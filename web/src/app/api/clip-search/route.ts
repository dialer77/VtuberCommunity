// 키리누키 검색 (검색 화면이 입력할 때마다 부름) → 백엔드 /api/clips?q=
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

export async function GET(req: Request) {
  const from = new URL(req.url).searchParams;
  const q = (from.get("q") ?? "").trim().slice(0, 100);
  if (!q) return Response.json({ total: 0, clips: [] });
  const sp = new URLSearchParams({ q, limit: String(Math.min(12, Number(from.get("limit")) || 6)) });
  try {
    const res = await fetch(`${BACKEND}/api/clips?${sp}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ total: 0, clips: [] }, { status: 502 });
  }
}
