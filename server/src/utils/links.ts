// Branch map links become clickable anchors on the public site, so a value that is not a
// plain web address must never reach the database — a `javascript:` link typed into the
// admin panel would run inside every visitor's browser.
export type WebUrlCheck = { ok: true; value?: string | null } | { ok: false; message: string };

export function checkWebUrl(raw: unknown, label: string): WebUrlCheck {
  if (raw === undefined || raw === null) return { ok: true, value: raw as undefined | null };
  if (typeof raw !== 'string') return { ok: false, message: `${label}: الرابط غير صحيح` };

  const trimmed = raw.trim();
  if (!trimmed) return { ok: true, value: null };

  // Bare "maps.google.com/x" is what people actually paste, so it gets the scheme added.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, message: `${label}: الرابط غير صحيح` };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, message: `${label}: الرابط لازم يكون موقع (http أو https)` };
  }
  return { ok: true, value: url.toString() };
}
