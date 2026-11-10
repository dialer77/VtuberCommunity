// 키리누키 참여 (4단계): 좋아요 · 내 재생목록 · 태그 투표. 사용자 DB(Postgres)에 저장하고,
// 사이트에 보이는 합계(좋아요 수·태그 투표 집계)는 수집 DB(SQLite)에 복사해 목록·비슷한 클립 계산에 쓴다.
import { db } from "./db";

export const MAX_LIKES = 5000;
export const MAX_PLAYLISTS = 30;
export const MAX_PLAYLIST_ITEMS = 200;
export const MAX_TITLE = 40;

export interface VoteAgg {
  tag: string;
  up: number;
  down: number;
}

export interface PlaylistSummary {
  id: number;
  title: string;
  count: number;
  updatedAt: string;
  /** 표지로 쓸 첫 영상 */
  firstVideoId: string | null;
}

async function ensureUser(userId: string): Promise<void> {
  // 로그인 시 upsert 가 실패했어도(백엔드 일시 장애) 저장되게
  await db().query("INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [userId]);
}

// ---------------------------------------------------------------- 좋아요

export async function likeCount(videoId: string): Promise<number> {
  const { rows } = await db().query("SELECT count(*)::int AS n FROM clip_likes WHERE video_id = $1", [videoId]);
  return Number(rows[0]?.n ?? 0);
}

/** 좋아요 켜기/끄기. 한도를 넘으면 "limit". 반환: 이 클립의 좋아요 수 */
export async function setLike(userId: string, videoId: string, on: boolean): Promise<number | "limit"> {
  if (on) {
    await ensureUser(userId);
    const { rowCount } = await db().query(
      `INSERT INTO clip_likes (user_id, video_id)
       SELECT $1, $2 WHERE (SELECT count(*) FROM clip_likes WHERE user_id = $1) < $3
       ON CONFLICT DO NOTHING`,
      [userId, videoId, MAX_LIKES],
    );
    if (!rowCount) {
      const exists = await db().query("SELECT 1 FROM clip_likes WHERE user_id = $1 AND video_id = $2", [userId, videoId]);
      if (!exists.rowCount) return "limit";
    }
  } else {
    await db().query("DELETE FROM clip_likes WHERE user_id = $1 AND video_id = $2", [userId, videoId]);
  }
  return likeCount(videoId);
}

/** 내가 좋아요한 클립 (최근 순) */
export async function listLikes(userId: string, limit: number, offset: number): Promise<{ total: number; videoIds: string[] }> {
  const [t, r] = await Promise.all([
    db().query("SELECT count(*)::int AS n FROM clip_likes WHERE user_id = $1", [userId]),
    db().query("SELECT video_id FROM clip_likes WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", [
      userId,
      limit,
      offset,
    ]),
  ]);
  return { total: Number(t.rows[0]?.n ?? 0), videoIds: r.rows.map((x) => x.video_id as string) };
}

// ---------------------------------------------------------------- 태그 투표

export async function voteAgg(videoId: string): Promise<VoteAgg[]> {
  const { rows } = await db().query(
    `SELECT tag, count(*) FILTER (WHERE vote = 1)::int AS up, count(*) FILTER (WHERE vote = -1)::int AS down
     FROM clip_tag_votes WHERE video_id = $1 GROUP BY tag`,
    [videoId],
  );
  return rows.map((r) => ({ tag: r.tag as string, up: Number(r.up), down: Number(r.down) }));
}

/** 태그 투표: 1 = 맞아요, -1 = 아니에요, 0 = 취소. 반환: 이 클립의 투표 집계 */
export async function setTagVote(userId: string, videoId: string, tag: string, vote: -1 | 0 | 1): Promise<VoteAgg[]> {
  if (vote === 0) {
    await db().query("DELETE FROM clip_tag_votes WHERE user_id = $1 AND video_id = $2 AND tag = $3", [userId, videoId, tag]);
  } else {
    await ensureUser(userId);
    await db().query(
      `INSERT INTO clip_tag_votes (user_id, video_id, tag, vote) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, video_id, tag) DO UPDATE SET vote = EXCLUDED.vote, created_at = now()`,
      [userId, videoId, tag, vote],
    );
  }
  return voteAgg(videoId);
}

// ---------------------------------------------------------------- 클립 하나에 대한 내 상태

export async function myClipState(
  userId: string,
  videoId: string,
): Promise<{ liked: boolean; votes: Record<string, number>; playlists: (PlaylistSummary & { has: boolean })[] }> {
  const [l, v, p] = await Promise.all([
    db().query("SELECT 1 FROM clip_likes WHERE user_id = $1 AND video_id = $2", [userId, videoId]),
    db().query("SELECT tag, vote FROM clip_tag_votes WHERE user_id = $1 AND video_id = $2", [userId, videoId]),
    db().query(
      `SELECT p.id, p.title, p.updated_at,
         (SELECT count(*)::int FROM playlist_items i WHERE i.playlist_id = p.id) AS n,
         (SELECT video_id FROM playlist_items i WHERE i.playlist_id = p.id ORDER BY added_at LIMIT 1) AS first,
         EXISTS (SELECT 1 FROM playlist_items i WHERE i.playlist_id = p.id AND i.video_id = $2) AS has
       FROM playlists p WHERE p.user_id = $1 ORDER BY p.updated_at DESC`,
      [userId, videoId],
    ),
  ]);
  return {
    liked: (l.rowCount ?? 0) > 0,
    votes: Object.fromEntries(v.rows.map((r) => [r.tag as string, Number(r.vote)])),
    playlists: p.rows.map((r) => ({
      id: Number(r.id),
      title: r.title as string,
      count: Number(r.n),
      updatedAt: new Date(r.updated_at as string).toISOString(),
      firstVideoId: (r.first as string | null) ?? null,
      has: !!r.has,
    })),
  };
}

// ---------------------------------------------------------------- 내 재생목록

export async function listPlaylists(userId: string): Promise<PlaylistSummary[]> {
  const { rows } = await db().query(
    `SELECT p.id, p.title, p.updated_at,
       (SELECT count(*)::int FROM playlist_items i WHERE i.playlist_id = p.id) AS n,
       (SELECT video_id FROM playlist_items i WHERE i.playlist_id = p.id ORDER BY added_at LIMIT 1) AS first
     FROM playlists p WHERE p.user_id = $1 ORDER BY p.updated_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    id: Number(r.id),
    title: r.title as string,
    count: Number(r.n),
    updatedAt: new Date(r.updated_at as string).toISOString(),
    firstVideoId: (r.first as string | null) ?? null,
  }));
}

/** 새 재생목록. 한도를 넘으면 null */
export async function createPlaylist(userId: string, title: string): Promise<number | null> {
  await ensureUser(userId);
  const { rows } = await db().query(
    `INSERT INTO playlists (user_id, title)
     SELECT $1, $2 WHERE (SELECT count(*) FROM playlists WHERE user_id = $1) < $3
     RETURNING id`,
    [userId, title, MAX_PLAYLISTS],
  );
  return rows[0] ? Number(rows[0].id) : null;
}

export async function renamePlaylist(userId: string, id: number, title: string): Promise<boolean> {
  const { rowCount } = await db().query("UPDATE playlists SET title = $3, updated_at = now() WHERE id = $2 AND user_id = $1", [
    userId,
    id,
    title,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function deletePlaylist(userId: string, id: number): Promise<boolean> {
  const { rowCount } = await db().query("DELETE FROM playlists WHERE id = $2 AND user_id = $1", [userId, id]);
  return (rowCount ?? 0) > 0;
}

/** 재생목록 내용 (담은 순서). 내 것이 아니면 null */
export async function getPlaylist(userId: string, id: number): Promise<{ id: number; title: string; videoIds: string[] } | null> {
  const p = await db().query("SELECT id, title FROM playlists WHERE id = $2 AND user_id = $1", [userId, id]);
  if (!p.rowCount) return null;
  const items = await db().query("SELECT video_id FROM playlist_items WHERE playlist_id = $1 ORDER BY added_at", [id]);
  return { id, title: p.rows[0].title as string, videoIds: items.rows.map((r) => r.video_id as string) };
}

export async function addToPlaylist(userId: string, id: number, videoId: string): Promise<"ok" | "not_found" | "limit"> {
  const own = await db().query("SELECT 1 FROM playlists WHERE id = $2 AND user_id = $1", [userId, id]);
  if (!own.rowCount) return "not_found";
  const { rowCount } = await db().query(
    `INSERT INTO playlist_items (playlist_id, video_id)
     SELECT $1, $2 WHERE (SELECT count(*) FROM playlist_items WHERE playlist_id = $1) < $3
     ON CONFLICT DO NOTHING`,
    [id, videoId, MAX_PLAYLIST_ITEMS],
  );
  if (!rowCount) {
    const exists = await db().query("SELECT 1 FROM playlist_items WHERE playlist_id = $1 AND video_id = $2", [id, videoId]);
    if (!exists.rowCount) return "limit";
  }
  await db().query("UPDATE playlists SET updated_at = now() WHERE id = $1", [id]);
  return "ok";
}

export async function removeFromPlaylist(userId: string, id: number, videoId: string): Promise<boolean> {
  const { rowCount } = await db().query(
    `DELETE FROM playlist_items i USING playlists p
     WHERE i.playlist_id = p.id AND p.id = $2 AND p.user_id = $1 AND i.video_id = $3`,
    [userId, id, videoId],
  );
  if (rowCount) await db().query("UPDATE playlists SET updated_at = now() WHERE id = $1", [id]);
  return (rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------- 합계 맞추기

/** 사용자가 좋아요·투표한 영상 (탈퇴 뒤 합계를 다시 계산하기 위해) */
export async function userTouchedVideos(userId: string): Promise<string[]> {
  const { rows } = await db().query(
    `SELECT video_id FROM clip_likes WHERE user_id = $1 UNION SELECT video_id FROM clip_tag_votes WHERE user_id = $1`,
    [userId],
  );
  return rows.map((r) => r.video_id as string);
}

/** 전체 합계 (서버 시작 시 수집 DB 와 맞춤) */
export async function allAggregates(): Promise<{ likes: Map<string, number>; votes: Map<string, VoteAgg[]> }> {
  const [l, v] = await Promise.all([
    db().query("SELECT video_id, count(*)::int AS n FROM clip_likes GROUP BY video_id"),
    db().query(
      `SELECT video_id, tag, count(*) FILTER (WHERE vote = 1)::int AS up, count(*) FILTER (WHERE vote = -1)::int AS down
       FROM clip_tag_votes GROUP BY video_id, tag`,
    ),
  ]);
  const likes = new Map(l.rows.map((r) => [r.video_id as string, Number(r.n)]));
  const votes = new Map<string, VoteAgg[]>();
  for (const r of v.rows) {
    const list = votes.get(r.video_id as string) ?? [];
    list.push({ tag: r.tag as string, up: Number(r.up), down: Number(r.down) });
    votes.set(r.video_id as string, list);
  }
  return { likes, votes };
}
