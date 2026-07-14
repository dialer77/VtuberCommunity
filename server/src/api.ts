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

  return app;
}
