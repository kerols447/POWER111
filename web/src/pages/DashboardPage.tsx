import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area } from 'recharts';

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

interface FinancialData {
  revenue: number;
  expenses: number;
  profit: number;
  outstanding: number;
  salesCount: number;
  expensesCount: number;
  paymentsCount: number;
}

interface ExpiringSubscription {
  id: string;
  endDate: string;
  member: { name: string; code: string };
  plan: { name: string; nameAr?: string };
}

function formatPiasters(piasters: number): string {
  const pounds = piasters / 100;
  return pounds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ج.م';
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

const COLORS = ['#F59E0B', '#D97706', '#FCD34D', '#B45309'];

function DashboardPage() {
  const navigate = useNavigate();
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [financial, setFinancial] = useState<FinancialData | null>(null);
  const [expiring, setExpiring] = useState<ExpiringSubscription[]>([]);
  const [branchCounts, setBranchCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const { user, hasPermission, isOwner } = useAuth();

  const today = new Date();
  const toStr = today.toISOString().split('T')[0];
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 6);
  const fromStr = weekAgo.toISOString().split('T')[0];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [branchRes, financialRes, expiringRes] = await Promise.all([
        fetch(`/api/reports/branches?from=${fromStr}&to=${toStr}`, { credentials: 'include' }),
        fetch(`/api/reports/financial?from=${fromStr}&to=${toStr}`, { credentials: 'include' }),
        fetch('/api/subscriptions/expiring?days=7', { credentials: 'include' })
      ]);

      if (branchRes.ok) {
        const stats = await branchRes.json();
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
      if (financialRes.ok) setFinancial(await financialRes.json());
      if (expiringRes.ok) setExpiring(await expiringRes.json());
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

  const totalRevenue = filteredStats.reduce((sum, b) => sum + (b.revenue || 0), 0);
  const totalExpenses = filteredStats.reduce((sum, b) => sum + (b.expenses || 0), 0);
  const totalProfit = filteredStats.reduce((sum, b) => sum + (b.profit || 0), 0);
  const totalOutstanding = filteredStats.reduce((sum, b) => sum + (b.outstanding || 0), 0);
  const totalMembers = filteredStats.reduce((sum, b) => sum + b.activeMembers, 0);
  const totalSubscriptions = filteredStats.reduce((sum, b) => sum + b.activeSubscriptions, 0);
  const totalInGym = Object.values(branchCounts).reduce((sum, c) => sum + c, 0);

  const branchComparisonData = branchStats.map((stat, idx) => ({
    name: stat.branch.name.split('—')[1]?.trim() || stat.branch.code,
    revenue: stat.revenue / 100,
    expenses: stat.expenses / 100,
    members: stat.activeMembers,
    color: COLORS[idx % COLORS.length]
  }));

  const revenueByBranch = branchStats
    .map((stat, idx) => ({
      name: stat.branch.name.split('—')[1]?.trim() || stat.branch.code,
      value: stat.revenue / 100,
      color: COLORS[idx % COLORS.length]
    }))
    .filter(b => b.value > 0);

  const profitMargin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 100) : 0;

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">لوحة التحكم</h1>
          <p className="text-sm text-gray-500 mt-1">
            {isOwner ? 'نظرة عامة على جميع الفروع' : `فرعك — ${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
          </p>
        </div>
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="bg-dark-card border border-dark-border rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-primary/60 min-w-[180px] transition-colors"
        >
          <option value="all">جميع الفروع</option>
          {branchStats.map(stat => (
            <option key={stat.branch.id} value={stat.branch.id}>
              {stat.branch.name}
            </option>
          ))}
        </select>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button
          onClick={() => navigate('/admin/attendance')}
          className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-5 hover:border-primary/40 transition-all group text-right"
        >
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center mb-3 group-hover:from-primary/30 group-hover:to-primary/10 transition-all">
            <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white">حضور عضو</p>
          <p className="text-xs text-gray-500 mt-0.5">تسجيل الحضور</p>
        </button>

        <button
          onClick={() => navigate('/admin/members')}
          className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-5 hover:border-primary/40 transition-all group text-right"
        >
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center mb-3 group-hover:from-primary/30 group-hover:to-primary/10 transition-all">
            <svg className="w-6 h-6 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3M2.25 9.75h19.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H2.25A2.25 2.25 0 010 18v-6a2.25 2.25 0 012.25-2.25z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 2.25c1.105 0 2.25.895 2.25 2.25S13.105 6.75 12 6.75 9.75 5.855 9.75 4.5 10.895 2.25 12 2.25z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white">عضو جديد</p>
          <p className="text-xs text-gray-500 mt-0.5">إضافة عضو</p>
        </button>

        <button
          onClick={() => navigate('/admin/sales')}
          className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-5 hover:border-amber-500/40 transition-all group text-right"
        >
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-amber-500/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500/20 to-amber-500/5 rounded-xl flex items-center justify-center mb-3 group-hover:from-amber-500/30 group-hover:to-amber-500/10 transition-all">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white">نقطة بيع</p>
          <p className="text-xs text-gray-500 mt-0.5">بيع منتجات</p>
        </button>

        <button
          onClick={() => navigate('/admin/subscriptions')}
          className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-5 hover:border-yellow-500/40 transition-all group text-right"
        >
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-yellow-500/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="w-12 h-12 bg-gradient-to-br from-yellow-500/20 to-yellow-500/5 rounded-xl flex items-center justify-center mb-3 group-hover:from-yellow-500/30 group-hover:to-yellow-500/10 transition-all">
            <svg className="w-6 h-6 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.182" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-white">تجديد اشتراك</p>
          <p className="text-xs text-gray-500 mt-0.5">إدارة الاشتراكات</p>
        </button>
      </div>

      {/* Hero Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {hasPermission('VIEW_DASHBOARD_REVENUE') && (
          <div className="relative overflow-hidden bg-gradient-to-br from-emerald-500/10 via-dark-card to-dark-card border border-emerald-500/20 rounded-2xl p-4 sm:p-5">
            <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/5 rounded-full -translate-y-6 translate-x-6" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-emerald-500/15 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <span className="text-xs text-emerald-400/70 font-medium">الإيرادات</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight">{formatPiasters(totalRevenue)}</p>
              <div className="mt-2 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-emerald-400/50">{filteredStats.reduce((s, b) => s + b.salesCount, 0)} عملية بيع</span>
              </div>
            </div>
          </div>
        )}

        {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
          <div className="relative overflow-hidden bg-gradient-to-br from-rose-500/10 via-dark-card to-dark-card border border-rose-500/20 rounded-2xl p-4 sm:p-5">
            <div className="absolute top-0 right-0 w-20 h-20 bg-rose-500/5 rounded-full -translate-y-6 translate-x-6" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-rose-500/15 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <span className="text-xs text-rose-400/70 font-medium">المصروفات</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-rose-400 tracking-tight">{formatPiasters(totalExpenses)}</p>
              <div className="mt-2 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-rose-400/50">{filteredStats.reduce((s, b) => s + b.expensesCount, 0)} مصروف</span>
              </div>
            </div>
          </div>
        )}

        {hasPermission('VIEW_DASHBOARD_PROFIT') && (
          <div className={`relative overflow-hidden bg-gradient-to-br ${totalProfit >= 0 ? 'from-primary/10 via-dark-card to-dark-card border-primary/20' : 'from-rose-500/10 via-dark-card to-dark-card border-rose-500/20'} border rounded-2xl p-4 sm:p-5`}>
            <div className={`absolute top-0 right-0 w-20 h-20 ${totalProfit >= 0 ? 'bg-primary/5' : 'bg-rose-500/5'} rounded-full -translate-y-6 translate-x-6`} />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-8 h-8 ${totalProfit >= 0 ? 'bg-primary/15' : 'bg-rose-500/15'} rounded-lg flex items-center justify-center`}>
                  <svg className={`w-4 h-4 ${totalProfit >= 0 ? 'text-primary' : 'text-rose-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                  </svg>
                </div>
                <span className={`text-xs ${totalProfit >= 0 ? 'text-primary/70' : 'text-rose-400/70'} font-medium`}>صافي الربح</span>
              </div>
              <p className={`text-xl sm:text-2xl font-black tracking-tight ${totalProfit >= 0 ? 'text-primary' : 'text-rose-400'}`}>{formatPiasters(totalProfit)}</p>
              <div className="mt-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${totalProfit >= 0 ? 'bg-primary/10 text-primary/70' : 'bg-rose-500/10 text-rose-400/70'}`}>
                  {profitMargin}% هامش الربح
                </span>
              </div>
            </div>
          </div>
        )}

        {hasPermission('VIEW_DASHBOARD_OUTSTANDING') && (
          <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/10 via-dark-card to-dark-card border border-amber-500/20 rounded-2xl p-4 sm:p-5">
            <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/5 rounded-full -translate-y-6 translate-x-6" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-amber-500/15 rounded-lg flex items-center justify-center">
                  <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
                  </svg>
                </div>
                <span className="text-xs text-amber-400/70 font-medium">مستحقات</span>
              </div>
              <p className="text-xl sm:text-2xl font-black text-amber-400 tracking-tight">{formatPiasters(totalOutstanding)}</p>
              <div className="mt-2 flex items-center gap-1">
                <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                <span className="text-[10px] text-amber-400/50">{filteredStats.reduce((s, b) => s + b.paymentsCount, 0)} دفعة</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Members & Subscriptions Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-5 sm:p-6">
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-primary/40 via-primary/20 to-transparent" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">إجمالي الأعضاء</p>
              <p className="text-3xl sm:text-4xl font-black text-white tracking-tight">{formatNumber(totalMembers)}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-primary/20 to-primary/5 rounded-2xl flex items-center justify-center">
              <svg className="w-7 h-7 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-5 sm:p-6">
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-500/40 via-emerald-500/20 to-transparent" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">الاشتراكات النشطة</p>
              <p className="text-3xl sm:text-4xl font-black text-emerald-400 tracking-tight">{formatNumber(totalSubscriptions)}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 rounded-2xl flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </div>

        <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-5 sm:p-6">
          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-amber-500/40 via-amber-500/20 to-transparent" />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 mb-1">تنتهي خلال 7 أيام</p>
              <p className="text-3xl sm:text-4xl font-black text-amber-400 tracking-tight">{expiring.length}</p>
            </div>
            <div className="w-14 h-14 bg-gradient-to-br from-amber-500/20 to-amber-500/5 rounded-2xl flex items-center justify-center">
              <svg className="w-7 h-7 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Currently in Gym — per branch */}
      {Object.keys(branchCounts).length > 0 && (
        <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl p-5 sm:p-7">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/40 via-primary/10 to-transparent" />
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
                </svg>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white">الحاضرين في الفرع حالياً</h3>
                <p className="text-xs text-gray-500">{totalInGym} عضو حاضر الآن</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {filteredStats.map((stat, idx) => {
              const count = branchCounts[stat.branch.id] ?? 0;
              const pct = Math.min(100, (count / Math.max(stat.activeMembers, 1)) * 100);
              return (
                <div key={stat.branch.id} className="relative overflow-hidden rounded-2xl border border-white/5 bg-gradient-to-br from-dark to-dark-card p-5 text-center group hover:border-primary/20 transition-colors">
                  <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <div className="text-4xl font-black text-primary">{count}</div>
                  <div className="mt-2 text-xs text-gray-400 font-medium">{stat.branch.name.split('—')[1]?.trim() || stat.branch.name}</div>
                  <div className="mt-3 h-2 rounded-full bg-dark-card overflow-hidden border border-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-primary/60 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-2 text-[11px] text-gray-500">{count} / {stat.activeMembers} عضو</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Charts */}
      {branchStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Branch Comparison */}
          <div className="bg-dark-card border border-dark-border rounded-2xl p-5 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white">مقارنة الفروع</h3>
            </div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={branchComparisonData} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1A1A1A" vertical={false} />
                <XAxis dataKey="name" stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#4B5563" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '12px', fontSize: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                  labelStyle={{ color: '#fff', fontWeight: 600 }}
                  formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                  cursor={{ fill: 'rgba(245, 158, 11, 0.05)' }}
                />
                <Bar dataKey="revenue" fill="#F59E0B" radius={[6, 6, 0, 0]} name="إيرادات" />
                <Bar dataKey="expenses" fill="#374151" radius={[6, 6, 0, 0]} name="مصروفات" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-8 mt-4">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-primary rounded-sm"></div>
                <span className="text-xs text-gray-400">إيرادات</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-gray-700 rounded-sm"></div>
                <span className="text-xs text-gray-400">مصروفات</span>
              </div>
            </div>
          </div>

          {/* Revenue Distribution */}
          <div className="bg-dark-card border border-dark-border rounded-2xl p-5 sm:p-7">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white">توزيع الإيرادات</h3>
            </div>
            {revenueByBranch.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie
                      data={revenueByBranch}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={4}
                      dataKey="value"
                      strokeWidth={0}
                    >
                      {revenueByBranch.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0A0A0A', border: '1px solid #2A2A2A', borderRadius: '12px', fontSize: '12px', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}
                      formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-4 mt-4">
                  {revenueByBranch.map((branch, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: branch.color }}></div>
                      <span className="text-xs text-gray-400">{branch.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-[240px] gap-3">
                <div className="w-16 h-16 bg-dark rounded-2xl flex items-center justify-center border border-dark-border">
                  <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm">لا توجد إيرادات خلال الفترة</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Branch Performance Table */}
      {branchStats.length > 0 && (
        <div className="bg-dark-card border border-dark-border rounded-2xl overflow-hidden">
          <div className="p-5 sm:p-7 pb-0 sm:pb-0">
            <div className="flex items-center gap-3 mb-5">
              <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center">
                <svg className="w-4.5 h-4.5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5m.75-9l3-3 2.148 2.148A12.061 12.061 0 0116.5 7.605" />
                </svg>
              </div>
              <h3 className="text-base font-bold text-white">أداء الفروع</h3>
            </div>
          </div>
          <div className="overflow-x-auto px-5 sm:px-7 pb-5 sm:pb-7">
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
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm" style={{ backgroundColor: COLORS[idx % COLORS.length] + '15', color: COLORS[idx % COLORS.length] }}>
                          {stat.branch.code.charAt(0).toUpperCase()}
                        </div>
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

      {/* Expiring Subscriptions Alert */}
      {expiring.length > 0 && (
        <div className="relative overflow-hidden bg-gradient-to-br from-amber-500/5 via-dark-card to-dark-card border border-amber-500/15 rounded-2xl p-5 sm:p-7">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-amber-500/40 via-amber-500/10 to-transparent" />
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 bg-amber-500/15 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-bold text-amber-400">اشتراكات تنتهي قريباً</h3>
              <p className="text-xs text-amber-400/50">{expiring.length} اشتراك يحتاج تجديد</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {expiring.slice(0, 6).map(sub => (
              <div key={sub.id} className="bg-dark-card/80 border border-dark-border rounded-xl p-4 flex items-center justify-between hover:border-amber-500/20 transition-colors">
                <div>
                  <p className="text-sm font-semibold text-white">{sub.member.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{sub.plan.nameAr || sub.plan.name}</p>
                </div>
                <span className="text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-lg font-medium whitespace-nowrap">
                  {new Date(sub.endDate).toLocaleDateString('ar-EG')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default DashboardPage;
