import { proxyUserApi } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; videoId: string }> };

/** 재생목록에 담기 */
export async function PUT(_req: Request, { params }: Ctx) {
  const { id, videoId } = await params;
  return proxyUserApi(`/playlists/${encodeURIComponent(id)}/items/${encodeURIComponent(videoId)}`, "PUT");
}

/** 재생목록에서 빼기 */
export async function DELETE(_req: Request, { params }: Ctx) {
  const { id, videoId } = await params;
  return proxyUserApi(`/playlists/${encodeURIComponent(id)}/items/${encodeURIComponent(videoId)}`, "DELETE");
}
