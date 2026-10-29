// Amounts arrive from JSON as numbers or strings. A NaN used to fall through to Prisma and
// surface as a 500, and a negative expense quietly subtracted from the branch's costs.
export function piasters(value: unknown, max = 500_000_000): number | null {
  if (value === undefined || value === null || value === '') return null;
  const amount = Math.trunc(Number(value));
  if (!Number.isFinite(amount) || amount < 0 || amount > max) return null;
  return amount;
}

// An unparsable date must not reach Postgres as an Invalid Date.
export function parseDate(value: unknown): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const date = new Date(value as string);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}
