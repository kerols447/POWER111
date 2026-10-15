import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface SidebarItem {
  label: string;
  path: string;
  icon: string;
  permission?: string;
}

const allMenuItems: SidebarItem[] = [
  { label: 'الرئيسية', path: '/admin', icon: '🏠', permission: 'VIEW_DASHBOARD' },
  { label: 'الفروع', path: '/admin/branches', icon: '🏢', permission: 'VIEW_BRANCHES' },
  { label: 'العروض', path: '/admin/offers', icon: '🎁', permission: 'VIEW_BRANCHES' },
  { label: 'المستخدمين', path: '/admin/users', icon: '👤', permission: 'VIEW_USERS' },
  { label: 'الأعضاء', path: '/admin/members', icon: '', permission: 'VIEW_MEMBERS' },
  { label: 'الاشتراكات', path: '/admin/subscriptions', icon: '📋', permission: 'VIEW_SUBSCRIPTIONS' },
  { label: 'الحضور', path: '/admin/attendance', icon: '✅', permission: 'VIEW_ATTENDANCE' },
  { label: 'الموظفين', path: '/admin/staff', icon: '💼', permission: 'VIEW_ATTENDANCE' },
  { label: 'المنتجات', path: '/admin/products', icon: '📦', permission: 'VIEW_PRODUCTS' },
  { label: 'المبيعات', path: '/admin/sales', icon: '💰', permission: 'VIEW_SALES' },
  { label: 'المصروفات', path: '/admin/expenses', icon: '💸', permission: 'VIEW_EXPENSES' },
  { label: 'التقارير', path: '/admin/reports', icon: '📊', permission: 'VIEW_REPORTS' },
  { label: 'رسائل واتساب', path: '/admin/whatsapp', icon: '💬', permission: 'VIEW_REPORTS' },
  { label: 'الإعدادات', path: '/admin/settings', icon: '⚙️', permission: 'MANAGE_SETTINGS' }
];

const roleLabels: Record<string, string> = {
  OWNER: 'مالك',
  BRANCH_MANAGER: 'مدير فرع',
  RECEPTIONIST: 'موظف استقبال',
  ACCOUNTANT: 'محاسب',
  TRAINER: 'مدرب',
  CONTENT_MANAGER: 'مدير محتوى'
};

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
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
  }, [location.pathname]);

  const menuItems = allMenuItems.filter(item => {
    if (!item.permission) return true;
    return hasPermission(item.permission);
  });

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
    <div className="min-h-screen bg-dark flex">
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
            ? `fixed top-0 right-0 h-full z-50 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : 'translate-x-full'}`
            : sidebarOpen ? 'w-64' : 'w-20'
        } w-64 bg-dark-card border-l border-white/10 flex flex-col`}
      >
        {/* Logo */}
        <div className="p-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-10 h-10 rounded-lg object-cover shrink-0 ring-1 ring-yellow-500/30" />
            <div className="min-w-0">
              <h1 className="text-lg font-black text-white truncate">POWER <span style={{ background: 'linear-gradient(135deg, #FCD34D, #F59E0B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>111</span></h1>
              <p className="text-xs text-gray-500">لوحة التحكم</p>
            </div>
          </div>
        </div>

        {/* Menu */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {menuItems.map((item) => (
            <button
              key={item.path}
              onClick={() => handleNavigate(item.path)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 text-sm ${
                location.pathname === item.path
                  ? 'text-black font-bold shadow-lg'
                  : 'text-gray-300 hover:bg-white/5 hover:text-white'
              }`}
              style={location.pathname === item.path ? { background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' } : undefined}
            >
              <span className="text-lg shrink-0">{item.icon}</span>
              <span className="font-medium truncate">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User info */}
        <div className="p-3 border-t border-white/10">
          <div className="mb-2">
            <p className="text-sm font-medium text-white truncate">{user?.name || 'المستخدم'}</p>
            <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            {user?.role && (
              <span className="inline-block mt-1 text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>
                {roleLabels[user.role] || user.role}
              </span>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-xl transition-colors text-sm"
          >
            <span className="text-lg">🚪</span>
            <span>تسجيل الخروج</span>
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-dark-card border-b border-white/10 px-4 py-3 flex items-center justify-between sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-300 hover:text-white transition-colors p-2 -m-1 min-h-10 min-w-10 flex items-center justify-center"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs sm:text-sm text-gray-400 hidden sm:block">
              {new Date().toLocaleDateString('ar-EG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
              })}
            </span>
            <span className="text-xs sm:text-sm text-gray-400 sm:hidden">
              {new Date().toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' })}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-3 sm:p-6 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export default AdminLayout;
