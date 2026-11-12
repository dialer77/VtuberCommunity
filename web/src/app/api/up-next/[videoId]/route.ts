// 이어보기 후보 — 플레이어가 클립이 끝나면 이 중 안 본 첫 클립을 재생한다 (본 기록은 브라우저에만)
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

type Ctx = { params: Promise<{ videoId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { videoId } = await params;
  if (!/^[\w-]{11}$/.test(videoId)) return Response.json({ items: [] }, { status: 400 });
  try {
    const res = await fetch(`${BACKEND}/api/clips/${encodeURIComponent(videoId)}/next`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json({ items: [] }, { status: 502 });
  }
}
