// toISOString() reports UTC, so just after midnight in Egypt it hands back yesterday.
// Any date the owner stores or reads has to come from his own calendar.
export function localDate(d: Date = new Date()) {
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function startOfMonth() {
  const d = new Date();
  d.setDate(1);
  return localDate(d);
}

function asDate(value: string | number | Date) {
  if (value instanceof Date || typeof value === 'number') return new Date(value);
  // A bare "YYYY-MM-DD" names a calendar day, not an instant. Parsed as UTC it can
  // land on the previous evening elsewhere, so read it in the owner's own timezone.
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value);
}

// "16 أكتوبر 2026" — Arabic month names with Latin digits, the one date style the app uses.
export function arDate(value?: string | number | Date) {
  return asDate(value ?? new Date()).toLocaleDateString('ar-EG-u-nu-latn', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}
