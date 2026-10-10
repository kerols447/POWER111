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

const COLORS = ['#DC2626', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899'];

type ReportTab = 'financial' | 'sales' | 'expenses' | 'branches';

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

  const tabs: { key: ReportTab; label: string; icon: string }[] = [
    { key: 'financial', label: 'مالي', icon: '💰' },
    { key: 'sales', label: 'المبيعات', icon: '🛒' },
    { key: 'expenses', label: 'المصروفات', icon: '💸' },
    { key: 'branches', label: 'الفروع', icon: '🏢' },
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

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white">التقارير</h1>
        <p className="text-sm text-gray-400 mt-1">تحليل شامل للأداء المالي والمبيعات</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 sm:gap-2 overflow-x-auto pb-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-1.5 px-3 sm:px-4 py-2 sm:py-2.5 rounded-lg font-medium text-xs sm:text-sm whitespace-nowrap transition-colors ${
              activeTab === tab.key
                ? 'bg-primary text-white'
                : 'bg-dark-card border border-dark-border text-gray-300 hover:bg-dark-hover'
            }`}
          >
            <span>{tab.icon}</span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-end gap-3">
          {/* Quick Range Buttons */}
          <div className="flex gap-1.5 flex-wrap">
            {([
              ['today', 'اليوم'],
              ['week', 'أسبوع'],
              ['month', 'شهر'],
              ['year', 'سنة'],
            ] as const).map(([range, label]) => (
              <button
                key={range}
                onClick={() => setQuickRange(range)}
                className="px-3 py-1.5 bg-dark border border-dark-border text-gray-300 rounded-lg text-xs hover:border-primary/50 hover:text-white transition-colors"
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
            {activeTab !== 'branches' && !singleBranchUser && (
              <div>
                <label className="block text-xs text-gray-400 mb-1.5">الفرع</label>
                <select
                  value={selectedBranch}
                  onChange={(e) => setSelectedBranch(e.target.value)}
                  className="w-full bg-dark border border-dark-border text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
                >
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>{branch.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">من</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-dark border border-dark-border text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs text-gray-400 mb-1.5">إلى</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-dark border border-dark-border text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-primary"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="bg-dark-card border border-dark-border rounded-xl p-12 text-center text-gray-400">
          جاري التحميل...
        </div>
      ) : (
        <>
          {/* Financial Tab */}
          {activeTab === 'financial' && financial && (
            <div className="space-y-4 sm:space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
                  <p className="text-xs text-gray-400 mb-1">الإيرادات</p>
                  <p className="text-lg sm:text-xl font-bold text-green-400">{formatPiasters(financial.revenue)}</p>
                  <p className="text-xs text-gray-500 mt-1">{financial.salesCount} مبيعات + {financial.paymentsCount} مدفوعات</p>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
                  <p className="text-xs text-gray-400 mb-1">المصروفات</p>
                  <p className="text-lg sm:text-xl font-bold text-red-400">{formatPiasters(financial.expenses)}</p>
                  <p className="text-xs text-gray-500 mt-1">{financial.expensesCount} مصروف</p>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
                  <p className="text-xs text-gray-400 mb-1">صافي الربح</p>
                  <p className={`text-lg sm:text-xl font-bold ${financial.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {formatPiasters(financial.profit)}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    {financial.revenue > 0 ? `${Math.round((financial.profit / financial.revenue) * 100)}%` : '0%'} هامش الربح
                  </p>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-5">
                  <p className="text-xs text-gray-400 mb-1">مستحقات</p>
                  <p className="text-lg sm:text-xl font-bold text-yellow-400">{formatPiasters(financial.outstanding)}</p>
                  <p className="text-xs text-gray-500 mt-1">مبالغ متبقية</p>
                </div>
              </div>

              {/* Visual Breakdown */}
              <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-bold text-white mb-4">ملخص الأداء</h3>
                <div className="space-y-4">
                  {[
                    { label: 'الإيرادات', value: financial.revenue, max: financial.revenue, color: 'bg-green-500', textColor: 'text-green-400' },
                    { label: 'المصروفات', value: financial.expenses, max: financial.revenue, color: 'bg-red-500', textColor: 'text-red-400' },
                    { label: 'صافي الربح', value: financial.profit, max: financial.revenue, color: financial.profit >= 0 ? 'bg-blue-500' : 'bg-red-500', textColor: financial.profit >= 0 ? 'text-blue-400' : 'text-red-400' },
                  ].map(item => (
                    <div key={item.label}>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-gray-400">{item.label}</span>
                        <span className={item.textColor}>{formatPiasters(item.value)}</span>
                      </div>
                      <div className="w-full bg-dark rounded-full h-2.5">
                        <div
                          className={`${item.color} h-2.5 rounded-full transition-all duration-500`}
                          style={{ width: item.max > 0 ? `${Math.max(0, Math.min(100, (item.value / item.max) * 100))}%` : '0%' }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue vs Expenses Chart */}
              <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-6">
                <h3 className="text-sm sm:text-base font-bold text-white mb-4">الإيرادات مقابل المصروفات</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={[
                    { name: 'إيرادات', value: financial.revenue / 100, fill: '#10B981' },
                    { name: 'مصروفات', value: financial.expenses / 100, fill: '#EF4444' },
                    { name: 'ربح', value: Math.max(0, financial.profit / 100), fill: '#3B82F6' },
                  ]}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                    <XAxis dataKey="name" stroke="#6B7280" fontSize={12} />
                    <YAxis stroke="#6B7280" fontSize={12} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#141414', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                      formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} name="المبلغ">
                      {[
                        { fill: '#10B981' },
                        { fill: '#EF4444' },
                        { fill: '#3B82F6' },
                      ].map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* Sales Tab */}
          {activeTab === 'sales' && (
            <div className="space-y-4 sm:space-y-6">
              {/* Sales Summary */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">عدد الفواتير</p>
                  <p className="text-xl font-bold text-white">{salesData.length}</p>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">إجمالي المبيعات</p>
                  <p className="text-xl font-bold text-green-400">{formatPiasters(totalSalesAmount)}</p>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-4 col-span-2 sm:col-span-1">
                  <p className="text-xs text-gray-400 mb-1">متوسط الفاتورة</p>
                  <p className="text-xl font-bold text-blue-400">
                    {salesData.length > 0 ? formatPiasters(totalSalesAmount / salesData.length) : '0 ج.م'}
                  </p>
                </div>
              </div>

              {/* Sales List */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-dark-border">
                  <h3 className="text-sm font-bold text-white">سجل المبيعات</h3>
                </div>
                {salesData.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center">
                    <span className="text-4xl block mb-3">🛒</span>
                    <p className="text-gray-400">لا توجد مبيعات في هذه الفترة</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards */}
                    <div className="sm:hidden divide-y divide-dark-border">
                      {salesData.map(sale => (
                        <div key={sale.id} className="p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="text-sm font-medium text-white">{sale.invoiceNumber}</p>
                              <p className="text-xs text-gray-500">{sale.branch.name}</p>
                            </div>
                            <p className="text-sm font-bold text-green-400">{formatPiasters(sale.finalTotalPiasters)}</p>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {sale.items.slice(0, 3).map(item => (
                              <span key={item.id} className="text-xs bg-dark px-2 py-0.5 rounded text-gray-400">
                                {item.product.nameAr || item.product.name} ×{item.quantity}
                              </span>
                            ))}
                            {sale.items.length > 3 && (
                              <span className="text-xs text-gray-500">+{sale.items.length - 3} أخرى</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-2">
                            {new Date(sale.createdAt).toLocaleDateString('ar-EG')} {new Date(sale.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-dark">
                          <tr>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">رقم الفاتورة</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">الفرع</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">المنتجات</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">الإجمالي</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {salesData.map(sale => (
                            <tr key={sale.id} className="border-t border-dark-border hover:bg-dark-hover transition-colors">
                              <td className="py-3 px-4">
                                <span className="text-sm font-mono text-white">{sale.invoiceNumber}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-sm text-gray-300">{sale.branch.name}</span>
                              </td>
                              <td className="py-3 px-4">
                                <div className="flex flex-wrap gap-1">
                                  {sale.items.slice(0, 2).map(item => (
                                    <span key={item.id} className="text-xs bg-dark px-2 py-0.5 rounded text-gray-400">
                                      {item.product.nameAr || item.product.name} ×{item.quantity}
                                    </span>
                                  ))}
                                  {sale.items.length > 2 && (
                                    <span className="text-xs text-gray-500">+{sale.items.length - 2}</span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-sm font-medium text-green-400">{formatPiasters(sale.finalTotalPiasters)}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-sm text-gray-400">
                                  {new Date(sale.createdAt).toLocaleDateString('ar-EG')}
                                </span>
                                <span className="text-xs text-gray-500 mr-1">
                                  {new Date(sale.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                </span>
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

          {/* Expenses Tab */}
          {activeTab === 'expenses' && expensesData && (
            <div className="space-y-4 sm:space-y-6">
              {/* Expense Summary */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">إجمالي المصروفات</p>
                  <p className="text-xl font-bold text-red-400">{formatPiasters(expensesData.total)}</p>
                </div>
                <div className="bg-dark-card border border-dark-border rounded-xl p-4">
                  <p className="text-xs text-gray-400 mb-1">عدد المصروفات</p>
                  <p className="text-xl font-bold text-white">{expensesData.expenses.length}</p>
                </div>
              </div>

              {/* Category Chart */}
              {expenseCategoryData.length > 0 && (
                <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-6">
                  <h3 className="text-sm sm:text-base font-bold text-white mb-4">المصروفات حسب الفئة</h3>
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <ResponsiveContainer width="100%" height={200}>
                      <PieChart>
                        <Pie
                          data={expenseCategoryData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={75}
                          paddingAngle={5}
                          dataKey="value"
                        >
                          {expenseCategoryData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#141414', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                          formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2">
                      {expenseCategoryData.map((cat, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-dark rounded-lg">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }}></div>
                            <span className="text-sm text-gray-300">{cat.name}</span>
                          </div>
                          <div className="text-left">
                            <span className="text-sm font-medium text-white">{formatPiasters(cat.value * 100)}</span>
                            <span className="text-xs text-gray-500 mr-2">({cat.count})</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Expenses List */}
              <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                <div className="p-4 border-b border-dark-border">
                  <h3 className="text-sm font-bold text-white">سجل المصروفات</h3>
                </div>
                {expensesData.expenses.length === 0 ? (
                  <div className="p-8 sm:p-12 text-center">
                    <span className="text-4xl block mb-3">💸</span>
                    <p className="text-gray-400">لا توجد مصروفات في هذه الفترة</p>
                  </div>
                ) : (
                  <>
                    {/* Mobile Cards */}
                    <div className="sm:hidden divide-y divide-dark-border">
                      {expensesData.expenses.map(expense => (
                        <div key={expense.id} className="p-4">
                          <div className="flex items-start justify-between mb-1">
                            <div>
                              <p className="text-sm font-medium text-white">{expense.description}</p>
                              <p className="text-xs text-gray-500">{expense.branch.name}</p>
                            </div>
                            <p className="text-sm font-bold text-red-400">{formatPiasters(expense.amountPiasters)}</p>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs bg-dark px-2 py-0.5 rounded text-gray-400">{expense.category}</span>
                            <span className="text-xs text-gray-500">
                              {new Date(expense.createdAt).toLocaleDateString('ar-EG')}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden sm:block overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-dark">
                          <tr>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">الوصف</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">الفئة</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">الفرع</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">المبلغ</th>
                            <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {expensesData.expenses.map(expense => (
                            <tr key={expense.id} className="border-t border-dark-border hover:bg-dark-hover transition-colors">
                              <td className="py-3 px-4">
                                <span className="text-sm text-white">{expense.description}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-xs bg-dark px-2 py-1 rounded text-gray-400">{expense.category}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-sm text-gray-300">{expense.branch.name}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-sm font-medium text-red-400">{formatPiasters(expense.amountPiasters)}</span>
                              </td>
                              <td className="py-3 px-4">
                                <span className="text-sm text-gray-400">
                                  {new Date(expense.createdAt).toLocaleDateString('ar-EG')}
                                </span>
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

          {/* Branches Tab */}
          {activeTab === 'branches' && (
            <div className="space-y-4 sm:space-y-6">
              {branchStats.length === 0 ? (
                <div className="bg-dark-card border border-dark-border rounded-xl p-12 text-center">
                  <span className="text-4xl block mb-3">🏢</span>
                  <p className="text-gray-400">لا توجد بيانات للفروع</p>
                </div>
              ) : (
                <>
                  {/* Branch Comparison Chart */}
                  <div className="bg-dark-card border border-dark-border rounded-xl p-4 sm:p-6">
                    <h3 className="text-sm sm:text-base font-bold text-white mb-4">مقارنة أداء الفروع</h3>
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={branchComparisonData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2A2A" />
                        <XAxis dataKey="name" stroke="#6B7280" fontSize={11} />
                        <YAxis stroke="#6B7280" fontSize={11} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#141414', border: '1px solid #2A2A2A', borderRadius: '8px', fontSize: '12px' }}
                          formatter={(value: number) => [`${value.toFixed(0)} ج.م`]}
                        />
                        <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="إيرادات" />
                        <Bar dataKey="expenses" fill="#EF4444" radius={[4, 4, 0, 0]} name="مصروفات" />
                        <Bar dataKey="profit" fill="#3B82F6" radius={[4, 4, 0, 0]} name="ربح" />
                      </BarChart>
                    </ResponsiveContainer>
                    <div className="flex justify-center gap-4 sm:gap-6 mt-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                        <span className="text-xs text-gray-400">إيرادات</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                        <span className="text-xs text-gray-400">مصروفات</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        <span className="text-xs text-gray-400">ربح</span>
                      </div>
                    </div>
                  </div>

                  {/* Branch Cards - Mobile */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:hidden">
                    {branchStats.map((stat, idx) => (
                      <div key={stat.branch.id} className="bg-dark-card border border-dark-border rounded-xl p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: COLORS[idx % COLORS.length] + '20' }}>
                            <span className="text-lg">🏢</span>
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white">{stat.branch.name}</p>
                            <p className="text-xs text-gray-500">{stat.branch.code}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                            <div>
                              <p className="text-gray-500">الإيرادات</p>
                              <p className="text-green-400 font-medium">{formatPiasters(stat.revenue || 0)}</p>
                            </div>
                          )}
                          {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                            <div>
                              <p className="text-gray-500">المصروفات</p>
                              <p className="text-red-400 font-medium">{formatPiasters(stat.expenses || 0)}</p>
                            </div>
                          )}
                          {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                            <div>
                              <p className="text-gray-500">الربح</p>
                              <p className={`font-medium ${stat.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {formatPiasters(stat.profit || 0)}
                              </p>
                            </div>
                          )}
                          <div>
                            <p className="text-gray-500">الأعضاء</p>
                            <p className="text-white font-medium">{stat.activeMembers}</p>
                          </div>
                          <div>
                            <p className="text-gray-500">الاشتراكات</p>
                            <p className="text-white font-medium">{stat.activeSubscriptions}</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Branch Table - Desktop */}
                  <div className="hidden sm:block bg-dark-card border border-dark-border rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-dark">
                          <tr>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الفرع</th>
                            {hasPermission('VIEW_DASHBOARD_REVENUE') && (
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الإيرادات</th>
                            )}
                            {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">المصروفات</th>
                            )}
                            {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الربح</th>
                            )}
                            {hasPermission('VIEW_DASHBOARD_OUTSTANDING') && (
                              <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">مستحقات</th>
                            )}
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الأعضاء</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">الاشتراكات</th>
                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-400">المبيعات</th>
                          </tr>
                        </thead>
                        <tbody>
                          {branchStats.map((stat, idx) => (
                            <tr key={stat.branch.id} className="border-t border-dark-border hover:bg-dark-hover transition-colors">
                              <td className="px-4 py-3">
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
                                <td className="px-4 py-3 text-sm text-green-400">{formatPiasters(stat.revenue || 0)}</td>
                              )}
                              {hasPermission('VIEW_DASHBOARD_EXPENSES') && (
                                <td className="px-4 py-3 text-sm text-red-400">{formatPiasters(stat.expenses || 0)}</td>
                              )}
                              {hasPermission('VIEW_DASHBOARD_PROFIT') && (
                                <td className="px-4 py-3">
                                  <span className={`text-sm ${stat.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {formatPiasters(stat.profit || 0)}
                                  </span>
                                </td>
                              )}
                              {hasPermission('VIEW_DASHBOARD_OUTSTANDING') && (
                                <td className="px-4 py-3 text-sm text-yellow-400">{formatPiasters(stat.outstanding || 0)}</td>
                              )}
                              <td className="px-4 py-3 text-sm text-white">{stat.activeMembers}</td>
                              <td className="px-4 py-3 text-sm text-white">{stat.activeSubscriptions}</td>
                              <td className="px-4 py-3 text-sm text-gray-300">{stat.salesCount}</td>
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
  );
}
