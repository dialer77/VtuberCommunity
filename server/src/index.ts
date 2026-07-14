import { config } from "./config";
import { startScheduler } from "./scheduler";
import { buildApi } from "./api";
import { SqliteStore } from "./store/sqlite";
import { MemoryStore } from "./store/memory";
import { PostgresStore } from "./store/postgres";
import type { Store } from "./store/types";
import { log } from "./log";

function makeStore(): Store {
  switch (config.storeKind) {
    case "postgres":
      return new PostgresStore();
    case "memory":
      return new MemoryStore();
    default:
      return new SqliteStore(config.dbPath);
  }
}

const store = makeStore();

// REST API (읽기 라우트는 SqliteStore 기준)
if (store instanceof SqliteStore) {
  const app = buildApi(store);
  await app.listen({ port: config.apiPort, host: "0.0.0.0" });
  log.info(
    `API http://localhost:${config.apiPort}  (/health, /api/lives, /api/debuts)`,
  );
}

// 수집 스케줄러
await startScheduler(store);
