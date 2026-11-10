// 키리누키 분류: Claude(구독, 헤드리스, 도구 없음)가 RSS 제목·설명만 보고
//  누가(버튜버) · 무엇을(category·topic) · 어떤 순간(moments) · 한 줄 요약 을 정한다.
// 정책: 입력은 RSS 정보뿐 (YouTube API 데이터로 파생 데이터를 만들지 않음). 화면에는 "버모아 분류"로 표시.
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import type { ClipClass, ClipRow } from "./store";
import { CATEGORY_IDS, CLIP_TAGS, MOMENT_IDS } from "./vocab";
import { runClaudeJson } from "../issues/claude";
import { mappingTargets } from "../youtube/sync";
import { config } from "../config";
import { log } from "../log";

const MAX_TRIES = 3;
const MAX_CANDIDATES = 10;
const DESC_CHARS = 400;

interface NameEntry {
  platform: Platform;
  channelId: string;
  name: string;
  /** 프롬프트에 보이는 이름 (같은 이름이 여럿이면 플랫폼을 붙임) */
  label: string;
  full: string;
  parts: string[];
  rank: number;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

/** 알려진 버튜버 이름 목록 (상위·방송 중·확정 목록 + 매핑 기록) */
export function buildNameIndex(store: SqliteStore): NameEntry[] {
  const seen = new Set<string>();
  const raw: Omit<NameEntry, "label">[] = [];
  const add = (platform: Platform, channelId: string, name: string) => {
    const k = `${platform}:${channelId}`;
    if (seen.has(k) || (platform !== "chzzk" && platform !== "soop")) return;
    seen.add(k);
    const full = norm(name);
    if (full.length < 2) return;
    // "유즈하 리코" → 유즈하리코 · 유즈하 · 리코, "하시요 HaSiyo" → 하시요 · hasiyo
    const parts = name
      .split(/[\s\p{P}\p{S}]+/u)
      .map(norm)
      .filter((p) => p.length >= 2 && p !== full);
    raw.push({ platform, channelId, name, full, parts, rank: raw.length });
  };
  for (const t of mappingTargets(store, 400)) add(t.platform, t.channelId, t.name);
  for (const l of store.youtube.listLinks()) add(l.platform, l.channelId, l.name);
  const count = new Map<string, number>();
  for (const e of raw) count.set(e.name, (count.get(e.name) ?? 0) + 1);
  return raw.map((e) => ({ ...e, label: (count.get(e.name) ?? 0) > 1 ? `${e.name} (${e.platform === "soop" ? "SOOP" : "치지직"})` : e.name }));
}

/** 클립 하나의 버튜버 후보: 이름 전체가 나오면 먼저, 채널을 처음 찾은 버튜버, 이름 일부가 나오는 버튜버 */
export function candidatesFor(clip: ClipRow, index: NameEntry[]): NameEntry[] {
  const hay = norm(`${clip.title} ${clip.description?.slice(0, 800) ?? ""} ${clip.channelTitle ?? ""}`);
  const full: NameEntry[] = [];
  const partial: NameEntry[] = [];
  for (const e of index) {
    if (hay.includes(e.full)) full.push(e);
    else if (e.parts.some((p) => hay.includes(p))) partial.push(e);
  }
  const hint = index.find((e) => e.platform === clip.hintPlatform && e.channelId === clip.hintChannelId);
  const out: NameEntry[] = [];
  for (const e of [...full, ...(hint ? [hint] : []), ...partial.sort((a, b) => a.rank - b.rank)]) {
    if (!out.includes(e)) out.push(e);
    if (out.length >= MAX_CANDIDATES) break;
  }
  return out;
}

const SCHEMA = {
  type: "object",
  properties: {
    clips: {
      type: "array",
      items: {
        type: "object",
        properties: {
          n: { type: "integer", description: "영상 번호" },
          isClip: { type: "boolean", description: "버튜버 방송을 편집한 클립이면 true" },
          vtubers: { type: "array", items: { type: "string" }, description: "나오는 버튜버 (그 영상의 후보 이름 그대로, 주인공 먼저)" },
          category: { type: "string", enum: CATEGORY_IDS },
          topic: { type: "string", description: "무엇을 하는 장면인지 짧게 (게임·콘텐츠 이름). 모르면 빈 문자열" },
          moments: { type: "array", items: { type: "string", enum: MOMENT_IDS }, description: "어떤 순간인지 1~3개" },
          summary: { type: "string", description: "한 줄 요약 40자 이내" },
        },
        required: ["n", "isClip", "vtubers", "category", "topic", "moments", "summary"],
      },
    },
  },
  required: ["clips"],
} as const;

function buildPrompt(clips: ClipRow[], cands: NameEntry[][]): string {
  const vocab = (kind: "category" | "moment") =>
    CLIP_TAGS.filter((t) => t.kind === kind)
      .map((t) => `- ${t.id}: ${t.label} — ${t.hint}`)
      .join("\n");
  const items = clips
    .map((c, i) => {
      const desc = (c.description ?? "").replace(/\s+/g, " ").trim().slice(0, DESC_CHARS);
      return [
        `[${i + 1}]`,
        `채널: ${c.channelTitle ?? "-"}`,
        `제목: ${c.title}`,
        `설명: ${desc || "-"}`,
        `후보: ${cands[i]!.map((e) => e.label).join(", ") || "(없음)"}`,
      ].join("\n");
    })
    .join("\n\n");
  return `당신은 한국 버튜버 정보 사이트 "버모아(VMOA)"의 클립 분류 담당이다.
아래는 유튜브 키리누키(팬이 방송을 잘라 편집한 클립) 채널의 영상들이다. **제목·설명만 보고** 각 영상을 분류한다. 검색하지 않는다.

## 규칙
- isClip: 버튜버 방송(치지직·SOOP·유튜브 라이브)을 편집한 클립이면 true.
  버튜버와 무관한 영상, 채널 공지, 원곡 음원만 올린 영상, 광고, 방송 전체를 그대로 올린 다시보기·풀영상은 false (false 면 나머지는 대충 채워도 됨).
- vtubers: 영상에 실제로 나오는 버튜버. **그 영상의 '후보' 이름 중에서만, 적힌 그대로** 고른다. 주인공을 먼저. 확실하지 않으면 넣지 않는다.
  후보 이름의 일부(예: "유즈하 리코" → "리코")만 제목에 있어도 문맥상 같은 사람이면 고른다.
- category: 무엇을 하는 방송인지 하나
${vocab("category")}
- topic: 무엇을 하는 장면인지 짧게 — 게임 이름("마인크래프트", "발로란트"), 콘텐츠 이름("노래 방송", "시청자 사연") 등. 모르면 빈 문자열.
- moments: 어떤 순간인지 1~3개
${vocab("moment")}
- summary: 무슨 장면인지 한 줄 요약. 40자 이내, 명사형으로 끝냄(예: "공포게임에서 귀신 보고 기절하는 리코"). 제목을 그대로 베끼지 않는다.
- 영상마다 하나씩, 번호(n)를 맞춰 모두 답한다.

## 영상
${items}
`;
}

interface RawOut {
  n: number;
  isClip: boolean;
  vtubers: string[];
  category: string;
  topic: string;
  moments: string[];
  summary: string;
}

/** Claude 출력 → 저장할 분류 (어휘·후보 밖의 값은 버림) */
export function toClassification(clip: ClipRow, cands: NameEntry[], o: RawOut): ClipClass {
  const byLabel = new Map(cands.map((e) => [e.label, e]));
  const byName = new Map(cands.map((e) => [e.name, e]));
  const vtubers: { platform: Platform; channelId: string }[] = [];
  for (const v of o.vtubers ?? []) {
    const e = byLabel.get(v.trim()) ?? byName.get(v.trim());
    if (e && !vtubers.some((x) => x.platform === e.platform && x.channelId === e.channelId)) {
      vtubers.push({ platform: e.platform, channelId: e.channelId });
    }
  }
  const moments = [...new Set((o.moments ?? []).filter((m) => MOMENT_IDS.includes(m)))].slice(0, 3);
  const clean = (s: string | undefined, max: number) => {
    const t = (s ?? "").replace(/\s+/g, " ").trim();
    return t ? t.slice(0, max) : null;
  };
  return {
    videoId: clip.videoId,
    isClip: !!o.isClip,
    category: CATEGORY_IDS.includes(o.category) ? o.category : "etc",
    topic: clean(o.topic, 40),
    summary: clean(o.summary, 60),
    moments,
    vtubers,
  };
}

export interface ClassifySummary {
  pending: number;
  classified: number;
  clips: number;
  notClips: number;
  failed: number;
  blockedChannels: string[];
  durationMs: number;
}

/** 분류 1회 (분류 대기 클립을 최신부터 batch 개). 대기가 없으면 Claude 를 부르지 않는다 */
export async function classifyClips(store: SqliteStore, batch = config.clipsClassifyBatch): Promise<ClassifySummary> {
  const repo = store.clips;
  const pending = repo.pendingClips(Math.max(1, batch), MAX_TRIES);
  const summary: ClassifySummary = { pending: pending.length, classified: 0, clips: 0, notClips: 0, failed: 0, blockedChannels: [], durationMs: 0 };
  if (pending.length === 0) return summary;

  const index = buildNameIndex(store);
  const cands = pending.map((c) => candidatesFor(c, index));
  const res = await runClaudeJson<{ clips: RawOut[] }>(buildPrompt(pending, cands), SCHEMA, {
    tools: [],
    timeoutMs: 10 * 60_000,
  });
  summary.durationMs = res.durationMs;

  const byN = new Map((res.output.clips ?? []).map((o) => [o.n, o]));
  const results: ClipClass[] = [];
  const missing: string[] = [];
  pending.forEach((c, i) => {
    const o = byN.get(i + 1);
    if (!o) missing.push(c.videoId);
    else results.push(toClassification(c, cands[i]!, o));
  });
  repo.saveClassification(results);
  if (missing.length) repo.markClassFailed(missing);
  summary.classified = results.length;
  summary.clips = results.filter((r) => r.isClip).length;
  summary.notClips = results.length - summary.clips;
  summary.failed = missing.length;

  // 클립이 아닌 영상이 대부분인 자동 등록 채널은 차단 (운영자가 승인한 채널은 그대로)
  for (const ch of new Set(pending.map((c) => c.ytChannelId))) {
    const info = repo.getChannel(ch);
    if (info?.status !== "auto") continue;
    const s = repo.channelClassStats(ch);
    const total = s.done + s.notClip;
    if (total >= 8 && s.notClip / total >= 0.7) {
      repo.setChannelStatus(ch, "blocked", "not_clips");
      summary.blockedChannels.push(info.title ?? ch);
    }
  }
  log.info(
    `키리누키 분류: ${summary.classified}개 (클립 ${summary.clips} · 클립 아님 ${summary.notClips}${summary.failed ? ` · 누락 ${summary.failed}` : ""}) · ${Math.round(summary.durationMs / 1000)}초` +
      (summary.blockedChannels.length ? ` · 차단 ${summary.blockedChannels.join(", ")}` : ""),
  );
  return summary;
}
