// 관계 그래프 → API 응답: 한 점을 가운데 둔 관계도(마인드맵), 게임·사건 페이지, 검색 바로가기
import type { SqliteStore } from "../store/sqlite";
import type { Platform } from "../domain";
import { toClipOuts } from "../clips/view";
import { eventId, gameId, getGraph, norm, vtuberId, type EdgeType, type GEdge, type GNode, type Graph, type NodeType } from "./build";

export interface NodeOut {
  id: string;
  type: NodeType;
  label: string;
  sub: string | null;
  /** 사이트 안 주소 */
  href: string;
  /** 버튜버 프로필 (vtuber 만) */
  platform?: Platform;
  channelId?: string;
}

export interface MapGroup {
  key: string;
  label: string;
  items: { node: NodeOut; weight: number; manual?: boolean }[];
  /** 더 있는 수 */
  more: number;
}

export function nodeHref(n: GNode): string {
  switch (n.type) {
    case "vtuber":
      return `/vtuber/${n.platform}/${encodeURIComponent(n.channelId!)}`;
    case "game":
      return `/game/${encodeURIComponent(n.key)}`;
    case "event":
      return `/event/${encodeURIComponent(n.key)}`;
    case "issue":
      return `/issue/${encodeURIComponent(n.key)}`;
    default:
      return `/map?n=${encodeURIComponent(n.id)}`;
  }
}

export function nodeOut(n: GNode): NodeOut {
  return {
    id: n.id,
    type: n.type,
    label: n.label,
    sub: n.sub ?? null,
    href: nodeHref(n),
    ...(n.type === "vtuber" ? { platform: n.platform, channelId: n.channelId } : {}),
  };
}

const PER_GROUP = 12;

/** 점 id 의 이웃 중 type 관계, 상대 점 종류로 거르고 정렬 */
function neighbors(g: Graph, id: string, type: EdgeType, nodeType?: NodeType): { n: GNode; e: GEdge }[] {
  return (g.adj.get(id) ?? [])
    .filter((e) => e.type === type)
    .map((e) => ({ n: g.nodes.get(e.to)!, e }))
    .filter((x) => !!x.n && (!nodeType || x.n.type === nodeType));
}

function group(key: string, label: string, list: { n: GNode; weight: number; manual?: boolean }[], limit = PER_GROUP): MapGroup | null {
  if (list.length === 0) return null;
  return {
    key,
    label,
    items: list.slice(0, limit).map((x) => ({ node: nodeOut(x.n), weight: x.weight, ...(x.manual ? { manual: true } : {}) })),
    more: Math.max(0, list.length - limit),
  };
}

const byWeight = (a: { weight: number; n: GNode }, b: { weight: number; n: GNode }) => b.weight - a.weight || b.n.score - a.n.score;
const byDate = (a: { n: GNode }, b: { n: GNode }) => (b.n.sub ?? "").localeCompare(a.n.sub ?? "");

/** 이웃의 이웃을 무게 합으로 모으기 (예: 소속 멤버들이 많이 한 게임) */
function aggregate(g: Graph, from: GNode[], type: EdgeType, nodeType: NodeType, exclude: Set<string>) {
  const sum = new Map<string, number>();
  for (const f of from) for (const x of neighbors(g, f.id, type, nodeType)) if (!exclude.has(x.n.id)) sum.set(x.n.id, (sum.get(x.n.id) ?? 0) + x.e.weight);
  return [...sum.entries()].map(([id, w]) => ({ n: g.nodes.get(id)!, weight: w })).sort(byWeight);
}

