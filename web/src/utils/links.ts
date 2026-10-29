// The admin types a branch's map link, and it becomes an anchor on the public site. Anything
// that is not a plain web address is dropped instead of rendered.
export function safeWebUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Older rows may hold a bare "maps.google.com/x" typed without a scheme.
  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
