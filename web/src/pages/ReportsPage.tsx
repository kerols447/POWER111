import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface FinancialSummary {
  revenue: number;
  expenses: number;
  profit: number;
  outstanding: number;
  salesCount: number;
  expensesCount: number;
  paymentsCount: number;
}

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

interface SaleItem {
  id: string;
  productId: string;
  quantity: number;
  unitPricePiasters: number;
  totalPiasters: number;
  product: { name: string; nameAr?: string };
}

interface SaleRecord {
  id: string;
  invoiceNumber: string;
  subtotalPiasters: number;
  discountPiasters: number;
  taxPiasters: number;
  finalTotalPiasters: number;
  createdAt: string;
  branch: { id: string; name: string };
  items: SaleItem[];
}

interface ExpenseRecord {
  id: string;
  category: string;
  description: string;
  amountPiasters: number;
  createdAt: string;
  branch: { id: string; name: string };
}

interface ExpensesReport {
  expenses: ExpenseRecord[];
  byCategory: Record<string, { count: number; total: number }>;
  total: number;
}

function formatPiasters(piasters: number): string {
  const pounds = piasters / 100;
  return pounds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ج.م';
}

const COLORS = ['#F59E0B', '#D97706', '#FCD34D', '#B45309', '#92400E', '#78350F'];

type ReportTab = 'financial' | 'sales' | 'expenses' | 'branches';

/* ------------------------------------------------------------------ */
/*  SVG Icon Components                                                */
/* ------------------------------------------------------------------ */

