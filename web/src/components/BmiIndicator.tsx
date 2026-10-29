import { BMI_BANDS, bmiBand, bmiOf } from '../utils/bodyMetrics';

/**
 * The member's body-mass index as a standalone reading: the number, how it is
 * classified, and the adult scale it was measured against so the member and the
 * trainer see the same reference instead of a bare figure.
 */
export default function BmiIndicator({
  weightKg,
  heightCm,
  title = 'مؤشر كتلة الجسم'
}: {
  weightKg: number | null | undefined;
  heightCm: number | null | undefined;
  title?: string;
}) {
  const bmi = bmiOf(weightKg, heightCm);
  if (bmi === null) return null;
  const band = bmiBand(bmi);

  return (
    <section className="rounded-2xl border border-dark-border bg-dark-card p-5 sm:p-6">
      <p className="text-xs sm:text-sm text-gray-500 font-semibold">{title}</p>
      <p className="mt-2 text-3xl sm:text-4xl font-extrabold text-primary leading-none" dir="ltr">{bmi}</p>
      <p className="mt-3">
        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold bg-primary/10 border border-primary/30 ${band.tone}`}>
          {band.pill} وفق تصنيف البالغين
        </span>
      </p>

      <div className="mt-5 pt-4 border-t border-dark-border">
        <p className="text-xs sm:text-sm text-gray-500 font-semibold">تصنيفات BMI للبالغين</p>
        <ul className="mt-3 space-y-2.5">
          {BMI_BANDS.map(b => {
            const active = b.label === band.label;
            return (
              <li key={b.label} className="flex items-center gap-3">
                <span className={`flex-1 min-w-0 text-xs sm:text-sm ${active ? 'text-white font-bold' : 'text-gray-400'}`}>
                  {b.range} — {b.label}
                </span>
                <span
                  aria-hidden
                  className={`h-1.5 shrink-0 rounded-full ${b.bar} ${active ? 'opacity-100' : 'opacity-40'}`}
                  style={{ width: b.width, maxWidth: '45%' }}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
