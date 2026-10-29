import { useState, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import AssistantWidget from './AssistantWidget';
import { PageTransition } from './Motion';
import { whatsappLink } from '../utils/whatsapp';
import { GOLD, GOLD_DEEP, GOLD_LIGHT, GOLD_SURFACE } from './ui';

// The same number the landing page and the member portal hand out, kept in one place here.
const SUPPORT_PHONE = '01280368119';
const SUPPORT_LINK = whatsappLink(SUPPORT_PHONE, 'محتاج دعم في نظام POWER 111') || `tel:${SUPPORT_PHONE}`;

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
  physio: ['M12 20.5s-7.5-4.7-7.5-10a4.5 4.5 0 0 1 7.5-3.3 4.5 4.5 0 0 1 7.5 3.3c0 5.3-7.5 10-7.5 10Z', 'M4.5 12.5h3l1.5-2.5 2.5 5 2-2.5h4'],
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
      { label: 'المصروفات', path: '/admin/expenses', icon: 'expenses', permission: 'VIEW_EXPENSES' },
      { label: 'جلسات العلاج الطبيعي', path: '/admin/physio', icon: 'physio', permission: 'VIEW_PHYSIO' }
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

function todayLabel(style: 'full' | 'withWeekday' | 'short') {
  const d = new Date();
  const date = `${d.getDate()} ${AR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  if (style === 'short') return `${d.getDate()} ${AR_MONTHS[d.getMonth()]}`;
  return style === 'withWeekday' ? `${AR_DAYS[d.getDay()]} ${date}` : date;
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
  // Renewal only happens on the member's own page, so the bell needs his id to jump there.
  member: { id: string; name: string; code: string };
}

interface PhysioItem {
  id: string;
  requestedDate: string;
  member: { person: { name: string } };
}

function sessionDayLabel(value: string | number | Date): string {
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days <= 0) return 'الجلسة النهاردة';
  if (days === 1) return 'الجلسة بكرة';
  return `الجلسة بعد ${days} يوم`;
}

// The bell is read per device, and what makes it light up again is a subscription he has
// not looked at yet — not the same list coming back on every page change.
const ALERTS_SEEN_KEY = 'power111AlertsSeen';

function readSeenAlerts(): Record<string, string> {
  try {
    const raw = localStorage.getItem(ALERTS_SEEN_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [alerts, setAlerts] = useState<ExpiringItem[]>([]);
  const [physioAlerts, setPhysioAlerts] = useState<PhysioItem[]>([]);
  const [unseenAlerts, setUnseenAlerts] = useState(0);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [clock, setClock] = useState(clockLabel);
  const alertsRef = useRef<HTMLDivElement>(null);
  const seenAlertsRef = useRef<Record<string, string>>(readSeenAlerts());
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

  // The bell only ever carries something the owner has to act on today or tomorrow,
  // plus physio session requests waiting for the gym's decision.
  useEffect(() => {
    if (!hasPermission('VIEW_SUBSCRIPTIONS') && !hasPermission('VIEW_PHYSIO')) return;
    let active = true;
    if (hasPermission('VIEW_SUBSCRIPTIONS')) {
      fetch('/api/subscriptions/expiring?days=2', { credentials: 'include' })
        .then(res => (res.ok ? res.json() : []))
        .then(data => {
          if (active) setAlerts(Array.isArray(data) ? data : []);
        })
        .catch(() => {});
    }
    if (hasPermission('VIEW_PHYSIO')) {
      fetch('/api/physio?status=PENDING', { credentials: 'include' })
        .then(res => (res.ok ? res.json() : []))
        .then(data => {
          if (active) setPhysioAlerts(Array.isArray(data) ? data : []);
        })
        .catch(() => {});
    }
    return () => { active = false; };
  }, [location.pathname, hasPermission]);

  useEffect(() => {
    const subsUnseen = alerts.filter(item => seenAlertsRef.current[item.id] !== item.endDate).length;
    const physioUnseen = physioAlerts.filter(item => seenAlertsRef.current[`physio:${item.id}`] !== 'PENDING').length;
    setUnseenAlerts(subsUnseen + physioUnseen);
  }, [alerts, physioAlerts]);

  // Opening the list once reads everything in it; a renewal that pushes a date back, or a
  // new member entering the window, is what lights it up again.
  const toggleAlerts = () => {
    const next = !alertsOpen;
    if (next) {
      const seen: Record<string, string> = {};
      alerts.forEach(item => { seen[item.id] = item.endDate; });
      physioAlerts.forEach(item => { seen[`physio:${item.id}`] = 'PENDING'; });
      seenAlertsRef.current = seen;
      try {
        localStorage.setItem(ALERTS_SEEN_KEY, JSON.stringify(seen));
      } catch {
        // A private-mode browser keeps the read state for this session only.
      }
      setUnseenAlerts(0);
    }
    setAlertsOpen(next);
  };

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

  // Escape closes the phone drawer, the same way it closes every other overlay.
  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isMobile, sidebarOpen]);

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
      {/* Backdrop: the page behind the drawer is out of reach until it is closed */}
      {isMobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/65 z-40 animate-fade-in"
          aria-hidden="true"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — a permanent rail on desktop, a drawer on phones */}
      <aside
        className={`bg-dark-nav border-l border-white/[0.08] flex flex-col ${
          isMobile
            // visibility is part of the transition so the panel still slides away, then leaves
            // the tab order — a closed drawer you can tab into is a trap on a phone.
            ? `fixed top-0 right-0 h-full w-72 max-w-[85vw] z-50 shadow-2xl shadow-black/60 transition-[transform,visibility] duration-[260ms] ease-[cubic-bezier(.16,.84,.44,1)] ${sidebarOpen ? 'translate-x-0 visible' : 'translate-x-full invisible'}`
            : `relative transition-[width] duration-200 ${sidebarOpen ? 'w-60' : 'w-[74px]'}`
        }`}
        role={isMobile ? 'dialog' : undefined}
        aria-modal={isMobile ? 'true' : undefined}
        aria-label={isMobile ? 'قائمة التنقل' : undefined}
      >
        {/* The brand edge: one gold hairline down the seam the content starts from */}
        <div aria-hidden="true" className="absolute inset-y-0 left-0 w-px" style={{ background: `linear-gradient(180deg, ${GOLD}55, transparent 55%)` }} />

        {/* Phone: the drawer's own way out, kept off the brand card */}
        {isMobile && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="إغلاق القائمة"
            className="absolute top-3 left-3 z-10 w-11 h-11 rounded-xl grid place-items-center text-gray-400 hover:text-white hover:bg-white/5 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
              <path d="m6.5 6.5 11 11M17.5 6.5l-11 11" />
            </svg>
          </button>
        )}

        {/* Logo — the original artwork, inside the gold-edged card the brand opens with */}
        <div className={`p-3 border-b border-white/[0.08] ${sidebarOpen ? '' : 'px-2'}`}>
          <div
            className={`relative overflow-hidden rounded-2xl border border-primary/25 bg-black/45 ${
              sidebarOpen ? 'px-3 py-3.5 flex flex-col items-center gap-1.5 text-center' : 'py-2 flex items-center justify-center'
            }`}
          >
            <span aria-hidden="true" className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${GOLD}99, transparent)` }} />
            <img src="/power-logo.jpg" alt="POWER 111" className="w-11 h-11 rounded-xl object-cover shrink-0 ring-1 ring-primary/30" />
            {sidebarOpen ? (
              <>
                <h1 className="text-[15px] font-extrabold text-white leading-none mt-1">POWER <span className="text-primary">111</span></h1>
                <p className="text-[10.5px] text-gray-500 leading-none">إدارة النادى</p>
              </>
            ) : (
              <h1 className="sr-only">POWER 111</h1>
            )}
          </div>
        </div>

        {/* Menu, grouped by the work each screen is for */}
        <nav className="flex-1 min-h-0 p-3 overflow-y-auto overscroll-contain">
          {groups.map((group, groupIdx) => (
            <div key={group.title} className={groupIdx > 0 ? 'mt-5 pt-4 border-t border-white/[0.06]' : ''}>
              {sidebarOpen ? (
                <p className="flex items-center gap-1.5 px-3 mb-2 text-[10.5px] font-bold text-gray-600">
                  <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: `${GOLD}99` }} />
                  {group.title}
                </p>
              ) : (
                <span className="block mx-3 mb-2 h-px bg-white/[0.06]" aria-hidden="true" />
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
                      className={`group relative w-full flex items-center gap-3 rounded-xl text-sm min-h-[44px] transition-[background-color,color,box-shadow,transform] duration-200 ${
                        sidebarOpen ? 'px-3 py-2.5' : 'justify-center px-0 py-2.5'
                      } ${
                        active
                          ? 'text-black font-extrabold shadow-md shadow-black/30 active:scale-[.99]'
                          : 'text-gray-400 hover:bg-white/5 hover:text-white active:bg-white/[0.08]'
                      }`}
                      style={active ? { background: `linear-gradient(100deg, ${GOLD_LIGHT}, ${GOLD_DEEP})` } : undefined}
                    >
                      <Icon name={item.icon} className={`w-5 h-5 shrink-0 ${active ? '' : 'transition-colors duration-200'}`} />
                      {sidebarOpen && (
                        <>
                          <span className={`flex-1 min-w-0 text-right truncate ${active ? 'font-bold' : 'font-medium'}`}>{item.label}</span>
                          {/* The arrow points at the content the item opens, and it is there on every row */}
                          <svg
                            className={`w-3.5 h-3.5 shrink-0 transition-colors duration-200 ${active ? 'text-black/65' : 'text-gray-700 group-hover:text-gray-400'}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="m14.5 5.5-7 6.5 7 6.5" />
                          </svg>
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Support and the way out — reachable from every screen, in every group */}
        <div className="p-3 border-t border-white/[0.06] bg-black/25 space-y-2">
          {sidebarOpen && (
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3">
              <div className="flex items-center gap-2.5">
                <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ backgroundColor: GOLD_SURFACE, color: GOLD }}>
                  <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 13.5V12a7 7 0 0 1 14 0v1.5" />
                    <path d="M3.75 14.25A1.75 1.75 0 0 1 5.5 12.5h.75v5H5.5a1.75 1.75 0 0 1-1.75-1.75Z" />
                    <path d="M20.25 14.25A1.75 1.75 0 0 0 18.5 12.5h-.75v5h.75a1.75 1.75 0 0 0 1.75-1.75Z" />
                    <path d="M17.75 18.25c0 1.24-1.23 2.25-2.75 2.25" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[11px] text-gray-500 leading-none">الدعم الفني</p>
                  <a
                    href={SUPPORT_LINK}
                    target="_blank"
                    rel="noreferrer"
                    dir="ltr"
                    className="mt-1.5 block text-[13px] font-bold text-white truncate hover:text-primary transition-colors"
                  >
                    {SUPPORT_PHONE}
                  </a>
                </div>
              </div>
              <a
                href={SUPPORT_LINK}
                target="_blank"
                rel="noreferrer"
                className="mt-2.5 flex items-center justify-center gap-2 w-full min-h-[40px] rounded-xl border font-bold text-[12.5px] transition-[background-color,border-color] duration-200 hover:bg-primary/10"
                style={{ color: GOLD, borderColor: 'rgba(255,198,41,0.35)' }}
              >
                تواصل معنا
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.5 4.5 3.75 11l6.7 2.6L13 20.5l7.5-16Z" />
                  <path d="M10.45 13.6 20.5 4.5" />
                </svg>
              </a>
            </div>
          )}
          {/* In the narrow rail support stays one tap away, icon only */}
          {!sidebarOpen && (
            <a
              href={SUPPORT_LINK}
              target="_blank"
              rel="noreferrer"
              title={`الدعم الفني ${SUPPORT_PHONE}`}
              aria-label={`الدعم الفني على ${SUPPORT_PHONE}`}
              className="w-full flex justify-center"
            >
              <span className="w-9 h-9 rounded-xl grid place-items-center transition-colors hover:bg-primary/10" style={{ backgroundColor: GOLD_SURFACE, color: GOLD }}>
                <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 13.5V12a7 7 0 0 1 14 0v1.5" />
                  <path d="M3.75 14.25A1.75 1.75 0 0 1 5.5 12.5h.75v5H5.5a1.75 1.75 0 0 1-1.75-1.75Z" />
                  <path d="M20.25 14.25A1.75 1.75 0 0 0 18.5 12.5h-.75v5h.75a1.75 1.75 0 0 0 1.75-1.75Z" />
                  <path d="M17.75 18.25c0 1.24-1.23 2.25-2.75 2.25" />
                </svg>
              </span>
            </a>
          )}

          {sidebarOpen ? (
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-white/[0.06] bg-white/[0.025]">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-extrabold text-black shrink-0"
                style={{ background: `linear-gradient(140deg, ${GOLD_LIGHT}, ${GOLD_DEEP})` }}
              >
                {(user?.name || 'م').trim().charAt(0)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-[13px] font-bold text-white truncate">{user?.name || 'المستخدم'}</p>
                  {user?.role && (
                    <span className="shrink-0 text-[9.5px] font-bold px-1.5 py-0.5 rounded-md" style={{ backgroundColor: GOLD_SURFACE, color: GOLD }}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>
          ) : (
            <div className="flex justify-center">
              <div
                className="w-9 h-9 rounded-xl flex items-center justify-center text-[13px] font-extrabold text-black"
                style={{ background: `linear-gradient(140deg, ${GOLD_LIGHT}, ${GOLD_DEEP})` }}
              >
                {(user?.name || 'م').trim().charAt(0)}
              </div>
            </div>
          )}
          <button
            onClick={handleLogout}
            title={sidebarOpen ? undefined : 'تسجيل الخروج'}
            className={`w-full flex items-center gap-3 min-h-11 py-2.5 text-gray-400 hover:text-rose-400 hover:bg-rose-500/5 rounded-xl transition-colors text-sm ${
              sidebarOpen ? 'px-3' : 'justify-center px-0'
            }`}
          >
            {sidebarOpen && <span className="flex-1 text-right font-semibold">تسجيل الخروج</span>}
            <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15.5 5.5h2A2.5 2.5 0 0 1 20 8v8a2.5 2.5 0 0 1-2.5 2.5h-2" />
              <path d="M10.5 16l4-4-4-4M14.5 12H4" />
            </svg>
            {!sidebarOpen && <span className="sr-only">تسجيل الخروج</span>}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="bg-dark-nav/85 backdrop-blur-md border-b border-white/[0.06] px-2 sm:px-4 h-[54px] flex items-center justify-between gap-2 sm:gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              aria-label={isMobile ? (sidebarOpen ? 'إغلاق القائمة' : 'فتح القائمة') : (sidebarOpen ? 'تصغير القائمة' : 'تكبير القائمة')}
              aria-expanded={sidebarOpen}
              className="text-gray-400 hover:text-white hover:bg-white/[0.06] active:bg-white/[0.08] transition-colors p-2 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24" strokeLinecap="round">
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            {/* The brand stays on the phone header while the menu lives in the drawer */}
            {isMobile && (
              <img src="/power-logo.jpg" alt="POWER 111" className="w-8 h-8 rounded-lg object-cover shrink-0 ring-1 ring-primary/25" />
            )}
            <span aria-hidden="true" className="w-[3px] h-5 rounded-full shrink-0" style={{ backgroundColor: GOLD }} />
            <div className="min-w-0 flex flex-col gap-1">
              <h2 className="text-[15px] sm:text-[16px] font-extrabold text-white leading-none truncate">{currentPage?.label || 'لوحة التحكم'}</h2>
              {/* Under 640 the date drops below the title, where the phone has room for both */}
              <span className="flex sm:hidden items-center gap-1 text-[10.5px] text-gray-500 leading-none">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
                  <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z" />
                  <path d="M4.5 9.5h15M8 3.5v3M16 3.5v3" />
                </svg>
                {todayLabel('short')}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-2.5 shrink-0">
            {/* Date and time on one quiet ruled line, exactly as the reference header carries them */}
            <span className="hidden sm:flex items-center gap-2.5 pe-1 text-[12.5px] text-gray-400">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.6} strokeLinecap="round" aria-hidden="true">
                  <path d="M4.5 6.5A1.5 1.5 0 0 1 6 5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19H6a1.5 1.5 0 0 1-1.5-1.5Z" />
                  <path d="M4.5 9.5h15M8 3.5v3M16 3.5v3" />
                </svg>
                {isMobile ? todayLabel('short') : todayLabel('withWeekday')}
              </span>
              <span aria-hidden="true" className="w-px h-4 bg-white/[0.10]" />
              <span className="flex items-center gap-1.5 font-semibold text-gray-300 tabular-nums">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke={GOLD} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7.5V12l3 2" />
                </svg>
                {clock}
              </span>
            </span>

            {/* What needs action today */}
            {(hasPermission('VIEW_SUBSCRIPTIONS') || hasPermission('VIEW_PHYSIO')) && (
              <div className="relative" ref={alertsRef}>
                <button
                  onClick={toggleAlerts}
                  aria-label={unseenAlerts > 0 ? `${unseenAlerts} تنبيه جديد يحتاج تصرف` : 'التنبيهات مقروءة'}
                  aria-expanded={alertsOpen}
                  className={`relative hover:text-white hover:bg-white/[0.06] transition-colors p-2 rounded-xl min-h-[44px] min-w-[44px] flex items-center justify-center ${
                    unseenAlerts > 0 ? 'text-primary' : 'text-gray-400'
                  }`}
                >
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9a6 6 0 0 1 12 0c0 5 1.5 6.5 1.5 6.5h-15S6 14 6 9Z" />
                    <path d="M10 19.5a2.2 2.2 0 0 0 4 0" />
                  </svg>
                  {unseenAlerts > 0 && (
                    <span className="absolute top-1 right-0.5 min-w-[17px] h-[17px] px-1 rounded-full text-[10px] font-bold text-black flex items-center justify-center bg-primary">
                      {unseenAlerts}
                    </span>
                  )}
                </button>

                {alertsOpen && (
                  <div className="absolute left-0 mt-2 w-[290px] max-w-[86vw] bg-dark-elevate border border-white/[0.08] rounded-2xl shadow-2xl shadow-black/60 overflow-hidden z-40 animate-fade-in">
                    {alerts.length === 0 && physioAlerts.length === 0 ? (
                      <p className="px-4 py-6 text-[13px] text-gray-500 text-center">مفيش حاجة محتاجة تصرف دلوقتي</p>
                    ) : (
                      <>
                        {hasPermission('VIEW_PHYSIO') && physioAlerts.length > 0 && (
                          <>
                            <p className="px-4 py-3 text-[13px] font-bold text-white border-b border-white/[0.08]">طلبات علاج طبيعي مستنياك</p>
                            <ul className="max-h-[280px] overflow-y-auto divide-y divide-white/5">
                              {physioAlerts.slice(0, 8).map(item => (
                                <li key={item.id}>
                                  <button
                                    onClick={() => navigate('/admin/physio')}
                                    className="w-full text-right px-4 py-3 hover:bg-white/5 transition-colors"
                                  >
                                    <p className="text-[13px] font-semibold text-white truncate">{item.member.person.name}</p>
                                    <p className="text-[11px] text-amber-400 mt-0.5">{sessionDayLabel(item.requestedDate)}</p>
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <button
                              onClick={() => navigate('/admin/physio')}
                              className="w-full px-4 py-3 text-[13px] font-bold text-primary hover:bg-primary/5 transition-colors border-t border-white/[0.08]"
                            >
                              كل الجلسات
                            </button>
                          </>
                        )}
                        {hasPermission('VIEW_SUBSCRIPTIONS') && alerts.length > 0 && (
                          <>
                            <p className="px-4 py-3 text-[13px] font-bold text-white border-b border-white/[0.08]">يحتاج تجديد قريباً</p>
                            <ul className="max-h-[280px] overflow-y-auto divide-y divide-white/5">
                              {alerts.slice(0, 8).map(item => (
                                <li key={item.id}>
                                  <button
                                    onClick={() => navigate(`/admin/members/${item.member.id}`)}
                                    className="w-full text-right px-4 py-3 hover:bg-white/5 transition-colors"
                                  >
                                    <p className="text-[13px] font-semibold text-white truncate">{item.member.name}</p>
                                    <p className="text-[11px] text-amber-400 mt-0.5">{daysUntilExpiry(item.endDate)}</p>
                                  </button>
                                </li>
                              ))}
                            </ul>
                            <button
                              onClick={() => navigate('/admin/members?tab=subscriptions')}
                              className="w-full px-4 py-3 text-[13px] font-bold text-primary hover:bg-primary/5 transition-colors border-t border-white/[0.08]"
                            >
                              كل الاشتراكات
                            </button>
                          </>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Who is signed in */}
            <div
              title={user?.email}
              className="hidden sm:flex items-center gap-2 ps-2.5 pe-0.5 min-h-[40px] border-s border-white/[0.08]"
            >
              <div className="min-w-0 hidden sm:block text-right">
                <p className="text-[13px] font-bold text-white truncate max-w-[130px] leading-tight">{user?.name || 'المستخدم'}</p>
                <p className="text-[10px] text-gray-500 truncate leading-tight">{user?.role ? roleLabels[user.role] : ''}</p>
              </div>
              <span
                className="w-8 h-8 rounded-xl flex items-center justify-center text-[13px] font-extrabold text-black shrink-0"
                style={{ background: `linear-gradient(140deg, ${GOLD_LIGHT}, ${GOLD_DEEP})` }}
              >
                {(user?.name || 'م').trim().charAt(0)}
              </span>
            </div>
          </div>
        </header>

        {/* Page content — each route arrives with one short fade and rise */}
        {/* The page behind an open drawer cannot scroll — it is out of reach until it closes */}
        <main
          className="flex-1 p-3 sm:p-5 lg:p-6 pb-[max(0.75rem,env(safe-area-inset-bottom))] overflow-y-auto overscroll-contain"
          style={isMobile && sidebarOpen ? { overflowY: 'hidden' } : undefined}
        >
          <PageTransition key={location.pathname}>
            <Outlet />
          </PageTransition>
        </main>

        {/* The closing strip the reference ends the page with; on a phone the screen is too
            short to spend rows on it, so the drawer and the pages carry the brand instead. */}
        <footer className="hidden sm:flex items-center justify-between gap-3 border-t border-white/[0.06] bg-dark-nav/60 px-4 lg:px-6 py-2.5">
          <p className="flex items-center gap-2 text-[12px] text-gray-500">
            <span aria-hidden="true" className="w-1 h-1 rounded-full" style={{ backgroundColor: GOLD }} />
            <span className="font-bold text-gray-400">POWER 111</span>
            <span>إدارة ذكية لناديك الرياضي</span>
          </p>
          <p className="text-[11.5px] text-gray-600">© {new Date().getFullYear()} POWER 111 — جميع الحقوق محفوظة</p>
        </footer>
      </div>

      {/* The floating assistant reads the reports, so it belongs to the accounts that hold
          it — the reception desk never sees the bubble at all. It stays out of the way while
          the phone menu is open. */}
      {hasPermission('USE_ASSISTANT') && <AssistantWidget hidden={isMobile && sidebarOpen} />}
    </div>
  );
}

export default AdminLayout;
