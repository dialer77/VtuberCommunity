import { config } from "./config";
import { startScheduler } from "./scheduler";
import { MemoryStore } from "./store/memory";
import { PostgresStore } from "./store/postgres";
import type { Store } from "./store/types";

function makeStore(): Store {
  return config.storeKind === "postgres"
    ? new PostgresStore()
    : new MemoryStore();
}

await startScheduler(makeStore());
