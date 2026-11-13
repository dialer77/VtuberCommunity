// 버튜버 검색 — 수집 DB 에 있는 채널 전체(방송 중이 아니어도) + 유튜브 전용 버튜버를 이름·예전 이름·유튜브 채널명·초성·태그로 찾는다.
// 색인은 메모리에 두고 10분마다 다시 만든다 (채널 수천 개 수준이라 매 요청 선형 탐색으로 충분).
import type { SqliteStore, LiveItem } from "./store/sqlite";
import type { Platform } from "./domain";
import { TAG_CATALOG, resolveChannelTags, tagById, type TagDef } from "./tags/catalog";
import { log } from "./log";

const INDEX_TTL_MS = 10 * 60_000;
const MAX_LIMIT = 100;

export interface SearchTagRef {
  id: string;
  label: string;
  emoji: string;
  kind: TagDef["kind"];
}

export interface SearchResult {
  platform: Platform;
  channelId: string;
  name: string;
  /** 이름이 아닌 다른 이름(예전 이름·유튜브 채널명 등)으로 찾았을 때 그 이름 */
  matchedName: string | null;
  tags: SearchTagRef[];
  isLive: boolean;
  /** 지금 방송 중인 플랫폼 (유튜브 방송이면 youtube) */
  livePlatform: Platform | null;
  viewers: number | null;
  liveTitle: string | null;
  /** 마지막 방송 날짜 (KST, 일별 집계 기준 — 집계 시작 전 방송만 있으면 null) */
  lastLiveDate: string | null;
  firstSeenAt: string;
  /** 유튜브 전용 버튜버의 소속 (그 밖에는 null) */
  group: string | null;
}

export interface SearchResponse {
  q: string;
  /** 적용된 태그 필터 (모두 만족) */
  tags: SearchTagRef[];
  /** '#…' 로 썼지만 어떤 태그인지 알 수 없는 것 */
  unknownTags: string[];
  /** 검색어와 이름이 겹치는 태그 (누르면 태그로 보기) */
  suggestedTags: SearchTagRef[];
  total: number;
  results: SearchResult[];
  /** 검색어로 찾은 채널(태그 필터 전) 기준 태그별 개수 */
  tagCounts: (SearchTagRef & { count: number })[];
}

interface Entry {
  platform: Platform;
  channelId: string;
  name: string;
  /** 정규화한 이름들 — [0] 이 현재 이름 */
  names: string[];
  rawNames: string[];
  cho: string[];
  tags: string[];
  lastDate: string | null;
  vm30: number;
  peak: number;
  firstSeenAt: string;
  group: string | null;
}

/** 비교용 정규화: 소문자, 공백·문장부호·기호 제거 (한글 호환 자모는 그대로 두려고 NFKC 대신 NFC) */
export function normalize(s: string): string {
  return s.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");
}

const CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ";
/** 한글 음절을 초성으로 바꾼다 (그 밖의 글자는 그대로) */
export function chosung(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    out += c >= 0xac00 && c <= 0xd7a3 ? CHO[Math.floor((c - 0xac00) / 588)] : ch;
  }
  return out;
}

const isChosungOnly = (s: string) => /^[ㄱ-ㅎ]+$/.test(s);

function toRef(id: string): SearchTagRef | null {
  const d = tagById(id);
  return d ? { id: d.id, label: d.label, emoji: d.emoji, kind: d.kind } : null;
}
const toRefs = (ids: string[]) => ids.map(toRef).filter((r): r is SearchTagRef => r !== null);

let cache: { builtAt: number; entries: Entry[] } | null = null;

