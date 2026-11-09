// 웹 푸시 서비스 워커 — 최애 방송 시작 알림 표시
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    return;
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "버모아", {
      body: data.body || "",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.tag,
      data: { url: typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";
  // 이미 열린 다른 탭은 이동시키지 않는다 (사이트 안 플레이어 재생이 끊기므로) — 같은 페이지가 있을 때만 그 탭으로
  const target = new URL(url, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      const same = list.find((c) => c.url === target && "focus" in c);
      return same ? same.focus() : self.clients.openWindow(url);
    }),
  );
});
