// 유튜브 전용 버튜버 — 치지직·SOOP 채널 없이 유튜브에서 활동하는 버튜버 (한국 유튜브 버튜버, 키리누키에 자주 나오는 해외 버튜버).
//  찾기: ① 웹 수집 (Claude 구독 + 웹 검색, 7일마다) — '유튜브가 주 무대인 한국 버튜버' + '버모아 키리누키에 나오는데 아직 모르는 버튜버'의 공식 채널
//        ② 데뷔 소식의 유튜브 채널  ③ 운영자 (deploy\windows\youtube.ps1 vtuber-add)
//  확인: 주소(@핸들·UC…)를 대기열에 넣고, 유튜브 연동 주기 작업이 channels.list(1단위)로 채널이 있는지 확인한 뒤 등록.
//        치지직·SOOP 버튜버의 공식 채널로 이미 연결된 채널, 키리누키 채널은 넣지 않는다.
//  등록되면: 검색 · 프로필(/vtuber/youtube/UC…) · 공식 영상 · 노래 · 유튜브 라이브(한국어 버튜버만 LIVE 목록) · 키리누키 출연 연결
//
// 정책: Claude 에는 RSS 로 받은 키리누키 제목만 넣는다 (videos.list 로 바뀐 제목은 빼고 — API 로 받은 데이터로 새 정보를 만들지 않음).
//       이름·소속은 웹 출처 기준. 키리누키 출연 연결도 RSS 제목·버모아 요약만 본다.
import type { SqliteStore } from "../store/sqlite";
import type { YtVtuber } from "./store";
import { QuotaExceededError, channelByHandle, channelsByIds, quotaAllows, ytApiEnabled } from "./api";
import { runClaudeJson } from "../issues/claude";
import { config } from "../config";
import { log } from "../log";

/** 유튜브 채널 주소·핸들·ID → "@핸들"(소문자) 또는 "UC…" */
export function parseYoutubeRef(raw: string | null | undefined): string | null {
  const s = (raw ?? "").trim();
  if (!s) return null;
  if (/^UC[\w-]{22}$/.test(s)) return s;
  if (/^@[\w.\-·\p{L}\p{N}]{2,40}$/u.test(s)) return s.toLowerCase();
  let u: URL;
  try {
    u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^www\.|^m\./, "");
  if (host !== "youtube.com") return null;
  const parts = u.pathname.split("/").filter(Boolean).map((p) => decodeURIComponent(p));
  const first = parts[0] ?? "";
  if (first.startsWith("@") && first.length >= 3) return first.toLowerCase();
  if (first === "channel" && /^UC[\w-]{22}$/.test(parts[1] ?? "")) return parts[1]!;
  return null;
}

/** 대기열에 넣기 (확인은 유튜브 연동 주기 작업이 한다) */
export function queueYoutubeVtuber(
  store: SqliteStore,
  v: { url: string; name: string; aliases?: string[]; group?: string | null; region?: YtVtuber["region"]; source: string },
): "queued" | "exists" | "bad_url" {
  const ref = parseYoutubeRef(v.url);
  if (!ref) return "bad_url";
  const name = v.name.trim().slice(0, 60);
  if (!name) return "bad_url";
  const ok = store.youtube.queueVtuber({
    ref,
    name,
    aliases: (v.aliases ?? []).map((a) => a.trim().slice(0, 60)).filter(Boolean).slice(0, 8),
    group: v.group?.trim().slice(0, 40) || null,
    region: v.region === "foreign" ? "foreign" : "ko",
    source: v.source,
  });
  return ok ? "queued" : "exists";
}

export interface ResolveSummary {
  added: string[];
  skipped: { ref: string; name: string; reason: string }[];
}

/**
 * 대기열 확인: 채널이 있는지(API) → 치지직·SOOP 공식 채널·키리누키 채널이 아닌지 → 등록.
 * 운영자가 넣은 것(manual)은 확인 상태로, 나머지는 자동(auto)으로.
 */
