import { proxyUserApi } from "@/lib/auth";

/** 내가 좋아요한 클립 (?limit=&offset=) */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const q = new URLSearchParams();
  for (const k of ["limit", "offset"]) {
    const v = u.searchParams.get(k);
    if (v && /^\d{1,5}$/.test(v)) q.set(k, v);
  }
  return proxyUserApi(`/likes${q.size ? `?${q}` : ""}`, "GET");
}
