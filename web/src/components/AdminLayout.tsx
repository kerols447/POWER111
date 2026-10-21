import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface SidebarItem {
  label: string;
  path: string;
  icon: keyof typeof icons;
  permission?: string;
}

// Line icons drawn on a 24x24 grid so every entry in the menu carries the same weight.
const icons = {
  home: ['M3 10.75 12 3.25l9 7.5', 'M5.5 9.5V19a1.5 1.5 0 0 0 1.5 1.5h10A1.5 1.5 0 0 0 18.5 19V9.5', 'M10 20.5v-4.5h4v4.5'],
  branches: ['M4.5 20.5h15', 'M6.5 20.5V4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5v16', 'M10 20.5V16h4v4.5', 'M9.25 7.25h1.5M13.25 7.25h1.5M9.25 11h1.5M13.25 11h1.5'],
  offers: ['M4 10.5h16v9a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-9Z', 'M3 7h18v3.5H3Z', 'M12 7v13.5', 'M12 7a2.3 2.3 0 0 1-3-2.2A2.3 2.3 0 0 1 12 7Zm0 0a2.3 2.3 0 0 0 3-2.2A2.3 2.3 0 0 0 12 7Z'],
  users: ['M15.75 20v-1.8a3.4 3.4 0 0 0-3.4-3.4H6.9a3.4 3.4 0 0 0-3.4 3.4V20', 'M9.5 11.25a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z', 'M18.5 11a3 3 0 1 0-2-5.24', 'M17.5 15.2a3.4 3.4 0 0 1 3.5 3.4V20'],
  member: ['M4.5 20V6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5V20', 'M4.5 20h15', 'M12 5v9.5', 'M8.75 8.5h1.5M13.75 8.5h1.5M9.5 12h5'],
  subscriptions: ['M8.5 4.5h7a1 1 0 0 1 1 1v1H8.5v-1a1 1 0 0 1 1-1Z', 'M6 6.5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V8A1.5 1.5 0 0 1 6 6.5Z', 'M8.5 12h7M8.5 15.5h4.5'],
  attendance: ['M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z', 'M4.5 9.5h15', 'M8 3.5v3M16 3.5v3', 'M9 14l2 2 4-4'],
  staff: ['M4.5 8.5A1.5 1.5 0 0 1 6 7h12a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z', 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7', 'M4.5 12.5h15', 'M10.5 15.5h3'],
  products: ['M12 3.5 20 7.5v9L12 20.5 4 16.5v-9Z', 'M4 7.5 12 11.5l8-4', 'M12 11.5v9'],
  sales: ['M4 7h16v10.5H4Z', 'M4 7l2.5-3h11L21 7', 'M12 10.25a2.75 2.75 0 1 0 0 5.5 2.75 2.75 0 0 0 0-5.5Z'],
  expenses: ['M4.5 8h15a1.5 1.5 0 0 1 1.5 1.5v7A1.5 1.5 0 0 1 19.5 18h-15A1.5 1.5 0 0 1 3 16.5v-7A1.5 1.5 0 0 1 4.5 8Z', 'M3 10.5h18', 'M16.5 14.5h2', 'M6 8V6a1.5 1.5 0 0 1 1.5-1.5h9A1.5 1.5 0 0 1 18 6v2'],
  reports: ['M4 20h16', 'M6.5 20V11M11.5 20V6M16.5 20v-7'],
  whatsapp: ['M4 5.5h16v10.5H9.75L5.5 19.5V16H4Z', 'M8.25 10.75h.01M11.75 10.75h.01M15.25 10.75h.01'],
  settings: ['M4 8.25h8M16.5 8.25h3.5', 'M4 15.75h3.5M12 15.75h8', 'M14 8.25a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Z', 'M6 15.75a2.25 2.25 0 1 0 4.5 0 2.25 2.25 0 0 0-4.5 0Z']
} as const;

function Icon({ name, className }: { name: keyof typeof icons; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// The menu is grouped by what the person at the desk is doing, not by database order.
const menuGroups: { title: string; items: SidebarItem[] }[] = [
  {
    title: 'الرئيسية',
    items: [
      { label: 'الرئيسية', path: '/admin', icon: 'home', permission: 'VIEW_DASHBOARD' }
    ]
  },
  {
    title: 'الأعضاء',
    items: [
      { label: 'الأعضاء', path: '/admin/members', icon: 'member', permission: 'VIEW_MEMBERS' },
      { label: 'الاشتراكات', path: '/admin/subscriptions', icon: 'subscriptions', permission: 'VIEW_SUBSCRIPTIONS' },
      { label: 'العروض', path: '/admin/offers', icon: 'offers', permission: 'VIEW_BRANCHES' }
    ]
  },
  {
    title: 'الوردية اليومية',
    items: [
      { label: 'الحضور', path: '/admin/attendance', icon: 'attendance', permission: 'VIEW_ATTENDANCE' },
      { label: 'الموظفين', path: '/admin/staff', icon: 'staff', permission: 'VIEW_ATTENDANCE' },
      { label: 'المنتجات', path: '/admin/products', icon: 'products', permission: 'VIEW_PRODUCTS' },
      { label: 'المبيعات', path: '/admin/sales', icon: 'sales', permission: 'VIEW_SALES' },
      { label: 'المصروفات', path: '/admin/expenses', icon: 'expenses', permission: 'VIEW_EXPENSES' }
    ]
  },
  {
    title: 'الإدارة',
    items: [
      { label: 'التقارير', path: '/admin/reports', icon: 'reports', permission: 'VIEW_REPORTS' },
      { label: 'رسائل واتساب', path: '/admin/whatsapp', icon: 'whatsapp', permission: 'VIEW_REPORTS' },
      { label: 'الفروع', path: '/admin/branches', icon: 'branches', permission: 'VIEW_BRANCHES' },
      { label: 'المستخدمين', path: '/admin/users', icon: 'users', permission: 'VIEW_USERS' },
      { label: 'الإعدادات', path: '/admin/settings', icon: 'settings', permission: 'MANAGE_SETTINGS' }
    ]
  }
];

const roleLabels: Record<string, string> = {
  OWNER: 'مالك',
  BRANCH_MANAGER: 'مدير فرع',
  RECEPTIONIST: 'موظف استقبال',
  ACCOUNTANT: 'محاسب',
  TRAINER: 'مدرب',
  CONTENT_MANAGER: 'مدير محتوى'
};

const AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const AR_DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

function todayLabel(withWeekday: boolean) {
  const d = new Date();
  const date = `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return withWeekday ? `${AR_DAYS[d.getDay()]} ${date}` : date;
}

function clockLabel() {
  return new Date().toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
}

function daysUntilExpiry(value: string | number | Date): string {
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return 'ينتهي اليوم';
  if (days === 1) return 'غداً';
  return `بعد ${days} أيام`;
}

interface ExpiringItem {
  id: string;
  endDate: string;
  member: { name: string; code: string };
}

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [alerts, setAlerts] = useState<ExpiringItem[]>([]);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [clock, setClock] = useState(clockLabel);
  const alertsRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, hasPermission, logout } = useAuth();

  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setSidebarOpen(true);
      else setSidebarOpen(false);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  useEffect(() => {
    if (isMobile) setSidebarOpen(false);
    setAlertsOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const id = window.setInterval(() => setClock(clockLabel()), 30000);
    return () => window.clearInterval(id);
  }, []);

  // The bell only ever carries something the owner has to act on today or tomorrow.
  useEffect(() => {
    if (!hasPermission('VIEW_SUBSCRIPTIONS')) return;
    let active = true;
    fetch('/api/subscriptions/expiring?days=2', { credentials: 'include' })
      .then(res => (res.ok ? res.json() : []))
      .then(data => { if (active) setAlerts(Array.isArray(data) ? data : []); })
      .catch(() => {});
    return () => { active = false; };
  }, [location.pathname]);

  useEffect(() => {
    if (!alertsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (alertsRef.current && !alertsRef.current.contains(e.target as Node)) setAlertsOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAlertsOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [alertsOpen]);

  const groups = menuGroups
    .map(group => ({ ...group, items: group.items.filter(item => !item.permission || hasPermission(item.permission)) }))
    .filter(group => group.items.length > 0);

  const currentPage = menuGroups.flatMap(g => g.items).find(item => location.pathname === item.path);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include'
      });
      logout();
      navigate('/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const handleNavigate = (path: string) => {
    navigate(path);
    if (isMobile) setSidebarOpen(false);
  };

  return (
    <div className="h-screen bg-dark flex overflow-hidden" style={{ height: '100dvh' }}>
      {/* Mobile Overlay */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`${
          isMobile
            ? `fixed top-0 right-0 h-full w-72 max-w-[85vw] z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'} shadow-2xl shadow-black/50`
            : sidebarOpen ? 'w-60' : 'w-[74px]'
        } bg-dark-card border-l border-white/10 flex flex-col transition-[width] duration-200`}
      >
        {/* Logo */}
        <div className={`p-4 border-b border-white/10 ${sidebarOpen ? '' : 'lg:px-2'}`}>
          <div className="flex items-center gap-3">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-10 h-10 rounded-xl object-cover shrink-0 ring-1 ring-yellow-500/30" />
            {sidebarOpen && (
              <div className="min-w-0">
                <h1 className="text-lg font-extrabold text-white truncate">POWER <span style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>111</span></h1>
                <p className="text-[11px] text-gray-500 leading-tight">إدارة النادى</p>
              </div>
            )}
          </div>
        </div>

        {/* Menu, grouped by the work each screen is for */}
        <nav className="flex-1 min-h-0 p-3 overflow-y-auto">
          {groups.map((group, groupIdx) => (
            <div key={group.title} className={groupIdx > 0 ? 'mt-4 pt-4 border-t border-white/5' : ''}>
              {sidebarOpen ? (
                <p className="px-3 mb-1.5 text-[10px] font-bold text-gray-600">{group.title}</p>
              ) : (
                <span className="block mx-3 mb-2 h-px bg-white/5" aria-hidden="true" />
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = location.pathname === item.path;
                  return (
                    <button
                      key={item.path}
                      onClick={() => handleNavigate(item.path)}
                      title={sidebarOpen ? undefined : item.label}
                      aria-current={active ? 'page' : undefined}
                      className={`w-full flex items-center gap-3 rounded-xl transition-colors text-sm min-h-[44px] ${
                        sidebarOpen ? 'px-3 py-2.5' : 'justify-center px-0 py-2.5'
                      } ${
                        active
                          ? 'text-black font-bold shadow-lg shadow-black/20'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white'
                      }`}
                      style={active ? { background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' } : undefined}
                    >
                      <Icon name={item.icon} className="w-5 h-5 shrink-0" />
                      {sidebarOpen && <span className="font-medium truncate">{item.label}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-white/10">
          {sidebarOpen ? (
            <div className="flex items-center gap-3 mb-2 px-1">
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary shrink-0">
                {(user?.name || 'م').trim().charAt(0)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white truncate">{user?.name || 'المستخدم'}</p>
                <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center mb-2">
              <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-sm font-bold text-primary">
                {(user?.name || 'م').trim().charAt(0)}
              </div>
            </div>
          )}
          {user?.role && sidebarOpen && (
            <span className="block mb-2 text-center text-[11px] px-2 py-1 rounded-lg font-semibold" style={{ backgroundColor: 'rgba(245,158,11,0.08)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.18)' }}>
              {roleLabels[user.role] || user.role}
            </span>
          )}
          <button
            onClick={handleLogout}
            title={sidebarOpen ? undefined : 'تسجيل الخروج'}
            className={`w-full flex items-center gap-3 min-h-11 py-2.5 text-gray-400 hover:text-red-400 hover:bg-red-500/5 rounded-xl transition-colors text-sm ${
              sidebarOpen ? 'px-3' : 'justify-center px-0'
            }`}
          >
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15.5 5.5h2A2.5 2.5 0 0 1 20 8v8a2.5 2.5 0 0 1-2.5 2.5h-2" />
              <path d="M10.5 16l4-4-4-4M14.5 12H4" />
            </svg>
            {sidebarOpen && <span>تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-dark-card/95 backdrop-blur border-b border-white/10 px-3 sm:px-5 h-14 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={sidebarOpen ? 'تصغير القائمة' : 'تكبير القائمة'}
              className="text-gray-400 hover:text-white hover:bg-white/5 transition-colors p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <h2 className="text-[15px] sm:text-base font-bold text-white truncate">{currentPage?.label || 'لوحة التحكم'}</h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Clock */}
            <span className="hidden md:flex items-center gap-1.5 text-[13px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 tabular-nums">
              <svg className="w-4 h-4 text-primary/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5V12l3 2" />
              </svg>
              {clock}
            </span>

            {/* Date */}
            <span className="flex items-center gap-2 text-xs sm:text-[13px] text-gray-400 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5">
              <svg className="w-4 h-4 text-primary/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z" />
                <path d="M4.5 9.5h15M8 3.5v3M16 3.5v3" />
              </svg>
              {todayLabel(!isMobile)}
            </span>

            {/* What needs action today */}
            {hasPermission('VIEW_SUBSCRIPTIONS') && (
              <div className="relative" ref={alertsRef}>
                <button
                  onClick={() => setAlertsOpen(open => !open)}
                  aria-label={alerts.length > 0 ? `${alerts.length} اشتراك يحتاج تجديد` : 'لا اشتراكات تحتاج تجديد'}
                  aria-expanded={alertsOpen}
                  className="relative text-gray-400 hover:text-white hover:bg-white/5 transition-colors p-2 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9a6 6 0 0 1 12 0c0 5 1.5 6.5 1.5 6.5h-15S6 14 6 9Z" />
                    <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
                  </svg>
                  {alerts.length > 0 && (
                    <span className="absolute top-1 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold text-black flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' }}>
                      {alerts.length}
                    </span>
                  )}
                </button>

                {alertsOpen && (
                  <div className="absolute left-0 mt-2 w-[290px] max-w-[86vw] bg-dark-card border border-white/10 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-40">
                    <p className="px-4 py-3 text-[13px] font-bold text-white border-b border-white/10">يحتاج تجديد قريباً</p>
                    {alerts.length > 0 ? (
                      <>
                        <ul className="max-h-[280px] overflow-y-auto divide-y divide-white/5">
                          {alerts.slice(0, 8).map(item => (
                            <li key={item.id}>
                              <button
                                onClick={() => navigate('/admin/subscriptions')}
                                className="w-full text-right px-4 py-3 hover:bg-white/5 transition-colors"
                              >
                                <p className="text-[13px] font-semibold text-white truncate">{item.member.name}</p>
                                <p className="text-[11px] text-amber-400 mt-0.5">{daysUntilExpiry(item.endDate)}</p>
                              </button>
                            </li>
                          ))}
                        </ul>
                        <button
                          onClick={() => navigate('/admin/subscriptions')}
                          className="w-full px-4 py-3 text-[13px] font-bold text-primary hover:bg-primary/5 transition-colors border-t border-white/10"
                        >
                          كل الاشتراكات
                        </button>
                      </>
                    ) : (
                      <p className="px-4 py-6 text-[13px] text-gray-500 text-center">مفيش اشتراك محتاج تجديد دلوقتي</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Who is signed in */}
            <div
              title={user?.email}
              className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg pl-3 pr-1.5 py-1.5 min-h-[40px]"
            >
              <div className="min-w-0 hidden sm:block text-right">
                <p className="text-[13px] font-semibold text-white truncate max-w-[130px]">{user?.name || 'المستخدم'}</p>
                <p className="text-[10px] text-gray-500 truncate">{user?.role ? roleLabels[user.role] : ''}</p>
              </div>
              <span className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-[13px] font-bold text-primary shrink-0">
                {(user?.name || 'م').trim().charAt(0)}
              </span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-5 lg:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
