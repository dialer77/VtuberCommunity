import { proxyUserApi } from "@/lib/auth";

type Ctx = { params: Promise<{ channelId: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const { channelId } = await params;
  return proxyUserApi(`/favorites/${encodeURIComponent(channelId)}`, "PATCH", await req.text());
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { channelId } = await params;
  return proxyUserApi(`/favorites/${encodeURIComponent(channelId)}`, "DELETE");
}
