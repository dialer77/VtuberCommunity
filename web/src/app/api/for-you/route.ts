// 내 취향 추천 — 본 기록·취향 설정을 백엔드로 넘겨 계산만 한다 (어디에도 저장하지 않음)
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 40_000) return Response.json({ error: "too_large" }, { status: 413 });
  try {
    const res = await fetch(`${BACKEND}/api/clips/for-you`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
  } catch {
    return Response.json({ error: "backend_unavailable" }, { status: 502 });
  }
}
