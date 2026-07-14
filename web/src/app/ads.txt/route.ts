// AdSense ads.txt — 퍼블리셔 ID(NEXT_PUBLIC_ADSENSE_CLIENT, 예: ca-pub-XXXX)가
// 설정된 경우에만 유효한 라인을 반환한다.
export function GET(): Response {
  const client = process.env.NEXT_PUBLIC_ADSENSE_CLIENT; // "ca-pub-XXXXXXXX"
  const headers = { "content-type": "text/plain; charset=utf-8" };

  if (!client) {
    return new Response("# ads.txt — AdSense 미설정\n", { headers });
  }
  const pub = client.replace(/^ca-/, ""); // "pub-XXXXXXXX"
  return new Response(`google.com, ${pub}, DIRECT, f08c47fec0942fa0\n`, {
    headers,
  });
}
