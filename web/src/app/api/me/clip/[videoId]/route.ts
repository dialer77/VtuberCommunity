import { proxyUserApi } from "@/lib/auth";

type Ctx = { params: Promise<{ videoId: string }> };

/** 클립 하나에 대한 내 상태 (좋아요 · 내 태그 투표 · 재생목록에 담겼는지) */
export async function GET(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  return proxyUserApi(`/clip/${encodeURIComponent(videoId)}`, "GET");
}
