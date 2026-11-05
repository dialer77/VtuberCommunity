// 이슈 관리 CLI (배포 PC 에서 deploy\windows\issues.ps1 로 실행)
//   run [시간]      지금 바로 수집 (기본: 마지막 실행 이후)
//   list [개수]     최근 이슈 (숨김 포함)
//   hide <slug>     화면에서 숨김
//   show <slug>     다시 공개
//   status          자동 수집 상태 (이슈·데뷔)
//   debuts-run      지금 바로 데뷔 소식 수집
//   debuts-list [n] 데뷔 소식 목록 (번호 확인용)
//   debuts-hide <번호> / debuts-show <번호>
//   registry-list   버튜버 확정 목록
import { SqliteStore } from "../store/sqlite";
import { config } from "../config";
import { collectIssues } from "./collector";
import { resolveClaudeBin } from "./claude";
import { collectDebuts } from "../debuts/collector";

const [cmd = "status", arg] = process.argv.slice(2);
const store = new SqliteStore(config.dbPath);

switch (cmd) {
  case "run": {
    const s = await collectIssues(store, arg ? Number(arg) : undefined);
    store.setMeta("issues_last_attempt", new Date().toISOString());
    store.setMeta("issues_last_status", "ok");
    store.setMeta("issues_last_result", JSON.stringify({ at: new Date().toISOString(), manual: true, ...s }));
    console.log(JSON.stringify(s, null, 2));
    break;
  }
  case "list": {
    for (const i of store.listIssues(Number(arg) || 20, true)) {
      console.log(`${i.status === "hidden" ? "[숨김] " : ""}${i.slug}  ${i.title}  (출처 ${i.sources.length})`);
    }
    break;
  }
  case "hide":
  case "show": {
    if (!arg) throw new Error(`사용법: ${cmd} <slug>`);
    const ok = store.setIssueStatus(arg, cmd === "hide" ? "hidden" : "published");
    console.log(ok ? `${cmd === "hide" ? "숨김" : "공개"}: ${arg}` : `없는 slug: ${arg}`);
    break;
  }
  case "status": {
    let bin = "(없음)";
    try {
      bin = resolveClaudeBin();
    } catch (e) {
      bin = String(e);
    }
    const job = (key: string) => ({
      lastAttempt: store.getMeta(`${key}_last_attempt`),
      lastStatus: store.getMeta(`${key}_last_status`),
      lastResult: JSON.parse(store.getMeta(`${key}_last_result`) ?? "null"),
    });
    console.log(
      JSON.stringify(
        {
          claudeBin: bin,
          auth: process.env.CLAUDE_CODE_OAUTH_TOKEN ? "CLAUDE_CODE_OAUTH_TOKEN (구독 토큰)" : "로그인된 사용자 계정",
          issues: { enabled: config.issuesEnabled, intervalMin: config.issuesIntervalMin, ...job("issues") },
          debuts: { enabled: config.debutsEnabled, intervalMin: config.debutsIntervalMin, ...job("debuts") },
          registry: store.listRegistry().length,
        },
        null,
        2,
      ),
    );
    break;
  }
  case "debuts-run": {
    const s = await collectDebuts(store);
    store.setMeta("debuts_last_attempt", new Date().toISOString());
    store.setMeta("debuts_last_status", "ok");
    store.setMeta("debuts_last_result", JSON.stringify({ at: new Date().toISOString(), manual: true, ...s }));
    console.log(JSON.stringify(s, null, 2));
    break;
  }
  case "debuts-list": {
    for (const r of store.listDebutReports(true, Number(arg) || 30)) {
      console.log(
        `#${r.id} ${r.hidden ? "[숨김] " : ""}${r.debutDate} ${r.status === "upcoming" ? "예정" : "데뷔"}  ${r.name}` +
          `${r.agency ? ` (${r.agency})` : ""}${r.channelUrl ? `  ${r.channelUrl}` : ""}  출처 ${r.sources.length}`,
      );
    }
    break;
  }
  case "debuts-hide":
  case "debuts-show": {
    if (!arg) throw new Error(`사용법: ${cmd} <번호>`);
    const ok = store.setDebutReportHidden(Number(arg), cmd === "debuts-hide");
    console.log(ok ? `${cmd === "debuts-hide" ? "숨김" : "공개"}: #${arg}` : `없는 번호: #${arg}`);
    break;
  }
  case "registry-list": {
    for (const r of store.listRegistry()) console.log(`${r.platform}  ${r.channelId}  ${r.name}`);
    break;
  }
  default:
    console.log(
      "사용법: status | run [시간] | list [개수] | hide <slug> | show <slug> | debuts-run | debuts-list [개수] | debuts-hide <번호> | debuts-show <번호> | registry-list",
    );
}
