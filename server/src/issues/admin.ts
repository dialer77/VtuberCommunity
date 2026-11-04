// 이슈 관리 CLI (배포 PC 에서 deploy\windows\issues.ps1 로 실행)
//   run [시간]      지금 바로 수집 (기본: 마지막 실행 이후)
//   list [개수]     최근 이슈 (숨김 포함)
//   hide <slug>     화면에서 숨김
//   show <slug>     다시 공개
//   status          자동 수집 상태
import { SqliteStore } from "../store/sqlite";
import { config } from "../config";
import { collectIssues } from "./collector";
import { resolveClaudeBin } from "./claude";

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
    console.log(
      JSON.stringify(
        {
          enabled: config.issuesEnabled,
          intervalMin: config.issuesIntervalMin,
          claudeBin: bin,
          auth: process.env.CLAUDE_CODE_OAUTH_TOKEN ? "CLAUDE_CODE_OAUTH_TOKEN (구독 토큰)" : "로그인된 사용자 계정",
          lastAttempt: store.getMeta("issues_last_attempt"),
          lastStatus: store.getMeta("issues_last_status"),
          lastResult: JSON.parse(store.getMeta("issues_last_result") ?? "null"),
        },
        null,
        2,
      ),
    );
    break;
  }
  default:
    console.log("사용법: run [시간] | list [개수] | hide <slug> | show <slug> | status");
}