function IconFinancial({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

function IconSales({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function IconExpenses({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9" />
      <path d="M3 15h18l-1.5 6H4.5L3 15Z" />
      <path d="M9 10h6" />
    </svg>
  );
}

function IconBranch({ className = 'w-5 h-5', style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4" /><path d="M8 6h.01M16 6h.01M12 6h.01M8 10h.01M16 10h.01M12 10h.01M8 14h.01M16 14h.01M12 14h.01" />
    </svg>
  );
}

function IconCalendar({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function IconTrendUp({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" /><polyline points="17 6 23 6 23 12" />
    </svg>
  );
}

function IconTrendDown({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" /><polyline points="17 18 23 18 23 12" />
    </svg>
  );
}

function IconWallet({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h16v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5" />
      <circle cx="17" cy="12" r="1.5" />
    </svg>
  );
}

function IconChart({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 20V10M12 20V4M6 20v-6" />
    </svg>
  );
}

function IconReceipt({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2-3-2Z" />
      <path d="M8 10h8M8 14h4" />
    </svg>
  );
}

function IconUsers({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

function IconEmpty({ className = 'w-12 h-12' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v3" />
      <path d="M3 16s1.5 2 4.5 2 4.5-3 8-3 4.5 3 4.5 3" />
      <path d="M3 8v11a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8" />
      <path d="M12 2v4M8 2v4M16 2v4" />
    </svg>
  );
}

function IconClock({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconFilter({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function IconLoader({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Decorative gradient orbs (background)                             */
/* ------------------------------------------------------------------ */

function BackgroundDecor() {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none" aria-hidden="true">
      <div className="absolute -top-40 -right-40 w-[500px] h-[500px] rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute top-1/3 -left-32 w-[400px] h-[400px] rounded-full bg-amber-500/5 blur-3xl" />
      <div className="absolute bottom-0 right-1/4 w-[350px] h-[350px] rounded-full bg-emerald-500/5 blur-3xl" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const { user, isOwner, hasPermission } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeTab, setActiveTab] = useState<ReportTab>('financial');
  const [loading, setLoading] = useState(false);

  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [salesData, setSalesData] = useState<SaleRecord[]>([]);
  const [expensesData, setExpensesData] = useState<ExpensesReport | null>(null);

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    fetchReports();
  }, [selectedBranch, fromDate, toDate, activeTab]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const branchList = Array.isArray(data) ? data : (data.branches || []);
      setBranches(branchList);
      if (branchList.length > 0 && !selectedBranch) {
        setSelectedBranch(branchList[0].id);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchReports = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch && activeTab !== 'branches') params.append('branchId', selectedBranch);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);

      if (activeTab === 'financial') {
        const res = await fetch(`/api/reports/financial?${params}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          if (data.revenue !== undefined) setFinancial(data);
        }
      } else if (activeTab === 'sales') {
        const res = await fetch(`/api/reports/sales?${params}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setSalesData(Array.isArray(data) ? data : []);
        }
      } else if (activeTab === 'expenses') {
        const res = await fetch(`/api/reports/expenses?${params}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setExpensesData(data);
        }
      } else if (activeTab === 'branches') {
        const branchParams = new URLSearchParams();
        if (fromDate) branchParams.append('from', fromDate);
        if (toDate) branchParams.append('to', toDate);
        const res = await fetch(`/api/reports/branches?${branchParams}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setBranchStats(Array.isArray(data) ? data : []);
        }
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const setQuickRange = (range: 'today' | 'week' | 'month' | 'year') => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    switch (range) {
      case 'today':
        setFromDate(today);
        setToDate(today);
        break;
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        setFromDate(weekAgo.toISOString().split('T')[0]);
        setToDate(today);
        break;
      }
      case 'month': {
        const monthAgo = new Date(now);
        monthAgo.setMonth(monthAgo.getMonth() - 1);
        setFromDate(monthAgo.toISOString().split('T')[0]);
        setToDate(today);
        break;
      }
      case 'year': {
        const yearAgo = new Date(now);
        yearAgo.setFullYear(yearAgo.getFullYear() - 1);
        setFromDate(yearAgo.toISOString().split('T')[0]);
        setToDate(today);
        break;
      }
    }
  };

  const tabs: { key: ReportTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { key: 'financial', label: 'مالي', Icon: IconFinancial },
    { key: 'sales', label: 'المبيعات', Icon: IconSales },
    { key: 'expenses', label: 'المصروفات', Icon: IconExpenses },
    { key: 'branches', label: 'الفروع', Icon: IconBranch },
  ];

  const branchComparisonData = branchStats.map((stat, idx) => ({
    name: stat.branch.name.split('—')[1]?.trim() || stat.branch.code,
    revenue: (stat.revenue || 0) / 100,
    expenses: (stat.expenses || 0) / 100,
    profit: (stat.profit || 0) / 100,
    members: stat.activeMembers,
    color: COLORS[idx % COLORS.length]
  }));

  const expenseCategoryData = expensesData?.byCategory
    ? Object.entries(expensesData.byCategory).map(([name, data], idx) => ({
        name,
        value: data.total / 100,
        count: data.count,
        color: COLORS[idx % COLORS.length]
      }))
    : [];

  const totalSalesAmount = salesData.reduce((sum, s) => sum + s.finalTotalPiasters, 0);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <>
      <BackgroundDecor />

      <div className="space-y-4 sm:space-y-6 lg:space-y-8">
        {/* ============================================================ */}
        {/*  Header                                                      */}
        {/* ============================================================ */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card via-dark-card to-amber-950/20 border border-dark-border p-5 sm:p-6 lg:p-8">
          {/* decorative corner glow */}
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -right-10 w-36 h-36 rounded-full bg-amber-500/10 blur-2xl pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary/20 to-amber-600/10 border border-primary/20">
                  <IconChart className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                </div>
                <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
                  التقارير
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-gray-400 mt-1 max-w-md">
                تحليل شامل للأداء المالي والمبيعات
              </p>
            </div>

            {/* Live badge */}
            <div className="flex items-center gap-2 self-start sm:self-auto px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="text-xs font-medium text-emerald-400">مباشر</span>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  Tabs                                                        */}
        {/* ============================================================ */}
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {tabs.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={`group relative flex items-center gap-2 px-3.5 sm:px-5 py-2.5 sm:py-3 rounded-xl font-semibold text-xs sm:text-sm whitespace-nowrap transition-all duration-300 ${
                activeTab === key
                  ? 'bg-gradient-to-r from-primary to-amber-600 text-white shadow-lg shadow-primary/25 scale-[1.02]'
                  : 'bg-dark-card border border-dark-border text-gray-400 hover:text-white hover:border-primary/30 hover:bg-dark-hover hover:shadow-md hover:shadow-primary/5'
              }`}
            >
              <Icon className={`w-4 h-4 sm:w-5 sm:h-5 transition-colors ${activeTab === key ? 'text-white' : 'text-gray-500 group-hover:text-primary'}`} />
              <span>{label}</span>
              {activeTab === key && (
                <span className="absolute inset-x-0 -bottom-px h-0.5 bg-gradient-to-r from-transparent via-white/40 to-transparent rounded-full" />
              )}
            </button>
          ))}
        </div>

        {/* ============================================================ */}
        {/*  Filters                                                     */}
        {/* ============================================================ */}
        <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5 lg:p-6">
          {/* subtle top accent */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <IconFilter className="w-4 h-4 text-primary" />
            <span className="text-xs sm:text-sm font-semibold text-gray-300">تصفية البيانات</span>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-end gap-4">
            {/* Quick Range Buttons */}
            <div className="flex gap-1.5 sm:gap-2 flex-wrap">
              {([
                ['today', 'اليوم'],
                ['week', 'أسبوع'],
                ['month', 'شهر'],
                ['year', 'سنة'],
              ] as const).map(([range, label]) => (
                <button
                  key={range}
                  onClick={() => setQuickRange(range)}
                  className="group relative px-3 sm:px-4 py-2 bg-dark border border-dark-border text-gray-400 rounded-lg text-xs sm:text-sm font-medium hover:border-primary/40 hover:text-white hover:shadow-md hover:shadow-primary/5 transition-all duration-200"
                >
                  <span className="relative z-10">{label}</span>
                  <div className="absolute inset-0 rounded-lg bg-gradient-to-t from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              ))}
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
              {activeTab !== 'branches' && !singleBranchUser && (
                <div>
                  <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5 font-medium">
                    <IconBranch className="w-3.5 h-3.5" />
                    الفرع
                  </label>
                  <select
                    value={selectedBranch}
                    onChange={(e) => setSelectedBranch(e.target.value)}
                    className="w-full bg-dark border border-dark-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                  >
                    {branches.map((branch) => (
                      <option key={branch.id} value={branch.id}>{branch.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5 font-medium">
                  <IconCalendar className="w-3.5 h-3.5" />
                  من
                </label>
                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full bg-dark border border-dark-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </div>

              <div>
                <label className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5 font-medium">
                  <IconCalendar className="w-3.5 h-3.5" />
                  إلى
                </label>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full bg-dark border border-dark-border text-white rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================ */}
        {/*  Content                                                     */}
        {/* ============================================================ */}
        {loading ? (
          <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-16 sm:p-20 text-center">
            <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-amber-500/5" />
            <div className="relative flex flex-col items-center gap-3">
              <IconLoader className="w-10 h-10 text-primary" />
              <p className="text-sm text-gray-400 font-medium">جاري التحميل...</p>
            </div>
          </div>
        ) : (
          <>
            {/* ======================================================== */}
            {/*  Financial Tab                                           */}
            {/* ======================================================== */}
            {activeTab === 'financial' && financial && (
              <div className="space-y-4 sm:space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {/* Revenue */}
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-emerald-950/15 border border-dark-border p-4 sm:p-5 hover:border-emerald-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5">
                    <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-emerald-500/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">الإيرادات</span>
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <IconTrendUp className="w-4 h-4 text-emerald-400" />
                        </div>
                      </div>
                      <p className="text-base sm:text-lg lg:text-xl font-bold text-emerald-400">{formatPiasters(financial.revenue)}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-2">{financial.salesCount} مبيعات + {financial.paymentsCount} مدفوعات</p>
                    </div>
                  </div>

                  {/* Expenses */}
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-rose-950/15 border border-dark-border p-4 sm:p-5 hover:border-rose-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-rose-500/5">
                    <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-rose-500/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">المصروفات</span>
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                          <IconTrendDown className="w-4 h-4 text-rose-400" />
                        </div>
                      </div>
                      <p className="text-base sm:text-lg lg:text-xl font-bold text-rose-400">{formatPiasters(financial.expenses)}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-2">{financial.expensesCount} مصروف</p>
                    </div>
                  </div>

                  {/* Profit */}
                  <div className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${financial.profit >= 0 ? 'from-dark-card to-emerald-950/15 border-emerald-500/10 hover:border-emerald-500/20 hover:shadow-emerald-500/5' : 'from-dark-card to-rose-950/15 border-rose-500/10 hover:border-rose-500/20 hover:shadow-rose-500/5'} border border-dark-border p-4 sm:p-5 transition-all duration-300 hover:shadow-lg`}>
                    <div className={`absolute top-0 right-0 w-20 h-20 rounded-full ${financial.profit >= 0 ? 'bg-emerald-500/5' : 'bg-rose-500/5'} -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500`} />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">صافي الربح</span>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${financial.profit >= 0 ? 'bg-emerald-500/10' : 'bg-rose-500/10'}`}>
                          {financial.profit >= 0
                            ? <IconTrendUp className="w-4 h-4 text-emerald-400" />
                            : <IconTrendDown className="w-4 h-4 text-rose-400" />
                          }
                        </div>
                      </div>
                      <p className={`text-base sm:text-lg lg:text-xl font-bold ${financial.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {formatPiasters(financial.profit)}
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-2">
                        {financial.revenue > 0 ? `${Math.round((financial.profit / financial.revenue) * 100)}%` : '0%'} هامش الربح
                      </p>
                    </div>
                  </div>

                  {/* Outstanding */}
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-amber-950/15 border border-dark-border p-4 sm:p-5 hover:border-amber-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5">
                    <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-amber-500/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">مستحقات</span>
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <IconWallet className="w-4 h-4 text-amber-400" />
                        </div>
                      </div>
                      <p className="text-base sm:text-lg lg:text-xl font-bold text-amber-400">{formatPiasters(financial.outstanding)}</p>
                      <p className="text-[10px] sm:text-xs text-gray-500 mt-2">مبالغ متبقية</p>
                    </div>
                  </div>
                </div>

                {/* Visual Breakdown */}
                <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-6 lg:p-8">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                  <div className="flex items-center gap-2 mb-5 sm:mb-6">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <IconChart className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white">ملخص الأداء</h3>
                  </div>
                  <div className="space-y-5">
                    {[
                      { label: 'الإيرادات', value: financial.revenue, max: financial.revenue, gradient: 'from-emerald-500 to-emerald-400', textColor: 'text-emerald-400' },
                      { label: 'المصروفات', value: financial.expenses, max: financial.revenue, gradient: 'from-rose-500 to-rose-400', textColor: 'text-rose-400' },
                      { label: 'صافي الربح', value: financial.profit, max: financial.revenue, gradient: financial.profit >= 0 ? 'from-primary to-amber-400' : 'from-rose-500 to-rose-400', textColor: financial.profit >= 0 ? 'text-primary' : 'text-rose-400' },
                    ].map(item => (
                      <div key={item.label}>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-400 font-medium">{item.label}</span>
                          <span className={`font-semibold ${item.textColor}`}>{formatPiasters(item.value)}</span>
                        </div>
                        <div className="w-full bg-dark rounded-full h-3 overflow-hidden">
                          <div
                            className={`bg-gradient-to-r ${item.gradient} h-3 rounded-full transition-all duration-700 ease-out relative`}
                            style={{ width: item.max > 0 ? `${Math.max(0, Math.min(100, (item.value / item.max) * 100))}%` : '0%' }}
                          >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent rounded-full" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revenue vs Expenses Chart */}
                <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-6 lg:p-8">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                  <div className="flex items-center gap-2 mb-5 sm:mb-6">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <IconChart className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white">الإيرادات مقابل المصروفات</h3>
                  </div>
                  <div className="w-full" style={{ height: 'clamp(180px, 25vw, 280px)' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={[
                        { name: 'إيرادات', value: financial.revenue / 100, fill: '#F59E0B' },
                        { name: 'مصروفات', value: financial.expenses / 100, fill: '#6B7280' },
                        { name: 'ربح', value: Math.max(0, financial.profit / 100), fill: '#D97706' },
                      ]}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                        <XAxis dataKey="name" stroke="#6B7280" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} width={50} />
                        <Tooltip
                          cursor={{ fill: 'rgba(245,158,11,0.05)' }}
                          contentStyle={{ backgroundColor: '#141414', border: '1px solid #2A2A2A', borderRadius: '12px', fontSize: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                          formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                        />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]} name="المبلغ" barSize={40}>
                          {[
                            { fill: '#F59E0B' },
                            { fill: '#6B7280' },
                            { fill: '#D97706' },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/*  Sales Tab                                               */}
            {/* ======================================================== */}
            {activeTab === 'sales' && (
              <div className="space-y-4 sm:space-y-6">
                {/* Sales Summary */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-primary/5 border border-dark-border p-4 sm:p-5 hover:border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                    <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-primary/5 -translate-y-4 translate-x-4 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                          <IconReceipt className="w-3.5 h-3.5 text-primary" />
                        </div>
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">عدد الفواتير</span>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white">{salesData.length}</p>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-emerald-950/15 border border-dark-border p-4 sm:p-5 hover:border-emerald-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5">
                    <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-emerald-500/5 -translate-y-4 translate-x-4 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                          <IconTrendUp className="w-3.5 h-3.5 text-emerald-400" />
                        </div>
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">إجمالي المبيعات</span>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-emerald-400">{formatPiasters(totalSalesAmount)}</p>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-amber-950/15 border border-dark-border p-4 sm:p-5 col-span-2 sm:col-span-1 hover:border-amber-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-amber-500/5">
                    <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-amber-500/5 -translate-y-4 translate-x-4 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center">
                          <IconFinancial className="w-3.5 h-3.5 text-amber-400" />
                        </div>
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">متوسط الفاتورة</span>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-primary">
                        {salesData.length > 0 ? formatPiasters(totalSalesAmount / salesData.length) : '0 ج.م'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Sales List */}
                <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                  <div className="p-4 sm:p-5 border-b border-dark-border flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                      <IconSales className="w-4 h-4 text-primary" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white">سجل المبيعات</h3>
                    {salesData.length > 0 && (
                      <span className="mr-auto px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-primary/10 text-primary border border-primary/20">
                        {salesData.length}
                      </span>
                    )}
                  </div>
                  {salesData.length === 0 ? (
                    <div className="p-10 sm:p-16 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark border border-dark-border mb-4">
                        <IconEmpty className="w-8 h-8 text-gray-600" />
                      </div>
                      <p className="text-gray-400 text-sm font-medium">لا توجد مبيعات في هذه الفترة</p>
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards */}
                      <div className="sm:hidden divide-y divide-dark-border">
                        {salesData.map(sale => (
                          <div key={sale.id} className="p-4 hover:bg-dark-hover/50 transition-colors">
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <IconReceipt className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-white">{sale.invoiceNumber}</p>
                                  <p className="text-xs text-gray-500">{sale.branch.name}</p>
                                </div>
                              </div>
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-400">
                                {formatPiasters(sale.finalTotalPiasters)}
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {sale.items.slice(0, 3).map(item => (
                                <span key={item.id} className="text-[11px] bg-dark px-2.5 py-1 rounded-lg text-gray-400 border border-dark-border">
                                  {item.product.nameAr || item.product.name} ×{item.quantity}
                                </span>
                              ))}
                              {sale.items.length > 3 && (
                                <span className="text-[11px] text-gray-500 px-1">+{sale.items.length - 3} أخرى</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                              <IconClock className="w-3 h-3" />
                              {new Date(sale.createdAt).toLocaleDateString('ar-EG')} {new Date(sale.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-dark/60">
                            <tr>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">رقم الفاتورة</th>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">الفرع</th>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">المنتجات</th>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">الإجمالي</th>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">التاريخ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {salesData.map(sale => (
                              <tr key={sale.id} className="border-t border-dark-border/50 hover:bg-dark-hover/50 transition-colors">
                                <td className="py-3.5 px-4">
                                  <span className="text-sm font-mono font-semibold text-white bg-dark px-2.5 py-1 rounded-lg border border-dark-border">{sale.invoiceNumber}</span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <IconBranch className="w-3.5 h-3.5 text-primary/70" />
                                    </div>
                                    <span className="text-sm text-gray-300">{sale.branch.name}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex flex-wrap gap-1.5">
                                    {sale.items.slice(0, 2).map(item => (
                                      <span key={item.id} className="text-xs bg-dark px-2.5 py-1 rounded-lg text-gray-400 border border-dark-border">
                                        {item.product.nameAr || item.product.name} ×{item.quantity}
                                      </span>
                                    ))}
                                    {sale.items.length > 2 && (
                                      <span className="text-xs text-gray-500 px-1">+{sale.items.length - 2}</span>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-sm font-semibold text-emerald-400">{formatPiasters(sale.finalTotalPiasters)}</span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-1.5">
                                    <IconClock className="w-3.5 h-3.5 text-gray-500" />
                                    <span className="text-sm text-gray-400">
                                      {new Date(sale.createdAt).toLocaleDateString('ar-EG')}
                                    </span>
                                    <span className="text-xs text-gray-500">
                                      {new Date(sale.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/*  Expenses Tab                                            */}
            {/* ======================================================== */}
            {activeTab === 'expenses' && expensesData && (
              <div className="space-y-4 sm:space-y-6">
                {/* Expense Summary */}
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-rose-950/15 border border-dark-border p-4 sm:p-5 hover:border-rose-500/20 transition-all duration-300 hover:shadow-lg hover:shadow-rose-500/5">
                    <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-rose-500/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                          <IconTrendDown className="w-4 h-4 text-rose-400" />
                        </div>
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">إجمالي المصروفات</span>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-rose-400">{formatPiasters(expensesData.total)}</p>
                    </div>
                  </div>

                  <div className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-primary/5 border border-dark-border p-4 sm:p-5 hover:border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                    <div className="absolute top-0 right-0 w-20 h-20 rounded-full bg-primary/5 -translate-y-6 translate-x-6 group-hover:scale-150 transition-transform duration-500" />
                    <div className="relative">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <IconExpenses className="w-4 h-4 text-primary" />
                        </div>
                        <span className="text-[11px] sm:text-xs text-gray-400 font-medium">عدد المصروفات</span>
                      </div>
                      <p className="text-xl sm:text-2xl font-bold text-white">{expensesData.expenses.length}</p>
                    </div>
                  </div>
                </div>

                {/* Category Chart */}
                {expenseCategoryData.length > 0 && (
                  <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-6 lg:p-8">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                    <div className="flex items-center gap-2 mb-5 sm:mb-6">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                        <IconChart className="w-4 h-4 text-primary" />
                      </div>
                      <h3 className="text-sm sm:text-base font-bold text-white">المصروفات حسب الفئة</h3>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-center">
                      <div style={{ height: 'clamp(180px, 25vw, 260px)' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie
                              data={expenseCategoryData}
                              cx="50%"
                              cy="50%"
                              innerRadius="45%"
                              outerRadius="75%"
                              paddingAngle={4}
                              dataKey="value"
                              strokeWidth={0}
                            >
                              {expenseCategoryData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                              ))}
                            </Pie>
                            <Tooltip
                              contentStyle={{ backgroundColor: '#141414', border: '1px solid #2A2A2A', borderRadius: '12px', fontSize: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                              formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="space-y-2">
                        {expenseCategoryData.map((cat, idx) => {
                          const percentage = expensesData.total > 0 ? Math.round((cat.value * 100 / (expensesData.total / 100)) * 100) / 100 : 0;
                          return (
                            <div key={idx} className="group flex items-center justify-between p-3 bg-dark rounded-xl border border-dark-border/50 hover:border-primary/20 transition-all duration-200">
                              <div className="flex items-center gap-3">
                                <div className="w-3.5 h-3.5 rounded-full ring-2 ring-offset-2 ring-offset-dark-card" style={{ backgroundColor: cat.color, boxShadow: `0 0 0 2px ${cat.color}` }} />
                                <span className="text-sm text-gray-300 font-medium">{cat.name}</span>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className="text-[11px] text-gray-500 font-medium">{percentage}%</span>
                                <span className="text-sm font-semibold text-white">{formatPiasters(cat.value * 100)}</span>
                                <span className="text-[11px] text-gray-500 bg-dark-card px-2 py-0.5 rounded-md border border-dark-border">({cat.count})</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Expenses List */}
                <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                  <div className="p-4 sm:p-5 border-b border-dark-border flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                      <IconExpenses className="w-4 h-4 text-rose-400" />
                    </div>
                    <h3 className="text-sm sm:text-base font-bold text-white">سجل المصروفات</h3>
                    {expensesData.expenses.length > 0 && (
                      <span className="mr-auto px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                        {expensesData.expenses.length}
                      </span>
                    )}
                  </div>
                  {expensesData.expenses.length === 0 ? (
                    <div className="p-10 sm:p-16 text-center">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark border border-dark-border mb-4">
                        <IconEmpty className="w-8 h-8 text-gray-600" />
                      </div>
                      <p className="text-gray-400 text-sm font-medium">لا توجد مصروفات في هذه الفترة</p>
                    </div>
                  ) : (
                    <>
                      {/* Mobile Cards */}
                      <div className="sm:hidden divide-y divide-dark-border">
                        {expensesData.expenses.map(expense => (
                          <div key={expense.id} className="p-4 hover:bg-dark-hover/50 transition-colors">
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex items-center gap-2.5">
                                <div className="w-9 h-9 rounded-lg bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                                  <IconExpenses className="w-4 h-4 text-rose-400" />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-white">{expense.description}</p>
                                  <p className="text-xs text-gray-500">{expense.branch.name}</p>
                                </div>
                              </div>
                              <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-xs font-bold text-rose-400">
                                {formatPiasters(expense.amountPiasters)}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-[11px] bg-dark px-2.5 py-1 rounded-lg text-gray-400 border border-dark-border">{expense.category}</span>
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                                <IconClock className="w-3 h-3" />
                                {new Date(expense.createdAt).toLocaleDateString('ar-EG')}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Desktop Table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-dark/60">
                            <tr>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">الوصف</th>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">الفئة</th>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">الفرع</th>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">المبلغ</th>
                              <th className="text-right py-3.5 px-4 text-xs font-semibold text-gray-400">التاريخ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {expensesData.expenses.map(expense => (
                              <tr key={expense.id} className="border-t border-dark-border/50 hover:bg-dark-hover/50 transition-colors">
                                <td className="py-3.5 px-4">
                                  <span className="text-sm text-white font-medium">{expense.description}</span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <span className="text-xs bg-dark px-2.5 py-1 rounded-lg text-gray-400 border border-dark-border font-medium">{expense.category}</span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-2">
                                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                      <IconBranch className="w-3.5 h-3.5 text-primary/70" />
                                    </div>
                                    <span className="text-sm text-gray-300">{expense.branch.name}</span>
                                  </div>
                                </td>
                                <td className="py-3.5 px-4">
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 text-sm font-semibold text-rose-400">{formatPiasters(expense.amountPiasters)}</span>
                                </td>
                                <td className="py-3.5 px-4">
                                  <div className="flex items-center gap-1.5">
                                    <IconClock className="w-3.5 h-3.5 text-gray-500" />
                                    <span className="text-sm text-gray-400">
                                      {new Date(expense.createdAt).toLocaleDateString('ar-EG')}
                                    </span>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* ======================================================== */}
            {/*  Branches Tab                                            */}
            {/* ======================================================== */}
            {activeTab === 'branches' && (
              <div className="space-y-4 sm:space-y-6">
                {branchStats.length === 0 ? (
                  <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-12 sm:p-16 text-center">
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-amber-500/5" />
                    <div className="relative">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark border border-dark-border mb-4">
                        <IconEmpty className="w-8 h-8 text-gray-600" />
                      </div>
                      <p className="text-gray-400 text-sm font-medium">لا توجد بيانات للفروع</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Branch Comparison Chart */}
                    <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-6 lg:p-8">
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                      <div className="flex items-center gap-2 mb-5 sm:mb-6">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                          <IconBranch className="w-4 h-4 text-primary" />
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-white">مقارنة أداء الفروع</h3>
                      </div>
                      <div className="w-full" style={{ height: 'clamp(200px, 28vw, 300px)' }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={branchComparisonData} barGap={2}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" vertical={false} />
                            <XAxis dataKey="name" stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} />
                            <YAxis stroke="#6B7280" fontSize={11} tickLine={false} axisLine={false} width={50} />
                            <Tooltip
                              cursor={{ fill: 'rgba(245,158,11,0.05)' }}
                              contentStyle={{ backgroundColor: '#141414', border: '1px solid #2A2A2A', borderRadius: '12px', fontSize: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                              formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                            />
                            <Bar dataKey="revenue" fill="#F59E0B" radius={[6, 6, 0, 0]} name="إيرادات" />
                            <Bar dataKey="expenses" fill="#6B7280" radius={[6, 6, 0, 0]} name="مصروفات" />
                            <Bar dataKey="profit" fill="#D97706" radius={[6, 6, 0, 0]} name="ربح" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-4 sm:gap-6 mt-4 flex-wrap">
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark border border-dark-border">
                          <div className="w-3 h-3 rounded-full bg-primary" />
                          <span className="text-xs text-gray-400 font-medium">إيرادات</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark border border-dark-border">
                          <div className="w-3 h-3 rounded-full bg-gray-500" />
                          <span className="text-xs text-gray-400 font-medium">مصروفات</span>
                        </div>
                        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-dark border border-dark-border">
                          <div className="w-3 h-3 rounded-full bg-amber-700" />
                          <span className="text-xs text-gray-400 font-medium">ربح</span>
                        </div>
                      </div>
                    </div>

                    {/* Branch Cards - Mobile */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:hidden">
                      {branchStats.map((stat, idx) => (
                        <div key={stat.branch.id} className="group relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card to-primary/5 border border-dark-border p-4 hover:border-primary/20 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5">
                          <div className="absolute top-0 right-0 w-16 h-16 rounded-full bg-primary/5 -translate-y-4 translate-x-4 group-hover:scale-150 transition-transform duration-500" />
                          <div className="relative">
                            <div className="flex items-center gap-3 mb-4">
                              <div className="w-10 h-10 rounded-xl flex items-center justify-center border" style={{ backgroundColor: COLORS[idx % COLORS.length] + '15', borderColor: COLORS[idx % COLORS.length] + '30' }}>
                                <IconBranch className="w-5 h-5" style={{ color: COLORS[idx % COLORS.length] }} />
                              </div>
                              <div>
                                <p className="text-sm font-bold text-white">{stat.branch.name}</p>
                                <p className="text-[11px] text-gray-500 font-mono">{stat.branch.code}</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">
                              {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                                <div className="bg-dark/50 rounded-xl p-2.5 border border-dark-border/50">
                                  <p className="text-[10px] text-gray-500 mb-0.5">الإيرادات</p>
                                  <p className="text-xs sm:text-sm font-bold text-emerald-400">{formatPiasters(stat.revenue || 0)}</p>
                                </div>
                              )}
                              {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                                <div className="bg-dark/50 rounded-xl p-2.5 border border-dark-border/50">
                                  <p className="text-[10px] text-gray-500 mb-0.5">المصروفات</p>
                                  <p className="text-xs sm:text-sm font-bold text-rose-400">{formatPiasters(stat.expenses || 0)}</p>
                                </div>
                              )}
                              {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                                <div className="bg-dark/50 rounded-xl p-2.5 border border-dark-border/50">
                                  <p className="text-[10px] text-gray-500 mb-0.5">الربح</p>
                                  <p className={`text-xs sm:text-sm font-bold ${stat.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {formatPiasters(stat.profit || 0)}
                                  </p>
                                </div>
                              )}
                              <div className="bg-dark/50 rounded-xl p-2.5 border border-dark-border/50">
                                <p className="text-[10px] text-gray-500 mb-0.5">الأعضاء</p>
                                <div className="flex items-center gap-1.5">
                                  <IconUsers className="w-3 h-3 text-gray-500" />
                                  <p className="text-xs sm:text-sm font-bold text-white">{stat.activeMembers}</p>
                                </div>
                              </div>
                              <div className="bg-dark/50 rounded-xl p-2.5 border border-dark-border/50 col-span-2">
                                <p className="text-[10px] text-gray-500 mb-0.5">الاشتراكات</p>
                                <p className="text-xs sm:text-sm font-bold text-white">{stat.activeSubscriptions}</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Branch Table - Desktop */}
                    <div className="hidden sm:block relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border">
                      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead className="bg-dark/60">
                            <tr>
                              <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-400">الفرع</th>
                              {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                                <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-400">الإيرادات</th>
                              )}
                              {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                                <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-400">المصروفات</th>
                              )}
                              {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                                <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-400">الربح</th>
                              )}
                              {hasPermission('VIEW_DASHBOARD_OUTSTANDING') && (
                                <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-400">مستحقات</th>
                              )}
                              <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-400">الأعضاء</th>
                              <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-400">الاشتراكات</th>
                              <th className="px-4 py-3.5 text-right text-xs font-semibold text-gray-400">المبيعات</th>
                            </tr>
                          </thead>
                          <tbody>
                            {branchStats.map((stat, idx) => (
                              <tr key={stat.branch.id} className="border-t border-dark-border/50 hover:bg-dark-hover/50 transition-colors">
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-2.5">
                                    <div className="w-9 h-9 rounded-xl flex items-center justify-center border" style={{ backgroundColor: COLORS[idx % COLORS.length] + '15', borderColor: COLORS[idx % COLORS.length] + '30' }}>
                                      <IconBranch className="w-4 h-4" style={{ color: COLORS[idx % COLORS.length] }} />
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-white">{stat.branch.name}</p>
                                      <p className="text-[11px] text-gray-500 font-mono">{stat.branch.code}</p>
                                    </div>
                                  </div>
                                </td>
                                {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                                  <td className="px-4 py-3.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-emerald-500/10 text-sm font-semibold text-emerald-400">{formatPiasters(stat.revenue || 0)}</span>
                                  </td>
                                )}
                                {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                                  <td className="px-4 py-3.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-rose-500/10 text-sm font-semibold text-rose-400">{formatPiasters(stat.expenses || 0)}</span>
                                  </td>
                                )}
                                {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                                  <td className="px-4 py-3.5">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-sm font-semibold ${stat.profit >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'}`}>
                                      {formatPiasters(stat.profit || 0)}
                                    </span>
                                  </td>
                                )}
                                {hasPermission('VIEW_DASHBOARD_OUTSTANDING') && (
                                  <td className="px-4 py-3.5">
                                    <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-amber-500/10 text-sm font-semibold text-amber-400">{formatPiasters(stat.outstanding || 0)}</span>
                                  </td>
                                )}
                                <td className="px-4 py-3.5">
                                  <div className="flex items-center gap-1.5">
                                    <IconUsers className="w-3.5 h-3.5 text-gray-500" />
                                    <span className="text-sm font-medium text-white">{stat.activeMembers}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3.5 text-sm font-medium text-white">{stat.activeSubscriptions}</td>
                                <td className="px-4 py-3.5">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-dark border border-dark-border text-sm text-gray-300 font-medium">{stat.salesCount}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}
