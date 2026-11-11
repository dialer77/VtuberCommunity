// 검색 화면이 입력할 때마다 부르는 같은 출처 프록시 (백엔드 주소를 브라우저에 드러내지 않는다)
const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";
const KEYS = ["q", "tag", "limit", "offset"] as const;

export async function GET(req: Request) {
  const from = new URL(req.url).searchParams;
  const sp = new URLSearchParams();
  for (const k of KEYS) {
    const v = from.get(k);
    if (v) sp.set(k, v.slice(0, 200));
  }
  try {
    const res = await fetch(`${BACKEND}/api/search?${sp}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json({ error: "backend_unavailable" }, { status: 502 });
  }
}
