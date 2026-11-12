// 추천 묶음 익명 측정 → 백엔드로 전달 (노출·열기·재생 합계만)
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

export async function POST(req: Request) {
  const text = await req.text();
  if (text.length > 4000) return new Response(null, { status: 413 });
  try {
    await fetch(`${BACKEND}/api/rec/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: text,
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 측정 실패는 사용자에게 영향 없음
  }
  return new Response(null, { status: 204 });
}
