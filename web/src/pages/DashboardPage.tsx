import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { localDate, arDate } from '../utils/dates';
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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
  member: { name: string; code: string };
  plan: { name: string; nameAr?: string };
}

interface MonthPoint {
  label: string;
  revenue: number;
  expenses: number;
}

type PeriodKey = 'week' | 'month' | 'current';

const PERIODS: { key: PeriodKey; label: string; caption: string }[] = [
  { key: 'week', label: '٧ أيام', caption: 'آخر ٧ أيام' },
  { key: 'month', label: '٣٠ يوم', caption: 'آخر ٣٠ يوم' },
  { key: 'current', label: 'هذا الشهر', caption: 'من أول الشهر' }
];

const AR_MONTHS_SHORT = ['ينا', 'فبر', 'مار', 'أبر', 'مايو', 'يون', 'يول', 'أغس', 'سبت', 'أكت', 'نوف', 'ديس'];
const COLORS = ['#F59E0B', '#D97706', '#FCD34D', '#B45309', '#92400E'];

const GOLD = '#F59E0B';
const TONE = {
  revenue: '#34D399',
  expenses: '#FB7185',
  profit: GOLD,
  outstanding: '#FBBF24',
  members: GOLD,
  attendance: '#38BDF8',
  expiring: '#FBBF24'
};

const card = 'bg-dark-card border border-dark-border rounded-2xl';

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

// A zero on these cards means "nothing happened yet", not "the club earned nothing" — say so plainly.
function StatFooter({ dotClass, textClass, count, noun, emptyText }: {
  dotClass: string;
  textClass: string;
  count: number;
  noun: string;
  emptyText: string;
}) {
  return (
    <div className="mt-2 flex items-center gap-1.5 min-h-[16px]">
      {count > 0 && <div className={`w-1.5 h-1.5 rounded-full animate-pulse shrink-0 ${dotClass}`} />}
      <span className={`text-[11px] leading-tight ${textClass}`}>
        {count > 0 ? `${formatNumber(count)} ${noun}` : emptyText}
      </span>
    </div>
  );
}

/** Real change against the previous period. No previous movement means no percentage to show. */
function Delta({ current, previous, spanLabel }: { current: number; previous: number; spanLabel: string }) {
  if (previous <= 0) {
    return <span className="text-[11px] text-gray-600">لا حركة في {spanLabel}</span>;
  }
  const percent = Math.round(((current - previous) / previous) * 100);
  const up = percent >= 0;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded-md"
      style={{ backgroundColor: up ? 'rgba(52,211,153,0.10)' : 'rgba(251,113,133,0.10)', color: up ? TONE.revenue : TONE.expenses }}
      title={`مقارنة بـ${spanLabel}`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {up ? <path d="M12 19V5M6 11l6-6 6 6" /> : <path d="M12 5v14M6 13l6 6 6-6" />}
      </svg>
      {Math.abs(percent)}%
    </span>
  );
}

function CardTitle({ children, tone = GOLD }: { children: React.ReactNode; tone?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: tone }} />
      <h3 className="text-[15px] sm:text-base font-extrabold text-white">{children}</h3>
    </div>
  );
}

const chartTooltipStyle = {
  backgroundColor: '#0A0A0A',
  border: '1px solid #2A2A2A',
  borderRadius: '12px',
  fontSize: '12px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
};

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
    label: 'تجديد اشتراك',
    hint: 'إدارة الاشتراكات',
    path: '/admin/subscriptions',
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
  performance: 'M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0-1 3m8.5-3 1 3m0 0 .5 1.5m-.5-1.5h-9.5m0 0-.5 1.5'
};

function Glyph({ name, className = 'w-4 h-4' }: { name: keyof typeof icons; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={icons[name]} />
    </svg>
  );
}

