// Lists used to trust whatever page size the caller sent, so one request could pull the whole
// member sheet. Page numbers and sizes are read through these so they always land in range.
export function readPage(raw: unknown, fallback = 1): number {
  const value = Math.floor(Number(raw));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function readPageSize(raw: unknown, fallback = 50, max = 200): number {
  const value = Math.floor(Number(raw));
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(value, max);
}