export async function resolveQueue(store: SqliteStore, limit = 20): Promise<ResolveSummary> {
  const repo = store.youtube;
  const out: ResolveSummary = { added: [], skipped: [] };
  if (!ytApiEnabled()) return out;
  const queue = repo.listQueue(limit);
  if (queue.length === 0) return out;
  let names: Set<string> | null = null;
  const streamerNames = () => (names ??= new Set(store.streamerNames().map(norm).filter((n) => n.length >= 2)));

  // UC… 는 한 번에, @핸들은 받아 둔 값 → 1단위씩
  const ids = queue.filter((q) => q.ref.startsWith("UC")).map((q) => q.ref);
  const infoById = new Map<string, { ytChannelId: string; title: string | null; handle: string | null; thumbnailUrl: string | null }>();
  if (ids.length) {
    if (!quotaAllows(store, false)) return out;
    for (const c of await channelsByIds(store, ids)) infoById.set(c.ytChannelId, c);
  }

  for (const q of queue) {
    try {
      let ytId: string | null = null;
      if (q.ref.startsWith("UC")) {
        ytId = infoById.has(q.ref) ? q.ref : null;
        if (ytId) repo.saveChannelInfo(infoById.get(q.ref)!);
      } else {
        ytId = repo.channelIdForHandle(q.ref);
        if (!ytId) {
          if (!quotaAllows(store, false)) break;
          const info = await channelByHandle(store, q.ref);
          if (info) {
            repo.saveChannelInfo({ ...info, handle: info.handle ?? q.ref });
            ytId = info.ytChannelId;
          }
        }
      }
      const skip = (reason: string) => {
        out.skipped.push({ ref: q.ref, name: q.name, reason });
        repo.finishQueued(q.ref, null);
      };
      if (!ytId) {
        skip("채널 없음");
        continue;
      }
      if (repo.isLinkedToStreamer(ytId)) {
        skip("치지직·SOOP 버튜버의 공식 채널");
        continue;
      }
      // 치지직·SOOP 에 같은 이름의 버튜버가 있으면 그쪽의 유튜브일 가능성이 크다 → 중복 프로필을 만들지 않는다 (운영자 추가는 예외)
      if (q.source !== "manual" && streamerNames().has(norm(q.name))) {
        skip("치지직·SOOP 에 같은 이름의 버튜버가 있음");
        continue;
      }
      const clipCh = store.clips.getChannel(ytId);
      if (clipCh && clipCh.status !== "blocked") {
        skip("키리누키 채널");
        continue;
      }
      const cur = repo.getVtuber(ytId);
      if (cur?.status === "blocked" && q.source !== "manual") {
        skip("운영자가 제외한 채널");
        continue;
      }
      const isNew = repo.saveVtuber({
        ytChannelId: ytId,
        name: q.name,
        aliases: q.aliases,
        group: q.group,
        region: q.region,
        status: q.source === "manual" ? "manual" : "auto",
        source: q.source,
      });
      repo.finishQueued(q.ref, null);
      if (isNew) out.added.push(`${q.name} (${ytId})`);
    } catch (e) {
      if (e instanceof QuotaExceededError) break;
      repo.finishQueued(q.ref, String(e).slice(0, 200));
    }
  }
  if (out.added.length) {
    log.info(`유튜브 전용 버튜버 +${out.added.length}: ${out.added.slice(0, 10).join(", ")}`);
    relinkYoutubeVtuberClips(store);
  }
  return out;
}

// ---------------------------------------------------------------- 키리누키 출연 연결

