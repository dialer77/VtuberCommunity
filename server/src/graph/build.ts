// 관계 그래프 (지식 그래프) — 흩어진 데이터의 연결을 한곳에 모은다. 기존 테이블은 그대로 두고 30분마다 메모리에 다시 만든다.
//
//  점(node)   v:플랫폼:채널ID 버튜버 · a:태그ID 소속사 · gr:키 그룹(유튜브 전용 버튜버 소속) · g:키 게임·콘텐츠 · e:키 사건·밈 · i:slug 이슈
//  선(edge)   member  버튜버 → 소속사·그룹          (소속사 명단·방송 태그, 유튜브 전용 버튜버 소속)
//             collab  버튜버 ↔ 버튜버               (키리누키 공동 출연 2번 이상, 무게 = 횟수)
//             plays   버튜버 → 게임                 (그 게임 클립 2개 이상, 무게 = 클립 수)
//             event   버튜버 → 사건                 (그 사건 클립에 나옴, 무게 = 클립 수)
//             about   사건 → 게임                   (그 사건 클립의 주제)
//             mentions 이슈 → 버튜버·소속사          (이슈에 적힌 이름을 버튜버로 연결)
//  운영자 수정(graph_overrides)으로 관계를 더하거나 막고, 검색어(graph_aliases)를 대상에 잇는다.
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import { TAG_CATALOG, resolveChannelTags } from "../tags/catalog";
import { isGenericTopic, topicKey } from "../clips/topics";
import { log } from "../log";

export type NodeType = "vtuber" | "agency" | "group" | "game" | "event" | "issue";
export type EdgeType = "member" | "collab" | "plays" | "event" | "about" | "mentions";

export interface GNode {
  id: string;
  type: NodeType;
  label: string;
  /** 버튜버 */
  platform?: Platform;
  channelId?: string;
  /** 최근 30일 시청량(버튜버 순서용) · 클립 수(게임·사건) */
  score: number;
  /** 이슈 날짜·소속사 이모지 등 */
  sub?: string;
  /** 소속사 태그 ID · 이슈 slug · 게임·사건 이름 (주소용) */
  key: string;
}

export interface GEdge {
  to: string;
  type: EdgeType;
  weight: number;
  manual?: boolean;
}

export interface Graph {
  nodes: Map<string, GNode>;
  adj: Map<string, GEdge[]>;
  /** 정규화한 이름 → 점 (이름이 겹치면 여럿) */
  names: Map<string, string[]>;
  builtAt: number;
  /** 이슈에 적혔지만 버튜버로 잇지 못한 이름 (운영 확인용) */
  unlinkedIssueNames: { slug: string; name: string }[];
}

const TTL_MS = 30 * 60_000;
const MIN_GAME_CLIPS = 3;
const MIN_EVENT_CLIPS = 2;
const MIN_COLLAB = 2;
const MIN_PLAYS = 2;
const ACTIVE_DAYS = 180;
/** 이슈에 적혀도 사람이 아닌 이름 (플랫폼·일반 낱말) */
const NOT_PERSON = new Set(["soop", "숲", "치지직", "chzzk", "유튜브", "youtube", "아프리카tv", "아프리카", "트위치", "twitch", "네이버", "버튜버", "버추얼", "vtuber"]);
/** 게임·콘텐츠라고 하기 어려운 주제 ("스텔라이브 합방", "잡담" 등) */
const GENERIC_PART = /(합방|잡담|저챗|토크|소통|방송|콘텐츠|컨텐츠)$/;

export const vtuberId = (platform: Platform, channelId: string) => `v:${platform}:${channelId}`;
export const gameId = (topic: string) => `g:${topicKey(topic)}`;
export const eventId = (event: string) => `e:${topicKey(event)}`;
export const norm = (s: string) => s.normalize("NFC").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "");

let cache: Graph | null = null;

export function getGraph(store: SqliteStore): Graph {
  if (!cache || Date.now() - cache.builtAt > TTL_MS) cache = buildGraph(store);
  return cache;
}

/** 운영자 수정 직후 등 — 다음 요청 때 다시 만든다 */
export function resetGraph(): void {
  cache = null;
}

