// 키리누키 관리 CLI (배포 PC 에서 deploy\windows\clips.ps1 로 실행)
//   status                    수집 상태 · 채널/클립 개수 · 오늘 검색 횟수 · 마지막 분류
//   channels [상태] [개수]     키리누키 채널 (상태: auto|approved|blocked)
//   block <채널>              차단 (클립도 사이트에서 빠짐)
//   unblock <채널>            차단 해제 → 승인
//   add <유튜브 채널 주소> [버튜버]   직접 추가 (승인 상태). 버튜버: chzzk:<ID> · soop:<ID> · 이름
//   discover [개수]           지금 바로 채널 찾기 (search.list 사용)
//   classify                  지금 바로 분류 1회 (Claude)
//   recent [개수]             최근 분류된 클립
//   enrich                    지금 바로 예전 분류 보강 1회 (대표 순간·주제 통일·사건, Claude)
//   topics [개수]             많이 쓰인 주제 이름 (같은 게임이 다른 이름으로 갈렸는지 보기)
//   alias <별칭> <정식 이름>   주제 이름 통일 — 기존 클립에도 바로 반영 (예: alias 마크 마인크래프트)
//   events [일수]             최근 사건·밈 이름과 클립 수
// <채널>: UC… 채널 ID 또는 채널 이름
import { SqliteStore } from "../store/sqlite";
import { config } from "../config";
import type { Platform } from "../domain";
import type { ClipChannel, ClipChannelStatus } from "./store";
import { runDiscover } from "./sync";
import { classifyClips, enrichClips } from "./classify";
import { clipTagById } from "./vocab";
import { parseYoutubeChannelUrl } from "../youtube/links";
import { channelByHandle, quotaUsedToday, searchesToday, ytApiEnabled } from "../youtube/api";
import { fetchFeed } from "../youtube/rss";
import { mappingTargets } from "../youtube/sync";

const [cmd = "status", arg1, arg2] = process.argv.slice(2);
const store = new SqliteStore(config.dbPath);
const repo = store.clips;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

const STATUS_LABEL: Record<ClipChannelStatus, string> = { auto: "자동", approved: "승인", blocked: "차단" };
const REASON_LABEL: Record<string, string> = { manual: "운영자", not_clips: "클립 아닌 영상이 대부분", official: "공식 채널" };

function resolveChannel(raw: string | undefined): ClipChannel {
  if (!raw) die("채널을 적어 주세요 (UC… 채널 ID 또는 채널 이름)");
  const byId = repo.getChannel(raw.trim());
  if (byId) return byId;
  const found = repo.findChannelsByTitle(raw.trim());
  if (found.length === 1) return found[0]!;
  if (found.length > 1) {
    console.error(`'${raw}' 이름의 채널이 여럿이에요. 채널 ID 로 적어 주세요:`);
    for (const c of found) console.error(`  ${c.ytChannelId}  ${c.title ?? ""}`);
    process.exit(1);
  }
  die(`'${raw}' 채널을 찾지 못했어요.`);
}

function resolveVtuber(raw: string | undefined): { platform: Platform; channelId: string; name: string } | null {
  if (!raw) return null;
  const m = /^(chzzk|soop):(.+)$/i.exec(raw.trim());
  const targets = mappingTargets(store, 1000);
  if (m) {
    const platform = m[1]!.toLowerCase() as Platform;
    const channelId = platform === "chzzk" ? m[2]!.toLowerCase() : m[2]!;
    return { platform, channelId, name: targets.find((t) => t.channelId === channelId)?.name ?? channelId };
  }
  const hits = targets.filter((t) => t.name === raw.trim());
  if (hits.length === 1) return hits[0]!;
  die(hits.length ? `'${raw}' 이름의 버튜버가 여럿이에요. chzzk:<ID> 로 적어 주세요.` : `'${raw}' 버튜버를 찾지 못했어요.`);
}

