import { proxyUserApi } from "@/lib/auth";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

/** 웹 푸시 공개키 (비밀 아님) */
export async function GET() {
  try {
    const res = await fetch(`${BACKEND}/api/push/public-key`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return Response.json({ enabled: false, publicKey: null }, { status: 502 });
  }
}

export async function POST(req: Request) {
  return proxyUserApi("/push", "POST", await req.text());
}

export async function DELETE(req: Request) {
  return proxyUserApi("/push", "DELETE", await req.text());
}
