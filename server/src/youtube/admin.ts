// 유튜브 공식 채널 매핑 관리 CLI (배포 PC 에서 deploy\windows\youtube.ps1 로 실행)
//   status                      연동 상태 · 매핑 상태별 개수 · 오늘 할당량
//   list [상태] [개수]          상위 채널부터 매핑 결과 (상태: all|auto|manual|pending|nolink|none)
//   pending [개수]              운영자 확인이 필요한 채널 (후보 포함)
//   show <대상>                 한 채널의 매핑·후보·최신 영상
//   set <대상> <유튜브 주소>    공식 채널 확정 (주소: youtube.com/channel/UC… · @핸들 · UC…)
//   none <대상>                 공식 채널 없음 (자동 연결 안 함)
//   auto <대상>                 확정 해제 → 다음 확인 때 다시 자동 추정
//   run [개수]                  지금 바로 매핑 (기본 30개)
// <대상>: chzzk:<채널ID> · soop:<아이디> · 버튜버 이름 (공백이 있으면 따옴표)
import { SqliteStore } from "../store/sqlite";
import { config } from "../config";
import type { Platform } from "../domain";
import type { YtLink } from "./store";
import { mappingTargets, runMapping, type MapTarget } from "./sync";
import { parseYoutubeChannelUrl } from "./links";
import { channelByHandle, quotaUsedToday, ytApiEnabled } from "./api";
import { fetchFeed } from "./rss";

const [cmd = "status", arg1, arg2] = process.argv.slice(2);
const store = new SqliteStore(config.dbPath);
const repo = store.youtube;

const STATUS_LABEL: Record<YtLink["status"], string> = {
  auto: "자동",
  manual: "확정",
  none: "없음",
  pending: "확인필요",
  nolink: "링크없음",
};
const NOTE_LABEL: Record<string, string> = {
  ambiguous: "후보가 여럿",
  secondary_only: "다시보기·클립 채널만 있음",
  legacy_url: "예전 주소(/c/·/user/)",
  needs_key: "@핸들 변환에 API 키 필요",
  handle_not_found: "@핸들에 해당하는 채널 없음",
  quota: "할당량 부족 — 나중에 다시",
  shared: "다른 버튜버와 같은 채널 (소속사·그룹 공용 채널일 수 있음)",
};

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** 대상 찾기: platform:id 또는 이름 (매핑 기록 → 랭킹·확정 목록) */
function resolveTarget(raw: string | undefined): MapTarget {
  if (!raw) die("대상을 적어 주세요 (chzzk:<채널ID> · soop:<아이디> · 버튜버 이름)");
  const m = /^(chzzk|soop):(.+)$/i.exec(raw.trim());
  if (m) {
    const platform = m[1]!.toLowerCase() as Platform;
    const channelId = platform === "chzzk" ? m[2]!.toLowerCase() : m[2]!;
    const link = repo.getLink(platform, channelId);
    const known = link?.name ?? mappingTargets(store, 1000).find((t) => t.platform === platform && t.channelId === channelId)?.name;
    return { platform, channelId, name: known ?? channelId };
  }
  const name = raw.trim();
  const fromLinks = repo.findLinksByName(name);
  const fromTargets = mappingTargets(store, 1000).filter((t) => t.name === name);
  const all = new Map<string, MapTarget>();
  for (const l of fromLinks) all.set(`${l.platform}:${l.channelId}`, { platform: l.platform, channelId: l.channelId, name: l.name });
  for (const t of fromTargets) all.set(`${t.platform}:${t.channelId}`, t);
  if (all.size === 0) die(`'${name}' 채널을 찾지 못했어요. chzzk:<채널ID> 또는 soop:<아이디> 로 적어 주세요.`);
  if (all.size > 1) {
    console.error(`'${name}' 이름의 채널이 여럿이에요. 아래처럼 다시 적어 주세요:`);
    for (const [k, t] of all) console.error(`  ${k}   ${t.name}`);
    process.exit(1);
  }
  return [...all.values()][0]!;
}

function linkLine(l: YtLink | null, t: MapTarget, rank?: number): string {
  const head = `${rank != null ? `${String(rank).padStart(3)}. ` : ""}${t.name}  (${t.platform}:${t.channelId})`;
  if (!l) return `${head}\n       → 아직 확인 안 함`;
  const ch = l.ytChannelId ? repo.getChannel(l.ytChannelId) : null;
  const yt = l.ytChannelId ? `${ch?.title ?? l.ytHandle ?? ""} https://www.youtube.com/channel/${l.ytChannelId}` : "";
  const note = l.note ? ` — ${NOTE_LABEL[l.note] ?? l.note}` : "";
  return `${head}\n       → [${STATUS_LABEL[l.status]}] ${yt}${note}`;
}

