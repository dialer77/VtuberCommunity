// 지금 돌고 있는 코드의 git 커밋 (배포 PC 자동 업데이트 확인용 — /health 에 노출).
// git 명령 대신 .git 파일을 직접 읽는다 (SYSTEM 계정·PATH 영향 없음).
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

function readCommit(): string {
  try {
    const gitDir = resolve(process.cwd(), "..", ".git");
    const head = readFileSync(join(gitDir, "HEAD"), "utf8").trim();
    if (!head.startsWith("ref: ")) return head.slice(0, 7); // detached HEAD
    const ref = head.slice(5);
    const refFile = join(gitDir, ref);
    if (existsSync(refFile)) return readFileSync(refFile, "utf8").trim().slice(0, 7);
    const packed = readFileSync(join(gitDir, "packed-refs"), "utf8");
    const line = packed.split("\n").find((l) => l.endsWith(` ${ref}`));
    return line ? line.slice(0, 7) : "unknown";
  } catch {
    return "unknown";
  }
}

/** 서버 시작 시점의 커밋 (재시작 전까지 고정) */
export const VERSION = readCommit();
export const STARTED_AT = new Date().toISOString();
