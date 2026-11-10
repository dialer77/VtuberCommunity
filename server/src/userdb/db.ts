// 사용자 데이터 DB (Postgres). 지금은 배포 PC 의 Postgres 를 임시로 쓰고, 나중에 외부 DB 로 옮길 때는
// USER_DATABASE_URL 만 바꾸면 된다 (pg_dump → 복원 — docs/user-accounts.md).
// 방송 수집 데이터(SQLite)와 분리: 수집 DB 는 다시 쌓을 수 있지만 사용자 데이터는 복구할 수 없다.
import pg from "pg";
import { config } from "../config";
import { log } from "../log";

let pool: pg.Pool | null = null;

export function userDbEnabled(): boolean {
  return !!config.userDatabaseUrl;
}

export function db(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.userDatabaseUrl,
      max: 5,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
    });
    pool.on("error", (e) => log.error(`사용자 DB 연결 오류: ${String(e)}`));
  }
  return pool;
}

const MIGRATIONS: { id: number; sql: string }[] = [
  {
    id: 1,
    sql: `
      CREATE TABLE users (
        id            TEXT PRIMARY KEY,
        name          TEXT,
        image         TEXT,
        role          TEXT NOT NULL DEFAULT 'user',
        status        TEXT NOT NULL DEFAULT 'active',
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at TIMESTAMPTZ
      );
      CREATE TABLE favorites (
        user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform     TEXT NOT NULL,
        channel_id   TEXT NOT NULL,
        channel_name TEXT,
        notify       BOOLEAN NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, channel_id)
      );
      CREATE INDEX idx_favorites_channel ON favorites(channel_id);
      CREATE TABLE push_subscriptions (
        endpoint   TEXT PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        p256dh     TEXT NOT NULL,
        auth       TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_push_user ON push_subscriptions(user_id);
      CREATE TABLE notifications_sent (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        channel_id TEXT NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        sent_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, channel_id, started_at)
      );
      CREATE INDEX idx_sent_recent ON notifications_sent(user_id, channel_id, sent_at);
    `,
  },
  {
    // 4단계 키리누키 참여: 좋아요 · 내 재생목록 · 태그 투표 (영상은 유튜브 영상 ID 로만 가리킨다)
    id: 2,
    sql: `
      CREATE TABLE clip_likes (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id   TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, video_id)
      );
      CREATE INDEX idx_clip_likes_video ON clip_likes(video_id);
      CREATE TABLE playlists (
        id         BIGSERIAL PRIMARY KEY,
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX idx_playlists_user ON playlists(user_id);
      CREATE TABLE playlist_items (
        playlist_id BIGINT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
        video_id    TEXT NOT NULL,
        added_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (playlist_id, video_id)
      );
      CREATE TABLE clip_tag_votes (
        user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        video_id   TEXT NOT NULL,
        tag        TEXT NOT NULL,
        vote       SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        PRIMARY KEY (user_id, video_id, tag)
      );
      CREATE INDEX idx_clip_tag_votes_video ON clip_tag_votes(video_id);
    `,
  },
];

/** 아직 적용되지 않은 스키마 변경을 순서대로 적용 */
export async function migrateUserDb(): Promise<void> {
  const client = await db().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const done = new Set(
      (await client.query<{ id: number }>("SELECT id FROM schema_migrations")).rows.map((r) => r.id),
    );
    for (const m of MIGRATIONS) {
      if (done.has(m.id)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (id) VALUES ($1)", [m.id]);
        await client.query("COMMIT");
        log.info(`사용자 DB 스키마 적용: v${m.id}`);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
  } finally {
    client.release();
  }
}