function DashboardPage() {
  const navigate = useNavigate();
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [previousStats, setPreviousStats] = useState<BranchStat[]>([]);
  const [expiring, setExpiring] = useState<ExpiringSubscription[]>([]);
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({});
  const [todaySummary, setTodaySummary] = useState<TodaySummary | null>(null);
  const [trend, setTrend] = useState<MonthPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodKey>('week');
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const { hasPermission, isOwner } = useAuth();

  const range = useMemo(() => rangesFor(period), [period]);
  const canSeeAttendance = hasPermission('VIEW_ATTENDANCE');
  const canSeeTrend = hasPermission('VIEW_FINANCIAL_REPORTS');
  const canSeeRevenue = hasPermission('VIEW_DASHBOARD_REVENUE');
  const canSeeExpenses = hasPermission('VIEW_DASHBOARD_EXPENSES');
  const canSeeProfit = hasPermission('VIEW_DASHBOARD_PROFIT');
  const canSeeOutstanding = hasPermission('VIEW_DASHBOARD_OUTSTANDING');
  const canSeeAnyMoney = canSeeRevenue || canSeeExpenses || canSeeProfit || canSeeOutstanding;

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
    try {
      const [branchRes, previousRes, expiringRes, todayRes] = await Promise.all([
        fetch(`/api/reports/branches?from=${range.from}&to=${range.to}`, { credentials: 'include' }),
        fetch(`/api/reports/branches?from=${range.prevFrom}&to=${range.prevTo}`, { credentials: 'include' }),
        fetch('/api/subscriptions/expiring?days=7', { credentials: 'include' }),
        canSeeAttendance
          ? fetch(todayUrl, { credentials: 'include' })
          : Promise.resolve(null)
      ]);

      let stats: BranchStat[] = [];
      if (branchRes.ok) {
        stats = await branchRes.json();
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
      if (canSeeTrend) await fetchTrend();
    } catch (err) {
      console.error('Error fetching dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <div className="text-gray-400 text-sm">جاري التحميل...</div>
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
  const activePeriod = PERIODS.find(p => p.key === period)!;

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Header: what this page covers and how to switch the view */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: 'rgba(245,158,11,0.10)', color: GOLD }}>
              <Glyph name="performance" className="w-4 h-4" />
            </span>
            <h1 className="text-2xl sm:text-[26px] font-extrabold text-white tracking-tight leading-none">لوحة التحكم</h1>
          </div>
          <p className="text-[13px] text-gray-500 mt-2">
            {isOwner ? 'نظرة عامة على جميع الفروع' : 'نظرة عامة على فرعك'}
            <span className="mx-2 text-gray-700">·</span>
            من {arDate(range.from)} إلى {arDate(range.to)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Period switch — every money card and chart below follows it */}
          <div className="flex items-center gap-1 bg-dark-card border border-dark-border rounded-xl p-1">
            {PERIODS.map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                aria-pressed={period === p.key}
                className={`px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors min-h-[44px] sm:min-h-[36px] ${
                  period === p.key ? 'text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
                style={period === p.key ? { background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' } : undefined}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              aria-label="اختيار الفرع"
              className="appearance-none bg-dark-card border border-dark-border rounded-xl pr-4 pl-10 py-2.5 text-[13px] text-white focus:outline-none focus:border-primary/60 min-w-[180px] min-h-[44px] transition-colors cursor-pointer"
            >
              <option value="all">جميع الفروع</option>
              {branchStats.map(stat => (
                <option key={stat.branch.id} value={stat.branch.id}>{stat.branch.name}</option>
              ))}
            </select>
            <svg className="w-4 h-4 text-gray-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {quickActions.map((action) => (
          <button
            key={action.path}
            onClick={() => navigate(action.path)}
            className="group relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl px-3 sm:px-4 py-3.5 flex items-center gap-2 sm:gap-3 text-right hover:border-primary/40 hover:bg-primary/[0.03] transition-colors min-h-[64px]"
          >
            <div className="absolute top-0 right-0 h-full w-0.5 bg-gradient-to-b from-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="w-10 h-10 shrink-0 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center group-hover:from-primary/30 group-hover:to-primary/10 transition-colors">
              <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                {action.d.map((d, i) => <path key={i} strokeLinecap="round" strokeLinejoin="round" d={d} />)}
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white truncate">{action.label}</p>
              <p className="hidden sm:block text-[11px] text-gray-500 truncate mt-0.5">{action.hint}</p>
            </div>
            <svg className="hidden sm:block w-4 h-4 shrink-0 text-gray-700 group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
          </button>
        ))}
      </div>

      {/* Financial KPIs — nothing renders unless the user can see at least one money figure */}
      {canSeeAnyMoney && (
        <>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>الحركة المالية</CardTitle>
          <span className="text-[11px] text-gray-600">النسب مقارنة بـ{range.spanLabel}</span>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {canSeeRevenue && (
            <div className={`${card} relative overflow-hidden p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] sm:text-xs text-gray-500 font-semibold pt-2">الإيرادات</p>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TONE.revenue}14`, color: TONE.revenue }}>
                  <Glyph name="revenue" />
                </span>
              </div>
              <p className="mt-1 text-xl sm:text-[26px] font-extrabold tracking-tight" style={{ color: TONE.revenue }}>
                {formatPiasters(totalRevenue)}
              </p>
              <div className="mt-1.5">
                <Delta current={totalRevenue} previous={sum(prevFiltered, 'revenue')} spanLabel={range.spanLabel} />
              </div>
              <StatFooter
                dotClass="bg-emerald-400"
                textClass="text-emerald-400/60"
                count={sum(filteredStats, 'salesCount')}
                noun="عملية بيع"
                emptyText="لا مبيعات في الفترة"
              />
            </div>
          )}

          {canSeeExpenses && (
            <div className={`${card} relative overflow-hidden p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] sm:text-xs text-gray-500 font-semibold pt-2">المصروفات</p>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TONE.expenses}14`, color: TONE.expenses }}>
                  <Glyph name="expenses" />
                </span>
              </div>
              <p className="mt-1 text-xl sm:text-[26px] font-extrabold tracking-tight" style={{ color: TONE.expenses }}>
                {formatPiasters(totalExpenses)}
              </p>
              <div className="mt-1.5">
                <Delta current={totalExpenses} previous={sum(prevFiltered, 'expenses')} spanLabel={range.spanLabel} />
              </div>
              <StatFooter
                dotClass="bg-rose-400"
                textClass="text-rose-400/60"
                count={sum(filteredStats, 'expensesCount')}
                noun="مصروف"
                emptyText="لا مصروفات في الفترة"
              />
            </div>
          )}

          {canSeeProfit && (
            <div className={`${card} relative overflow-hidden p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] sm:text-xs text-gray-500 font-semibold pt-2">صافي الربح</p>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TONE.profit}14`, color: TONE.profit }}>
                  <Glyph name="profit" />
                </span>
              </div>
              <p className="mt-1 text-xl sm:text-[26px] font-extrabold tracking-tight" style={{ color: totalProfit >= 0 ? TONE.profit : TONE.expenses }}>
                {formatPiasters(totalProfit)}
              </p>
              <div className="mt-1.5 flex items-center gap-2 min-h-[22px]">
                {totalRevenue > 0 && (
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md" style={{ backgroundColor: `${TONE.profit}14`, color: TONE.profit }}>
                    {profitMargin}% هامش الربح
                  </span>
                )}
                <Delta current={totalProfit} previous={sum(prevFiltered, 'profit')} spanLabel={range.spanLabel} />
              </div>
              {totalRevenue <= 0 && (
                <StatFooter dotClass="" textClass="text-gray-600" count={0} noun="" emptyText="لا إيرادات في الفترة" />
              )}
            </div>
          )}

          {canSeeOutstanding && (
            <div className={`${card} relative overflow-hidden p-4 sm:p-5`}>
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] sm:text-xs text-gray-500 font-semibold pt-2">المستحقات</p>
                <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TONE.outstanding}14`, color: TONE.outstanding }}>
                  <Glyph name="outstanding" />
                </span>
              </div>
              <p className="mt-1 text-xl sm:text-[26px] font-extrabold tracking-tight" style={{ color: TONE.outstanding }}>
                {formatPiasters(totalOutstanding)}
              </p>
              {/* Outstanding is a live balance on active subscriptions, not a period total, so it has no period-over-period change. */}
              <div className="mt-1.5">
                <span className="text-[11px] text-gray-600">على الاشتراكات النشطة الآن</span>
              </div>
              <StatFooter
                dotClass="bg-amber-400"
                textClass="text-amber-400/60"
                count={sum(filteredStats, 'paymentsCount')}
                noun="دفعة مسجّلة"
                emptyText="لا دفعات في الفترة"
              />
            </div>
          )}
        </div>
        </>
      )}

      {/* Operational KPIs — two tiles per row on a phone, four across on a desktop */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          onClick={() => navigate('/admin/members')}
          className={`${card} group relative overflow-hidden p-3.5 sm:p-5 text-right hover:border-primary/40 transition-colors`}
        >
          <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-[1.03] transition-transform" style={{ backgroundColor: `${TONE.members}14`, color: TONE.members }}>
            <Glyph name="members" className="w-5 h-5 sm:w-6 sm:h-6" />
          </span>
          <p className="mt-3 sm:mt-2 text-[11px] sm:text-xs text-gray-500 font-semibold">الأعضاء النشطون</p>
          <p className="mt-1.5 sm:mt-1 text-[22px] sm:text-[30px] leading-none font-extrabold text-white tracking-tight">{formatNumber(totalMembers)}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-600 mt-1.5 sm:mt-2 leading-snug">
            {isOwner ? branchCountLabel(filteredStats.length) : 'في فرعك'} · {formatNumber(totalSubscriptions)} اشتراك
          </p>
        </button>

        {canSeeAttendance && (
          <button
            onClick={() => navigate('/admin/attendance')}
            className={`${card} group relative overflow-hidden p-3.5 sm:p-5 text-right hover:border-sky-400/40 transition-colors`}
          >
            <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-[1.03] transition-transform" style={{ backgroundColor: `${TONE.attendance}14`, color: TONE.attendance }}>
              <Glyph name="attendance" className="w-5 h-5 sm:w-6 sm:h-6" />
            </span>
            <p className="mt-3 sm:mt-2 text-[11px] sm:text-xs text-gray-500 font-semibold">حضور اليوم</p>
            <p className="mt-1.5 sm:mt-1 text-[22px] sm:text-[30px] leading-none font-extrabold tracking-tight" style={{ color: TONE.attendance }}>
              {formatNumber(todaySummary?.total ?? 0)}
            </p>
            <p className="text-[10px] sm:text-[11px] text-gray-600 mt-1.5 sm:mt-2 leading-snug">
              {todaySummary
                ? `${formatNumber(todaySummary.checkedIn)} بالداخل · ${formatNumber(todaySummary.checkedOut)} خرج`
                : '—'}
            </p>
            {todaySummary && todaySummary.flagged > 0 && (
              <span className="absolute top-3.5 left-3.5 text-[10px] sm:text-[11px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: 'rgba(251,113,133,0.12)', color: TONE.expenses }}>
                {formatNumber(todaySummary.flagged)} تنبيه
              </span>
            )}
          </button>
        )}

        <button
          onClick={() => navigate('/admin/subscriptions')}
          className={`${card} group relative overflow-hidden p-3.5 sm:p-5 text-right hover:border-amber-400/40 transition-colors`}
        >
          <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-[1.03] transition-transform" style={{ backgroundColor: `${TONE.expiring}14`, color: TONE.expiring }}>
            <Glyph name="expiring" className="w-5 h-5 sm:w-6 sm:h-6" />
          </span>
          <p className="mt-3 sm:mt-2 text-[11px] sm:text-xs text-gray-500 font-semibold">تنتهي خلال ٧ أيام</p>
          <p className="mt-1.5 sm:mt-1 text-[22px] sm:text-[30px] leading-none font-extrabold tracking-tight" style={{ color: expiring.length > 0 ? TONE.expiring : '#4B5563' }}>
            {formatNumber(expiring.length)}
          </p>
          <p className="text-[10px] sm:text-[11px] text-gray-600 mt-1.5 sm:mt-2 leading-snug">
            {expiring.length > 0 ? 'يحتاج تجديد' : 'كل الاشتراكات في موعد'}
          </p>
        </button>

        <button
          onClick={() => navigate('/admin/attendance')}
          className={`${card} group relative overflow-hidden p-3.5 sm:p-5 text-right hover:border-primary/40 transition-colors`}
        >
          <span className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-[1.03] transition-transform" style={{ backgroundColor: 'rgba(52,211,153,0.12)', color: TONE.revenue }}>
            <Glyph name="subscriptions" className="w-5 h-5 sm:w-6 sm:h-6" />
            {totalInGym > 0 && <span className="absolute top-1.5 left-1.5 w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />}
          </span>
          <p className="mt-3 sm:mt-2 text-[11px] sm:text-xs text-gray-500 font-semibold">داخل النادّي الآن</p>
          <p className="mt-1.5 sm:mt-1 text-[22px] sm:text-[30px] leading-none font-extrabold tracking-tight text-white">{formatNumber(totalInGym)}</p>
          <p className="text-[10px] sm:text-[11px] text-gray-600 mt-1.5 sm:mt-2 leading-snug">
            {canSeeAttendance ? 'لم يسجّلوا الخروج بعد' : 'حسب آخر تسجيل حضور'}
          </p>
        </button>
      </div>

      {/* Branch presence */}
      {Object.keys(branchCounts).length > 0 && (
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <CardTitle>الحاضرون في الفروع الآن</CardTitle>
            <span className="text-[11px] text-gray-600">{formatNumber(totalInGym)} عضو بالداخل الآن</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {filteredStats.map((stat, idx) => {
              const count = branchCounts[stat.branch.id] ?? 0;
              const color = COLORS[idx % COLORS.length];
              return (
                <div key={stat.branch.id} className="rounded-2xl border border-white/5 bg-dark px-4 py-4 flex items-center gap-3 hover:border-primary/25 transition-colors">
                  <span className="w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0" style={{ backgroundColor: color + '18', color }}>
                    {stat.branch.code.charAt(0).toUpperCase()}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{stat.branch.name}</p>
                    <p className="text-[11px] text-gray-500 mt-1">
                      {formatNumber(stat.activeMembers)} عضو نشط · {formatNumber(stat.activeSubscriptions)} اشتراك
                    </p>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl font-extrabold tracking-tight" style={{ color: count > 0 ? TONE.profit : '#4B5563' }}>{count}</span>
                      <span className="text-[11px] text-gray-500">حاضر</span>
                    </div>
                    <span className="flex items-center justify-end gap-1.5 mt-1 text-[11px]" style={{ color: count > 0 ? TONE.revenue : '#4B5563' }}>
                      <span className={`w-1.5 h-1.5 rounded-full ${count > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-dark-hover'}`} />
                      {count > 0 ? 'الآن' : 'لا حضور'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Revenue trend */}
      {canSeeTrend && (
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <CardTitle>إيرادات ومصروفات آخر ٦ شهور</CardTitle>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-2 text-xs text-gray-400">
                <span className="w-3 h-3 rounded-sm" style={{ background: GOLD }} /> إيرادات
              </span>
              <span className="flex items-center gap-2 text-xs text-gray-400">
                <span className="w-3 h-3 rounded-sm bg-gray-600" /> مصروفات
              </span>
            </div>
          </div>
          {trendHasData ? (
            <div className="h-[210px] sm:h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="trendRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={GOLD} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="trendExpenses" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#4B5563" stopOpacity={0.22} />
                      <stop offset="100%" stopColor="#4B5563" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                  <XAxis dataKey="label" stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`)} />
                  <Tooltip
                    contentStyle={chartTooltipStyle}
                    labelStyle={{ color: '#fff', fontWeight: 600 }}
                    formatter={(value: number, name: string) => [formatPounds(value), name === 'revenue' ? 'إيرادات' : 'مصروفات']}
                  />
                  <Area type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2.4} fill="url(#trendRevenue)" dot={{ r: 3, fill: GOLD, strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Area type="monotone" dataKey="expenses" stroke="#6B7280" strokeWidth={2} fill="url(#trendExpenses)" dot={{ r: 3, fill: '#6B7280', strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="h-[200px] flex items-center justify-center text-sm text-gray-500">لا توجد حركة مالية خلال الـ٦ شهور دي</p>
          )}
        </div>
      )}

      {/* Charts — each series only renders for someone allowed to read that number */}
      {branchStats.length > 0 && (canSeeRevenue || canSeeExpenses) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className={`${card} p-5 sm:p-6 ${canSeeRevenue ? '' : 'lg:col-span-2'}`}>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
              <CardTitle>مقارنة الفروع</CardTitle>
              <div className="flex items-center gap-4">
                {canSeeRevenue && (
                  <span className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-3 h-3 rounded-sm" style={{ background: GOLD }} /> إيرادات
                  </span>
                )}
                {canSeeExpenses && (
                  <span className="flex items-center gap-2 text-xs text-gray-400">
                    <span className="w-3 h-3 rounded-sm bg-dark-hover" /> مصروفات
                  </span>
                )}
              </div>
            </div>
            {comparisonHasData ? (
              <div className="h-[190px] sm:h-[240px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={branchComparisonData} barGap={4}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                    <XAxis dataKey="name" stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}K` : `${v}`)} />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: '#fff', fontWeight: 600 }}
                      formatter={(value: number, name: string) => [formatPounds(value), name === 'revenue' ? 'إيرادات' : 'مصروفات']}
                      cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }}
                    />
                    {canSeeRevenue && <Bar dataKey="revenue" fill="#F59E0B" radius={[6, 6, 0, 0]} name="إيرادات" />}
                    {canSeeExpenses && <Bar dataKey="expenses" fill="#374151" radius={[6, 6, 0, 0]} name="مصروفات" />}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="h-[190px] sm:h-[240px] flex items-center justify-center text-sm text-gray-500">لا توجد حركة مالية خلال الفترة</p>
            )}
          </div>

          {canSeeRevenue && (
            <div className={`${card} p-5 sm:p-6`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                <CardTitle>توزيع الإيرادات</CardTitle>
                <span className="text-[11px] text-gray-600">{activePeriod.caption}</span>
              </div>
              {revenueByBranch.length > 0 ? (
                <>
                  <div className="h-[190px] sm:h-[240px]">
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
                <p className="h-[190px] sm:h-[240px] flex items-center justify-center text-sm text-gray-500">لا توجد إيرادات خلال الفترة</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Branch performance */}
      {branchStats.length > 0 && (
        <div className={`${card} overflow-hidden`}>
          <div className="p-5 sm:p-6">
            <CardTitle>أداء الفروع</CardTitle>
          </div>
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
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">أعضاء نشط</span>
                    <span className="text-xs font-semibold text-white">{stat.activeMembers}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-gray-500">اشتراكات</span>
                    <span className="text-xs font-semibold text-white">{stat.activeSubscriptions}</span>
                  </div>
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
                  <th className="text-right text-xs text-gray-500 font-semibold pb-3 px-3">الأعضاء</th>
                  <th className="text-right text-xs text-gray-500 font-semibold pb-3 px-3">الاشتراكات</th>
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
                    <td className="py-4 px-3">
                      <span className="text-sm font-semibold text-white">{stat.activeMembers}</span>
                    </td>
                    <td className="py-4 px-3">
                      <span className="text-sm font-semibold text-white">{stat.activeSubscriptions}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Expiring subscriptions */}
      {expiring.length > 0 && (
        <div className={`${card} p-5 sm:p-6`}>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
            <CardTitle tone={TONE.expiring}>اشتراكات تنتهي قريباً</CardTitle>
            <button
              onClick={() => navigate('/admin/subscriptions')}
              className="text-[13px] font-semibold text-amber-400 hover:text-amber-300 transition-colors min-h-[44px] sm:min-h-[36px]"
            >
              جدّد الآن ←
            </button>
          </div>
          <div className="divide-y divide-dark-border/40 -my-1">
            {expiring.slice(0, 6).map(sub => (
              <div key={sub.id} className="py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[13px] sm:text-sm font-semibold text-white truncate">{sub.member.name}</p>
                  <p className="text-[11px] text-gray-500 truncate">{sub.plan.nameAr || sub.plan.name} · {arDate(sub.endDate)}</p>
                </div>
                <span className="shrink-0 text-[11px] sm:text-xs text-amber-400 bg-amber-500/10 border border-amber-500/15 px-2.5 py-1.5 rounded-lg font-semibold whitespace-nowrap">
                  {expiringInLabel(sub.endDate)}
                </span>
              </div>
            ))}
          </div>
          {expiring.length > 6 && (
            <p className="mt-3 text-[11px] text-gray-600">
              و{formatNumber(expiring.length - 6)} اشتراك آخر ينتهي خلال ٧ أيام
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