function buildIndex(store: SqliteStore): Entry[] {
  const t0 = Date.now();
  const src = store.searchSource();
  const aliasMap = new Map<string, string[]>();
  for (const a of src.aliases) {
    const list = aliasMap.get(a.channelId);
    if (list) list.push(a.name);
    else aliasMap.set(a.channelId, [a.name]);
  }
  const tagMap = new Map(src.lastTags.map((t) => [t.channelId, t.tags]));
  const actMap = new Map(src.activity.map((a) => [a.channelId, a]));

  const entries: Entry[] = [];
  for (const ch of src.channels) {
    const names: string[] = [];
    const rawNames: string[] = [];
    for (const raw of [ch.name, ...(aliasMap.get(ch.channelId) ?? [])]) {
      const n = normalize(raw);
      if (!n || names.includes(n)) continue;
      names.push(n);
      rawNames.push(raw);
    }
    if (names.length === 0) continue;
    const act = actMap.get(ch.channelId);
    entries.push({
      platform: ch.platform,
      channelId: ch.channelId,
      name: ch.name,
      names,
      rawNames,
      cho: names.map(chosung),
      tags: resolveChannelTags(ch.channelId, tagMap.get(ch.channelId) ?? []),
      lastDate: act?.lastDate ?? null,
      vm30: act?.viewerMinutes30 ?? 0,
      peak: act?.peak ?? 0,
      firstSeenAt: ch.firstSeenAt,
      group: null,
    });
  }
  // 유튜브 전용 버튜버: 이름·별칭·유튜브 채널명·핸들·소속으로
  for (const v of store.youtube.listVtubers()) {
    const ch = store.youtube.getChannel(v.ytChannelId);
    const names: string[] = [];
    const rawNames: string[] = [];
    for (const raw of [v.name, ...v.aliases, ch?.title ?? "", ch?.handle ?? "", v.group ?? ""]) {
      const n = normalize(raw);
      if (!n || names.includes(n)) continue;
      names.push(n);
      rawNames.push(raw);
    }
    if (names.length === 0) continue;
    entries.push({
      platform: "youtube",
      channelId: v.ytChannelId,
      name: v.name,
      names,
      rawNames,
      cho: names.map(chosung),
      tags: [],
      lastDate: null,
      vm30: 0,
      peak: 0,
      firstSeenAt: v.addedAt,
      group: v.group,
    });
  }
  log.info(`검색 색인 ${entries.length}개 채널 (${Date.now() - t0}ms)`);
  return entries;
}

function getIndex(store: SqliteStore): Entry[] {
  if (!cache || Date.now() - cache.builtAt > INDEX_TTL_MS) {
    cache = { builtAt: Date.now(), entries: buildIndex(store) };
  }
  return cache.entries;
}

/** '#노래' 같은 태그 토큰 → 태그 id (이름·id 가 같으면 우선, 없으면 앞부분·포함 순) */
function resolveTagToken(token: string): string | null {
  const t = normalize(token);
  if (!t) return null;
  const by = (pred: (label: string, id: string) => boolean) =>
    TAG_CATALOG.find((d) => pred(normalize(d.label), d.id.toLowerCase()))?.id ?? null;
  return (
    by((l, id) => l === t || id === t) ??
    by((l) => l.startsWith(t)) ??
    by((l) => l.includes(t))
  );
}

/** 이름 일치 점수 (0 = 불일치). 현재 이름이 다른 이름보다, 정확·앞부분·포함 순으로 높다 */
function matchScore(e: Entry, q: string, cho: string | null): { score: number; alias: number } {
  let best = 0;
  let alias = -1;
  e.names.forEach((n, i) => {
    const cur = i === 0;
    const s = n === q ? (cur ? 100 : 70) : n.startsWith(q) ? (cur ? 80 : 55) : n.includes(q) ? (cur ? 60 : 45) : 0;
    if (s > best) {
      best = s;
      alias = cur ? -1 : i;
    }
  });
  if (cho) {
    e.cho.forEach((c, i) => {
      const s = c.startsWith(cho) ? 50 : c.includes(cho) ? 40 : 0;
      if (s > best) {
        best = s;
        alias = i === 0 ? -1 : i;
      }
    });
  }
  return { score: best, alias };
}

