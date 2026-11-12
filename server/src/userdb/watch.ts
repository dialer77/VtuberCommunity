// 로그인 사용자의 본 클립 기록·클립 취향 설정 — 여러 기기에서 같은 추천을 받게 계정에 저장한다.
// (로그인하지 않으면 브라우저에만 저장하고 서버에는 남기지 않는다. 탈퇴하면 users 삭제와 함께 지워짐)
import { db } from "./db";

const MAX_HISTORY = 2000;
const VIDEO_ID = /^[\w-]{11}$/;

export async function getWatched(userId: string, limit = 1000): Promise<{ videoId: string; at: number }[]> {
  const r = await db().query<{ video_id: string; watched_at: Date }>(
    `SELECT video_id, watched_at FROM watch_history WHERE user_id = $1 ORDER BY watched_at DESC LIMIT $2`,
    [userId, limit],
  );
  return r.rows.map((x) => ({ videoId: x.video_id, at: x.watched_at.getTime() }));
}

/** 본 기록 추가 (이미 있으면 그대로). 오래된 것부터 지워 MAX_HISTORY 개만 */
export async function addWatched(userId: string, items: { videoId: string; at: number }[]): Promise<number> {
  const ok = items.filter((i) => VIDEO_ID.test(i.videoId) && Number.isFinite(i.at)).slice(0, 200);
  if (ok.length === 0) return 0;
  const client = await db().connect();
  try {
    await client.query("BEGIN");
    await client.query(`INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
    const now = Date.now();
    for (const i of ok) {
      const at = new Date(Math.min(i.at, now));
      await client.query(
        `INSERT INTO watch_history (user_id, video_id, watched_at) VALUES ($1, $2, $3) ON CONFLICT (user_id, video_id) DO NOTHING`,
        [userId, i.videoId, at],
      );
    }
    await client.query(
      `DELETE FROM watch_history WHERE user_id = $1 AND video_id IN (
         SELECT video_id FROM watch_history WHERE user_id = $1 ORDER BY watched_at DESC OFFSET $2
       )`,
      [userId, MAX_HISTORY],
    );
    await client.query("COMMIT");
    return ok.length;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function clearWatched(userId: string): Promise<void> {
  await db().query(`DELETE FROM watch_history WHERE user_id = $1`, [userId]);
}

/** 클립 취향 설정 (관심 없음·숨긴 채널·덜 볼 주제·좋아하는 순간) — 모양은 웹(lib/clip-prefs.ts)이 정한다 */
export async function getClipPrefs(userId: string): Promise<unknown | null> {
  const r = await db().query<{ prefs: unknown }>(`SELECT prefs FROM user_clip_prefs WHERE user_id = $1`, [userId]);
  return r.rows[0]?.prefs ?? null;
}

export async function setClipPrefs(userId: string, prefs: unknown): Promise<void> {
  await db().query(`INSERT INTO users (id) VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
  await db().query(
    `INSERT INTO user_clip_prefs (user_id, prefs, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET prefs = excluded.prefs, updated_at = now()`,
    [userId, JSON.stringify(prefs)],
  );
}
