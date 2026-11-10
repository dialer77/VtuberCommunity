import { proxyUserApi } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return proxyUserApi(`/playlists/${encodeURIComponent(id)}`, "GET");
}

/** 이름 바꾸기 { title } */
export async function PATCH(req: Request, { params }: Ctx) {
  const { id } = await params;
  return proxyUserApi(`/playlists/${encodeURIComponent(id)}`, "PATCH", await req.text());
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const { id } = await params;
  return proxyUserApi(`/playlists/${encodeURIComponent(id)}`, "DELETE");
}
