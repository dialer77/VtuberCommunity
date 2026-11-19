// 관계 그래프 관리 CLI (배포 PC 에서 deploy\windows\graph.ps1 로 실행). 바꾼 내용은 서버가 30분 안에 다시 읽는다.
//   status                          점·선 개수, 못 이은 이슈 이름 수
//   show <대상>                     그 대상의 관계도 (묶음별)
//   issues [개수]                   이슈에 적혔지만 버튜버로 잇지 못한 이름 (→ alias-add 로 이어 주기)
//   aliases                         운영자가 이은 검색어
//   alias-add <검색어> <대상>        검색어를 대상에 잇기 (애칭·줄임말·오타 → 정확한 곳, 이슈 이름 연결에도 쓰임)
//   alias-del <검색어>               검색어 연결 지우기
//   link <대상A> <대상B> <종류>      관계 더하기 (종류: member·collab·plays·event·about·mentions)
//   unlink <대상A> <대상B> <종류>    잘못된 관계 막기
//   reset <대상A> <대상B> <종류>     운영자 수정 지우기 (자동으로 되돌림)
// <대상>: 이름(버튜버·소속사·게임·사건) 또는 점 id (v:chzzk:<채널ID> · a:<소속사> · g:<게임> · e:<사건> · i:<이슈 slug>)
import { SqliteStore } from "../store/sqlite";
import { config } from "../config";
import { buildAgencyRoster, loadRosterSeed } from "../tags/roster";
import { setAgencyRoster } from "../tags/catalog";
import { getGraph, norm, type EdgeType, type GNode } from "./build";
import { egoGraph, findNodes } from "./view";

const [cmd = "status", arg1, arg2, arg3] = process.argv.slice(2);
const store = new SqliteStore(config.dbPath);
// 서버와 같은 소속사 명단
setAgencyRoster(
  buildAgencyRoster(
    store.listBroadcastTags(90),
    store
      .listDebutReports()
      .filter((r) => r.channelId && r.agency)
      .map((r) => ({ channelId: r.channelId as string, agency: r.agency as string })),
    loadRosterSeed(),
  ),
);

const TYPE_LABEL: Record<string, string> = { vtuber: "버튜버", agency: "소속사", group: "그룹", game: "게임·콘텐츠", event: "사건·밈", issue: "이슈" };
const EDGE_TYPES: EdgeType[] = ["member", "collab", "plays", "event", "about", "mentions"];

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

function resolve(raw: string | undefined): GNode {
  if (!raw) die("대상을 적어 주세요 (이름 또는 v:chzzk:<채널ID> · a:<소속사> · g:<게임> · e:<사건> · i:<이슈>)");
  const list = findNodes(store, raw.trim());
  if (list.length === 0) die(`'${raw}' 를 찾지 못했어요. 점 id 로 적어 주세요 (show 로 확인)`);
  if (list.length > 1) {
    console.error(`'${raw}' 가 여럿이에요. 점 id 로 다시 적어 주세요:`);
    for (const n of list) console.error(`  ${n.id}   ${n.label} (${TYPE_LABEL[n.type]})`);
    process.exit(1);
  }
  return list[0]!;
}

const edgeType = (raw: string | undefined): EdgeType => {
  if (!raw || !EDGE_TYPES.includes(raw as EdgeType)) die(`관계 종류: ${EDGE_TYPES.join(" · ")}`);
  return raw as EdgeType;
};

switch (cmd) {
  case "status": {
    const g = getGraph(store);
    const byType: Record<string, number> = {};
    for (const n of g.nodes.values()) byType[TYPE_LABEL[n.type] ?? n.type] = (byType[TYPE_LABEL[n.type] ?? n.type] ?? 0) + 1;
    const byEdge: Record<string, number> = {};
    for (const list of g.adj.values()) for (const e of list) byEdge[e.type] = (byEdge[e.type] ?? 0) + 0.5;
    console.log(
      JSON.stringify(
        { nodes: byType, edges: byEdge, unlinkedIssueNames: g.unlinkedIssueNames.length, aliases: store.graph.aliases().length, overrides: store.graph.overrides().length },
        null,
        2,
      ),
    );
    break;
  }
  case "show": {
    const n = resolve(arg1);
    const r = egoGraph(store, n.id)!;
    console.log(`${n.label}  (${TYPE_LABEL[n.type]} · ${n.id})`);
    for (const gr of r.groups) {
      console.log(`  ${gr.label}: ${gr.items.map((i) => `${i.node.label}${i.weight > 1 ? `(${i.weight})` : ""}${i.manual ? "*" : ""}`).join(", ")}${gr.more ? ` …+${gr.more}` : ""}`);
    }
    if (r.groups.length === 0) console.log("  (연결 없음)");
    break;
  }
  case "issues": {
    const g = getGraph(store);
    const counts = new Map<string, number>();
    for (const x of g.unlinkedIssueNames) counts.set(x.name, (counts.get(x.name) ?? 0) + 1);
    const list = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, Number(arg1) || 40);
    console.log(`버튜버로 잇지 못한 이슈 이름 ${counts.size}개 (많은 순) — 맞는 버튜버가 있으면: alias-add "이름" "버튜버"`);
    for (const [name, n] of list) console.log(`  ${name}  (${n}건)`);
    break;
  }
  case "aliases": {
    const g = getGraph(store);
    const list = store.graph.aliases();
    if (list.length === 0) console.log("(없음)");
    for (const a of list) console.log(`  ${a.alias} → ${g.nodes.get(a.nodeId)?.label ?? "(없는 대상)"}  ${a.nodeId}`);
    break;
  }
  case "alias-add": {
    if (!arg1) die("사용법: alias-add <검색어> <대상>");
    const n = resolve(arg2);
    const key = norm(arg1);
    if (key.length < 2) die("검색어는 두 글자 이상");
    store.graph.setAlias(key, arg1.trim(), n.id);
    console.log(`검색어 연결: ${arg1} → ${n.label} (${TYPE_LABEL[n.type]})`);
    break;
  }
  case "alias-del": {
    if (!arg1) die("사용법: alias-del <검색어>");
    console.log(store.graph.deleteAlias(norm(arg1)) ? `지움: ${arg1}` : `'${arg1}' 연결이 없어요`);
    break;
  }
  case "link":
  case "unlink": {
    const a = resolve(arg1);
    const b = resolve(arg2);
    const t = edgeType(arg3);
    store.graph.setOverride(a.id, b.id, t, cmd === "link" ? "add" : "block", "운영자");
    console.log(`${cmd === "link" ? "관계 더함" : "관계 막음"}: ${a.label} — ${b.label} (${t})`);
    break;
  }
  case "reset": {
    const a = resolve(arg1);
    const b = resolve(arg2);
    const t = edgeType(arg3);
    console.log(store.graph.clearOverride(a.id, b.id, t) ? `자동으로 되돌림: ${a.label} — ${b.label} (${t})` : "운영자 수정이 없어요");
    break;
  }
  default:
    console.log(
      "사용법: status | show <대상> | issues [개수] | aliases | alias-add <검색어> <대상> | alias-del <검색어> | link·unlink·reset <대상A> <대상B> <종류>",
    );
}
