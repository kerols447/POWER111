import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { localDate, arDate } from '../utils/dates';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { Stagger } from '../components/Motion';
// The dashboard reads its surfaces, gold and card shell from the shared kit so a token
// change lands on every screen at once.
import { CARD as card, CHART, GOLD, GOLD_SURFACE, Skeleton, TONE, SkeletonCard, SkeletonTiles } from '../components/ui';

interface BranchStat {
  branch: { id: string; name: string; code: string };
  revenue: number;
  expenses: number;
  profit: number;
  outstanding: number;
  salesCount: number;
  expensesCount: number;
  paymentsCount: number;
  activeMembers: number;
  activeSubscriptions: number;
}

interface TodaySummary {
  total: number;
  checkedIn: number;
  checkedOut: number;
  flagged: number;
}

interface ExpiringSubscription {
  id: string;
  endDate: string;
  // Renewal only happens on the member's own page, so the row has to carry his id.
  member: { id: string; name: string; code: string };
  plan: { name: string; nameAr?: string };
}

interface MonthPoint {
  label: string;
  revenue: number;
  expenses: number;
}

interface GrowthMonth {
  label: string;
  newMembers: number;
  cumulative: number;
}

interface PlanSlice {
  name: string;
  count: number;
}

type ActivityKind = 'SALE' | 'PAYMENT' | 'EXPENSE' | 'SALARY' | 'MEMBER' | 'CHECKIN';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  at: string;
  title: string;
  subtitle: string;
  amountPiasters: number | null;
  branchName?: string;
}

type PeriodKey = 'week' | 'month' | 'current';

const PERIODS: { key: PeriodKey; label: string; caption: string }[] = [
  { key: 'week', label: '٧ أيام', caption: 'آخر ٧ أيام' },
  { key: 'month', label: '٣٠ يوم', caption: 'آخر ٣٠ يوم' },
  { key: 'current', label: 'هذا الشهر', caption: 'من أول الشهر' }
];

const AR_MONTHS_SHORT = ['ينا', 'فبر', 'مار', 'أبر', 'مايو', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];

// Chart ink comes from the shared kit, so a chart on this page and one in reports
// are drawn with exactly the same golds, greys and tooltip: gold for money coming in,
// one quiet grey for everything else, axes dim enough to stay behind the numbers.
const COLORS = CHART.ramp;
const PLAN_COLORS = CHART.planRamp;
const chartTooltipStyle = CHART.tooltip;
const AXIS = CHART.axis;
const GRID = CHART.grid;
const NEUTRAL_SERIES = CHART.neutral;
const CURSOR_FILL = CHART.cursor;

// What a clickable card does under a pointer: border warms to gold, the card rises 2px,
// a shadow appears. Mobile keeps it flat so nothing moves under a thumb.
const HOVER_LIFT =
  'transition-[border-color,transform,box-shadow] duration-200 sm:hover:-translate-y-[2px] sm:hover:shadow-lg sm:hover:shadow-black/40 active:scale-[.995]';

function formatPiasters(piasters: number): string {
  const pounds = piasters / 100;
  return pounds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ج.م';
}

