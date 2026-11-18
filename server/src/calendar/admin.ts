// 기념일(생일·데뷔일) 관리 CLI (배포 PC 에서 deploy\windows\calendar.ps1 로 실행)
//   status                          수집 상태 (찾은 생일·데뷔일 수, 남은 대상, 마지막 수집)
//   list [found|missing] [개수]     찾은 것 / 아직 못 찾은 것
//   show <대상>                     한 버튜버의 생일·데뷔일·출처
//   set <대상> birthday <MM-DD>     생일 정하기 (none = 없음으로 확정)
//   set <대상> debut <YYYY-MM-DD>   데뷔일 정하기 (none = 없음으로 확정)
//   auto <대상>                     운영자 입력 해제 → 다음 수집 때 다시 찾음
//   run [개수]                      지금 바로 웹 수집 (Claude)
//   month [YYYY-MM]                 그 달의 기념일 목록
//   upcoming [일수]                 오늘부터 다가오는 기념일
//   links <대상>                    프로필에 보일 SNS 링크·커뮤니티·해시태그
//   link-add <대상> <주소>          공식 SNS 링크 추가 · link-del <대상> <주소> 빼기
//   tag-add <대상> <#태그> [fanart|clip|stream|other]   공식 해시태그 추가 (기본 fanart) · tag-del <대상> <#태그> 빼기
//   social-auto <대상>              링크·태그 운영자 수정 해제 → 다음 수집 때 다시 찾음
// <대상>: chzzk:<채널ID> · soop:<아이디> · youtube:UC… · 버튜버 이름
import { SqliteStore } from "../store/sqlite";
import { config } from "../config";
import type { Platform } from "../domain";
import { validBirthday, validDebutDate, type VtuberFact } from "./store";
import { collectFacts, factTargets } from "./collector";
import { calendarMonth, kstToday, upcomingEvents, type CalendarEvent } from "./view";
import { socialForProfile } from "../social/view";
import { classifyLink, cleanHashtag } from "../social/links";
import type { HashtagKind } from "../social/store";
import { youtubeForProfile } from "../youtube/view";

const [cmd = "status", arg1, arg2, arg3] = process.argv.slice(2);
const store = new SqliteStore(config.dbPath);
const repo = store.facts;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

interface Target {
  platform: Platform;
  channelId: string;
  name: string;
}

/** 대상 찾기: platform:id 또는 이름 (수집 채널·유튜브 전용 버튜버·기념일 기록) */
function resolveTarget(raw: string | undefined): Target {
  if (!raw) die("대상을 적어 주세요 (chzzk:<채널ID> · soop:<아이디> · youtube:UC… · 버튜버 이름)");
  const m = /^(chzzk|soop|youtube):(.+)$/i.exec(raw.trim());
  if (m) {
    const platform = m[1]!.toLowerCase() as Platform;
    const channelId = platform === "youtube" ? m[2]! : m[2]!.toLowerCase();
    const name =
      platform === "youtube"
        ? store.youtube.getVtuber(channelId)?.name
        : store.channelNames([channelId]).get(channelId);
    if (!name) die(`${raw}: 버모아에 없는 채널이에요`);
    return { platform, channelId, name };
  }
  const name = raw.trim();
  const all = new Map<string, Target>();
  for (const t of factTargets(store, { all: true })) if (t.name === name) all.set(`${t.platform}:${t.channelId}`, t);
  for (const f of repo.listAll()) if (f.name === name) all.set(`${f.platform}:${f.channelId}`, f);
  for (const v of store.youtube.listVtubers()) {
    if (v.name === name || v.aliases.includes(name)) all.set(`youtube:${v.ytChannelId}`, { platform: "youtube", channelId: v.ytChannelId, name: v.name });
  }
  if (all.size === 0) die(`'${name}' 버튜버를 찾지 못했어요. chzzk:<채널ID> · soop:<아이디> · youtube:UC… 로 적어 주세요.`);
  if (all.size > 1) {
    console.error(`'${name}' 이름이 여럿이에요. 아래처럼 다시 적어 주세요:`);
    for (const k of all.keys()) console.error(`  ${k}`);
    process.exit(1);
  }
  return [...all.values()][0]!;
}

