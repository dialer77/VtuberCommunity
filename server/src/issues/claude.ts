// Claude Code 를 헤드리스(-p)로 실행해 구조화된 JSON 결과를 받는다.
// 인증은 Claude 구독: 배포 PC 에서는 CLAUDE_CODE_OAUTH_TOKEN(`claude setup-token` 으로 발급),
// 개발 PC 에서는 로그인된 사용자 계정을 그대로 쓴다. (API 키는 쓰지 않는다)
import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import { config } from "../config";

export interface ClaudeRunResult<T> {
  output: T;
  /** 구독에서는 실제 청구가 아니라 참고용 환산값 */
  costUsd: number | null;
  durationMs: number;
  numTurns: number;
}

/** claude 실행 파일 찾기. npm 설치(.cmd 래퍼)는 셸 없이 실행할 수 있게 내부 claude.exe 로 바꾼다. */
export function resolveClaudeBin(): string {
  const candidates: string[] = [];
  if (config.claudeBin) candidates.push(config.claudeBin);
  const appData = process.env.APPDATA ?? "";
  candidates.push(
    join(homedir(), ".local", "bin", process.platform === "win32" ? "claude.exe" : "claude"),
    join(appData, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"),
  );
  for (const dir of (process.env.PATH ?? "").split(process.platform === "win32" ? ";" : ":")) {
    if (!dir) continue;
    candidates.push(join(dir, process.platform === "win32" ? "claude.exe" : "claude"));
    if (process.platform === "win32") {
      // npm 전역 설치: <dir>\claude.cmd → <dir>\node_modules\@anthropic-ai\claude-code\bin\claude.exe
      candidates.push(join(dir, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe"));
    }
  }
  for (const c of candidates) {
    if (!c) continue;
    let p = c;
    if (p.toLowerCase().endsWith(".cmd")) {
      p = join(dirname(p), "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
    }
    if (existsSync(p)) return resolve(p);
  }
  throw new Error("claude 실행 파일을 찾을 수 없음 — CLAUDE_BIN 에 claude.exe 경로를 지정하세요");
}

export async function runClaudeJson<T>(
  prompt: string,
  schema: object,
  opts: { tools: string[]; timeoutMs?: number },
): Promise<ClaudeRunResult<T>> {
  const bin = resolveClaudeBin();
  // CLAUDE.md·프로젝트 설정이 끼어들지 않도록 빈 작업 폴더에서 실행
  const workDir = join(tmpdir(), "vmoa-claude-work");
  mkdirSync(workDir, { recursive: true });

  const env: NodeJS.ProcessEnv = { ...process.env };
  // 토큰 방식(배포 PC)이면 사용자 설정·플러그인과 분리된 전용 설정 폴더를 쓴다
  if (env.CLAUDE_CODE_OAUTH_TOKEN && !env.CLAUDE_CONFIG_DIR) {
    env.CLAUDE_CONFIG_DIR = resolve(dirname(config.dbPath), "claude-home");
    mkdirSync(env.CLAUDE_CONFIG_DIR, { recursive: true });
  }
  // API 키가 섞여 있으면 구독 대신 API 과금이 될 수 있으므로 제거
  delete env.ANTHROPIC_API_KEY;

  const args = [
    "-p",
    "--output-format", "json",
    "--json-schema", JSON.stringify(schema),
    "--setting-sources", "project",
    "--strict-mcp-config",
    "--no-session-persistence",
    "--disable-slash-commands",
    "--tools", opts.tools.join(","),
    "--allowedTools", ...opts.tools,
  ];
  if (config.claudeModel) args.push("--model", config.claudeModel);

  const started = Date.now();
  const timeoutMs = opts.timeoutMs ?? config.claudeTimeoutMs;

  const { stdout, stderr, code } = await new Promise<{ stdout: string; stderr: string; code: number | null }>(
    (resolvePromise, reject) => {
      const child = spawn(bin, args, { cwd: workDir, env, windowsHide: true });
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill();
        reject(new Error(`claude 실행 시간 초과 (${Math.round(timeoutMs / 1000)}초)`));
      }, timeoutMs);
      child.stdout.setEncoding("utf8").on("data", (d: string) => (out += d));
      child.stderr.setEncoding("utf8").on("data", (d: string) => (err += d));
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(e);
      });
      child.on("close", (c) => {
        clearTimeout(timer);
        resolvePromise({ stdout: out, stderr: err, code: c });
      });
      // 프롬프트는 stdin 으로 (명령줄 길이·따옴표 문제 회피)
      child.stdin.end(prompt, "utf8");
    },
  );

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    throw new Error(`claude 출력이 JSON 이 아님 (code=${code}): ${(stdout || stderr).slice(0, 400)}`);
  }
  if (parsed.is_error || parsed.subtype !== "success") {
    throw new Error(
      `claude 실행 실패 (${String(parsed.subtype)}): ${String(parsed.result ?? stderr).slice(0, 400)}`,
    );
  }
  if (parsed.structured_output === undefined || parsed.structured_output === null) {
    throw new Error(`구조화 출력 없음: ${String(parsed.result).slice(0, 400)}`);
  }
  return {
    output: parsed.structured_output as T,
    costUsd: typeof parsed.total_cost_usd === "number" ? parsed.total_cost_usd : null,
    durationMs: Date.now() - started,
    numTurns: Number(parsed.num_turns ?? 0),
  };
}
