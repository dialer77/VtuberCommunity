import { proxyUserApi } from "@/lib/auth";

type Ctx = { params: Promise<{ videoId: string }> };

/** 태그 투표 { tag, vote: 1 | -1 | 0 } */
export async function PUT(req: Request, { params }: Ctx) {
  const { videoId } = await params;
  return proxyUserApi(`/votes/${encodeURIComponent(videoId)}`, "PUT", await req.text());
}
