import { proxyUserApi } from "@/lib/auth";

type Ctx = { params: Promise<{ videoId: string }> };

export async function PUT(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  return proxyUserApi(`/likes/${encodeURIComponent(videoId)}`, "PUT");
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  return proxyUserApi(`/likes/${encodeURIComponent(videoId)}`, "DELETE");
}