switch (cmd) {
  case "status": {
    const ch = repo.listChannels();
    const count = (s: ClipChannelStatus) => ch.filter((c) => c.status === s).length;
    console.log(
      JSON.stringify(
        {
          enabled: config.clipsEnabled,
          apiKey: ytApiEnabled() ? "등록됨" : "없음",
          searchesToday: `${searchesToday(store)} / ${config.clipsSearchPerDay}`,
          quotaToday: `${quotaUsedToday(store)} / 예산 ${config.youtubeDailyBudget}`,
          searchedVtubers: repo.searchedCount(),
          channels: { 자동: count("auto"), 승인: count("approved"), 차단: count("blocked") },
          clips: repo.countByStatus(),
          classVersion: repo.classVerCounts(),
          lastClassify: JSON.parse(store.getMeta("clips_last_result") ?? "null"),
        },
        null,
        2,
      ),
    );
    break;
  }
  case "channels": {
    const status = arg1 && !/^\d+$/.test(arg1) ? (arg1 as ClipChannelStatus) : undefined;
    const n = Number(/^\d+$/.test(arg1 ?? "") ? arg1 : arg2) || 50;
    const names = store.channelNames(repo.listChannels().map((c) => c.hintChannelId ?? ""));
    for (const c of repo.listChannels(status).slice(0, n)) {
      const reason = c.blockReason ? ` (${REASON_LABEL[c.blockReason] ?? c.blockReason})` : "";
      const hint = c.hintChannelId ? names.get(c.hintChannelId) ?? c.hintChannelId : "-";
      console.log(
        `[${STATUS_LABEL[c.status]}${reason}] ${c.title ?? "(RSS 확인 전)"}  ${c.ytChannelId}\n` +
          `     찾은 버튜버 ${hint} · 발견 ${c.foundHits} · 클립 ${c.done} · 클립 아님 ${c.notClip} · 전체 ${c.clips}`,
      );
    }
    break;
  }
  case "block":
  case "unblock": {
    const c = resolveChannel(arg1);
    repo.setChannelStatus(c.ytChannelId, cmd === "block" ? "blocked" : "approved", "manual");
    console.log(`${cmd === "block" ? "차단" : "승인"}: ${c.title ?? c.ytChannelId}`);
    break;
  }
  case "add": {
    if (!arg1) die("유튜브 채널 주소를 적어 주세요");
    const raw = arg1.trim();
    const parsed = /^UC[\w-]{22}$/.test(raw)
      ? { ytChannelId: raw, handle: null }
      : parseYoutubeChannelUrl(raw.startsWith("@") ? `https://www.youtube.com/${raw}` : raw);
    if (!parsed) die("유튜브 채널 주소가 아니에요");
    let id = parsed.ytChannelId;
    if (!id && parsed.handle) {
      if (!ytApiEnabled()) die("API 키가 없어 @핸들을 변환할 수 없어요. youtube.com/channel/UC… 주소로 적어 주세요.");
      const info = await channelByHandle(store, parsed.handle);
      if (!info) die(`${parsed.handle} 채널이 없어요.`);
      id = info.ytChannelId;
    }
    if (!id) die("/c/·/user/ 주소는 변환할 수 없어요. youtube.com/channel/UC… 주소로 적어 주세요.");
    const v = resolveVtuber(arg2);
    repo.addManualChannel(id, v ? { platform: v.platform, channelId: v.channelId } : null);
    const feed = await fetchFeed(id).catch(() => null);
    const r = repo.saveFeed(id, feed);
    console.log(`추가: ${feed?.title ?? id}${v ? ` (버튜버 ${v.name})` : ""} — RSS ${feed ? `영상 ${feed.entries.length}개, 새 클립 ${r.added}` : "를 받지 못했어요"}`);
    break;
  }
  case "discover": {
    const r = await runDiscover(store, Number(arg1) || 1);
    console.log(JSON.stringify({ ...r, searchesToday: searchesToday(store) }, null, 2));
    break;
  }
  case "classify": {
    const r = await classifyClips(store);
    store.setMeta("clips_last_result", JSON.stringify({ at: new Date().toISOString(), manual: true, ...r }));
    console.log(JSON.stringify(r, null, 2));
    break;
  }
  case "recent": {
    const { clips } = repo.listClips({ limit: Number(arg1) || 20, offset: 0 });
    const names = store.channelNames(clips.flatMap((c) => c.vtubers.map((v) => v.channelId)));
    for (const c of clips) {
      const who = c.vtubers.map((v) => names.get(v.channelId) ?? v.channelId).join(", ") || "-";
      const tags = [c.category, ...c.moments].map((t) => (t ? clipTagById(t)?.label ?? t : "")).filter(Boolean).join("·");
      const extra = [c.event ? `사건 ${c.event}` : "", c.sourceUrl ? `원본 ${c.sourceDate ?? ""} ${c.sourceUrl}` : ""].filter(Boolean).join(" · ");
      console.log(
        `${c.publishedAt.slice(0, 10)} [${who}] ${c.summary ?? ""}  (${tags}${c.topic ? ` · ${c.topic}` : ""})\n     ${c.title}  https://youtu.be/${c.videoId}` +
          (extra ? `\n     ${extra}` : ""),
      );
    }
    break;
  }
  case "enrich": {
    const r = await enrichClips(store);
    console.log(JSON.stringify({ ...r, classVersion: repo.classVerCounts() }, null, 2));
    break;
  }
  case "topics": {
    for (const t of repo.allTopics(Number(arg1) || 60)) console.log(`${String(t.count).padStart(5)}  ${t.topic}`);
    break;
  }
  case "alias": {
    if (!arg1 || !arg2) die("사용법: alias <별칭> <정식 이름>  (예: alias 마크 마인크래프트)");
    const n = repo.setTopicAlias(arg1, arg2, "manual");
    console.log(`'${arg1}' → '${arg2}' 등록 · 기존 클립 ${n}개 주제를 바꿨어요`);
    break;
  }
  case "events": {
    for (const e of repo.recentEvents(Number(arg1) || 30, 100)) console.log(`${String(e.count).padStart(4)}  ${e.lastAt.slice(0, 10)}  ${e.event}`);
    break;
  }
  default:
    console.log(
      "사용법: status | channels [상태] [개수] | block <채널> | unblock <채널> | add <주소> [버튜버] | discover [개수] | classify | enrich | recent [개수] | topics [개수] | alias <별칭> <정식 이름> | events [일수]",
    );
}
