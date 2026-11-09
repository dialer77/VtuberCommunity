// 사용자 · 최애(즐겨찾기). 구글 로그인 식별값·이름·프로필 사진만 저장한다 (이메일 미수집).
import type { Platform } from "../domain";
import { db } from "./db";

const MAX_FAVORITES = 300;

export interface UserProfile {
  id: string;
  name?: string | null;
  image?: string | null;
}

export interface FavoriteRow {
  platform: Platform;
  channelId: string;
  channelName: string | null;
  notify: boolean;
}

export async function upsertUser(u: UserProfile): Promise<void> {
  await db().query(
    `INSERT INTO users (id, name, image, last_login_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, image = EXCLUDED.image, last_login_at = now()`,
    [u.id, u.name ?? null, u.image ?? null],
  );
}

/** 탈퇴: 사용자와 최애·알림 구독·발송 기록을 모두 지운다 (ON DELETE CASCADE) */
export async function deleteUser(id: string): Promise<void> {
  await db().query("DELETE FROM users WHERE id = $1", [id]);
}

export async function listFavorites(userId: string): Promise<FavoriteRow[]> {
  const { rows } = await db().query(
    `SELECT platform, channel_id, channel_name, notify FROM favorites
     WHERE user_id = $1 ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map((r) => ({
    platform: r.platform as Platform,
    channelId: r.channel_id as string,
    channelName: (r.channel_name as string | null) ?? null,
    notify: r.notify as boolean,
  }));
}

/** 최애 추가. 한도를 넘으면 false */
export async function addFavorite(
  userId: string,
  platform: Platform,
  channelId: string,
  channelName: string | null,
): Promise<boolean> {
  // 로그인 시 upsert 가 실패했어도(백엔드 일시 장애) 최애는 저장되게
  await db().query("INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [userId]);
  const { rowCount } = await db().query(
    `INSERT INTO favorites (user_id, platform, channel_id, channel_name)
     SELECT $1, $2, $3, $4
     WHERE (SELECT count(*) FROM favorites WHERE user_id = $1) < $5
     ON CONFLICT (user_id, channel_id) DO UPDATE SET channel_name = EXCLUDED.channel_name`,
    [userId, platform, channelId, channelName, MAX_FAVORITES],
  );
  return (rowCount ?? 0) > 0;
}

export async function removeFavorite(userId: string, channelId: string): Promise<void> {
  await db().query("DELETE FROM favorites WHERE user_id = $1 AND channel_id = $2", [userId, channelId]);
}

export async function setFavoriteNotify(userId: string, channelId: string, notify: boolean): Promise<void> {
  await db().query("UPDATE favorites SET notify = $3 WHERE user_id = $1 AND channel_id = $2", [
    userId,
    channelId,
    notify,
  ]);
}
