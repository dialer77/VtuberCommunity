// 브라우저 웹 푸시 구독 (클라이언트 전용)

export type PushState = "unsupported" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function supported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function getPushState(): Promise<PushState> {
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

/** 알림 켜기. 실패하면 이유를 담은 Error */
export async function enablePush(): Promise<void> {
  if (!supported()) throw new Error("이 브라우저는 알림을 지원하지 않아요.");
  const keyRes = await fetch("/api/me/push");
  const { enabled, publicKey } = (await keyRes.json()) as { enabled: boolean; publicKey: string | null };
  if (!enabled || !publicKey) throw new Error("알림 기능이 아직 준비되지 않았어요.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("브라우저에서 알림 권한을 허용해 주세요.");
  const reg = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  const res = await fetch("/api/me/push", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!res.ok) {
    await sub.unsubscribe().catch(() => undefined);
    throw new Error("알림 등록에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
}

export async function disablePush(): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await fetch("/api/me/push", {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ endpoint: sub.endpoint }),
  }).catch(() => undefined);
  await sub.unsubscribe();
}
