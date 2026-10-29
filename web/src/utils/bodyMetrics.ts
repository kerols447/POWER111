export function bmiOf(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null;
  const metres = heightCm / 100;
  const bmi = weightKg / (metres * metres);
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}

export interface BmiBand {
  /** Short name used inside the classification table. */
  label: string;
  /** Wording used in the one-line statement above the table. */
  pill: string;
  /** The range as it reads on the adult classification table. */
  range: string;
  tone: string;
  bar: string;
  /** Bars grow with the range so the scale reads as a ramp, not four equal chips. */
  width: string;
}

export const BMI_BANDS: BmiBand[] = [
  { label: 'نقص وزن', pill: 'نقص في الوزن', range: 'أقل من 18.5', tone: 'text-sky-400', bar: 'bg-sky-400', width: '34%' },
  { label: 'وزن طبيعي', pill: 'وزن طبيعي', range: '18.5 إلى 24.9', tone: 'text-emerald-400', bar: 'bg-emerald-400', width: '52%' },
  { label: 'زيادة وزن', pill: 'زيادة في الوزن', range: '25 إلى 29.9', tone: 'text-amber-500', bar: 'bg-amber-500', width: '70%' },
  { label: 'سمنة', pill: 'سمنة', range: '30 فأكثر', tone: 'text-rose-400', bar: 'bg-rose-400', width: '88%' }
];

export function bmiBand(bmi: number): BmiBand {
  if (bmi < 18.5) return BMI_BANDS[0];
  if (bmi < 25) return BMI_BANDS[1];
  if (bmi < 30) return BMI_BANDS[2];
  return BMI_BANDS[3];
}