function norm(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 이름 일치에 쓸 이름: 한글은 3글자 이상, 그 밖은 4글자 이상 (짧은 이름은 엉뚱하게 걸린다) */
function usableName(n: string): boolean {
  return /[가-힣]/.test(n) ? n.length >= 3 : n.length >= 4;
}

/**
 * 출연 버튜버를 못 찾은 키리누키를 유튜브 전용 버튜버 이름·별칭으로 다시 연결한다 (제목·버모아 요약에 이름 전체가 나올 때만).
 * 새 클립은 분류할 때 후보 이름에 들어가므로 Claude 가 바로 고른다.
 */
export function relinkYoutubeVtuberClips(store: SqliteStore): number {
  const names: { key: string; ytChannelId: string }[] = [];
  for (const v of store.youtube.listVtubers()) {
    for (const n of [v.name, ...v.aliases]) {
      const key = norm(n);
      if (usableName(key)) names.push({ key, ytChannelId: v.ytChannelId });
    }
  }
  if (names.length === 0) return 0;
  // 같은 이름을 여러 버튜버가 쓰면 그 이름은 쓰지 않는다
  const owners = new Map<string, Set<string>>();
  for (const n of names) owners.set(n.key, (owners.get(n.key) ?? new Set()).add(n.ytChannelId));
  const unique = names.filter((n) => owners.get(n.key)!.size === 1);
  let linked = 0;
  for (const c of store.clips.unlinkedClips(5000)) {
    const hay = norm(`${c.rssTitle ?? ""} ${c.summary ?? ""}`);
    const hit = [...new Set(unique.filter((n) => hay.includes(n.key)).map((n) => n.ytChannelId))].slice(0, 4);
    if (hit.length) linked += store.clips.addClipVtubers(c.videoId, hit.map((id) => ({ platform: "youtube" as const, channelId: id })));
  }
  if (linked) log.info(`키리누키 ${linked}개에 유튜브 전용 버튜버 연결`);
  return linked;
}

// ---------------------------------------------------------------- 웹 수집 (Claude)

interface RawVtuber {
  name: string;
  aliases?: string[];
  group?: string;
  region?: string;
  channelUrl?: string;
  sources?: { url: string; title?: string }[];
}

const SCHEMA = {
  type: "object",
  properties: {
    vtubers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "활동명 — 한국에서 부르는 한국어 표기 (예: 코가네이 니코, 우사다 페코라)" },
          aliases: { type: "array", items: { type: "string" }, description: "다른 표기: 영문·일본어 이름, 흔한 애칭 (최대 4개)" },
          group: { type: "string", description: "소속사·그룹 (예: 홀로라이브, 니지산지). 개인세면 '개인세'" },
          region: { type: "string", enum: ["ko", "foreign"], description: "ko = 한국어로 방송하는 버튜버, foreign = 해외(일본·영어 등) 버튜버" },
          channelUrl: { type: "string", description: "공식 유튜브 채널 주소 (https://www.youtube.com/@핸들 또는 /channel/UC…). 직접 확인한 것만" },
          sources: {
            type: "array",
            items: { type: "object", properties: { url: { type: "string" }, title: { type: "string" } }, required: ["url"] },
          },
        },
        required: ["name", "region", "channelUrl", "sources"],
      },
    },
  },
  required: ["vtubers"],
} as const;

