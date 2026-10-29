const ENDPOINT_KEY = 'power111PushEndpoint';

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export type PushSupport = 'unsupported' | 'off' | 'on';

export function pushAvailable(): boolean {
  return 'Notification' in window && 'PushManager' in window && 'serviceWorker' in navigator;
}

export function isPushOn(): boolean {
  return !!localStorage.getItem(ENDPOINT_KEY);
}

export function permissionState(): NotificationPermission | 'unsupported' {
  if (!pushAvailable()) return 'unsupported';
  return Notification.permission;
}

async function getRegistration(): Promise<ServiceWorkerRegistration | null> {
  try {
    const existing = await navigator.serviceWorker.getRegistration();
    if (existing) return existing;
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

// Turns on real system notifications for this device: ask the browser, then hand the
// subscription to the portal so the gym's decisions can reach the phone.
export async function enablePush(): Promise<{ ok: boolean; message: string }> {
  if (!pushAvailable()) {
    return { ok: false, message: 'المتصفح ده بيمتنع الإشعارات — جرّب من التطبيق المثبت' };
  }
  if (Notification.permission === 'denied') {
    return { ok: false, message: 'الإشعارات مقفولة في إعدادات المتصفح — افتحها من قفل الموقع وإذن الإشعارات' };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, message: 'لم يتم السماح بالإشعارات' };
    }

    const registration = await getRegistration();
    if (!registration) return { ok: false, message: 'تعذر تشغيل خدمة الإشعارات' };

    const keyRes = await fetch('/api/portal/push/key', { credentials: 'include' });
    if (!keyRes.ok) return { ok: false, message: 'الإشعارات مش متاحة دلوقتي' };
    const keyBody = await keyRes.json();

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(keyBody.data.publicKey)
    });

    const json = subscription.toJSON();
    const res = await fetch('/api/portal/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth }
      })
    });
    if (!res.ok) return { ok: false, message: 'تعذر تسجيل الجهاز' };

    localStorage.setItem(ENDPOINT_KEY, json.endpoint || '');
    return { ok: true, message: 'الإشعارات شغالة على الجهاز ده' };
  } catch {
    return { ok: false, message: 'تعذر تشغيل الإشعارات، حاول مرة أخرى' };
  }
}

export async function disablePush(): Promise<void> {
  const endpoint = localStorage.getItem(ENDPOINT_KEY);
  try {
    const registration = await getRegistration();
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription) await subscription.unsubscribe();
    await fetch('/api/portal/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ endpoint: endpoint || undefined })
    });
  } catch {
    // The switch is already off locally; the server prunes dead endpoints on send.
  }
  localStorage.removeItem(ENDPOINT_KEY);
}
