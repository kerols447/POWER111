// Loaded by the generated service worker through workbox's importScripts.
// The server pushes the full Arabic text, so the phone shows a real notification
// even when the app is closed.

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    payload = {};
  }

  const title = payload.title || 'POWER 111';
  const options = {
    body: payload.body || '',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-96x96.png',
    tag: payload.id || `power111-${Date.now()}`,
    timestamp: Date.now(),
    dir: 'rtl',
    lang: 'ar',
    renotify: true,
    data: { url: payload.link || '/portal' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/portal';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      const app = clientList.find((c) => 'focus' in c);
      if (app) {
        if (app.url !== url && 'navigate' in app) app.navigate(url);
        return app.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});