export function buildGraph(store: SqliteStore): Graph {
  const t0 = Date.now();
  const nodes = new Map<string, GNode>();
  const edges = new Map<string, GEdge & { from: string }>();
  const names = new Map<string, string[]>();
  const addName = (raw: string, id: string) => {
    const k = norm(raw);
    if (k.length < 2) return;
    const list = names.get(k);
    if (!list) names.set(k, [id]);
    else if (!list.includes(id)) list.push(id);
  };
  const addEdge = (a: string, b: string, type: EdgeType, weight: number, directed: boolean) => {
    if (a === b || !nodes.has(a) || !nodes.has(b)) return;
    const [x, y] = directed || a < b ? [a, b] : [b, a];
    const k = `${x}|${y}|${type}`;
    const cur = edges.get(k);
    if (cur) cur.weight += weight;
    else edges.set(k, { from: x, to: y, type, weight });
  };

  // ---- 버튜버 (치지직·SOOP): 최근 활동 + 소속사
  const src = store.searchSource();
  const act = new Map(src.activity.map((a) => [a.channelId, a]));
  const tags = new Map(src.lastTags.map((t) => [t.channelId, t.tags]));
  const sinceDay = new Date(Date.now() - ACTIVE_DAYS * 86_400_000 + 9 * 3_600_000).toISOString().slice(0, 10);
  const clipRows = store.clips.graphRows();
  const inClips = new Set(clipRows.flatMap((c) => c.vtubers.map((v) => v.channelId)));
  const agencyTags = new Set(TAG_CATALOG.filter((t) => t.kind === "agency").map((t) => t.id));
  // 소속사 점은 모두 미리 (멤버가 없어도 이슈가 이름으로 이을 수 있게 — 이어진 데가 없으면 끝에서 뺀다)
  for (const t of TAG_CATALOG.filter((x) => x.kind === "agency")) {
    const aid = `a:${t.id}`;
    nodes.set(aid, { id: aid, type: "agency", label: t.label, score: 0, sub: t.emoji, key: t.id });
    addName(t.label, aid);
  }
  const agencyNames = new Set(TAG_CATALOG.filter((t) => t.kind === "agency").map((t) => norm(t.label)));
  const isGame = (topic: string | null): topic is string => {
    if (!topic || isGenericTopic(topic)) return false;
    const k = norm(topic);
    return !agencyNames.has(k) && !GENERIC_PART.test(k);
  };
  for (const ch of src.channels) {
    const a = act.get(ch.channelId);
    const agencies = resolveChannelTags(ch.channelId, tags.get(ch.channelId) ?? []).filter((id) => agencyTags.has(id));
    const active = (a?.lastDate ?? "") >= sinceDay;
    if (!active && !inClips.has(ch.channelId) && agencies.length === 0) continue;
    const id = vtuberId(ch.platform, ch.channelId);
    nodes.set(id, { id, type: "vtuber", label: ch.name, platform: ch.platform, channelId: ch.channelId, score: a?.viewerMinutes30 ?? 0, key: ch.channelId });
    addName(ch.name, id);
    for (const ag of agencies) addEdge(id, `a:${ag}`, "member", 1, true);
  }
  const chById = new Map(src.channels.map((c) => [c.channelId, c]));
  for (const al of src.aliases) {
    const ch = chById.get(al.channelId);
    if (ch && nodes.has(vtuberId(ch.platform, ch.channelId))) addName(al.name, vtuberId(ch.platform, ch.channelId));
  }

  // ---- 유튜브 전용 버튜버 + 소속(그룹)
  for (const v of store.youtube.listVtubers()) {
    const id = vtuberId("youtube", v.ytChannelId);
    nodes.set(id, { id, type: "vtuber", label: v.name, platform: "youtube", channelId: v.ytChannelId, score: 0, key: v.ytChannelId });
    for (const n of [v.name, ...v.aliases]) addName(n, id);
    if (v.group) {
      // 소속사 태그 이름과 같으면 그 소속사로, 아니면 그룹 점
      const ag = TAG_CATALOG.find((t) => t.kind === "agency" && norm(t.label) === norm(v.group!));
      const gid = ag ? `a:${ag.id}` : `gr:${norm(v.group)}`;
      if (!nodes.has(gid)) {
        nodes.set(gid, ag ? { id: gid, type: "agency", label: ag.label, score: 0, sub: ag.emoji, key: ag.id } : { id: gid, type: "group", label: v.group, score: 0, key: v.group });
        addName(v.group, gid);
      }
      addEdge(id, gid, "member", 1, true);
    }
  }

  // ---- 키리누키: 합방 · 게임 · 사건
  const gameClips = new Map<string, { label: string; n: number }>();
  const eventClips = new Map<string, { label: string; n: number; last: string }>();
  for (const c of clipRows) {
    if (isGame(c.topic)) {
      const g = gameClips.get(gameId(c.topic)) ?? { label: c.topic, n: 0 };
      g.n++;
      gameClips.set(gameId(c.topic), g);
    }
    if (c.event) {
      const e = eventClips.get(eventId(c.event)) ?? { label: c.event, n: 0, last: "" };
      e.n++;
      if (c.publishedAt > e.last) e.last = c.publishedAt;
      eventClips.set(eventId(c.event), e);
    }
  }
  for (const [id, g] of gameClips) {
    if (g.n < MIN_GAME_CLIPS) continue;
    nodes.set(id, { id, type: "game", label: g.label, score: g.n, key: g.label });
    addName(g.label, id);
  }
  for (const [id, e] of eventClips) {
    if (e.n < MIN_EVENT_CLIPS) continue;
    nodes.set(id, { id, type: "event", label: e.label, score: e.n, sub: e.last.slice(0, 10), key: e.label });
    addName(e.label, id);
  }
  // 게임 별칭(마크 → 마인크래프트)도 검색어로
  for (const [aliasKey, canonical] of store.clips.topicAliasMap()) {
    const gid = gameId(canonical);
    if (nodes.has(gid)) {
      const list = names.get(aliasKey);
      if (!list) names.set(aliasKey, [gid]);
      else if (!list.includes(gid)) list.push(gid);
    }
  }
  const collab = new Map<string, number>();
  const plays = new Map<string, number>();
  for (const c of clipRows) {
    const vs = [...new Set(c.vtubers.map((v) => vtuberId(v.platform, v.channelId)))].filter((id) => nodes.has(id));
    for (let i = 0; i < vs.length; i++) {
      for (let j = i + 1; j < vs.length; j++) {
        const k = vs[i]! < vs[j]! ? `${vs[i]}|${vs[j]}` : `${vs[j]}|${vs[i]}`;
        collab.set(k, (collab.get(k) ?? 0) + 1);
      }
    }
    const g = isGame(c.topic) ? gameId(c.topic) : null;
    const e = c.event ? eventId(c.event) : null;
    for (const v of vs) {
      if (g && nodes.has(g)) plays.set(`${v}|${g}`, (plays.get(`${v}|${g}`) ?? 0) + 1);
      if (e && nodes.has(e)) addEdge(v, e, "event", 1, true);
    }
    if (e && g && nodes.has(e) && nodes.has(g)) addEdge(e, g, "about", 1, true);
  }
  for (const [k, n] of collab) if (n >= MIN_COLLAB) addEdge(k.split("|")[0]!, k.split("|")[1]!, "collab", n, false);
  for (const [k, n] of plays) if (n >= MIN_PLAYS) addEdge(k.split("|")[0]!, k.split("|")[1]!, "plays", n, true);

  // ---- 이슈 → 버튜버·소속사 (이름으로 잇기: 정확히 같은 이름, 괄호 앞부분, 이름이 겹치면 잇지 않음)
  const unlinkedIssueNames: Graph["unlinkedIssueNames"] = [];
  for (const is of store.listIssues(500)) {
    const id = `i:${is.slug}`;
    nodes.set(id, { id, type: "issue", label: is.title, score: 0, sub: is.eventDate ?? is.publishedAt.slice(0, 10), key: is.slug });
    for (const raw of is.vtubers) {
      const cands = [raw, raw.replace(/\s*[([（].*$/, "")].map(norm).filter((k) => k.length >= 2);
      if (cands.every((k) => NOT_PERSON.has(k))) continue;
      const hit = cands.map((k) => names.get(k) ?? []).find((list) => list.filter((n) => nodes.get(n)?.type !== "issue").length === 1);
      const target = hit?.find((n) => nodes.get(n)?.type !== "issue");
      if (target) addEdge(id, target, "mentions", 1, true);
      else unlinkedIssueNames.push({ slug: is.slug, name: raw });
    }
  }

  // ---- 운영자 수정
  for (const o of store.graph.overrides()) {
    const k1 = `${o.a}|${o.b}|${o.type}`;
    const k2 = `${o.b}|${o.a}|${o.type}`;
    if (o.action === "block") {
      edges.delete(k1);
      edges.delete(k2);
    } else if (nodes.has(o.a) && nodes.has(o.b) && !edges.has(k1) && !edges.has(k2)) {
      edges.set(k1, { from: o.a, to: o.b, type: o.type as EdgeType, weight: 1, manual: true });
    }
  }
  for (const al of store.graph.aliases()) {
    if (nodes.has(al.nodeId)) names.set(al.key, [al.nodeId]);
  }

  // 인접 목록 (양쪽에서 보이게)
  const adj = new Map<string, GEdge[]>();
  const push = (from: string, e: GEdge) => {
    const list = adj.get(from);
    if (list) list.push(e);
    else adj.set(from, [e]);
  };
  for (const e of edges.values()) {
    push(e.from, { to: e.to, type: e.type, weight: e.weight, ...(e.manual ? { manual: true } : {}) });
    push(e.to, { to: e.from, type: e.type, weight: e.weight, ...(e.manual ? { manual: true } : {}) });
  }
  // 이어진 데가 없는 버튜버·이슈는 빼서 가볍게 (검색 이름표는 남김)
  for (const [id, n] of nodes) if (n.type !== "game" && n.type !== "event" && !adj.has(id)) nodes.delete(id);

  log.info(`관계 그래프: 점 ${nodes.size} · 선 ${edges.size} (${Date.now() - t0}ms)`);
  return { nodes, adj, names, builtAt: Date.now(), unlinkedIssueNames };
}
