import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { downloadWorkbook } from '../utils/downloadWorkbook';
import { arDate, localDate, startOfMonth } from '../utils/dates';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import NoticeBanner from '../components/NoticeBanner';
import {
  PageHeader, SectionTitle, StatTile, Badge, Btn, Segmented, Picker, Field,
  CARD, FIELD, GOLD, TONE, UiIcon, TableShell, Th, Td, Row, ListCard, EmptyState, Loading
} from '../components/ui';

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

interface ActivityItem {
  id: string;
  kind: 'SALE' | 'PAYMENT' | 'EXPENSE' | 'SALARY' | 'MEMBER' | 'CHECKIN';
  at: string;
  title: string;
  subtitle: string;
  amountPiasters: number | null;
  method?: string;
  flagged?: boolean;
  branchName: string;
}

interface ActivityReport {
  items: ActivityItem[];
  truncated: boolean;
  limit: number;
  summary: {
    incomePiasters: number;
    outflowPiasters: number;
    netPiasters: number;
    counts: Record<string, number>;
    listed: Record<string, number>;
  };
}

// Every kind of operation the club does, and whether it moves money in or out.
const ACTIVITY_KINDS = [
  { key: 'SALE', label: 'مبيعات', flow: 'in' },
  { key: 'PAYMENT', label: 'اشتراكات', flow: 'in' },
  { key: 'EXPENSE', label: 'مصروفات', flow: 'out' },
  { key: 'SALARY', label: 'رواتب', flow: 'out' },
  { key: 'MEMBER', label: 'أعضاء', flow: 'none' },
  { key: 'CHECKIN', label: 'حضور', flow: 'none' },
] as const;

const ACTIVITY_METHODS: Record<string, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  OTHER: 'أخرى'
};

function activityFlow(kind: string): 'in' | 'out' | 'none' {
  return ACTIVITY_KINDS.find(k => k.key === kind)?.flow ?? 'none';
}

function ActivityKindIcon({ kind, className }: { kind: ActivityItem['kind']; className?: string }) {
  switch (kind) {
    case 'SALE': return <UiIcon name="sales" className={className} />;
    case 'PAYMENT': return <UiIcon name="subscriptions" className={className} />;
    case 'EXPENSE': return <UiIcon name="expenses" className={className} />;
    case 'SALARY': return <UiIcon name="wallet" className={className} />;
    case 'MEMBER': return <UiIcon name="users" className={className} />;
    default: return <UiIcon name="clock" className={className} />;
  }
}

function formatPiasters(piasters: number): string {
  const pounds = piasters / 100;
  return pounds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ج.م';
}

const COLORS = ['#F59E0B', '#D97706', '#FCD34D', '#B45309', '#92400E', '#78350F'];

// The same chart theme the dashboard uses, so every series reads as one product.
const chartTooltipStyle = {
  backgroundColor: '#0A0A0A',
  border: '1px solid #2A2A2A',
  borderRadius: '12px',
  fontSize: '12px',
  boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
};

