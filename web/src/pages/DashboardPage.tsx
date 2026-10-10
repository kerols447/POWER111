import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

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
  plan: { name: string };
}

function formatPiasters(piasters: number): string {
  const pounds = piasters / 100;
  return pounds.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' ج.م';
}

function formatNumber(num: number): string {
  return num.toLocaleString('en-US');
}

const COLORS = ['#DC2626', '#F59E0B', '#10B981', '#3B82F6'];

function DashboardPage() {
  const navigate = useNavigate();
  const [branchStats, setBranchStats] = useState<BranchStat[]>([]);
  const [financial, setFinancial] = useState<FinancialData | null>(null);
  const [expiring, setExpiring] = useState<ExpiringSubscription[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranch, setSelectedBranch] = useState<string>('all');
  const { user, hasPermission, isOwner } = useAuth();

  const today = new Date().toISOString().split('T')[0];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [branchRes, financialRes, expiringRes] = await Promise.all([
        fetch(`/api/reports/branches?from=${today}&to=${today}`, { credentials: 'include' }),
        fetch(`/api/reports/financial?from=${today}&to=${today}`, { credentials: 'include' }),
        fetch('/api/subscriptions/expiring?days=7', { credentials: 'include' })
      ]);

      if (branchRes.ok) setBranchStats(await branchRes.json());
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
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">جاري التحميل...</div>
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">لوحة التحكم</h1>
          <p className="text-sm text-gray-400 mt-1">
            {isOwner ? 'نظرة عامة على جميع الفروع' : `فرعك — ${new Date().toLocaleDateString('ar-EG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`}
          </p>
        </div>
        <select
          value={selectedBranch}
          onChange={(e) => setSelectedBranch(e.target.value)}
          className="bg-dark-card border border-dark-border rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-primary min-w-[160px]"
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <button
          onClick={() => navigate('/admin/attendance')}
          className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 hover:border-primary/50 transition-all group"
        >
          <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
            <span className="text-xl">📷</span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-white">حضور عضو</p>
        </button>
        <button
          onClick={() => navigate('/admin/members')}
          className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 hover:border-primary/50 transition-all group"
        >
          <div className="w-10 h-10 bg-blue-500/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-blue-500/20 transition-colors">
            <span className="text-xl">👤</span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-white">عضو جديد</p>
        </button>
        <button
          onClick={() => navigate('/admin/sales')}
          className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 hover:border-primary/50 transition-all group"
        >
          <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-green-500/20 transition-colors">
            <span className="text-xl">🛒</span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-white">نقطة بيع</p>
        </button>
        <button
          onClick={() => navigate('/admin/subscriptions')}
          className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 hover:border-primary/50 transition-all group"
        >
          <div className="w-10 h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center mb-2 group-hover:bg-yellow-500/20 transition-colors">
            <span className="text-xl">🔄</span>
          </div>
          <p className="text-xs sm:text-sm font-medium text-white">تجديد اشتراك</p>
        </button>
      </div>

      {/* Financial Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {hasPermission('VIEW_DASHBOARD_REVENUE') && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-green-500/10 rounded-lg flex items-center justify-center">
                <span className="text-lg sm:text-xl">💰</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">إيرادات اليوم</p>
            <p className="text-lg sm:text-xl font-bold text-green-400">{formatPiasters(totalRevenue)}</p>
          </div>
        )}

        {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-red-500/10 rounded-lg flex items-center justify-center">
                <span className="text-lg sm:text-xl">💸</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">مصروفات اليوم</p>
            <p className="text-lg sm:text-xl font-bold text-red-400">{formatPiasters(totalExpenses)}</p>
          </div>
        )}

        {hasPermission('VIEW_DASHBOARD_PROFIT') && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-blue-500/10 rounded-lg flex items-center justify-center">
                <span className="text-lg sm:text-xl">📈</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">صافي الربح</p>
            <p className={`text-lg sm:text-xl font-bold ${totalProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPiasters(totalProfit)}
            </p>
            <p className={`text-xs mt-1 ${totalProfit >= 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
              {profitMargin}% هامش الربح
            </p>
          </div>
        )}

        {hasPermission('VIEW_DASHBOARD_OUTSTANDING') && (
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="w-9 h-9 sm:w-10 sm:h-10 bg-yellow-500/10 rounded-lg flex items-center justify-center">
                <span className="text-lg sm:text-xl">📋</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">مستحقات</p>
            <p className="text-lg sm:text-xl font-bold text-yellow-400">{formatPiasters(totalOutstanding)}</p>
          </div>
        )}
      </div>

      {/* Members & Subscriptions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center">
              <span className="text-2xl">👥</span>
            </div>
            <div>
              <p className="text-xs text-gray-400">إجمالي الأعضاء</p>
              <p className="text-2xl font-bold text-white">{formatNumber(totalMembers)}</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center">
              <span className="text-2xl">✅</span>
            </div>
            <div>
              <p className="text-xs text-gray-400">الاشتراكات النشطة</p>
              <p className="text-2xl font-bold text-green-400">{formatNumber(totalSubscriptions)}</p>
            </div>
          </div>
        </div>

        <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5 sm:col-span-1 col-span-1">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-yellow-500/10 rounded-xl flex items-center justify-center">
              <span className="text-2xl">⚠️</span>
            </div>
            <div>
              <p className="text-xs text-gray-400">تنتهي خلال 7 أيام</p>
              <p className="text-2xl font-bold text-yellow-400">{expiring.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      {branchStats.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          {/* Branch Comparison */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-6">
            <h3 className="text-sm sm:text-base font-bold text-white mb-4">مقارنة الفروع</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={branchComparisonData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                <XAxis dataKey="name" stroke="#6B7280" fontSize={11} />
                <YAxis stroke="#6B7280" fontSize={11} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#141414', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                  labelStyle={{ color: '#fff' }}
                  formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                />
                <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="إيرادات" />
                <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} name="مصروفات" />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex justify-center gap-6 mt-3">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-xs text-gray-400">إيرادات</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <span className="text-xs text-gray-400">مصروفات</span>
              </div>
            </div>
          </div>

          {/* Revenue Distribution */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-6">
            <h3 className="text-sm sm:text-base font-bold text-white mb-4">توزيع الإيرادات</h3>
            {revenueByBranch.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={revenueByBranch}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {revenueByBranch.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{ backgroundColor: '#141414', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap justify-center gap-3 mt-3">
                  {revenueByBranch.map((branch, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: branch.color }}></div>
                      <span className="text-xs text-gray-400">{branch.name}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-[220px] text-gray-500 text-sm">
                لا توجد إيرادات اليوم
              </div>
            )}
          </div>
        </div>
      )}

      {/* Branch Performance Table */}
      {branchStats.length > 0 && (
        <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-6">
          <h3 className="text-sm sm:text-base font-bold text-white mb-4">أداء الفروع</h3>
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="w-full min-w-[500px]">
              <thead>
                <tr className="border-b border-dark-border">
                  <th className="text-right text-xs text-gray-400 font-medium pb-3 px-4">الفرع</th>
                  {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                    <th className="text-right text-xs text-gray-400 font-medium pb-3 px-4">الإيرادات</th>
                  )}
                  {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                    <th className="text-right text-xs text-gray-400 font-medium pb-3 px-4">المصروفات</th>
                  )}
                  {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                    <th className="text-right text-xs text-gray-400 font-medium pb-3 px-4">الربح</th>
                  )}
                  <th className="text-right text-xs text-gray-400 font-medium pb-3 px-4">الأعضاء</th>
                  <th className="text-right text-xs text-gray-400 font-medium pb-3 px-4">الاشتراكات</th>
                </tr>
              </thead>
              <tbody>
                {filteredStats.map((stat, idx) => (
                  <tr key={stat.branch.id} className="border-b border-dark-border/50 hover:bg-dark-hover transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: COLORS[idx % COLORS.length] + '20' }}>
                          <span className="text-sm">🏢</span>
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{stat.branch.name}</p>
                          <p className="text-xs text-gray-500">{stat.branch.code}</p>
                        </div>
                      </div>
                    </td>
                    {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-green-400">{formatPiasters(stat.revenue || 0)}</span>
                      </td>
                    )}
                    {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                      <td className="py-3 px-4">
                        <span className="text-sm font-medium text-red-400">{formatPiasters(stat.expenses || 0)}</span>
                      </td>
                    )}
                    {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                      <td className="py-3 px-4">
                        <span className={`text-sm font-medium ${stat.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatPiasters(stat.profit || 0)}
                        </span>
                      </td>
                    )}
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-white">{stat.activeMembers}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm font-medium text-white">{stat.activeSubscriptions}</span>
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
        <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 sm:p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-yellow-400 text-lg">⚠️</span>
            <h3 className="text-sm sm:text-base text-yellow-400 font-bold">اشتراكات تنتهي قريباً ({expiring.length})</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {expiring.slice(0, 6).map(sub => (
              <div key={sub.id} className="bg-dark-card border border-dark-border rounded-lg p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-white">{sub.member.name}</p>
                  <p className="text-xs text-gray-500">{sub.plan.name}</p>
                </div>
                <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-1 rounded whitespace-nowrap">
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
