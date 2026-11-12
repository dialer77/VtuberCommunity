import { proxyUserApi } from "@/lib/auth";

// 로그인 사용자의 본 클립 기록 (여러 기기에서 같은 추천) — 계정에 저장, 탈퇴하면 삭제
export async function GET() {
  return proxyUserApi("/watched", "GET");
}

export async function POST(req: Request) {
  return proxyUserApi("/watched", "POST", await req.text(), 20_000);
}

export async function DELETE() {
  return proxyUserApi("/watched", "DELETE");
}