type ReportTab = 'financial' | 'sales' | 'expenses' | 'activity' | 'branches';

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export default function ReportsPage() {
  const { user, isOwner, hasPermission } = useAuth();
  const isOnline = useOnlineStatus();
  const navigate = useNavigate();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [fromDate, setFromDate] = useState(startOfMonth);
  const [toDate, setToDate] = useState(() => localDate(new Date()));
  const [activeTab, setActiveTab] = useState<ReportTab>('financial');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [financial, setFinancial] = useState<FinancialSummary | null>(null);
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [salesData, setSalesData] = useState<SaleRecord[]>([]);
  const [expensesData, setExpensesData] = useState<ExpensesReport | null>(null);
  const [activity, setActivity] = useState<ActivityReport | null>(null);
  // 'ALL' keeps the full journal; a kind narrows it to just that sort of operation
  const [activityKind, setActivityKind] = useState<string>('ALL');

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

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
      } else if (activeTab === 'activity') {
        const res = await fetch(`/api/reports/activity?${params}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          setActivity({
            items: Array.isArray(data.items) ? data.items : [],
            truncated: !!data.truncated,
            limit: data.limit || 800,
            summary: data.summary
          });
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

  const handleExportExcel = async () => {
    if (!isOnline) {
      setNotice({ kind: 'err', text: 'تحميل ملف Excel يحتاج اتصال بالإنترنت' });
      return;
    }
    setExporting(true);
    setNotice(null);
    try {
      const filename = await downloadWorkbook(
        '/api/exports/reports',
        {
          branchId: activeTab === 'branches' ? '' : selectedBranch,
          from: fromDate,
          to: toDate
        },
        `تقارير-POWER111-${fromDate || 'all'}_${toDate || localDate()}.xlsx`
      );
      setNotice({ kind: 'ok', text: `تم تنزيل ${filename}` });
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : 'تعذر تحميل ملف Excel' });
    } finally {
      setExporting(false);
    }
  };

  const setQuickRange = (range: 'today' | 'week' | 'month' | 'year') => {
    const now = new Date();
    const today = localDate(now);

    switch (range) {
      case 'today':
        setFromDate(today);
        setToDate(today);
        break;
      case 'week': {
        const weekAgo = new Date(now);
        weekAgo.setDate(weekAgo.getDate() - 7);
        setFromDate(localDate(weekAgo));
        setToDate(today);
        break;
      }
      case 'month': {
        const monthStart = new Date(now);
        monthStart.setDate(1);
        setFromDate(localDate(monthStart));
        setToDate(today);
        break;
      }
      case 'year': {
        const yearStart = new Date(now.getFullYear(), 0, 1);
        setFromDate(localDate(yearStart));
        setToDate(today);
        break;
      }
    }
  };

  const tabs: { key: ReportTab; label: string }[] = [
    { key: 'financial', label: 'مالي' },
    { key: 'sales', label: 'المبيعات' },
    { key: 'expenses', label: 'المصروفات' },
    { key: 'activity', label: 'سجل عمليات' },
    { key: 'branches', label: 'الفروع' },
  ];

  const branchComparisonData = branchStats.map((stat, idx) => ({
    name: stat.branch.name.split('—')[1]?.trim() || stat.branch.code,
    revenue: (stat.revenue || 0) / 100,
    expenses: (stat.expenses || 0) / 100,
    profit: (stat.profit || 0) / 100,
    members: stat.activeMembers,
    color: COLORS[idx % COLORS.length]
  }));

  // Same guard the dashboard uses: an all-zero period shows a message, never fake zero bars.
  const comparisonHasData = branchStats.some(s =>
    (s.revenue || 0) > 0 || (s.expenses || 0) > 0 || (s.profit || 0) > 0
  );

  const expenseCategoryData = expensesData?.byCategory
    ? Object.entries(expensesData.byCategory).map(([name, data], idx) => ({
        name,
        value: data.total / 100,
        count: data.count,
        color: COLORS[idx % COLORS.length]
      }))
    : [];

  const totalSalesAmount = salesData.reduce((sum, s) => sum + s.finalTotalPiasters, 0);

  // The journal is one flat list from the API; the owner reads it day by day, so it is
  // grouped on his own calendar (Cairo) rather than the raw UTC timestamps.
  const activityDays = useMemo(() => {
    const rows = (activity?.items ?? []).filter(i => activityKind === 'ALL' || i.kind === activityKind);
    const groups = new Map<string, ActivityItem[]>();
    rows.forEach(item => {
      const key = localDate(new Date(item.at));
      const list = groups.get(key);
      if (list) list.push(item);
      else groups.set(key, [item]);
    });
    const days = [...groups.entries()].map(([date, items]) => {
      const income = items.reduce((s, i) => s + (activityFlow(i.kind) === 'in' ? i.amountPiasters || 0 : 0), 0);
      const outflow = items.reduce((s, i) => s + (activityFlow(i.kind) === 'out' ? i.amountPiasters || 0 : 0), 0);
      // A member import or a busy door can drop hundreds of one kind on the same day. The day
      // header keeps the real count, the list keeps the first rows of each kind and folds the rest.
      const perKind: Record<string, number> = {};
      const rows = items.filter(item => {
        perKind[item.kind] = (perKind[item.kind] || 0) + 1;
        return perKind[item.kind] <= 12;
      });
      const folded = Object.entries(perKind)
        .filter(([, count]) => count > 12)
        .map(([kind, count]) => ({ kind, hidden: count - 12 }));
      return { date, items: rows, total: items.length, folded, income, outflow, net: income - outflow };
    });
    return { days, shown: rows.length };
  }, [activity, activityKind]);

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-5 sm:space-y-7 lg:space-y-8">
      {/* ============================================================ */}
      {/*  Header                                                      */}
      {/* ============================================================ */}
      <PageHeader
        icon="reports"
        title="التقارير"
        caption="تحليل شامل للأداء المالي والمبيعات"
        actions={
          <>
            <Badge tone="green">مباشر</Badge>
            <Btn
              icon="download"
              variant="primary"
              onClick={handleExportExcel}
              disabled={exporting}
            >
              {exporting ? 'جارٍ التحضير…' : 'تحميل Excel'}
            </Btn>
          </>
        }
      />

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* ============================================================ */}
      {/*  Tabs                                                        */}
      {/* ============================================================ */}
      <div className="overflow-x-auto">
        <Segmented<ReportTab>
          value={activeTab}
          onChange={setActiveTab}
          options={tabs}
          ariaLabel="أقسام التقارير"
        />
      </div>

      {/* ============================================================ */}
      {/*  WhatsApp messages shortcut                                  */}
      {/* ============================================================ */}
      <button
        onClick={() => navigate('/admin/whatsapp')}
        className={`${CARD} group w-full flex items-center gap-4 p-4 sm:p-5 text-right hover:border-primary/40 transition-colors min-h-[64px]`}
      >
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ backgroundColor: `${TONE.revenue}14`, color: TONE.revenue }}
        >
          <UiIcon name="whatsapp" className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">رسائل واتساب</p>
          <p className="text-xs text-gray-500 mt-0.5">ابعت تنبيهات التجديد والعروض والترحيب للأعضاء مرة واحدة</p>
        </div>
        <span className="text-gray-600 group-hover:text-primary transition-colors text-lg">←</span>
      </button>

      {/* ============================================================ */}
      {/*  Filters                                                     */}
      {/* ============================================================ */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="mb-4">
          <SectionTitle
            right={
              <span className="text-[11px] text-gray-500 whitespace-nowrap">
                {fromDate && toDate ? `${arDate(fromDate)} — ${arDate(toDate)}` : 'كل الفترات'}
              </span>
            }
          >
            تصفية البيانات
          </SectionTitle>
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
              <Btn key={range} variant="ghost" onClick={() => setQuickRange(range)}>
                {label}
              </Btn>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {activeTab !== 'branches' && !singleBranchUser && (
              <Field label="الفرع">
                <Picker
                  value={selectedBranch}
                  onChange={setSelectedBranch}
                  options={branches.map(branch => ({ value: branch.id, label: branch.name }))}
                  ariaLabel="الفرع"
                  className="min-w-0"
                />
              </Field>
            )}

            <Field label="من">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className={FIELD}
              />
            </Field>

            <Field label="إلى">
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className={FIELD}
              />
            </Field>
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/*  Content                                                     */}
      {/* ============================================================ */}
      {loading ? (
        <div className={`${CARD} overflow-hidden`}>
          <Loading />
        </div>
      ) : (
        <>
          {/* ======================================================== */}
          {/*  Financial Tab                                           */}
          {/* ======================================================== */}
          {activeTab === 'financial' && financial && (
            <div className="space-y-4 sm:space-y-6">
              {/* Summary Cards — whole-dataset totals from the API */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                  icon="wallet"
                  tone={TONE.revenue}
                  label="الإيرادات"
                  value={<span style={{ color: TONE.revenue }}>{formatPiasters(financial.revenue)}</span>}
                  caption={
                    financial.salesCount + financial.paymentsCount > 0
                      ? `${financial.salesCount} مبيعات + ${financial.paymentsCount} مدفوعات`
                      : 'لا عمليات في الفترة'
                  }
                />
                <StatTile
                  icon="expenses"
                  tone={TONE.expenses}
                  label="المصروفات"
                  value={<span style={{ color: TONE.expenses }}>{formatPiasters(financial.expenses)}</span>}
                  caption={
                    financial.expensesCount > 0 ? `${financial.expensesCount} مصروف` : 'لا مصروفات في الفترة'
                  }
                />
                <StatTile
                  icon="reports"
                  tone={financial.profit >= 0 ? TONE.profit : TONE.expenses}
                  label="صافي الربح"
                  value={
                    <span style={{ color: financial.profit >= 0 ? TONE.profit : TONE.expenses }}>
                      {formatPiasters(financial.profit)}
                    </span>
                  }
                  caption={
                    financial.revenue > 0 ? `${Math.round((financial.profit / financial.revenue) * 100)}% هامش الربح` : 'لا إيرادات في الفترة'
                  }
                />
                <StatTile
                  icon="subscriptions"
                  tone={TONE.outstanding}
                  label="مستحقات"
                  value={<span style={{ color: TONE.outstanding }}>{formatPiasters(financial.outstanding)}</span>}
                  caption={
                    financial.outstanding > 0 ? 'مبالغ متبقية للمتابعة' : 'لا مبالغ متبقية'
                  }
                />
              </div>

              {/* Visual Breakdown */}
              <div className={`${CARD} p-5 sm:p-6`}>
                <div className="mb-5">
                  <SectionTitle>ملخص الأداء</SectionTitle>
                </div>
                <div className="space-y-5">
                  {[
                    { label: 'الإيرادات', value: financial.revenue, max: financial.revenue, color: TONE.revenue },
                    { label: 'المصروفات', value: financial.expenses, max: financial.revenue, color: TONE.expenses },
                    { label: 'صافي الربح', value: financial.profit, max: financial.revenue, color: financial.profit >= 0 ? TONE.profit : TONE.expenses },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-2">
                        <span className="text-gray-400 font-medium">{item.label}</span>
                        <span className="font-semibold" style={{ color: item.color }}>{formatPiasters(item.value)}</span>
                      </div>
                      <div className="w-full bg-dark rounded-full h-2 overflow-hidden">
                        <div
                          className="h-2 rounded-full transition-all duration-700"
                          style={{
                            width: item.max > 0 ? `${Math.max(0, Math.min(100, (item.value / item.max) * 100))}%` : '0%',
                            backgroundColor: item.color
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue vs Expenses Chart */}
              <div className={`${CARD} p-5 sm:p-6`}>
                <div className="mb-5">
                  <SectionTitle>الإيرادات مقابل المصروفات</SectionTitle>
                </div>
                {financial.revenue > 0 || financial.expenses > 0 ? (
                  <div className="h-[190px] sm:h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        margin={{ top: 6, right: 8, left: 8, bottom: 0 }}
                        data={[
                          { name: 'إيرادات', value: financial.revenue / 100 },
                          { name: 'مصروفات', value: financial.expenses / 100 },
                          { name: 'ربح', value: Math.max(0, financial.profit / 100) },
                        ]}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                        <XAxis dataKey="name" stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} />
                        <YAxis stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} width={50} />
                        <Tooltip
                          cursor={{ fill: 'rgba(245,158,11,0.05)' }}
                          contentStyle={chartTooltipStyle}
                          labelStyle={{ color: '#fff', fontWeight: 600 }}
                          formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                        />
                        <Bar dataKey="value" radius={[8, 8, 0, 0]} name="المبلغ" barSize={40}>
                          {[
                            { fill: GOLD },
                            { fill: '#374151' },
                            { fill: '#D97706' },
                          ].map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <p className="h-[190px] sm:h-[240px] flex items-center justify-center text-sm text-gray-500">لا عمليات في الفترة</p>
                )}
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
                <StatTile
                  icon="subscriptions"
                  label="عدد الفواتير"
                  value={salesData.length}
                />
                <StatTile
                  icon="sales"
                  tone={TONE.revenue}
                  label="إجمالي المبيعات"
                  value={<span style={{ color: TONE.revenue }}>{formatPiasters(totalSalesAmount)}</span>}
                />
                <div className="col-span-2 sm:col-span-1">
                  <StatTile
                    icon="wallet"
                    label="متوسط الفاتورة"
                    value={
                      salesData.length > 0 ? formatPiasters(totalSalesAmount / salesData.length) : '0 ج.م'
                    }
                  />
                </div>
              </div>

              {/* Sales List */}
              <div className={`${CARD} overflow-hidden`}>
                <div className="p-4 sm:p-5 border-b border-dark-border">
                  <SectionTitle
                    right={
                      salesData.length > 0 ? <Badge tone="gold">{salesData.length}</Badge> : undefined
                    }
                  >
                    سجل المبيعات
                  </SectionTitle>
                </div>
                {salesData.length === 0 ? (
                  <EmptyState title="لا توجد مبيعات في هذه الفترة" />
                ) : (
                  <>
                    {/* Phone: same fields as the table, stacked */}
                    <div className="sm:hidden p-4 space-y-3">
                      {salesData.map(sale => (
                        <ListCard key={sale.id}>
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${GOLD}14`, color: GOLD }}>
                                <UiIcon name="subscriptions" className="w-4 h-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white">{sale.invoiceNumber}</p>
                                <p className="text-xs text-gray-500">{sale.branch.name}</p>
                              </div>
                            </div>
                            <Badge tone="green">{formatPiasters(sale.finalTotalPiasters)}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {sale.items.slice(0, 3).map(item => (
                              <span key={item.id} className="text-[11px] bg-dark px-2 py-0.5 rounded-md text-gray-400">
                                {item.product.nameAr || item.product.name} ×{item.quantity}
                              </span>
                            ))}
                            {sale.items.length > 3 && (
                              <span className="text-[11px] text-gray-500 px-1">+{sale.items.length - 3} أخرى</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                            <UiIcon name="clock" className="w-3.5 h-3.5" />
                            {arDate(sale.createdAt)} {new Date(sale.createdAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </ListCard>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden sm:block">
                      <TableShell
                        head={
                          <>
                            <Th>رقم الفاتورة</Th>
                            <Th>الفرع</Th>
                            <Th>المنتجات</Th>
                            <Th>الإجمالي</Th>
                            <Th>التاريخ</Th>
                          </>
                        }
                      >
                        {salesData.map(sale => (
                          <Row key={sale.id} className="hover:bg-white/[0.02]">
                            <Td>
                              <span className="text-sm font-mono font-semibold text-white bg-dark px-2 py-0.5 rounded-md">{sale.invoiceNumber}</span>
                            </Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${GOLD}14`, color: GOLD }}>
                                  <UiIcon name="branches" className="w-3.5 h-3.5" />
                                </span>
                                <span className="text-sm text-gray-300">{sale.branch.name}</span>
                              </div>
                            </Td>
                            <Td>
                              <div className="flex flex-wrap gap-1.5">
                                {sale.items.slice(0, 2).map(item => (
                                  <span key={item.id} className="text-xs bg-dark px-2 py-0.5 rounded-md text-gray-400">
                                    {item.product.nameAr || item.product.name} ×{item.quantity}
                                  </span>
                                ))}
                                {sale.items.length > 2 && (
                                  <span className="text-xs text-gray-500 px-1">+{sale.items.length - 2}</span>
                                )}
                              </div>
                            </Td>
                            <Td>
                              <Badge tone="green">{formatPiasters(sale.finalTotalPiasters)}</Badge>
                            </Td>
                            <Td>
                              <div className="flex items-center gap-1.5">
                                <UiIcon name="clock" className="w-3.5 h-3.5 text-gray-500" />
                                <span className="text-sm text-gray-400">{arDate(sale.createdAt)}</span>
                                <span className="text-xs text-gray-500">
                                  {new Date(sale.createdAt).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                              </div>
                            </Td>
                          </Row>
                        ))}
                      </TableShell>
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
                <StatTile
                  icon="expenses"
                  tone={TONE.expenses}
                  label="إجمالي المصروفات"
                  value={<span style={{ color: TONE.expenses }}>{formatPiasters(expensesData.total)}</span>}
                />
                <StatTile
                  icon="wallet"
                  label="عدد المصروفات"
                  value={expensesData.expenses.length}
                />
              </div>

              {/* Category Chart */}
              {expenseCategoryData.length > 0 && (
                <div className={`${CARD} p-5 sm:p-6`}>
                  <div className="mb-5">
                    <SectionTitle>المصروفات حسب الفئة</SectionTitle>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8 items-center">
                    <div className="h-[190px] sm:h-[240px]">
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
                            contentStyle={chartTooltipStyle}
                            labelStyle={{ color: '#fff', fontWeight: 600 }}
                            formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-2">
                      {expenseCategoryData.map((cat, idx) => {
                        const percentage = expensesData.total > 0 ? Math.round((cat.value * 100 / (expensesData.total / 100)) * 100) / 100 : 0;
                        return (
                          <div key={idx} className="flex items-center justify-between gap-3 p-3 bg-dark rounded-xl border border-dark-border">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                              <span className="text-sm text-gray-300 font-medium truncate">{cat.name}</span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className="text-[11px] text-gray-500 font-medium">{percentage}%</span>
                              <span className="text-sm font-semibold text-white">{formatPiasters(cat.value * 100)}</span>
                              <span className="text-[11px] text-gray-500 bg-dark-card px-2 py-0.5 rounded-md">({cat.count})</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Expenses List */}
              <div className={`${CARD} overflow-hidden`}>
                <div className="p-4 sm:p-5 border-b border-dark-border">
                  <SectionTitle
                    tone={TONE.expenses}
                    right={
                      expensesData.expenses.length > 0 ? <Badge tone="red">{expensesData.expenses.length}</Badge> : undefined
                    }
                  >
                    سجل المصروفات
                  </SectionTitle>
                </div>
                {expensesData.expenses.length === 0 ? (
                  <EmptyState title="لا توجد مصروفات في هذه الفترة" />
                ) : (
                  <>
                    {/* Phone: same fields as the table, stacked */}
                    <div className="sm:hidden p-4 space-y-3">
                      {expensesData.expenses.map(expense => (
                        <ListCard key={expense.id}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" style={{ backgroundColor: `${TONE.expenses}14`, color: TONE.expenses }}>
                                <UiIcon name="expenses" className="w-4 h-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-white">{expense.description}</p>
                                <p className="text-xs text-gray-500">{expense.branch.name}</p>
                              </div>
                            </div>
                            <Badge tone="red">{formatPiasters(expense.amountPiasters)}</Badge>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-2">
                            <span className="text-[11px] bg-dark px-2 py-0.5 rounded-md text-gray-400">{expense.category}</span>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-500">
                              <UiIcon name="clock" className="w-3.5 h-3.5" />
                              {arDate(expense.createdAt)}
                            </div>
                          </div>
                        </ListCard>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden sm:block">
                      <TableShell
                        head={
                          <>
                            <Th>الوصف</Th>
                            <Th>الفئة</Th>
                            <Th>الفرع</Th>
                            <Th>المبلغ</Th>
                            <Th>التاريخ</Th>
                          </>
                        }
                      >
                        {expensesData.expenses.map(expense => (
                          <Row key={expense.id} className="hover:bg-white/[0.02]">
                            <Td>
                              <span className="text-sm text-white font-medium">{expense.description}</span>
                            </Td>
                            <Td>
                              <span className="text-xs bg-dark px-2 py-0.5 rounded-md text-gray-400 font-medium">{expense.category}</span>
                            </Td>
                            <Td>
                              <div className="flex items-center gap-2">
                                <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${GOLD}14`, color: GOLD }}>
                                  <UiIcon name="branches" className="w-3.5 h-3.5" />
                                </span>
                                <span className="text-sm text-gray-300">{expense.branch.name}</span>
                              </div>
                            </Td>
                            <Td>
                              <Badge tone="red">{formatPiasters(expense.amountPiasters)}</Badge>
                            </Td>
                            <Td>
                              <div className="flex items-center gap-1.5">
                                <UiIcon name="clock" className="w-3.5 h-3.5 text-gray-500" />
                                <span className="text-sm text-gray-400">{arDate(expense.createdAt)}</span>
                              </div>
                            </Td>
                          </Row>
                        ))}
                      </TableShell>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* ======================================================== */}
          {/*  Activity Log Tab                                        */}
          {/* ======================================================== */}
          {activeTab === 'activity' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Range totals — counted over every row, not just what is on screen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
                <StatTile
                  icon="wallet"
                  tone={TONE.revenue}
                  label="الوارد في الفترة"
                  value={<span style={{ color: TONE.revenue }}>{formatPiasters(activity?.summary.incomePiasters ?? 0)}</span>}
                  caption={
                    <span>
                      {activity?.summary.counts.SALE ?? 0} بيع • {activity?.summary.counts.PAYMENT ?? 0} اشتراك
                    </span>
                  }
                />
                <StatTile
                  icon="expenses"
                  tone={TONE.expenses}
                  label="الخارج في الفترة"
                  value={<span style={{ color: TONE.expenses }}>{formatPiasters(activity?.summary.outflowPiasters ?? 0)}</span>}
                  caption={
                    <span>
                      {activity?.summary.counts.EXPENSE ?? 0} مصروف • {activity?.summary.counts.SALARY ?? 0} مرتّب
                    </span>
                  }
                />
                <StatTile
                  icon="reports"
                  tone={(activity?.summary.netPiasters ?? 0) >= 0 ? TONE.profit : TONE.expenses}
                  label="الصافي"
                  value={
                    <span style={{ color: (activity?.summary.netPiasters ?? 0) >= 0 ? TONE.profit : TONE.expenses }}>
                      {formatPiasters(activity?.summary.netPiasters ?? 0)}
                    </span>
                  }
                />
                <StatTile
                  icon="member"
                  label="كل العمليات"
                  value={
                    Object.values(activity?.summary.counts ?? {}).reduce((s: number, n: number) => s + n, 0)
                  }
                  caption={
                    <span>
                      {activity?.summary.counts.MEMBER ?? 0} عضو جديد • {activity?.summary.counts.CHECKIN ?? 0} دخول
                    </span>
                  }
                />
              </div>

              {/* Kind filter */}
              <div className="flex gap-1.5 sm:gap-2 flex-wrap">
                <Btn
                  variant={activityKind === 'ALL' ? 'primary' : 'ghost'}
                  onClick={() => setActivityKind('ALL')}
                >
                  الكل
                </Btn>
                {ACTIVITY_KINDS.map(kind => (
                  <Btn
                    key={kind.key}
                    variant={activityKind === kind.key ? 'primary' : 'ghost'}
                    onClick={() => setActivityKind(activityKind === kind.key ? 'ALL' : kind.key)}
                  >
                    <span>{kind.label}</span>
                    <span className="text-[11px] opacity-70">{activity?.summary.counts[kind.key] ?? 0}</span>
                  </Btn>
                ))}
              </div>

              {/* The journal */}
              <div className={`${CARD} overflow-hidden`}>
                <div className="p-4 sm:p-5 border-b border-dark-border">
                  <SectionTitle right={<Badge tone="gold">{activityDays.shown}</Badge>}>
                    سجل العمليات
                  </SectionTitle>
                </div>

                {activityDays.days.length === 0 ? (
                  <EmptyState title="مفيش عمليات في الفترة دي" hint="غيّر التاريخ أو اختار فرع تاني" />
                ) : (
                  <div className="divide-y divide-dark-border">
                    {activityDays.days.map(day => (
                      <div key={day.date}>
                        {/* Day header with that day's money */}
                        <div className="flex flex-wrap items-center gap-2 bg-dark/40 px-4 py-2.5">
                          <span className="text-xs sm:text-sm font-bold text-white">{arDate(day.date)}</span>
                          {day.income > 0 && (
                            <Badge tone="green">+{formatPiasters(day.income)}</Badge>
                          )}
                          {day.outflow > 0 && (
                            <Badge tone="red">-{formatPiasters(day.outflow)}</Badge>
                          )}
                          <span className="mr-auto text-[11px] text-gray-500">
                            {day.total} عملية
                            {day.income || day.outflow ? ` • الصافي ${formatPiasters(day.net)}` : ''}
                          </span>
                        </div>

                        {day.items.map(item => (
                          <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors">
                            <div
                              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                              style={
                                activityFlow(item.kind) === 'in'
                                  ? { backgroundColor: `${TONE.revenue}14`, color: TONE.revenue }
                                  : activityFlow(item.kind) === 'out'
                                    ? { backgroundColor: `${TONE.expenses}14`, color: TONE.expenses }
                                    : { backgroundColor: '#141414', color: '#9CA3AF' }
                              }
                            >
                              <ActivityKindIcon kind={item.kind} className="w-4 h-4" />
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-white truncate">
                                {item.title}
                                {item.flagged && (
                                  <span className="mr-1.5 text-[11px] font-normal text-rose-400">— بدون اشتراك</span>
                                )}
                              </p>
                              <p className="text-[11px] sm:text-xs text-gray-500 truncate">{item.subtitle}</p>
                              <p className="text-[11px] text-gray-600 truncate">
                                {new Date(item.at).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                                {' • '}{item.branchName}
                                {item.method ? ` • ${ACTIVITY_METHODS[item.method] || item.method}` : ''}
                              </p>
                            </div>

                            {item.amountPiasters !== null ? (
                              <span
                                className="text-sm sm:text-base font-bold shrink-0"
                                dir="rtl"
                                style={{ color: activityFlow(item.kind) === 'in' ? TONE.revenue : TONE.expenses }}
                              >
                                {activityFlow(item.kind) === 'in' ? '+' : '-'}{formatPiasters(item.amountPiasters)}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-600 shrink-0">
                                {ACTIVITY_KINDS.find(k => k.key === item.kind)?.label}
                              </span>
                            )}
                          </div>
                        ))}

                        {day.folded.map(fold => (
                          <div key={fold.kind} className="px-4 pb-3 pt-1 text-[11px] text-gray-500 border-t border-white/[0.04]">
                            {fold.hidden} {ACTIVITY_KINDS.find(k => k.key === fold.kind)?.label} تانية في اليوم ده — دوس على «{ACTIVITY_KINDS.find(k => k.key === fold.kind)?.label}» فوق عشان تعدّهم كلهم
                          </div>
                        ))}
                      </div>
                    ))}

                    {activity?.truncated && (
                      <div className="p-4 text-center bg-dark/40">
                        <p className="text-xs text-gray-500">
                          دي آخر {activity.limit} عملية في الفترة — عشان تشوف الباقي اختار نوع أو ضيّق التاريخ.
                        </p>
                      </div>
                    )}
                  </div>
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
                <div className={`${CARD}`}>
                  <EmptyState title="لا توجد بيانات للفروع" />
                </div>
              ) : (
                <>
                  {/* Branch Comparison Chart */}
                  <div className={`${CARD} p-5 sm:p-6`}>
                    <div className="mb-5">
                      <SectionTitle>مقارنة أداء الفروع</SectionTitle>
                    </div>
                    {comparisonHasData ? (
                      <>
                    <div className="h-[190px] sm:h-[240px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={branchComparisonData} barGap={2} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                          <XAxis dataKey="name" stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} />
                          <YAxis stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} width={50} />
                          <Tooltip
                            cursor={{ fill: 'rgba(245,158,11,0.05)' }}
                            contentStyle={chartTooltipStyle}
                            labelStyle={{ color: '#fff', fontWeight: 600 }}
                            formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                          />
                          <Bar dataKey="revenue" fill={GOLD} radius={[6, 6, 0, 0]} name="إيرادات" />
                          <Bar dataKey="expenses" fill="#374151" radius={[6, 6, 0, 0]} name="مصروفات" />
                          <Bar dataKey="profit" fill="#D97706" radius={[6, 6, 0, 0]} name="ربح" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex justify-center gap-4 sm:gap-6 mt-4 flex-wrap">
                      <span className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="w-3 h-3 rounded-sm" style={{ background: GOLD }} /> إيرادات
                      </span>
                      <span className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="w-3 h-3 rounded-sm" style={{ background: '#374151' }} /> مصروفات
                      </span>
                      <span className="flex items-center gap-2 text-xs text-gray-400">
                        <span className="w-3 h-3 rounded-sm" style={{ background: '#D97706' }} /> ربح
                      </span>
                    </div>
                      </>
                    ) : (
                      <p className="h-[190px] sm:h-[240px] flex items-center justify-center text-sm text-gray-500">لا توجد حركة مالية خلال الفترة</p>
                    )}
                  </div>

                  {/* Branch Cards - Phone */}
                  <div className="grid grid-cols-1 gap-3 sm:hidden">
                    {branchStats.map((stat, idx) => {
                      const color = COLORS[idx % COLORS.length];
                      return (
                        <div key={stat.branch.id} className={`${CARD} p-4`}>
                          <div className="flex items-center gap-3 mb-4">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                              style={{ backgroundColor: `${color}14`, color }}
                            >
                              <UiIcon name="branches" className="w-5 h-5" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-white">{stat.branch.name}</p>
                              <p className="text-[11px] text-gray-500 font-mono">{stat.branch.code}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2.5">
                            {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                              <div className="bg-dark rounded-xl p-2.5">
                                <p className="text-[11px] text-gray-500 mb-0.5">الإيرادات</p>
                                <p className="text-xs sm:text-sm font-bold" style={{ color: TONE.revenue }}>{formatPiasters(stat.revenue || 0)}</p>
                              </div>
                            )}
                            {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                              <div className="bg-dark rounded-xl p-2.5">
                                <p className="text-[11px] text-gray-500 mb-0.5">المصروفات</p>
                                <p className="text-xs sm:text-sm font-bold" style={{ color: TONE.expenses }}>{formatPiasters(stat.expenses || 0)}</p>
                              </div>
                            )}
                            {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                              <div className="bg-dark rounded-xl p-2.5">
                                <p className="text-[11px] text-gray-500 mb-0.5">الربح</p>
                                <p className="text-xs sm:text-sm font-bold" style={{ color: stat.profit >= 0 ? TONE.revenue : TONE.expenses }}>
                                  {formatPiasters(stat.profit || 0)}
                                </p>
                              </div>
                            )}
                            <div className="bg-dark rounded-xl p-2.5">
                              <p className="text-[11px] text-gray-500 mb-0.5">الأعضاء</p>
                              <div className="flex items-center gap-1.5">
                                <UiIcon name="users" className="w-3.5 h-3.5 text-gray-500" />
                                <p className="text-xs sm:text-sm font-bold text-white">{stat.activeMembers}</p>
                              </div>
                            </div>
                            <div className="bg-dark rounded-xl p-2.5 col-span-2">
                              <p className="text-[11px] text-gray-500 mb-0.5">الاشتراكات</p>
                              <p className="text-xs sm:text-sm font-bold text-white">{stat.activeSubscriptions}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Branch Table - Desktop */}
                  <div className="hidden sm:block">
                    <div className={`${CARD} overflow-hidden`}>
                      <div className="p-5 sm:p-6">
                        <SectionTitle>أداء الفروع</SectionTitle>
                      </div>
                      <TableShell
                        minWidth="min-w-[760px]"
                        head={
                          <>
                            <Th>الفرع</Th>
                            {hasPermission('VIEW_DASHBOARD_REVENUE') && <Th>الإيرادات</Th>}
                            {hasPermission('VIEW_DASHBOARD_EXPENSES') && <Th>المصروفات</Th>}
                            {hasPermission('VIEW_DASHBOARD_PROFIT') && <Th>الربح</Th>}
                            {hasPermission('VIEW_DASHBOARD_OUTSTANDING') && <Th>مستحقات</Th>}
                            <Th>الأعضاء</Th>
                            <Th>الاشتراكات</Th>
                            <Th>المبيعات</Th>
                          </>
                        }
                      >
                        {branchStats.map((stat, idx) => {
                          const color = COLORS[idx % COLORS.length];
                          return (
                            <Row key={stat.branch.id} className="hover:bg-white/[0.02]">
                              <Td>
                                <div className="flex items-center gap-2.5">
                                  <div
                                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                                    style={{ backgroundColor: `${color}14`, color }}
                                  >
                                    <UiIcon name="branches" className="w-4 h-4" />
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-white">{stat.branch.name}</p>
                                    <p className="text-[11px] text-gray-500 font-mono">{stat.branch.code}</p>
                                  </div>
                                </div>
                              </Td>
                              {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                                <Td>
                                  <Badge tone="green">{formatPiasters(stat.revenue || 0)}</Badge>
                                </Td>
                              )}
                              {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                                <Td>
                                  <Badge tone="red">{formatPiasters(stat.expenses || 0)}</Badge>
                                </Td>
                              )}
                              {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                                <Td>
                                  <Badge tone={stat.profit >= 0 ? 'green' : 'red'}>{formatPiasters(stat.profit || 0)}</Badge>
                                </Td>
                              )}
                              {hasPermission('VIEW_DASHBOARD_OUTSTANDING') && (
                                <Td>
                                  <Badge tone="amber">{formatPiasters(stat.outstanding || 0)}</Badge>
                                </Td>
                              )}
                              <Td>
                                <div className="flex items-center gap-1.5">
                                  <UiIcon name="users" className="w-3.5 h-3.5 text-gray-500" />
                                  <span className="text-sm font-medium text-white">{stat.activeMembers}</span>
                                </div>
                              </Td>
                              <Td>
                                <span className="text-sm font-medium text-white">{stat.activeSubscriptions}</span>
                              </Td>
                              <Td>
                                <Badge tone="gray">{stat.salesCount}</Badge>
                              </Td>
                            </Row>
                          );
                        })}
                      </TableShell>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