export function searchChannels(
  store: SqliteStore,
  lives: LiveItem[],
  opts: { q?: string; tags?: string[]; limit?: number; offset?: number },
): SearchResponse {
  const entries = getIndex(store);
  const qRaw = (opts.q ?? "").trim().slice(0, 100);
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), MAX_LIMIT);
  const offset = Math.max(opts.offset ?? 0, 0);

  // 검색어 = 이름 부분 + '#태그' 부분
  const tokens = qRaw.split(/\s+/).filter(Boolean);
  const tagTokens = tokens.filter((t) => t.startsWith("#")).map((t) => t.replace(/^#+/, "")).filter(Boolean);
  const text = tokens.filter((t) => !t.startsWith("#")).join(" ");

  const required = new Set<string>((opts.tags ?? []).filter((id) => tagById(id)));
  const unknownTags: string[] = [];
  for (const tok of tagTokens) {
    const id = resolveTagToken(tok);
    if (id) required.add(id);
    else unknownTags.push(tok);
  }

  const q = normalize(text);
  const compact = text.replace(/\s+/g, "");
  const cho = isChosungOnly(compact) ? compact : null;
  // 검색어가 태그 이름과 겹치면 태그 제안 (정확히 같으면 그 태그 채널도 결과에 넣는다)
  const exactTag = q ? (TAG_CATALOG.find((d) => normalize(d.label) === q || d.id === q)?.id ?? null) : null;
  // 한 글자는 태그 이름이 그 글자로 시작할 때만 ('유' → '카론유니버스' 같은 엉뚱한 제안 방지)
  const suggested = q
    ? TAG_CATALOG.filter((d) => {
        const l = normalize(d.label);
        return l.startsWith(q) || (q.length >= 2 && (l.includes(q) || q.includes(l)));
      }).map((d) => d.id)
    : [];

  const liveMap = new Map<string, LiveItem>();
  for (const l of lives) {
    const prev = liveMap.get(l.channelId);
    if (!prev || l.viewers > prev.viewers) liveMap.set(l.channelId, l);
  }

  type Hit = { e: Entry; score: number; alias: number };
  const hits: Hit[] = [];
  for (const e of entries) {
    let score = 1;
    let alias = -1;
    if (q || cho) {
      const m = matchScore(e, q, cho);
      score = m.score;
      alias = m.alias;
      if (exactTag && e.tags.includes(exactTag)) score = Math.max(score, 30);
      if (score === 0) continue;
    }
    hits.push({ e, score, alias });
  }

  // 태그 필터 전 개수 (태그 칩 옆 숫자)
  const counts = new Map<string, number>();
  for (const h of hits) for (const id of h.e.tags) counts.set(id, (counts.get(id) ?? 0) + 1);

  // 모르는 '#태그' 가 있으면 결과 없음 (전체 목록이 나오면 태그로 거른 것처럼 보인다)
  const filtered = unknownTags.length
    ? []
    : required.size
      ? hits.filter((h) => [...required].every((id) => h.e.tags.includes(id)))
      : hits;
  filtered.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const la = liveMap.get(a.e.channelId);
    const lb = liveMap.get(b.e.channelId);
    if (!!lb !== !!la) return lb ? 1 : -1;
    if (la && lb && lb.viewers !== la.viewers) return lb.viewers - la.viewers;
    if (b.e.vm30 !== a.e.vm30) return b.e.vm30 - a.e.vm30;
    if (b.e.peak !== a.e.peak) return b.e.peak - a.e.peak;
    return a.e.name.localeCompare(b.e.name, "ko");
  });

  const results: SearchResult[] = filtered.slice(offset, offset + limit).map(({ e, alias }) => {
    const live = liveMap.get(e.channelId);
    return {
      platform: e.platform,
      channelId: e.channelId,
      name: e.name,
      matchedName: alias > 0 ? (e.rawNames[alias] ?? null) : null,
      tags: toRefs(e.tags),
      isLive: !!live,
      livePlatform: live ? live.platform : null,
      viewers: live ? live.viewers : null,
      liveTitle: live ? live.title : null,
      lastLiveDate: e.lastDate,
      firstSeenAt: e.firstSeenAt,
      group: e.group,
    };
  });

  return {
    q: qRaw,
    tags: toRefs([...required]),
    unknownTags,
    suggestedTags: toRefs(suggested.filter((id) => !required.has(id)).slice(0, 5)),
    total: filtered.length,
    results,
    tagCounts: TAG_CATALOG.map((d) => ({
      id: d.id,
      label: d.label,
      emoji: d.emoji,
      kind: d.kind,
      count: counts.get(d.id) ?? 0,
    })),
  };
}

/** 시험용 — 색인 캐시 비우기 */
export function resetSearchIndex(): void {
  cache = null;
}
