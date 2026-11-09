// 웹 푸시: 최애 버튜버의 방송이 시작되면 알림.
import { sendNotification } from "web-push";
import type { LiveSnapshot } from "../domain";
import { config } from "../config";
import { log } from "../log";
import { db, userDbEnabled } from "./db";

/** 방송 시작 후 이 시간 안에 처음 본 경우만 '방송 시작'으로 본다 (서버 재시작·최애 등록 직후 오발송 방지) */
const RECENT_MS = 15 * 60_000;
/** 재연결로 시작 시각이 바뀌어도 같은 채널 알림을 다시 보내지 않는 간격 */
const REPEAT_GUARD = "30 minutes";
const MAX_SUBS_PER_USER = 10;

// 브라우저 푸시 서비스만 허용 — endpoint 는 사용자가 보내는 값이라, 임의 주소로 서버가 요청하는 것(SSRF)을 막는다
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
];

export function isAllowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    return u.protocol === "https:" && PUSH_HOSTS.some((re) => re.test(u.hostname));
  } catch {
    return false;
  }
}

export function pushEnabled(): boolean {
  return userDbEnabled() && !!config.vapidPublicKey && !!config.vapidPrivateKey;
}

export interface PushSub {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 저장 성공 여부 (구독 수 한도 초과면 false) */
export async function savePushSubscription(userId: string, s: PushSub): Promise<boolean> {
  await db().query("INSERT INTO users (id) VALUES ($1) ON CONFLICT (id) DO NOTHING", [userId]);
  const { rowCount } = await db().query(
    `INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth)
     SELECT $1, $2, $3, $4
     WHERE (SELECT count(*) FROM push_subscriptions WHERE user_id = $2) < $5
        OR EXISTS (SELECT 1 FROM push_subscriptions WHERE endpoint = $1)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = EXCLUDED.user_id, p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth`,
    [s.endpoint, userId, s.p256dh, s.auth, MAX_SUBS_PER_USER],
  );
  return (rowCount ?? 0) > 0;
}

export async function removePushSubscription(userId: string, endpoint: string): Promise<void> {
  await db().query("DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2", [userId, endpoint]);
}

export type PushSender = (
  sub: PushSub,
  payload: string,
) => Promise<void>;

const defaultSender: PushSender = async (sub, payload) => {
  await sendNotification(
    { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
    payload,
    {
      TTL: 15 * 60,
      vapidDetails: {
        subject: config.vapidSubject,
        publicKey: config.vapidPublicKey,
        privateKey: config.vapidPrivateKey,
      },
    },
  );
};

let running = false;
let lastPrune = 0;

/**
 * 이번 사이클에 막 시작한 방송을 최애로 둔 사용자에게 알림.
 * 발송 기록을 먼저 원자적으로 남겨(ON CONFLICT) 같은 방송 알림이 두 번 가지 않게 한다.
 * 반환: 보낸 알림 수
 */
export async function notifyLiveStarts(
  snapshots: LiveSnapshot[],
  send: PushSender = defaultSender,
): Promise<number> {
  if (running) return 0;
  const now = Date.now();
  const byChannel = new Map<string, LiveSnapshot>();
  for (const s of snapshots) {
    if (now - Date.parse(s.startedAt) <= RECENT_MS) byChannel.set(s.channelId, s);
  }
  if (byChannel.size === 0) return 0;

  running = true;
  try {
    const ids = [...byChannel.keys()];
    const starts = ids.map((id) => byChannel.get(id)!.startedAt);
    const { rows: claimed } = await db().query<{ user_id: string; channel_id: string }>(
      `INSERT INTO notifications_sent (user_id, channel_id, started_at)
       SELECT f.user_id, f.channel_id, l.started_at
       FROM favorites f
       JOIN unnest($1::text[], $2::timestamptz[]) AS l(channel_id, started_at) USING (channel_id)
       JOIN users u ON u.id = f.user_id AND u.status = 'active'
       WHERE f.notify
         AND f.created_at <= l.started_at
         AND EXISTS (SELECT 1 FROM push_subscriptions p WHERE p.user_id = f.user_id)
         AND NOT EXISTS (
           SELECT 1 FROM notifications_sent n
           WHERE n.user_id = f.user_id AND n.channel_id = f.channel_id
             AND n.sent_at > now() - interval '${REPEAT_GUARD}'
         )
       ON CONFLICT (user_id, channel_id, started_at) DO NOTHING
       RETURNING user_id, channel_id`,
      [ids, starts],
    );
    if (claimed.length === 0) return 0;

    const userIds = [...new Set(claimed.map((c) => c.user_id))];
    const { rows: subs } = await db().query<{ endpoint: string; user_id: string; p256dh: string; auth: string }>(
      "SELECT endpoint, user_id, p256dh, auth FROM push_subscriptions WHERE user_id = ANY($1)",
      [userIds],
    );
    const subsByUser = new Map<string, PushSub[]>();
    for (const s of subs) subsByUser.set(s.user_id, [...(subsByUser.get(s.user_id) ?? []), s]);

    let sent = 0;
    const jobs: (() => Promise<void>)[] = [];
    for (const c of claimed) {
      const live = byChannel.get(c.channel_id)!;
      const payload = JSON.stringify({
        title: `${live.channelName} 방송 시작`,
        body: live.title,
        url: `/vtuber/${live.platform}/${live.channelId}`,
        tag: `live-${live.channelId}`,
      });
      for (const sub of subsByUser.get(c.user_id) ?? []) {
        jobs.push(async () => {
          try {
            await send(sub, payload);
            sent++;
          } catch (e) {
            const status = (e as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              // 사용자가 알림을 해제했거나 브라우저 구독이 만료됨
              await db().query("DELETE FROM push_subscriptions WHERE endpoint = $1", [sub.endpoint]);
            } else {
              log.error(`푸시 발송 실패 (${status ?? "?"}): ${String(e)}`);
            }
          }
        });
      }
    }
    for (let i = 0; i < jobs.length; i += 10) await Promise.all(jobs.slice(i, i + 10).map((j) => j()));

    if (now - lastPrune > 6 * 3_600_000) {
      lastPrune = now;
      await db().query("DELETE FROM notifications_sent WHERE sent_at < now() - interval '30 days'");
    }
    if (sent > 0) log.info(`  방송 시작 알림 ${sent}건 발송`);
    return sent;
  } finally {
    running = false;
  }
}