function buildPrompt(known: string[], unlinkedTitles: string[], max: number): string {
  return `당신은 한국 버튜버 정보 사이트 "버모아(VMOA)"의 자료 담당 에디터다.
버모아는 치지직·SOOP 방송을 자동으로 모으기 때문에, **유튜브에서만 활동하는 버튜버**를 따로 찾아 목록을 만든다.

## 할 일
웹 검색(WebSearch)과 페이지 확인(WebFetch)으로 아래 두 종류의 버튜버와 **공식 유튜브 채널 주소**를 찾는다 (합쳐서 최대 ${max}명).

A. **(가장 중요, ${Math.ceil(max / 2)}명 이상 목표)** 치지직·SOOP 채널 없이 **유튜브가 주 무대인 한국 버튜버**
   — 유튜브 라이브, 커버곡·오리지널곡, 버추얼 가수, 버추얼 아이돌 그룹, 유튜브 중심 개인세 버튜버, 유튜브 쇼츠 위주 버튜버
   검색은 **최소 8번, 검색어를 바꿔 가며** 한다. 예:
   "유튜브 버튜버 한국", "한국 버튜버 유튜브 라이브", "버츄얼 유튜버 추천 한국", "버튜버 커버곡", "버추얼 가수 한국",
   "버추얼 아이돌 그룹 데뷔", "버튜버 오리지널곡 발매", "개인세 버튜버 유튜브", "버튜버 노래 채널", "한국 vtuber youtube"
   버튜버 정리글·위키·소속사 공식 사이트의 멤버 목록·음원 발매 기사를 확인한다. 이미 알려진 그룹이면 멤버 개인 채널도 각각 넣는다.
B. 아래 '버모아 키리누키 제목'에 나오는데 버모아가 아직 모르는 버튜버 (최대 ${Math.floor(max / 2)}명)
   — 제목에서 버튜버 이름을 찾아 그 버튜버의 공식 채널을 확인한다. 홀로라이브·니지산지·브이스포 같은 해외 버튜버는 region = foreign

## 규칙
- channelUrl 은 **그 버튜버 본인의 공식 채널**만. 키리누키·팬 채널·소속사 공용 채널은 넣지 않는다. 실제로 열어 보거나 공식 출처에서 확인한 주소만 (지어내지 말 것).
- 치지직·SOOP 에서 주로 방송하는 버튜버는 넣지 않는다 (버모아가 이미 안다).
- 버튜버(버추얼 캐릭터로 활동하는 사람)가 아닌 일반 스트리머·연예인은 넣지 않는다.
- name 은 한국 팬이 부르는 한국어 표기. 해외 버튜버도 한국어 표기로 (예: "兎田ぺこら" → "우사다 페코라").
- 출처 1~3개 필수 (실제로 연 페이지).
- 아래 '이미 아는 유튜브 버튜버'와 같은 사람은 넣지 않는다.

## 이미 아는 유튜브 버튜버
${known.length ? known.map((k) => `- ${k}`).join("\n") : "- (없음)"}

## 버모아 키리누키 제목 (출연 버튜버를 못 찾은 것)
${unlinkedTitles.length ? unlinkedTitles.map((t) => `- ${t}`).join("\n") : "- (없음)"}
`;
}

export interface DiscoverSummary {
  found: number;
  queued: string[];
  skipped: { name: string; reason: string }[];
  durationMs: number;
}

/** 웹 수집 1회 — 찾은 채널은 대기열로 (확인·등록은 유튜브 연동 주기 작업) */
export async function discoverYoutubeVtubers(store: SqliteStore): Promise<DiscoverSummary> {
  const max = Math.max(5, config.ytVtubersMaxPerRun);
  const known = store.youtube
    .listVtubers({ all: true })
    .slice(-300)
    .map((v) => `${v.name}${v.group ? ` (${v.group})` : ""}`);
  const titles = store.clips
    .unlinkedClips(400)
    .flatMap((c) => (c.rssTitle ? [c.rssTitle.replace(/\s+/g, " ").slice(0, 80)] : []))
    .filter((t, i, a) => a.indexOf(t) === i)
    .slice(0, 120);
  log.info(`유튜브 전용 버튜버 웹 수집 시작 — 최대 ${max}명 (키리누키 제목 ${titles.length}개)`);
  const res = await runClaudeJson<{ vtubers: RawVtuber[] }>(buildPrompt(known, titles, max), SCHEMA, {
    tools: ["WebSearch", "WebFetch"],
  });
  const out: DiscoverSummary = { found: res.output.vtubers?.length ?? 0, queued: [], skipped: [], durationMs: res.durationMs };
  for (const v of (res.output.vtubers ?? []).slice(0, max)) {
    const name = (v.name ?? "").trim();
    if (!name) continue;
    const hasSource = (v.sources ?? []).some((s) => /^https?:\/\//.test(s.url ?? ""));
    if (!hasSource) {
      out.skipped.push({ name, reason: "출처 없음" });
      continue;
    }
    const r = queueYoutubeVtuber(store, {
      url: v.channelUrl ?? "",
      name,
      aliases: v.aliases ?? [],
      group: v.group && v.group !== "개인세" ? v.group : null,
      region: v.region === "foreign" ? "foreign" : "ko",
      source: "web",
    });
    if (r === "queued") out.queued.push(name);
    else out.skipped.push({ name, reason: r === "exists" ? "이미 있음" : "채널 주소 없음" });
  }
  log.info(`유튜브 전용 버튜버 웹 수집 완료 — 후보 ${out.found} · 확인 대기 +${out.queued.length} · ${Math.round(out.durationMs / 1000)}초`);
  return out;
}