/** 한 점을 가운데 둔 관계도 */
export function egoGraph(store: SqliteStore, id: string): { center: NodeOut; groups: MapGroup[] } | null {
  const g = getGraph(store);
  const c = g.nodes.get(id);
  if (!c) return null;
  const pick = (type: EdgeType, nodeType?: NodeType) => neighbors(g, id, type, nodeType).map((x) => ({ n: x.n, weight: x.e.weight, manual: x.e.manual }));
  const groups: (MapGroup | null)[] = [];
  if (c.type === "vtuber") {
    const orgs = pick("member");
    groups.push(group("member", "소속", orgs));
    groups.push(group("collab", "자주 합방", pick("collab").sort(byWeight)));
    const mates = new Map<string, GNode>();
    const collabIds = new Set(pick("collab").map((x) => x.n.id));
    for (const o of orgs) for (const m of neighbors(g, o.n.id, "member", "vtuber")) if (m.n.id !== id && !collabIds.has(m.n.id)) mates.set(m.n.id, m.n);
    groups.push(group("mates", "같은 소속", [...mates.values()].sort((a, b) => b.score - a.score).map((n) => ({ n, weight: 1 })), 10));
    groups.push(group("plays", "많이 한 게임", pick("plays").sort(byWeight), 10));
    groups.push(group("event", "엮인 사건·밈", pick("event").sort((a, b) => byDate(a, b) || b.weight - a.weight), 8));
    groups.push(group("issue", "관련 이슈", pick("mentions", "issue").sort(byDate), 6));
  } else if (c.type === "agency" || c.type === "group") {
    const members = pick("member", "vtuber").sort((a, b) => b.n.score - a.n.score);
    groups.push(group("members", "멤버", members, 24));
    const ex = new Set<string>();
    groups.push(group("plays", "멤버들이 많이 한 게임", aggregate(g, members.map((m) => m.n), "plays", "game", ex), 10));
    groups.push(group("event", "멤버들이 엮인 사건·밈", aggregate(g, members.map((m) => m.n), "event", "event", ex), 8));
    groups.push(group("issue", "관련 이슈", pick("mentions", "issue").sort(byDate), 6));
  } else if (c.type === "game") {
    const players = pick("plays", "vtuber").sort(byWeight);
    groups.push(group("players", "이 게임을 한 버튜버", players, 20));
    groups.push(group("event", "이 게임의 사건·밈", pick("about", "event").sort(byWeight), 10));
    groups.push(group("similar", "같이 많이 하는 게임", aggregate(g, players.slice(0, 30).map((p) => p.n), "plays", "game", new Set([id])), 8));
  } else if (c.type === "event") {
    groups.push(group("people", "나온 버튜버", pick("event", "vtuber").sort(byWeight), 20));
    groups.push(group("game", "게임·콘텐츠", pick("about", "game").sort(byWeight), 4));
  } else if (c.type === "issue") {
    groups.push(group("mentions", "관련 버튜버·소속사", pick("mentions").sort((a, b) => b.n.score - a.n.score), 20));
  }
  return { center: nodeOut(c), groups: groups.filter((x): x is MapGroup => !!x) };
}

/** 프로필의 '관계도' 탭을 보일지 (이웃 수) */
export function graphDegree(store: SqliteStore, platform: Platform, channelId: string): number {
  return getGraph(store).adj.get(vtuberId(platform, channelId))?.length ?? 0;
}

/** 게임·사건 페이지: 관계도 + 클립 */
export function topicPage(store: SqliteStore, kind: "game" | "event", name: string, limit: number, offset: number) {
  const g = getGraph(store);
  const id = kind === "game" ? gameId(name) : eventId(name);
  const node = g.nodes.get(id);
  if (!node) return null;
  const map = egoGraph(store, id)!;
  const r = store.clips.clipsByTopicOrEvent(kind === "game" ? "topic" : "event", node.key, limit, offset);
  return { ...map, clipTotal: r.total, clips: toClipOuts(store, r.clips) };
}

/** 검색 바로가기: 운영자가 이은 검색어 + 이름이 맞는 게임·사건·소속사·그룹 */
export function graphSearch(store: SqliteStore, q: string) {
  const g = getGraph(store);
  const key = norm(q);
  if (key.length < 2) return { shortcuts: [], topics: [] };
  const shortcuts = store.graph
    .aliases()
    .filter((a) => a.key === key)
    .map((a) => g.nodes.get(a.nodeId))
    .filter((n): n is GNode => !!n)
    .map(nodeOut);
  const topics: (NodeOut & { score: number })[] = [];
  for (const n of g.nodes.values()) {
    if (n.type !== "game" && n.type !== "event" && n.type !== "agency" && n.type !== "group") continue;
    const nk = norm(n.label);
    const aliasHit = (g.names.get(key) ?? []).includes(n.id);
    if (nk.includes(key) || aliasHit) topics.push({ ...nodeOut(n), score: (nk === key || aliasHit ? 1000 : 0) + n.score });
  }
  topics.sort((a, b) => b.score - a.score);
  return { shortcuts, topics: topics.slice(0, 8).map(({ score: _s, ...n }) => n) };
}

/** 사이트맵: 클립 3개 이상인 게임·사건 */
export function sitemapTopics(store: SqliteStore): { kind: "game" | "event"; name: string; lastAt: string | null }[] {
  const g = getGraph(store);
  const out: { kind: "game" | "event"; name: string; lastAt: string | null }[] = [];
  for (const n of g.nodes.values()) {
    if ((n.type === "game" || n.type === "event") && n.score >= 3) out.push({ kind: n.type, name: n.key, lastAt: n.type === "event" ? (n.sub ?? null) : null });
  }
  return out;
}

/** 운영: 이름·id 로 점 찾기 */
export function findNodes(store: SqliteStore, q: string): GNode[] {
  const g = getGraph(store);
  if (g.nodes.has(q)) return [g.nodes.get(q)!];
  return (g.names.get(norm(q)) ?? []).map((id) => g.nodes.get(id)).filter((n): n is GNode => !!n);
}
