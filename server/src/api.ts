import Fastify from "fastify";
import type { SqliteStore } from "./store/sqlite";

/** REST API — 웹(그리고 나중에 앱)이 소비하는 백엔드 엔드포인트. */
export function buildApi(store: SqliteStore) {
  const app = Fastify({ logger: false });

  app.get("/health", async () => ({ ok: true, ts: new Date().toISOString() }));

  // 현재 방송중 (최근 폴링 스냅샷)
  app.get("/api/lives", async () => {
    const lives = store.getCurrentLives();
    return { count: lives.length, lives };
  });

  // 최근 감지된 신규 채널(데뷔 후보)
  app.get("/api/debuts", async () => {
    const debuts = store.getRecentDebuts(20);
    return { count: debuts.length, debuts };
  });

  // 시청자 랭킹 (윈도우 내 평균)
  app.get("/api/ranking", async (req) => {
    const q = req.query as { window?: string; limit?: string };
    const ranking = store.getRanking(Number(q.window) || 180, Number(q.limit) || 30);
    return { count: ranking.length, ranking };
  });

  // 급상승 (윈도우 내 변화율)
  app.get("/api/rising", async (req) => {
    const q = req.query as { window?: string; limit?: string };
    const rising = store.getRising(Number(q.window) || 60, Number(q.limit) || 10);
    return { count: rising.length, rising };
  });

  return app;
}