function printCandidates(l: YtLink | null): void {
  if (!l || l.candidates.length === 0) return;
  for (const c of l.candidates) {
    console.log(`         후보 (${c.score >= 0 ? "+" : ""}${c.score}) ${c.label || "(이름 없음)"}  ${c.ytChannelId ? `https://www.youtube.com/channel/${c.ytChannelId}` : c.url}`);
  }
}

async function loadFeedNow(ytChannelId: string): Promise<void> {
  const feed = await fetchFeed(ytChannelId).catch(() => null);
  const r = repo.saveFeed(ytChannelId, feed);
  console.log(feed ? `   RSS 확인: 영상 ${feed.entries.length}개 (새로 ${r.added.length}) · 채널 이름 ${feed.title ?? "-"}` : "   RSS 를 받지 못했어요 (채널 주소를 확인해 주세요)");
}

switch (cmd) {
  case "status": {
    const targets = mappingTargets(store);
    console.log(
      JSON.stringify(
        {
          enabled: config.youtubeSync,
          apiKey: ytApiEnabled() ? "등록됨" : "없음",
          quotaToday: `${quotaUsedToday(store)} / 예산 ${config.youtubeDailyBudget} (태평양 자정 초기화)`,
          targets: targets.length,
          checked: targets.filter((t) => repo.getLink(t.platform, t.channelId)).length,
          links: repo.statusCounts(),
          youtubeChannels: repo.mappedYtChannels().length,
          liveNow: repo.listLiveVideos(10 * 60_000).length,
        },
        null,
        2,
      ),
    );
    break;
  }
  case "list":
  case "pending": {
    const filter = cmd === "pending" ? "pending" : arg1 && !/^\d+$/.test(arg1) ? arg1 : "all";
    const n = Number(cmd === "pending" ? arg1 : /^\d+$/.test(arg1 ?? "") ? arg1 : arg2) || 50;
    const targets = mappingTargets(store, 1000);
    let shown = 0;
    targets.forEach((t, i) => {
      if (shown >= n) return;
      const l = repo.getLink(t.platform, t.channelId);
      if (filter !== "all" && l?.status !== filter) return;
      shown++;
      console.log(linkLine(l, t, i + 1));
      if (filter === "pending") printCandidates(l);
    });
    if (shown === 0) console.log("(해당 채널 없음)");
    break;
  }
  case "show": {
    const t = resolveTarget(arg1);
    const l = repo.getLink(t.platform, t.channelId);
    console.log(linkLine(l, t));
    printCandidates(l);
    if (l?.ytChannelId) {
      const videos = repo.listVideos(l.ytChannelId, 5);
      console.log(`   최신 영상 ${videos.length ? "" : "없음 (RSS 확인 전)"}`);
      for (const v of videos) console.log(`     ${v.publishedAt.slice(0, 10)} ${v.liveStatus ? `[${v.liveStatus}] ` : ""}${v.title}`);
    }
    break;
  }
  case "set": {
    const t = resolveTarget(arg1);
    if (!arg2) die("유튜브 채널 주소를 적어 주세요 (youtube.com/channel/UC… · youtube.com/@핸들 · UC…)");
    const raw = arg2.trim();
    const parsed = /^UC[\w-]{22}$/.test(raw)
      ? { ytChannelId: raw, handle: null, legacy: null, url: "" }
      : parseYoutubeChannelUrl(raw.startsWith("@") ? `https://www.youtube.com/${raw}` : raw);
    if (!parsed) die("유튜브 채널 주소가 아니에요 (영상 주소 말고 채널 주소)");
    let ytChannelId = parsed.ytChannelId;
    let handle = parsed.handle;
    if (!ytChannelId && handle) {
      ytChannelId = repo.channelIdForHandle(handle);
      if (!ytChannelId) {
        if (!ytApiEnabled()) die("API 키가 없어 @핸들을 변환할 수 없어요. youtube.com/channel/UC… 주소로 적어 주세요.");
        const info = await channelByHandle(store, handle);
        if (!info) die(`${handle} 에 해당하는 채널이 없어요.`);
        repo.saveChannelInfo({ ...info, handle: info.handle ?? handle });
        ytChannelId = info.ytChannelId;
      }
    }
    if (!ytChannelId) die("/c/·/user/ 주소는 변환할 수 없어요. 채널 페이지의 youtube.com/channel/UC… 주소로 적어 주세요.");
    repo.setLinkManual(t.platform, t.channelId, t.name, { status: "manual", ytChannelId, ytHandle: handle });
    console.log(`확정: ${t.name} → https://www.youtube.com/channel/${ytChannelId}`);
    await loadFeedNow(ytChannelId);
    break;
  }
  case "none": {
    const t = resolveTarget(arg1);
    repo.setLinkManual(t.platform, t.channelId, t.name, { status: "none" });
    console.log(`공식 채널 없음으로 지정: ${t.name} (자동 연결 안 함)`);
    break;
  }
  case "auto": {
    const t = resolveTarget(arg1);
    if (!repo.getLink(t.platform, t.channelId)) die(`${t.name}: 매핑 기록이 없어요 (이미 자동 대상)`);
    repo.setLinkManual(t.platform, t.channelId, t.name, { status: "auto" });
    console.log(`자동으로 되돌림: ${t.name} — 다음 매핑 때 다시 추정 (지금 하려면 run)`);
    break;
  }
  case "run": {
    const r = await runMapping(store, Number(arg1) || 30);
    console.log(JSON.stringify({ ...r, links: repo.statusCounts() }, null, 2));
    break;
  }
  default:
    console.log(
      "사용법: status | list [상태] [개수] | pending [개수] | show <대상> | set <대상> <유튜브 주소> | none <대상> | auto <대상> | run [개수]",
    );
}
