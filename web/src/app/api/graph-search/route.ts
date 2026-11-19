// 검색 바로가기 (검색 화면이 입력할 때마다 부름) → 백엔드 /api/graph/search?q=
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") ?? "").trim().slice(0, 60);
  if (q.length < 2) return Response.json({ shortcuts: [], topics: [] });
  try {
    const res = await fetch(`${BACKEND}/api/graph/search?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ shortcuts: [], topics: [] }, { status: 502 });
  }
}
