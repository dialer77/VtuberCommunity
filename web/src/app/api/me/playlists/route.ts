import { proxyUserApi } from "@/lib/auth";

export async function GET() {
  return proxyUserApi("/playlists", "GET");
}

/** 새 재생목록 { title, videoId? } */
export async function POST(req: Request) {
  return proxyUserApi("/playlists", "POST", await req.text());
}
