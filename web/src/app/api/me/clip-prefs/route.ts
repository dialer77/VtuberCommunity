import { proxyUserApi } from "@/lib/auth";

// 로그인 사용자의 클립 취향 설정 (관심 없음·숨긴 채널·덜 볼 주제·좋아하는 순간)
export async function GET() {
  return proxyUserApi("/clip-prefs", "GET");
}

export async function PUT(req: Request) {
  return proxyUserApi("/clip-prefs", "PUT", await req.text(), 20_000);
}
