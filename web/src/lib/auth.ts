import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const BACKEND = process.env.BACKEND_URL ?? "http://localhost:4000";

/** 구글 로그인 + 세션 키 + 백엔드 공유 시크릿이 모두 있어야 로그인 기능을 켠다 (next.config 의 NEXT_PUBLIC_AUTH_ENABLED 와 같은 조건) */
export const authEnabled = !!(
  process.env.GOOGLE_CLIENT_ID &&
  process.env.GOOGLE_CLIENT_SECRET &&
  process.env.NEXTAUTH_SECRET &&
  process.env.INTERNAL_SECRET
);

export const authOptions: NextAuthOptions = {
  providers: authEnabled
    ? [
        GoogleProvider({
          clientId: process.env.GOOGLE_CLIENT_ID as string,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
          // 이메일은 요청하지 않는다 — 식별값·이름·프로필 사진만
          authorization: { params: { scope: "openid profile" } },
        }),
      ]
    : [],
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.uid = `google:${account.providerAccountId}`;
        // 백엔드 일시 장애여도 로그인은 되게 (최애 저장 시 사용자 행을 다시 만든다)
        await fetch(`${BACKEND}/api/user/upsert`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-internal-secret": process.env.INTERNAL_SECRET as string,
          },
          body: JSON.stringify({ id: token.uid, name: token.name, image: token.picture }),
          signal: AbortSignal.timeout(5000),
        }).catch(() => undefined);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.uid === "string") session.user.id = token.uid;
      return session;
    },
  },
};

/** 로그인한 사용자 id (없으면 null) */
export async function currentUserId(): Promise<string | null> {
  if (!authEnabled) return null;
  const session = await getServerSession(authOptions);
  return session?.user?.id ?? null;
}

const json = (body: unknown, status = 200) => Response.json(body, { status });

/**
 * 로그인 사용자의 백엔드 사용자 API 호출을 대신한다 (시크릿은 서버에만 있음).
 * path 는 /api/user/:id 뒤에 붙는 경로.
 */
export async function proxyUserApi(path: string, method: string, body?: string, maxBody = 4096): Promise<Response> {
  const uid = await currentUserId();
  if (!uid) return json({ error: "login_required" }, 401);
  if (body && body.length > maxBody) return json({ error: "too_large" }, 413);
  try {
    const res = await fetch(`${BACKEND}/api/user/${encodeURIComponent(uid)}${path}`, {
      method,
      headers: {
        "x-internal-secret": process.env.INTERNAL_SECRET as string,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    return new Response(await res.text(), {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return json({ error: "backend_unavailable" }, 502);
  }
}
