import { proxyUserApi } from "@/lib/auth";

/** 탈퇴 — 사용자 데이터 전부 삭제 */
export async function DELETE() {
  return proxyUserApi("", "DELETE");
}