function factLine(f: VtuberFact | null, t: Target): string {
  const head = `${t.name}  (${t.platform}:${t.channelId})`;
  if (!f) return `${head}\n   → 아직 안 찾음`;
  const b = f.birthday ? `🎂 ${f.birthday}${f.birthdayManual ? " (운영자)" : ""}` : f.birthdayManual ? "🎂 없음(운영자)" : "🎂 -";
  const d = f.debutDate ? `🌱 ${f.debutDate}${f.debutManual ? " (운영자)" : ""}` : f.debutManual ? "🌱 없음(운영자)" : "🌱 -";
  return `${head}\n   → ${b} · ${d} · 확인 ${f.checkedAt ? f.checkedAt.slice(0, 10) : "-"}`;
}

const evLine = (e: CalendarEvent) =>
  `${e.date}  ${e.label.padEnd(8)}  ${e.name}${e.song ? ` — ${e.song.title}` : ""}${e.agency ? ` (${e.agency})` : ""}${e.vtuber ? "" : " · 채널 미확인"}`;

switch (cmd) {
  case "status": {
    const due = factTargets(store);
    console.log(
      JSON.stringify(
        {
          enabled: config.factsEnabled,
          every: `${config.factsIntervalMin}분마다 ${config.factsBatch}명`,
          ...repo.counts(),
          social: { ...store.social.webCounts(), platformLinks: store.social.platformLinkCount() },
          dueNow: due.length,
          lastRun: store.getMeta("facts_last_result") ? JSON.parse(store.getMeta("facts_last_result")!) : null,
          today: kstToday(),
        },
        null,
        2,
      ),
    );
    break;
  }
  case "list": {
    const mode = arg1 === "missing" ? "missing" : "found";
    const n = Number(mode === arg1 ? arg2 : arg1) || 50;
    if (mode === "missing") {
      const all = factTargets(store, { all: true });
      const miss = all.filter((t) => {
        const f = repo.get(t.platform, t.channelId);
        return !f || (!f.birthday && !f.debutDate);
      });
      console.log(`못 찾았거나 아직 안 찾은 버튜버 ${miss.length}명 (상위부터)`);
      for (const t of miss.slice(0, n)) console.log(factLine(repo.get(t.platform, t.channelId), t));
    } else {
      const found = repo.listKnown();
      console.log(`생일·데뷔일을 찾은 버튜버 ${found.length}명 (최근 바뀐 순)`);
      for (const f of found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, n)) console.log(factLine(f, f));
    }
    break;
  }
  case "show": {
    const t = resolveTarget(arg1);
    const f = repo.get(t.platform, t.channelId);
    console.log(factLine(f, t));
    for (const s of f?.sources ?? []) console.log(`   출처: ${s.title} ${s.url}`);
    break;
  }
  case "set": {
    const t = resolveTarget(arg1);
    if (arg2 !== "birthday" && arg2 !== "debut") die("사용법: set <대상> birthday <MM-DD|none> · set <대상> debut <YYYY-MM-DD|none>");
    const v = (arg3 ?? "").trim();
    if (v !== "none") {
      if (arg2 === "birthday" && !validBirthday(v)) die("생일은 MM-DD 로 적어 주세요 (예: 03-05)");
      if (arg2 === "debut" && !validDebutDate(v, kstToday())) die("데뷔일은 YYYY-MM-DD 로 적어 주세요 (2016-01-01 ~ 오늘)");
    }
    repo.setManual(t.platform, t.channelId, t.name, arg2, v === "none" ? null : v);
    console.log(factLine(repo.get(t.platform, t.channelId), t));
    break;
  }
  case "auto": {
    const t = resolveTarget(arg1);
    repo.clearManual(t.platform, t.channelId);
    console.log(`운영자 입력 해제: ${t.name} — 다음 수집 때 다시 찾아요 (지금 하려면 run)`);
    break;
  }
  case "run": {
    const s = await collectFacts(store, Number(arg1) || config.factsBatch);
    console.log(`확인 ${s.checked}명 · 생일 ${s.birthdays} · 데뷔일 ${s.debuts} · ${Math.round(s.durationMs / 1000)}초`);
    for (const f of s.found) console.log(`  ${f}`);
    break;
  }
  case "month": {
    const r = calendarMonth(store, arg1 ?? "");
    console.log(`${r.month} 기념일 ${r.events.length}개`);
    for (const e of r.events) console.log(evLine(e));
    break;
  }
  case "upcoming": {
    const r = upcomingEvents(store, Number(arg1) || 14);
    console.log(`오늘(${r.today})부터 ${r.events.length}개`);
    for (const e of r.events) console.log(evLine(e));
    break;
  }
  case "links": {
    const t = resolveTarget(arg1);
    const yt = youtubeForProfile(store, t.platform, t.channelId)?.ytChannelId ?? null;
    const s = socialForProfile(store, t.platform, t.channelId, yt);
    const web = store.social.web(t.platform, t.channelId);
    console.log(`${t.name}  (${t.platform}:${t.channelId})${web?.manual ? " · 운영자 수정" : ""}`);
    if (!s) {
      console.log("   (링크·태그 없음)");
      break;
    }
    for (const l of s.links) console.log(`   ${l.label.padEnd(6)} ${l.url}`);
    for (const c of s.communities) console.log(`   ${c.label} ${c.url}`);
    for (const h of s.hashtags) console.log(`   ${h.tag} (${h.kind})`);
    break;
  }
  case "link-add":
  case "link-del":
  case "tag-add":
  case "tag-del": {
    const t = resolveTarget(arg1);
    const cur = store.social.web(t.platform, t.channelId) ?? { links: [], hashtags: [], manual: false, checkedAt: "" };
    let links = [...cur.links];
    let tags = [...cur.hashtags];
    if (cmd === "link-add" || cmd === "link-del") {
      const l = classifyLink(arg2 ?? "");
      if (!l) die("쓸 수 없는 주소예요 (https://… 공식 SNS·사이트 주소)");
      links = links.filter((u) => classifyLink(u)?.url !== l.url);
      if (cmd === "link-add") links.push(l.url);
    } else {
      const tag = cleanHashtag(arg2 ?? "");
      if (!tag) die("해시태그를 적어 주세요 (예: #리코아트)");
      tags = tags.filter((h) => h.tag.toLowerCase() !== tag.toLowerCase());
      const kinds: HashtagKind[] = ["fanart", "clip", "stream", "other"];
      if (cmd === "tag-add") tags.push({ tag, kind: kinds.includes(arg3 as HashtagKind) ? (arg3 as HashtagKind) : "fanart" });
    }
    store.social.setWebManual(t.platform, t.channelId, links, tags);
    console.log(`저장 (운영자 수정): ${t.name} — 링크 ${links.length}개 · 태그 ${tags.map((h) => h.tag).join(" ") || "-"}`);
    break;
  }
  case "social-auto": {
    const t = resolveTarget(arg1);
    store.social.clearWebManual(t.platform, t.channelId);
    console.log(`링크·태그 운영자 수정 해제: ${t.name} — 다음 수집 때 다시 찾아요`);
    break;
  }
  default:
    console.log(
      "사용법: status | list [found|missing] [개수] | show <대상> | set <대상> birthday <MM-DD|none> | set <대상> debut <YYYY-MM-DD|none> | auto <대상> | run [개수] | month [YYYY-MM] | upcoming [일수] | links <대상> | link-add·link-del <대상> <주소> | tag-add <대상> <#태그> [종류] | tag-del <대상> <#태그> | social-auto <대상>",
    );
}