function formatPounds(pounds: number): string {
  return pounds.toLocaleString('en-US', { maximumFractionDigits: 0 }) + ' ج.م';
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

function clockLabel(value: string | number | Date): string {
  return new Date(value).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function shiftDays(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

// The comparison period is the same span sitting directly before the chosen one,
// so a 7-day card always compares 7 days against the 7 days before them.
function rangesFor(period: PeriodKey) {
  const today = new Date();
  if (period === 'current') {
    const from = new Date(today.getFullYear(), today.getMonth(), 1);
    const prevFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    // Mid-month, the fair comparison is the same number of days into last month,
    // not the whole of it — otherwise every card reads "down" on the 10th of a month.
    const prevMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
    const prevTo = new Date(prevMonthEnd.getFullYear(), prevMonthEnd.getMonth(), Math.min(today.getDate(), prevMonthEnd.getDate()));
    return {
      from: localDate(from),
      to: localDate(today),
      prevFrom: localDate(prevFrom),
      prevTo: localDate(prevTo),
      spanLabel: 'نفس الفترة من الشهر الماضي'
    };
  }
  const back = period === 'week' ? 6 : 29;
  const from = shiftDays(-back);
  return {
    from: localDate(from),
    to: localDate(today),
    prevFrom: localDate(shiftDays(-back * 2 - 1)),
    prevTo: localDate(shiftDays(-back - 1)),
    spanLabel: 'الفترة السابقة'
  };
}

function daysUntil(value: string | number | Date): number {
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function branchCountLabel(count: number): string {
  if (count === 1) return 'فرع واحد';
  if (count === 2) return 'فرعين';
  return `${count} فرع`;
}

function expiringInLabel(value: string | number | Date): string {
  const days = daysUntil(value);
  if (days <= 0) return 'ينتهي اليوم';
  if (days === 1) return 'غداً';
  if (days === 2) return 'بعد يومين';
  return `خلال ${days} أيام`;
}

function branchLabel(stat: BranchStat): string {
  return stat.branch.name.split('—')[1]?.trim() || stat.branch.code;
}

/** Real change against the previous period. No previous movement means no percentage to show. */
function Delta({ current, previous, spanLabel }: { current: number; previous: number; spanLabel: string }) {
  if (previous <= 0) {
    // A quiet neutral chip rather than a sentence — the reference keeps this slot compact.
    return (
      <span className="inline-flex items-center text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-white/5 text-gray-500" title={`لا حركة في ${spanLabel}`}>
        لا حركة
      </span>
    );
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  const up = percent >= 0;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md"
      style={{ backgroundColor: up ? 'rgba(52,211,153,0.10)' : 'rgba(242,109,109,0.10)', color: up ? TONE.revenue : TONE.expenses }}
      title={`مقارنة بـ${spanLabel}`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {up ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
      </svg>
      {Math.abs(percent)}%
    </span>
  );
}

/**
 * Micro trend under a headline number. An empty or all-zero series draws nothing —
 * a flat invented line would read as real movement.
 */
function Sparkline({ points, color, id }: { points: number[]; color: string; id: string }) {
  const clean = points.filter(v => Number.isFinite(v));
  if (clean.length < 2 || clean.every(v => v === 0)) return null;
  const w = 120;
  const h = 34;
  const pad = 3;
  const max = Math.max(...clean);
  const min = Math.min(...clean);
  const span = max - min || 1;
  const step = (w - pad * 2) / (clean.length - 1);
  const coords = clean.map((v, i) => [pad + i * step, h - pad - ((v - min) / span) * (h - pad * 2)] as const);
  const line = coords.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${pad},${h - pad} ${line} ${(w - pad).toFixed(1)},${h - pad}`;
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.30} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#spark-${id})`} />
      <polyline
        points={line}
        fill="none"
        stroke={color}
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

const quickActions = [
  {
    label: 'حضور عضو',
    hint: 'تسجيل الحضور',
    path: '/admin/attendance',
    d: [
      'M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z',
      'M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z'
    ]
  },
  {
    label: 'عضو جديد',
    hint: 'إضافة عضو',
    path: '/admin/members',
    d: [
      'M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 18.25a5.625 5.625 0 0111.25 0v1.5H3v-1.5z'
    ]
  },
  {
    label: 'نقطة بيع',
    hint: 'بيع منتجات',
    path: '/admin/sales',
    d: [
      'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z'
    ]
  },
  {
    label: 'الاشتراكات',
    hint: 'الحالة والمتبقي',
    path: '/admin/members?tab=subscriptions',
    d: [
      'M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182'
    ]
  }
];

const icons = {
  revenue: 'M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  expenses: 'M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z',
  profit: 'M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941',
  outstanding: 'M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z',
  members: 'M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z',
  subscriptions: 'M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  attendance: 'M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5',
  expiring: 'M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z',
  branches: 'M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z',
  pie: 'M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6zM13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z',
  trend: 'M2.25 18 9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0-5.94-2.28m5.94 2.28-2.28 5.941',
  performance: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5',
  journal: 'M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25',
  sale: 'M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z',
  payment: 'M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z',
  salary: 'M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z',
  member: 'M18 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM3 18.25a5.625 5.625 0 0111.25 0v1.5H3v-1.5z',
  checkin: 'M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9',
  dumbbell: 'M3.5 10.5v3M6 8v8M18 8v8M20.5 10.5v3M6 12h12'
};

const activityMeta: Record<ActivityKind, { icon: keyof typeof icons; color: string; label: string }> = {
  SALE: { icon: 'sale', color: GOLD, label: 'بيع' },
  PAYMENT: { icon: 'payment', color: TONE.revenue, label: 'اشتراك' },
  EXPENSE: { icon: 'expenses', color: TONE.expenses, label: 'مصروف' },
  SALARY: { icon: 'salary', color: TONE.deep, label: 'مرتّب' },
  MEMBER: { icon: 'member', color: TONE.members, label: 'عضو جديد' },
  CHECKIN: { icon: 'checkin', color: TONE.revenue, label: 'حضور' }
};

function Glyph({ name, className = 'w-4 h-4' }: { name: keyof typeof icons; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

/**
 * A panel with a titled header strip over its content. The header carries the caption and
 * the way out, so the body only ever holds data — that is what separates a chart panel
 * from a plain card.
 */
function Panel({
  title,
  tone = GOLD,
  icon,
  caption,
  legend,
  action,
  className = '',
  bodyClass = 'p-4 sm:p-5',
  children
}: {
  title: string;
  tone?: string;
  icon?: keyof typeof icons;
  caption?: string;
  legend?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClass?: string;
  children: ReactNode;
}) {
  return (
    <section className={`${card} overflow-hidden ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 sm:px-5 py-3 border-b border-white/[0.06] bg-white/[0.015]">
        <div className="flex items-center gap-2.5 min-w-0">
          {icon ? (
            <span className="w-8 h-8 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: `${tone}14`, color: tone }}>
              <Glyph name={icon} className="w-[17px] h-[17px]" />
            </span>
          ) : (
            <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: tone }} />
          )}
          <h3 className="text-[14px] sm:text-[15px] font-extrabold text-white truncate">{title}</h3>
          {caption && <span className="text-[11px] text-gray-600 truncate">· {caption}</span>}
        </div>
        {(legend || action) && (
          <div className="flex items-center gap-3 shrink-0">
            {legend}
            {action}
          </div>
        )}
      </div>
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

/**
 * A count of the club, not of money. The words sit at the reading edge and the icon
 * square holds the far end, so a row of these reads as instruments rather than cards.
 */
function KpiTile({
  tone,
  icon,
  label,
  value,
  caption,
  spark,
  sparkId,
  live = false,
  onClick
}: {
  tone: string;
  icon: keyof typeof icons;
  label: string;
  value: string;
  caption: string;
  spark?: number[];
  sparkId?: string;
  live?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group relative overflow-hidden ${card} p-4 sm:p-5 text-right hover:border-primary/40 ${HOVER_LIFT}`}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-4 start-0 w-[3px] rounded-full opacity-60 transition-opacity duration-200 group-hover:opacity-100"
        style={{ backgroundColor: tone }}
      />
      <div className="flex items-center justify-between gap-2.5 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] sm:text-[12px] text-gray-500 font-semibold leading-snug">{label}</p>
          <p className="mt-1.5 text-[24px] sm:text-[30px] leading-none font-extrabold text-white tracking-tight tabular-nums">
            {value}
          </p>
          <p className="mt-1.5 text-[10.5px] sm:text-[11px] text-gray-600 leading-snug flex items-start gap-1.5">
            {live && <span className="mt-1 w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: tone }} />}
            <span>{caption}</span>
          </p>
        </div>
        <span
          className="w-10 h-10 sm:w-14 sm:h-14 rounded-2xl grid place-items-center shrink-0 transition-transform duration-200 group-hover:scale-[1.06]"
          style={{ backgroundColor: `${tone}12`, color: tone }}
        >
          <Glyph name={icon} className="w-5 h-5 sm:w-[26px] sm:h-[26px]" />
        </span>
      </div>
      <div className="mt-2 -mb-1 h-[30px]">
        {spark && <Sparkline points={spark} color={tone} id={sparkId || label} />}
      </div>
    </button>
  );
}

// One figure of the money statement: the figure, how it moved, and what it is measured over.
interface MoneySegment {
  key: string;
  label: string;
  icon: keyof typeof icons;
  tone: string;
  value: number;
  previous: number | null;
  note?: string;
  count: number;
  noun: string;
  empty: string;
  // Net profit is the number the club is actually run on, so it carries the gold edge.
  highlight?: boolean;
}

function DashboardPage() {
  const navigate = useNavigate();
  const { user, hasPermission, isOwner } = useAuth();
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [previousStats, setPreviousStats] = useState<BranchStat[]>([]);
  const [expiring, setExpiring] = useState<ExpiringSubscription[]>([]);
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({});
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [trend, setTrend] = useState<MonthPoint[]>([]);
  const [growthMonths, setGrowthMonths] = useState<GrowthMonth[]>([]);
  const [planMix, setPlanMix] = useState<PlanSlice[]>([]);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');

  const range = useMemo(() => rangesFor(period), [period]);
  const canSeeAttendance = hasPermission('VIEW_ATTENDANCE');
  // How many members the club has is the owner's business number, not something the
  // server sends to every account, so every census surface on this page checks for it.
  const canSeeCensus = hasPermission('VIEW_MEMBER_STATS');
  const canSeeTrend = hasPermission('VIEW_FINANCIAL_REPORTS');
  const canSeeRevenue = hasPermission('VIEW_DASHBOARD_REVENUE');
  const canSeeExpenses = hasPermission('VIEW_DASHBOARD_EXPENSES');
  const canSeeProfit = hasPermission('VIEW_DASHBOARD_PROFIT');
  const canSeeOutstanding = hasPermission('VIEW_DASHBOARD_OUTSTANDING');
  const canSeeAnyMoney = canSeeRevenue || canSeeExpenses || canSeeProfit || canSeeOutstanding;
  const canSeeJournal = hasPermission('VIEW_REPORTS');

  useEffect(() => {
    fetchData();
  }, [range.from, range.to, selectedBranch]);

  async function fetchTrend() {
    const months: MonthPoint[] = [];
    const now = new Date();
    const branchParam = selectedBranch === 'all' ? '' : `&branchId=${selectedBranch}`;
    await Promise.all(
      Array.from({ length: 6 }, async (_, i) => {
        const start = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const end = i === 5 ? now : new Date(now.getFullYear(), now.getMonth() - (5 - i) + 1, 0);
        const res = await fetch(`/api/reports/financial?from=${localDate(start)}&to=${localDate(end)}${branchParam}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          months[i] = {
            label: AR_MONTHS_SHORT[start.getMonth()],
            revenue: (data.revenue || 0) / 100,
            expenses: (data.expenses || 0) / 100
          };
        } else {
          months[i] = { label: AR_MONTHS_SHORT[start.getMonth()], revenue: 0, expenses: 0 };
        }
      })
    );
    setTrend(months.filter(Boolean));
  }

  const fetchData = async () => {
    const branchParam = selectedBranch === 'all' ? '' : `&branchId=${selectedBranch}`;
    const todayUrl = selectedBranch === 'all' ? '/api/attendance/today' : `/api/attendance/today?branchId=${selectedBranch}`;
    const growthUrl = selectedBranch === 'all' ? '/api/reports/growth' : `/api/reports/growth?branchId=${selectedBranch}`;
    // The journal strip always shows the last week, whatever period the money cards are on.
    const journalFrom = localDate(shiftDays(-6));
    const journalTo = localDate(new Date());
    try {
      const [branchRes, previousRes, expiringRes, todayRes, growthRes, activityRes] = await Promise.all([
        fetch(`/api/reports/branches?from=${range.from}&to=${range.to}`, { credentials: 'include' }),
        fetch(`/api/reports/branches?from=${range.prevFrom}&to=${range.prevTo}`, { credentials: 'include' }),
        fetch('/api/subscriptions/expiring?days=7', { credentials: 'include' }),
        canSeeAttendance
          ? fetch(todayUrl, { credentials: 'include' })
          : Promise.resolve(null),
        fetch(growthUrl, { credentials: 'include' }),
        canSeeJournal
          ? fetch(`/api/reports/activity?from=${journalFrom}&to=${journalTo}${branchParam}`, { credentials: 'include' })
          : Promise.resolve(null)
      ]);

      let stats: BranchStat[] = [];
      if (branchRes.ok) {
        // The server only sends the member census to accounts allowed to see it, so the
        // missing figure lands as 0 here instead of undefined inside a chart.
        stats = ((await branchRes.json()) as BranchStat[]).map(s => ({ ...s, activeMembers: s.activeMembers ?? 0 }));
        setBranchStats(stats);

        const counts: Record<string, number> = {};
        await Promise.all(
          stats.map(async (s: BranchStat) => {
            try {
              const res = await fetch(`/api/attendance/now?branchId=${s.branch.id}`, { credentials: 'include' });
              if (res.ok) {
                const data = await res.json();
                counts[s.branch.id] = data.count;
              }
            } catch {}
          })
        );
        setBranchCounts(counts);
      }
      if (previousRes.ok) setPreviousStats(await previousRes.json());
      if (expiringRes.ok) setExpiring(await expiringRes.json());
      if (todayRes && todayRes.ok) setTodaySummary((await todayRes.json()).summary);
      if (growthRes.ok) {
        const growthData = await growthRes.json();
        setGrowthMonths((growthData.months || []).map((m: GrowthMonth) => ({ ...m, newMembers: m.newMembers ?? 0, cumulative: m.cumulative ?? 0 })));
        setPlanMix(growthData.plans || []);
      }
      if (activityRes && activityRes.ok) {
        const activityData = await activityRes.json();
        setActivity((activityData.items || []).slice(0, 8));
      } else {
        setActivity([]);
      }
      if (canSeeTrend) await fetchTrend();
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-5 sm:space-y-7" aria-busy="true" role="status" aria-label="جاري التحميل">
        <div className="relative overflow-hidden rounded-[22px] border border-primary/20 bg-dark-elevate">
          <div className="px-4 sm:px-6 py-5 sm:py-7 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <Skeleton className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl shrink-0" />
              <div className="space-y-2">
                <Skeleton className="h-7 w-36 rounded-md" />
                <Skeleton className="h-3 w-44 rounded-md" />
              </div>
            </div>
            <Skeleton className="h-16 w-full xl:w-72 rounded-2xl" />
          </div>
          <div className="px-4 sm:px-6 py-3 border-t border-white/[0.08] bg-black/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
            <Skeleton className="h-11 w-full sm:w-64 rounded-xl" />
            <Skeleton className="h-10 w-full sm:w-44 rounded-xl" />
          </div>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`${card} p-4 sm:p-5`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-20 rounded-md" />
                  <Skeleton className="h-2.5 w-24 rounded-md" />
                </div>
                <Skeleton className="w-11 h-11 rounded-xl shrink-0" />
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className={`${card} p-4 sm:p-5 space-y-3`}>
              <Skeleton className="h-9 w-9 rounded-xl" />
              <Skeleton className="h-7 w-32 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
          ))}
        </div>
        <SkeletonTiles count={4} />
        <SkeletonCard height="h-[220px]" />
      </div>
    );
  }

  const filteredStats = selectedBranch === 'all'
    ? branchStats
    : branchStats.filter(s => s.branch.id === selectedBranch);

  const sum = (rows: BranchStat[], key: keyof BranchStat) =>
    rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

  const totalRevenue = sum(filteredStats, 'revenue');
  const totalExpenses = sum(filteredStats, 'expenses');
  const totalProfit = sum(filteredStats, 'profit');
  const totalOutstanding = sum(filteredStats, 'outstanding');
  const totalMembers = sum(filteredStats, 'activeMembers');
  const totalSubscriptions = sum(filteredStats, 'activeSubscriptions');
  const totalInGym = Object.values(branchCounts).reduce((s, c) => s + c, 0);

  const prevFiltered = selectedBranch === 'all'
    ? previousStats
    : previousStats.filter(s => s.branch.id === selectedBranch);

  const branchComparisonData = branchStats.map((stat) => ({
    name: branchLabel(stat),
    revenue: (stat.revenue || 0) / 100,
    expenses: (stat.expenses || 0) / 100,
    members: stat.activeMembers
  }));

  const revenueByBranch = branchStats
    .map((stat, idx) => ({
      name: branchLabel(stat),
      value: (stat.revenue || 0) / 100,
      color: COLORS[idx % COLORS.length]
    }))
    .filter(b => b.value > 0);

  const comparisonHasData = branchComparisonData.some(d =>
    (canSeeRevenue && d.revenue > 0) || (canSeeExpenses && d.expenses > 0)
  );

  const profitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;
  const trendHasData = trend.some(m => m.revenue > 0 || m.expenses > 0);
  // Two chart panels share a row, so when one is out of someone's permissions the other
  // takes the full width instead of leaving a hole in the page.
  const showTrendChart = canSeeTrend;
  const showComparisonChart = branchStats.length > 0 && (canSeeRevenue || canSeeExpenses);
  const showRevenueSplit = branchStats.length > 0 && canSeeRevenue && revenueByBranch.length > 0;
  const activePeriod = PERIODS.find(p => p.key === period)!;

  const memberSpark = growthMonths.map(m => m.cumulative);
  const planSpark = planMix.map(p => p.count);
  const revenueSpark = trend.map(m => m.revenue);
  const planTotal = planSpark.reduce((total, v) => total + v, 0);
  const growthHasData = growthMonths.some(m => m.newMembers > 0 || m.cumulative > 0);
  const latestGrowth = growthMonths[growthMonths.length - 1];
  const scopeName = !isOwner
    ? 'فرعك'
    : selectedBranch === 'all'
      ? 'جميع الفروع'
      : (branchStats.find(s => s.branch.id === selectedBranch)?.branch.name || 'الفرع المحدد');

  // The four money figures in the order the eye meets them. Each one only exists for
  // someone whose permissions carry it, so a receptionist's row is shorter, not fake.
  const moneyCards: MoneySegment[] = ([
    canSeeRevenue && {
      key: 'revenue',
      label: 'الإيرادات',
      icon: 'revenue' as const,
      tone: TONE.revenue,
      value: totalRevenue,
      previous: sum(prevFiltered, 'revenue'),
      count: sum(filteredStats, 'salesCount'),
      noun: 'عملية بيع',
      empty: 'لا مبيعات في الفترة'
    },
    canSeeExpenses && {
      key: 'expenses',
      label: 'المصروفات',
      icon: 'expenses' as const,
      tone: TONE.expenses,
      value: totalExpenses,
      previous: sum(prevFiltered, 'expenses'),
      count: sum(filteredStats, 'expensesCount'),
      noun: 'مصروف',
      empty: 'لا مصروفات في الفترة'
    },
    canSeeProfit && {
      key: 'profit',
      label: 'صافي الربح',
      icon: 'profit' as const,
      tone: totalProfit >= 0 ? TONE.profit : TONE.expenses,
      value: totalProfit,
      previous: sum(prevFiltered, 'profit'),
      count: sum(filteredStats, 'salesCount'),
      noun: 'عملية بيع',
      empty: 'لا إيرادات في الفترة',
      highlight: true
    },
    canSeeOutstanding && {
      key: 'outstanding',
      label: 'المستحقات',
      icon: 'outstanding' as const,
      tone: TONE.outstanding,
      // Outstanding is a live balance on active subscriptions, not a period total,
      // so there is no previous period to compare it against.
      value: totalOutstanding,
      previous: null,
      note: 'من المستحق على الأعضاء',
      count: sum(filteredStats, 'paymentsCount'),
      noun: 'دفعة مسجّلة',
      empty: 'لا دفعات في الفترة'
    }
  ].filter(Boolean) as MoneySegment[]);

  return (
    <Stagger>
      {/* ── Hero: the club's own photo under a dark wash, with the greeting and the quote ── */}
      <section className="relative overflow-hidden rounded-[22px] border border-primary/25 bg-dark-elevate">
        <img src="/images/login-bg.jpg" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover" />
        {/* The photo stays readable; only the two ends darken far enough for the text on them */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to left, rgba(9,9,9,0.92) 0%, rgba(9,9,9,0.58) 38%, rgba(9,9,9,0.50) 60%, rgba(9,9,9,0.86) 100%)' }}
        />
        <div aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}B3, transparent)` }} />

        <div className="relative px-4 sm:px-6 py-5 sm:py-6 flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4 sm:gap-5">
          <div className="flex items-center gap-3.5 min-w-0">
            <span
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl grid place-items-center shrink-0 border border-primary/25"
              style={{ backgroundColor: 'rgba(9,9,9,0.55)', color: GOLD }}
            >
              <Glyph name="performance" className="w-5 h-5 sm:w-[22px] sm:h-[22px]" />
            </span>
            <div className="min-w-0">
              <h1 className="text-[24px] sm:text-[30px] lg:text-[34px] leading-none font-extrabold text-white tracking-tight">
                لوحة التحكم
              </h1>
              <p className="mt-2 text-[12.5px] sm:text-[14px] text-gray-300 font-semibold truncate">
                أهلاً بعودتك، {user?.name?.split(' ')[0] || 'بيك'}
              </p>
              <p className="mt-1 text-[11.5px] sm:text-[12.5px] text-gray-400 truncate">
                نظرة عامة على {scopeName}
              </p>
            </div>
          </div>

          {/* The club's line, gold icon at the far edge and the span every figure below obeys.
              The span is only said when there are period figures underneath it. */}
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="min-w-0">
              <p className="text-[13.5px] sm:text-[15px] font-extrabold text-white leading-snug">
                "معاً نحو نسخة أفضل من نفسك"
              </p>
              {canSeeAnyMoney && (
                <p className="mt-1.5 text-[11.5px] sm:text-[12px] text-gray-400 flex items-center gap-1.5 min-w-0">
                  من {arDate(range.from)} إلى {arDate(range.to)}
                </p>
              )}
            </div>
            <span className="shrink-0 text-primary" aria-hidden="true">
              <Glyph name="dumbbell" className="w-8 h-8" />
            </span>
          </div>
        </div>
      </section>

      {/* ── The two switches every number on this page follows. A desk that sees no period
          figures gets no switches — they would change nothing under it. ── */}
      {canSeeAnyMoney && (
        <div className="rounded-2xl border border-dark-border bg-dark-card px-3 sm:px-4 py-2.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
          {/* Period switch — every money figure and chart below follows it */}
          <div className="flex items-center gap-1 rounded-xl p-1 border border-white/[0.06] bg-black/45">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                aria-pressed={period === p.key}
                className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg text-[13px] font-bold transition-[background-color,color,box-shadow] duration-200 min-h-[44px] sm:min-h-[38px] ${
                  period === p.key ? 'text-black shadow-sm shadow-black/30' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                style={period === p.key ? { background: GOLD } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2.5 min-w-0">
            <span className="text-[11.5px] text-gray-500">النسب مقارنة بـ{range.spanLabel}</span>
            {/* The branch reads as the gold pill the reference header uses */}
            <div className="relative flex-1 sm:flex-none">
              <svg className="w-4 h-4 absolute start-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 21s6.5-6.15 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 14.85 12 21 12 21Z" />
                <path d="M12 13.25a2.75 2.75 0 1 0 0-5.5 2.75 2.75 0 0 0 0 5.5Z" />
              </svg>
              <select
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
                aria-label="اختيار الفرع"
                className="appearance-none w-full sm:min-w-[210px] rounded-xl border border-primary/30 bg-black/50 ps-10 pe-9 py-2.5 min-h-[40px] text-[13px] font-bold text-white cursor-pointer transition-colors duration-200 hover:border-primary/55 focus:outline-none focus:border-primary/70"
              >
                <option value="all">جميع الفروع</option>
                {branchStats.map(stat => (
                  <option key={stat.branch.id} value={stat.branch.id}>{stat.branch.name}</option>
                ))}
              </select>
              <svg className="w-4 h-4 text-gray-500 absolute end-3.5 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </div>
          </div>
        </div>
      )}

      {/* ── The four doors: same size, same gold, each one a real route ── */}
      <div className="grid grid-cols-1 min-[380px]:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {quickActions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className={`group relative overflow-hidden ${card} px-3.5 sm:px-4 py-4 sm:py-5 text-right flex items-center gap-3 ${HOVER_LIFT}`}
          >
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px scale-x-0 transition-transform duration-[260ms] ease-out group-hover:scale-x-100" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}, transparent)` }} />
            <span
              className="w-10 h-10 sm:w-11 sm:h-11 shrink-0 rounded-xl grid place-items-center transition-transform duration-200 group-hover:scale-[1.06]"
              style={{ backgroundColor: GOLD_SURFACE, color: GOLD }}
            >
              <svg className="w-[21px] h-[21px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
                {action.d.map((d, i) => <path key={i} strokeLinecap="round" strokeLinejoin="round" d={d} />)}
              </svg>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[13.5px] font-bold text-white truncate">{action.label}</span>
              <span className="block text-[11px] text-gray-500 truncate mt-1">{action.hint}</span>
            </span>
            {/* The chevron is decoration on a phone — the label needs the room */}
            <svg className="hidden sm:block w-4 h-4 shrink-0 text-gray-700 transition-[color,transform] duration-200 group-hover:text-primary group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        ))}
      </div>

      {/* ── The money row: four equal figures, the profit one carrying the gold edge ── */}
      {canSeeAnyMoney && moneyCards.length > 0 && (
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {moneyCards.map(segment => (
            <div
              key={segment.key}
              className={`relative overflow-hidden px-3.5 py-4 sm:p-5 rounded-2xl border flex flex-col min-w-0 transition-colors duration-200 ${
                segment.highlight
                  ? 'border-primary/45 bg-dark-elevate shadow-[inset_0_0_0_1px_rgba(255,198,41,0.10)]'
                  : 'border-dark-border bg-dark-card'
              }`}
            >
              {segment.highlight && (
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -top-14 -start-10 w-40 h-40 rounded-full"
                  style={{ background: `radial-gradient(circle, ${GOLD}1F, transparent 65%)` }}
                />
              )}
              <div className="relative flex items-center gap-1.5 sm:gap-2 min-w-0">
                <span
                  className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl grid place-items-center shrink-0"
                  style={{ backgroundColor: `${segment.tone}14`, color: segment.tone }}
                >
                  <Glyph name={segment.icon} className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                </span>
                <p className="text-[11px] sm:text-[12.5px] text-gray-400 font-bold truncate">{segment.label}</p>
              </div>
              <p className="relative mt-3 text-[21px] sm:text-[26px] leading-none font-extrabold tracking-tight tabular-nums text-white" style={segment.value < 0 ? { color: TONE.expenses } : undefined}>
                {formatPiasters(segment.value)}
              </p>
              <div className="relative mt-auto pt-3 min-w-0 flex flex-col items-start gap-1.5 sm:flex-row sm:items-end sm:justify-between sm:gap-2">
                <p className="min-w-0 text-[11px] text-gray-600 flex items-center gap-1.5">
                  {segment.count > 0 && <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: segment.tone }} />}
                  <span className="truncate">
                    {segment.count > 0
                      ? `${formatNumber(segment.count)} ${segment.noun}`
                      : segment.empty}
                  </span>
                </p>
                <span className="shrink-0 flex items-center gap-1.5">
                  {segment.key === 'profit' && canSeeRevenue && totalRevenue > 0 && (
                    <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${TONE.profit}14`, color: TONE.profit }}>
                      {profitMargin}% الهامش
                    </span>
                  )}
                  {segment.previous === null ? (
                    <span className="text-[11px] text-gray-600">{segment.note}</span>
                  ) : (
                    <Delta current={segment.value} previous={segment.previous} spanLabel={range.spanLabel} />
                  )}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── The club itself: counts that are not money ── */}
      {(() => {
        // The member census is its own permission, so the row rebuilds itself around
        // whatever this account is allowed to see instead of leaving holes in the grid.
        const clubTiles = [
          canSeeCensus && (
            <KpiTile
              key="members"
              onClick={() => navigate('/admin/members')}
              tone={TONE.members}
              icon="members"
              label="إجمالي الأعضاء"
              value={formatNumber(totalMembers)}
              caption={`${isOwner ? branchCountLabel(filteredStats.length) : 'في فرعك'} · ${formatNumber(totalSubscriptions)} اشتراك`}
              spark={memberSpark}
              sparkId="members"
            />
          ),
          // How many subscriptions are live is the same club total as how many members are,
          // so it stands or falls with the census permission.
          canSeeCensus && (
            <KpiTile
              key="subscriptions"
              onClick={() => navigate('/admin/members?tab=subscriptions')}
              tone={TONE.expiring}
              icon="subscriptions"
              label="الاشتراكات النشطة"
              value={formatNumber(totalSubscriptions)}
              caption={expiring.length > 0 ? `${formatNumber(expiring.length)} تنتهي خلال ٧ أيام` : 'كل الاشتراكات في موعد'}
              spark={planSpark}
              sparkId="plans"
            />
          ),
          canSeeAttendance ? (
            <KpiTile
              key="attendance"
              onClick={() => navigate('/admin/attendance')}
              tone={TONE.attendance}
              icon="attendance"
              label="حضور اليوم"
              value={formatNumber(todaySummary?.total ?? 0)}
              caption={todaySummary ? `${formatNumber(todaySummary.checkedIn)} بالداخل · ${formatNumber(todaySummary.checkedOut)} خرج` : 'لا حضور مسجّل اليوم'}
              live={(todaySummary?.total ?? 0) > 0}
            />
          ) : (
            canSeeCensus && (
              <KpiTile
                key="new-members"
                onClick={() => navigate('/admin/members')}
                tone={TONE.members}
                icon="member"
                label="أعضاء جدد هذا الشهر"
                value={formatNumber(latestGrowth?.newMembers ?? 0)}
                caption={latestGrowth ? `إجمالي المسجّلين ${formatNumber(latestGrowth.cumulative)}` : '—'}
              />
            )
          ),
          <KpiTile
            key="in-gym"
            onClick={() => navigate('/admin/attendance')}
            tone={TONE.revenue}
            icon="checkin"
            label="داخل النادّي الآن"
            value={formatNumber(totalInGym)}
            caption={canSeeAttendance ? 'لم يسجّلوا الخروج بعد' : 'حسب آخر تسجيل حضور'}
            live={totalInGym > 0}
          />
        ].filter(Boolean);

        return (
          <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${
            clubTiles.length >= 4 ? 'lg:grid-cols-4' : clubTiles.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2'
          }`}>
            {clubTiles}
          </div>
        );
      })()}

      {/* ── Today: what needs a renewal, and who is in the building right now ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
        <Panel
          className="lg:col-span-3"
          title="اشتراكات تنتهي قريباً"
          icon="subscriptions"
          tone={TONE.expiring}
          caption="خلال ٧ أيام"
          bodyClass="p-0"
          action={
            <button
              onClick={() => navigate('/admin/members?tab=subscriptions')}
              className="text-[12.5px] font-bold text-amber-400 hover:text-amber-300 transition-colors duration-200 min-h-[44px] px-2"
            >
              كل الاشتراكات ←
            </button>
          }
        >
          {expiring.length > 0 ? (
            <>
              <ul className="divide-y divide-dark-border/40">
                {expiring.slice(0, 5).map(sub => (
                  <li key={sub.id}>
                    {/* One tap lands on his page, where the renewal actually lives. */}
                    <button
                      onClick={() => navigate(`/admin/members/${sub.member.id}`)}
                      className="w-full flex items-center gap-3 px-4 sm:px-5 py-3 text-right transition-colors duration-200 hover:bg-white/[0.02]"
                    >
                      <span className="w-9 h-9 rounded-xl grid place-items-center text-[13px] font-bold shrink-0" style={{ backgroundColor: `${TONE.expiring}14`, color: TONE.expiring }}>
                        {sub.member.name.trim().charAt(0)}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] sm:text-sm font-semibold text-white truncate">{sub.member.name}</p>
                        <p className="text-[11px] text-gray-500 truncate">{sub.plan.nameAr || sub.plan.name} · {sub.member.code}</p>
                      </div>
                      <div className="shrink-0 text-center">
                        <span className="block text-[11px] font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap" style={{ backgroundColor: `${TONE.expiring}12`, color: TONE.expiring }}>
                          {expiringInLabel(sub.endDate)}
                        </span>
                        <p className="mt-1 text-[10.5px] text-gray-600">{arDate(sub.endDate)}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {expiring.length > 5 && (
                <p className="px-4 sm:px-5 py-3 text-[11px] text-gray-600 border-t border-dark-border/40">
                  و{formatNumber(expiring.length - 5)} اشتراك آخر ينتهي خلال ٧ أيام
                </p>
              )}
            </>
          ) : (
            <p className="py-12 text-center text-sm text-gray-500">كل الاشتراكات في موعد</p>
          )}
        </Panel>

        <Panel
          className="lg:col-span-2"
          title="داخل النادّي الآن"
          icon="checkin"
          tone={TONE.revenue}
          caption={canSeeAttendance ? 'لم يسجّلوا الخروج بعد' : 'حسب آخر تسجيل حضور'}
          action={
            <button
              onClick={() => navigate('/admin/attendance')}
              className="text-[12.5px] font-bold text-primary hover:text-primary-light transition-colors duration-200 min-h-[44px] px-2"
            >
              الحضور ←
            </button>
          }
        >
          <div className="flex items-end justify-between gap-3">
            <p className="text-[34px] sm:text-[40px] leading-none font-extrabold text-white tracking-tight tabular-nums">
              {formatNumber(totalInGym)}
            </p>
            {totalInGym > 0 && (
              <span className="flex items-center gap-1.5 text-[11px] pb-1" style={{ color: TONE.revenue }}>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                مسجّل الآن
              </span>
            )}
          </div>

          {canSeeAttendance && todaySummary && (
            <div className="mt-4 grid grid-cols-3 gap-px bg-white/[0.06] rounded-xl overflow-hidden border border-dark-border/60">
              {[
                { label: 'بالداخل', value: todaySummary.checkedIn, tone: TONE.revenue },
                { label: 'خرج', value: todaySummary.checkedOut, tone: TONE.muted },
                { label: 'تنبيه', value: todaySummary.flagged, tone: todaySummary.flagged > 0 ? TONE.expenses : TONE.muted }
              ].map(cell => (
                <div key={cell.label} className="bg-dark-card px-2 py-3 text-center">
                  <p className="text-[10.5px] text-gray-600">{cell.label}</p>
                  <p className="mt-1 text-[17px] leading-none font-extrabold tracking-tight tabular-nums" style={{ color: cell.tone }}>
                    {formatNumber(cell.value)}
                  </p>
                </div>
              ))}
            </div>
          )}

          {filteredStats.length > 0 ? (
            <ul className="mt-4 space-y-1.5">
              {filteredStats.map((stat, idx) => {
                const count = branchCounts[stat.branch.id] ?? 0;
                const color = COLORS[idx % COLORS.length];
                return (
                  <li key={stat.branch.id} className="flex items-center gap-2.5 rounded-xl border border-dark-border/70 px-3 py-2.5 transition-colors duration-200 hover:border-primary/30">
                    <span className="w-7 h-7 rounded-lg grid place-items-center text-[12px] font-bold shrink-0" style={{ backgroundColor: `${color}18`, color }}>
                      {stat.branch.code.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] font-semibold text-white truncate">{stat.branch.name}</span>
                      {canSeeCensus && (
                        <span className="block text-[10.5px] text-gray-600">{formatNumber(stat.activeMembers)} عضو نشط</span>
                      )}
                    </span>
                    <span
                      className="shrink-0 text-[11px] font-bold px-2 py-1 rounded-lg whitespace-nowrap tabular-nums"
                      style={count > 0
                        ? { backgroundColor: 'rgba(52,211,153,0.12)', color: TONE.revenue }
                        : { backgroundColor: 'rgba(255,255,255,0.04)', color: TONE.muted }}
                    >
                      {count > 0 ? `${formatNumber(count)} بالداخل` : 'لا حضور'}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="mt-4 text-[13px] text-gray-600">لا فروع ظاهرة لصلاحياتك</p>
          )}
        </Panel>
      </div>
      {/* ── The club's money over six months, and the branches measured against each other ── */}
      {(showTrendChart || showComparisonChart) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
          {showTrendChart && (
            <Panel
              title="إيرادات ومصروفات آخر ٦ شهور"
              icon="revenue"
              className={showComparisonChart ? 'lg:col-span-3' : 'lg:col-span-5'}
              bodyClass="p-3 sm:p-4"
              legend={
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-3 h-3 rounded-sm" style={{ background: GOLD }} /> إيرادات
                  </span>
                  <span className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-3 h-3 rounded-sm bg-gray-600" /> مصروفات
                  </span>
                </div>
              }
            >
              {trendHasData ? (
                <div className="h-[210px] sm:h-[260px] rounded-xl border border-white/[0.05] bg-black/25 p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={trend} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={GOLD} stopOpacity={0.32} />
                          <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="trendExpenses" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={NEUTRAL_SERIES} stopOpacity={0.24} />
                          <stop offset="100%" stopColor={NEUTRAL_SERIES} stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`)} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={{ color: '#fff', fontWeight: 600 }}
                        formatter={(value: number, name: string) => [formatPounds(value), name === 'revenue' ? 'إيرادات' : 'مصروفات']}
                      />
                      <Area type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.6} fill="url(#trendRevenue)" dot={{ r: 3.5, fill: GOLD, strokeWidth: 0 }} activeDot={{ r: 5.5 }} />
                      <Area type="monotone" dataKey="expenses" stroke={NEUTRAL_SERIES} strokeWidth={2} fill="url(#trendExpenses)" dot={{ r: 3, fill: NEUTRAL_SERIES, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="h-[200px] rounded-xl border border-white/[0.05] bg-black/25 flex items-center justify-center text-sm text-gray-500">لا توجد حركة مالية خلال الـ٦ شهور دي</p>
              )}
            </Panel>
          )}

          {showComparisonChart && (
            <Panel
              title="مقارنة الفروع"
              icon="performance"
              className={showTrendChart ? 'lg:col-span-2' : 'lg:col-span-5'}
              caption={activePeriod.caption}
              bodyClass="p-3 sm:p-4"
              legend={
                <div className="flex items-center gap-4">
                  {canSeeRevenue && (
                    <span className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="w-3 h-3 rounded-sm" style={{ background: GOLD }} /> إيرادات
                    </span>
                  )}
                  {canSeeExpenses && (
                    <span className="flex items-center gap-2 text-xs text-gray-400">
                      <span className="w-3 h-3 rounded-sm bg-gray-600" /> مصروفات
                    </span>
                  )}
                </div>
              }
            >
              {comparisonHasData ? (
                <div className="h-[210px] sm:h-[260px] rounded-xl border border-white/[0.05] bg-black/25 p-2 sm:p-3">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={branchComparisonData} barGap={4}>
                      <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                      <XAxis dataKey="name" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
                      <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`)} />
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={{ color: '#fff', fontWeight: 600 }}
                        formatter={(value: number, name: string) => [formatPounds(value), name === 'revenue' ? 'إيرادات' : 'مصروفات']}
                        cursor={{ fill: CURSOR_FILL }}
                      />
                      {canSeeRevenue && <Bar dataKey="revenue" fill={GOLD} radius={[6, 6, 0, 0]} name="إيرادات" />}
                      {canSeeExpenses && <Bar dataKey="expenses" fill={NEUTRAL_SERIES} radius={[6, 6, 0, 0]} name="مصروفات" />}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <p className="h-[210px] sm:h-[260px] rounded-xl border border-white/[0.05] bg-black/25 flex items-center justify-center text-sm text-gray-500">لا توجد حركة مالية خلال الفترة</p>
              )}
            </Panel>
          )}
        </div>
      )}

      {/* Member growth and the live plan mix are both club totals, so the whole row only
          exists for accounts that are shown those numbers. */}
      {canSeeCensus && (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
        <Panel title="نمو الأعضاء" icon="trend" caption="آخر ١٠ شهور · إجمالي المسجّلين" className="lg:col-span-3" bodyClass="p-3 sm:p-4">
          {growthHasData ? (
            <div className="h-[210px] sm:h-[250px] rounded-xl border border-white/[0.05] bg-black/25 p-2 sm:p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthMonths} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="growthBar" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={CHART.goldLight} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={CHART.goldRich} stopOpacity={0.6} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="label" stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke={AXIS} fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: '#fff', fontWeight: 600 }}
                    cursor={{ fill: CURSOR_FILL }}
                    formatter={(value: number, name: string, entry: any) => {
                      const row = entry?.payload as GrowthMonth | undefined;
                      if (name === 'cumulative') return [formatNumber(value), 'الإجمالي'];
                      return [formatNumber(row?.newMembers ?? 0), 'جدد هذا الشهر'];
                    }}
                  />
                  <Bar dataKey="cumulative" fill="url(#growthBar)" radius={[6, 6, 0, 0]} name="cumulative" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="h-[210px] sm:h-[250px] rounded-xl border border-white/[0.05] bg-black/25 flex items-center justify-center text-sm text-gray-500">لا أعضاء مسجّلين في الفترة دي</p>
          )}
        </Panel>

        <Panel title="توزيع الباقات" icon="subscriptions" caption="اشتراكات نشطة الآن" className="lg:col-span-2">
          {planMix.length > 0 ? (
            <>
              <div className="relative h-[190px] sm:h-[210px] rounded-xl border border-white/[0.05] bg-black/25">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={planMix} cx="50%" cy="50%" innerRadius={54} outerRadius={82} paddingAngle={4} dataKey="count" nameKey="name" strokeWidth={0}>
                      {planMix.map((entry, index) => (
                        <Cell key={`plan-${index}`} fill={PLAN_COLORS[index % PLAN_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number, name: string) => [`${formatNumber(value)} اشتراك`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-[26px] font-extrabold text-white leading-none tracking-tight tabular-nums">{formatNumber(planTotal)}</span>
                  <span className="text-[11px] text-gray-500 mt-1">اشتراك نشط</span>
                </div>
              </div>
              <div className="mt-4 space-y-3">
                {planMix.map((plan, idx) => {
                  const color = PLAN_COLORS[idx % PLAN_COLORS.length];
                  const share = planTotal > 0 ? Math.round((plan.count / planTotal) * 100) : 0;
                  return (
                    <div key={`${plan.name}-${idx}`}>
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        <span className="text-[12.5px] text-gray-300 truncate flex-1">{plan.name}</span>
                        <span className="text-[12.5px] font-bold text-white shrink-0 tabular-nums">{formatNumber(plan.count)}</span>
                        <span className="text-[11px] text-gray-600 shrink-0 w-9 text-left tabular-nums">{share}%</span>
                      </div>
                      <div className="mt-1.5 ms-4 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <p className="h-[190px] sm:h-[210px] rounded-xl border border-white/[0.05] bg-black/25 flex items-center justify-center text-sm text-gray-500">لا اشتراكات نشطة الآن</p>
          )}
        </Panel>
      </div>
      )}

      {/* Branches at a glance + the live journal of what actually happened */}
      {(canSeeCensus || canSeeAnyMoney || canSeeJournal) && (
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
        <Panel
          className="lg:col-span-3"
          title="الفروع"
          icon="branches"
          bodyClass="p-4 sm:p-5"
          legend={
            <span className="flex items-center gap-1.5 text-[11px] text-gray-600">
              {totalInGym > 0 && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
              {formatNumber(totalInGym)} عضو بالداخل الآن
            </span>
          }
          action={
            <button
              onClick={() => navigate('/admin/branches')}
              className="text-[12.5px] font-bold text-primary hover:text-primary-light transition-colors duration-200 min-h-[44px] px-2"
            >
              عرض الكل ←
            </button>
          }
        >
          {filteredStats.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {filteredStats.map((stat, idx) => {
                const count = branchCounts[stat.branch.id] ?? 0;
                const color = COLORS[idx % COLORS.length];
                const selected = selectedBranch === stat.branch.id;
                return (
                  <div
                    key={stat.branch.id}
                    className={`relative overflow-hidden bg-dark-elevate border rounded-xl p-4 transition-colors duration-200 ${
                      selected ? 'border-primary/50' : 'border-white/[0.06] hover:border-primary/35'
                    }`}
                  >
                    <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${color}88, transparent)` }} />
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: color + '18', color }}>
                        {stat.branch.code.charAt(0).toUpperCase()}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13.5px] font-bold text-white truncate">{stat.branch.name}</p>
                        <p className="text-[11px] text-gray-600 mt-0.5 truncate">{stat.branch.code}</p>
                      </div>
                      {selected && (
                        <span className="shrink-0 text-[10px] font-bold px-2 py-1 rounded-lg" style={{ backgroundColor: GOLD_SURFACE, color: GOLD }}>
                          معروض
                        </span>
                      )}
                    </div>
                    {/* The two numbers the floor actually cares about: who is in, and who belongs */}
                    <div className={`grid ${canSeeCensus ? 'grid-cols-2' : 'grid-cols-1'} gap-2 mt-3.5 pt-3.5 border-t border-white/[0.06]`}>
                      <div>
                        <p className="text-[10.5px] text-gray-600">حضور الآن</p>
                        <p className="text-[19px] font-extrabold tracking-tight mt-0.5 tabular-nums" style={{ color: count > 0 ? TONE.revenue : TONE.muted }}>
                          {formatNumber(count)}
                        </p>
                      </div>
                      {canSeeCensus && (
                        <div>
                          <p className="text-[10.5px] text-gray-600">إجمالي الأعضاء</p>
                          <p className="text-[19px] font-extrabold text-white tracking-tight mt-0.5 tabular-nums">{formatNumber(stat.activeMembers)}</p>
                        </div>
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 text-[11px] text-gray-600">
                      {canSeeCensus && <span>{formatNumber(stat.activeSubscriptions)} اشتراك نشط</span>}
                      <button
                        onClick={() => setSelectedBranch(stat.branch.id)}
                        className="min-h-[44px] px-2 rounded-xl font-bold text-primary hover:text-primary-light hover:bg-primary/[0.08] transition-colors"
                      >
                        اعرض أرقامه ←
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-10 text-center text-sm text-gray-500">لا فروع ظاهرة لصلاحياتك</p>
          )}
        </Panel>

        {canSeeJournal && (
          <Panel
            className="lg:col-span-2"
            title="آخر الحركة"
            icon="journal"
            tone={TONE.goldLight}
            caption="آخر ٧ أيام"
            bodyClass="p-0"
            action={
              <button
                onClick={() => navigate('/admin/reports')}
                className="text-[12.5px] font-bold text-amber-400 hover:text-amber-300 transition-colors duration-200 min-h-[44px] px-2"
              >
                السجل الكامل ←
              </button>
            }
          >
            {activity.length > 0 ? (
              <>
                <ul className="divide-y divide-dark-border/40">
                  {activity.map(item => {
                    const meta = activityMeta[item.kind] || activityMeta.CHECKIN;
                    const outflow = item.kind === 'EXPENSE' || item.kind === 'SALARY';
                    return (
                      <li key={`${item.kind}-${item.id}`} className="group px-4 sm:px-5 py-2.5 flex items-center gap-3 transition-colors duration-200 hover:bg-white/[0.02]">
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-semibold text-white truncate">{item.title}</p>
                          <p className="text-[11px] text-gray-500 truncate mt-0.5">{item.subtitle}</p>
                        </div>
                        <div className="text-left shrink-0">
                          {item.amountPiasters !== null && (
                            <p className="text-[12.5px] font-bold tracking-tight tabular-nums" style={{ color: outflow ? TONE.expenses : TONE.revenue }}>
                              {outflow ? '−' : '+'}{formatPiasters(item.amountPiasters)}
                            </p>
                          )}
                          <p className="text-[10.5px] text-gray-600 mt-0.5 tabular-nums">{clockLabel(item.at)}</p>
                        </div>
                        <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0 transition-transform duration-200 group-hover:scale-105" style={{ backgroundColor: `${meta.color}14`, color: meta.color }}>
                          <Glyph name={meta.icon} className="w-[17px] h-[17px]" />
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="px-4 sm:px-5 py-2.5 text-[11px] text-gray-600 border-t border-dark-border/40">{scopeName}</p>
              </>
            ) : (
              <p className="py-12 text-center text-sm text-gray-500">لا حركة مسجّلة في آخر ٧ أيام</p>
            )}
          </Panel>
        )}
      </div>
      )}

      {/* Where the period's revenue came from, next to the full branch statement. Both are
          money-and-census surfaces, so a desk that holds neither never sees the row. */}
      {branchStats.length > 0 && (canSeeAnyMoney || canSeeCensus) && (
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 sm:gap-5">
          {canSeeRevenue && (
          <Panel
            title="توزيع الإيرادات"
            icon="pie"
            caption={activePeriod.caption}
            className="lg:col-span-2 lg:order-2"
            bodyClass="p-4 sm:p-5"
          >
              {revenueByBranch.length > 0 ? (
                <>
                  <div className="h-[190px] sm:h-[240px] rounded-xl border border-white/[0.05] bg-black/25">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={revenueByBranch} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4} dataKey="value" strokeWidth={0}>
                          {revenueByBranch.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle} formatter={(value: number) => [formatPounds(value), 'إيرادات']} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-4 mt-4">
                    {revenueByBranch.map((branch, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: branch.color }} />
                        <span className="text-xs text-gray-400">{branch.name}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="h-[190px] sm:h-[240px] rounded-xl border border-white/[0.05] bg-black/25 flex items-center justify-center text-sm text-gray-500">لا توجد إيرادات خلال الفترة</p>
              )}
            </Panel>
          )}

          <Panel
            title="أداء الفروع"
            icon="branches"
            className={canSeeRevenue ? 'lg:col-span-3 lg:order-1' : 'lg:col-span-5'}
            bodyClass="p-0"
          >
          {/* Phone: same data as stacked cards, no sideways scrolling */}
          <div className="sm:hidden px-4 pb-4 space-y-3">
            {filteredStats.map((stat, idx) => (
              <div key={stat.branch.id} className="bg-dark border border-dark-border rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: COLORS[idx % COLORS.length] + '15', color: COLORS[idx % COLORS.length] }}>
                    {stat.branch.code.charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{stat.branch.name}</p>
                    <p className="text-xs text-gray-600">{stat.branch.code}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3.5 border-t border-dark-border/50">
                  {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">الإيرادات</span>
                      <span className="text-xs font-semibold text-emerald-400">{formatPiasters(stat.revenue || 0)}</span>
                    </div>
                  )}
                  {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">المصروفات</span>
                      <span className="text-xs font-semibold text-rose-400">{formatPiasters(stat.expenses || 0)}</span>
                    </div>
                  )}
                  {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">الربح</span>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${(stat.profit || 0) >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                        {formatPiasters(stat.profit || 0)}
                      </span>
                    </div>
                  )}
                  {canSeeCensus && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">أعضاء نشط</span>
                      <span className="text-xs font-semibold text-white">{stat.activeMembers}</span>
                    </div>
                  )}
                  {canSeeCensus && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-gray-500">اشتراكات</span>
                      <span className="text-xs font-semibold text-white">{stat.activeSubscriptions}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden sm:block overflow-x-auto px-5 sm:px-6 pb-5 sm:pb-6">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-right text-xs text-gray-500 font-semibold pb-3 px-3">الفرع</th>
                  {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                    <th className="text-right text-xs text-gray-500 font-semibold pb-3 px-3">الإيرادات</th>
                  )}
                  {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                    <th className="text-right text-xs text-gray-500 font-semibold pb-3 px-3">المصروفات</th>
                  )}
                  {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                    <th className="text-right text-xs text-gray-500 font-semibold pb-3 px-3">الربح</th>
                  )}
                  {canSeeCensus && (
                    <th className="text-right text-xs text-gray-500 font-semibold pb-3 px-3">الأعضاء</th>
                  )}
                  {canSeeCensus && (
                    <th className="text-right text-xs text-gray-500 font-semibold pb-3 px-3">الاشتراكات</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((stat, idx) => (
                  <tr key={stat.branch.id} className="border-b border-dark-border/30 last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="py-4 px-3">
                      <div className="flex items-center gap-3">
                        <span className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] + '15', color: COLORS[idx % COLORS.length] }}>
                          {stat.branch.code.charAt(0).toUpperCase()}
                        </span>
                        <div>
                          <p className="text-sm font-semibold text-white">{stat.branch.name}</p>
                          <p className="text-xs text-gray-600">{stat.branch.code}</p>
                        </div>
                      </div>
                    </td>
                    {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                      <td className="py-4 px-3">
                        <span className="text-sm font-semibold text-emerald-400">{formatPiasters(stat.revenue || 0)}</span>
                      </td>
                    )}
                    {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                      <td className="py-4 px-3">
                        <span className="text-sm font-semibold text-rose-400">{formatPiasters(stat.expenses || 0)}</span>
                      </td>
                    )}
                    {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                      <td className="py-4 px-3">
                        <span className={`text-sm font-semibold px-2 py-0.5 rounded-lg ${(stat.profit || 0) >= 0 ? 'text-emerald-400 bg-emerald-500/10' : 'text-rose-400 bg-rose-500/10'}`}>
                          {formatPiasters(stat.profit || 0)}
                        </span>
                      </td>
                    )}
                    {canSeeCensus && (
                      <td className="py-4 px-3">
                        <span className="text-sm font-semibold text-white">{stat.activeMembers}</span>
                      </td>
                    )}
                    {canSeeCensus && (
                      <td className="py-4 px-3">
                        <span className="text-sm font-semibold text-white">{stat.activeSubscriptions}</span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </Panel>
        </div>
      )}
    </Stagger>
  );
}

export default DashboardPage;
