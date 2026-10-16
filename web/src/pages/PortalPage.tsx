import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  drawMembershipCard,
  downloadCardAsPng,
  downloadCardAsPdf
} from '../utils/membershipCard';
import { CountUp, Reveal, RevealWords, useInView } from '../components/Motion';
import { whatsappLink } from '../utils/whatsapp';

interface PortalMember {
  id: string;
  memberCode: string;
  status: string;
  name: string;
  phone: string;
  gender?: string | null;
  branch: { id: string; name: string; code: string; address?: string | null; phone?: string | null };
}

interface PortalSubscription {
  id: string;
  startDate: string;
  endDate: string;
  pricePiasters: number;
  paidPiasters: number;
  status: string;
  isFrozen: boolean;
  plan: { name: string; nameAr: string };
}

interface PortalPayment {
  id: string;
  amountPiasters: number;
  method: string;
  createdAt: string;
  subscription: { plan: { nameAr: string } };
}

interface PortalAttendance {
  id: string;
  checkInTime: string;
  branch: { name: string };
}

interface PortalData {
  member: PortalMember;
  currentSubscription: PortalSubscription | null;
  pastSubscriptions: PortalSubscription[];
  payments: PortalPayment[];
  attendances: PortalAttendance[];
  totalVisits: number;
  currentlyInBranch: number;
}

interface StaffShift {
  id: string;
  checkInTime: string;
  checkOutTime: string | null;
  branchName: string;
  method: string;
  minutes: number;
}

// Staff sessions carry shifts and hours only — never member or financial data.
interface PortalStaffData {
  kind: 'staff';
  staff: {
    id: string;
    name: string;
    staffCode: string | null;
    role: string;
    phone: string | null;
    branches: { id: string; name: string; code: string }[];
  };
  present: boolean;
  hoursToday: number;
  hoursTodayLabel: string;
  hoursMonth: number;
  hoursMonthLabel: string;
  daysWorkedMonth: number;
  shifts: StaffShift[];
}

const STAFF_ROLE_TEXT: Record<string, string> = {
  OWNER: 'مالك',
  BRANCH_MANAGER: 'مدير فرع',
  RECEPTIONIST: 'موظف استقبال',
  ACCOUNTANT: 'محاسب',
  TRAINER: 'مدرب',
  CONTENT_MANAGER: 'مدير محتوى'
};

const SUPPORT_PHONE = '01055002069';

const panel = 'rounded-2xl border border-white/10 bg-dark-card';
const goldBtn = 'inline-flex items-center justify-center gap-2 px-5 py-3 min-h-12 rounded-xl bg-amber-500 text-black font-bold text-sm transition-all duration-200 active:scale-[0.97] disabled:opacity-50 sm:hover:bg-amber-400';
const ghostBtn = 'inline-flex items-center justify-center gap-2 px-5 py-3 min-h-12 rounded-xl border border-white/15 text-gray-100 font-bold text-sm transition-all duration-200 active:scale-[0.97] disabled:opacity-50 sm:hover:bg-white/5';

function fmtClock(iso: string | null) {
  if (!iso) return 'شغال';
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function fmtShiftMinutes(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}س ${String(m).padStart(2, '0')}د`;
}

const STATUS_TEXT: Record<string, string> = {
  ACTIVE: 'نشط',
  EXPIRED: 'منتهي',
  SUSPENDED: 'موقوف',
  FROZEN: 'مجمّد',
  INACTIVE: 'غير نشط',
  CANCELLED: 'ملغي',
  PENDING_REVIEW: 'بانتظار المراجعة'
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVE: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40',
  EXPIRED: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
  SUSPENDED: 'bg-rose-500/15 text-rose-400 border-rose-500/40',
  FROZEN: 'bg-primary/15 text-primary border-primary/40',
  INACTIVE: 'bg-gray-500/15 text-gray-400 border-gray-500/40',
  CANCELLED: 'bg-gray-500/15 text-gray-400 border-gray-500/40',
  PENDING_REVIEW: 'bg-amber-500/15 text-amber-500 border-amber-500/40'
};

const METHOD_TEXT: Record<string, string> = {
  CASH: 'نقدي',
  BANK_TRANSFER: 'تحويل بنكي',
  CARD: 'بطاقة',
  OTHER: 'أخرى'
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('ar-EG', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Africa/Cairo'
  });
}

function formatEGP(piasters: number) {
  return `${(piasters / 100).toLocaleString('ar-EG')} ج.م`;
}

function daysRemaining(endDate: string): number {
  const end = new Date(endDate).getTime();
  const now = Date.now();
  return Math.max(0, Math.ceil((end - now) / (24 * 60 * 60 * 1000)));
}

function buildCardData(data: PortalData) {
  const sub = data.currentSubscription;
  return {
    memberName: data.member.name,
    memberCode: data.member.memberCode,
    branchName: data.member.branch.name,
    planName: sub ? (sub.plan.nameAr || sub.plan.name) : 'عضوية',
    validUntil: sub ? formatDate(sub.endDate) : 'بدون اشتراك',
    isActive: !!sub && daysRemaining(sub.endDate) > 0 && sub.status !== 'CANCELLED'
  };
}

function SectionTitle({ children, hint }: { children: string; hint?: string }) {
  return (
    <div>
      <h2 className="text-lg font-bold text-white">{children}</h2>
      {hint && <p className="text-sm text-gray-400 mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

function StatCard({ value, label, tone = 'text-amber-500' }: { value: number; label: string; tone?: string }) {
  return (
    <div className={`${panel} p-4 text-center`}>
      <div className={`text-xl sm:text-2xl font-extrabold ${tone}`}>
        <CountUp value={value} duration={900} />
      </div>
      <div className="mt-1 text-[11px] sm:text-xs text-gray-400 leading-snug">{label}</div>
    </div>
  );
}

/** Full-bleed code viewer — reception scans the phone screen straight off this. */
function CodeViewer({ open, code, image, label, onClose }: { open: boolean; code: string; image: string; label: string; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const previousFilter = root.style.filter;
    const previousOverflow = document.body.style.overflow;
    root.style.filter = 'brightness(1.5) contrast(1.06)';
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      root.style.filter = previousFilter;
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label={label}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-sm text-gray-400">{label}</p>
      {image ? (
        <img
          src={image}
          alt={label}
          className="mt-5 w-[min(78vw,420px)] h-[min(78vw,420px)] bg-white rounded-2xl p-4"
        />
      ) : (
        <div className="mt-5 w-[min(78vw,420px)] h-[min(78vw,420px)] rounded-2xl bg-white/10 flex items-center justify-center text-gray-400 text-sm">
          جاري التحميل…
        </div>
      )}
      <p className="mt-6 font-mono text-2xl tracking-[0.3em] text-white" dir="ltr">{code}</p>
      <button onClick={onClose} className="mt-8 px-6 py-3 min-h-12 rounded-xl border border-white/20 text-gray-200 text-sm font-bold active:scale-95">
        إغلاق
      </button>
    </div>
  );
}

/** Days-left ring that draws itself once on arrival. */
function ProgressRing({ percent, tone }: { percent: number; tone: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.3);
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, percent / 100)));

  return (
    <div ref={ref} className="relative w-[132px] h-[132px] shrink-0">
      <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="currentColor"
          className={tone}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={inView ? offset : circumference}
          style={{ transition: 'stroke-dashoffset 1100ms cubic-bezier(.16,.84,.44,1) 150ms' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black text-white">{Math.round(percent)}%</span>
        <span className="text-[11px] text-gray-500">من المدة</span>
      </div>
    </div>
  );
}

type PortalTab = 'visits' | 'payments' | 'history';

const TABS: { id: PortalTab; label: string }[] = [
  { id: 'visits', label: 'الزيارات' },
  { id: 'payments', label: 'المدفوعات' },
  { id: 'history', label: 'اشتراكات سابقة' }
];

export default function PortalPage() {
  const [checking, setChecking] = useState(true);
  const [data, setData] = useState<PortalData | null>(null);
  const [staffData, setStaffData] = useState<PortalStaffData | null>(null);
  const [qrImage, setQrImage] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cardError, setCardError] = useState('');
  const [downloading, setDownloading] = useState<'' | 'png' | 'pdf'>('');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [tab, setTab] = useState<PortalTab>('visits');
  const cardCanvasRef = useRef<HTMLCanvasElement>(null);

  const loadDashboard = async () => {
    try {
      const res = await fetch('/api/portal/me', { credentials: 'include' });
      if (!res.ok) return false;
      const body = await res.json();
      if (body.data?.kind === 'staff') {
        setStaffData(body.data);
        setData(null);
      } else {
        setData(body.data);
        setStaffData(null);
      }
      fetchQR();
      return true;
    } catch {
      return false;
    }
  };

  const fetchQR = async () => {
    try {
      const res = await fetch('/api/portal/qr', { credentials: 'include' });
      if (res.ok) {
        const body = await res.json();
        setQrImage(body.data.qrImage);
      }
    } catch (err) {
      console.error('Error fetching QR:', err);
    }
  };

  useEffect(() => {
    loadDashboard().then(ok => {
      setChecking(false);
      if (!ok) setData(null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const canvas = cardCanvasRef.current;
    if (!canvas) return;
    setCardError('');

    if (staffData) {
      drawMembershipCard(canvas, {
        memberName: staffData.staff.name,
        memberCode: staffData.staff.staffCode || '',
        branchName: staffData.staff.branches.map(b => b.name).join('، ') || '—',
        planName: '',
        validUntil: '',
        subtitle: `الوظيفة: ${STAFF_ROLE_TEXT[staffData.staff.role] || staffData.staff.role}   •   ختم دخول وخروج`,
        kind: 'staff',
        isActive: true
      }).catch(() => setCardError('تعذر رسم البطاقة، حاول مرة أخرى'));
      return;
    }

    if (data) {
      drawMembershipCard(canvas, buildCardData(data)).catch(() =>
        setCardError('تعذر رسم البطاقة، حاول مرة أخرى')
      );
    }
  }, [data, staffData]);

  const handleDownload = async (kind: 'png' | 'pdf') => {
    const canvas = cardCanvasRef.current;
    if (!canvas || (!data && !staffData) || downloading) return;
    setDownloading(kind);
    setCardError('');
    try {
      const code = staffData ? staffData.staff.staffCode : data!.member.memberCode;
      const name = `بطاقة-POWER111-${code}.${kind === 'png' ? 'png' : 'pdf'}`;
      if (kind === 'png') await downloadCardAsPng(canvas, name);
      else await downloadCardAsPdf(canvas, name);
    } catch {
      setCardError('تعذر تحميل البطاقة، حاول مرة أخرى');
    } finally {
      setDownloading('');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/portal/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ phone })
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message || 'حدث خطأ في تسجيل الدخول');
        return;
      }
      await loadDashboard();
    } catch {
      setError('حدث خطأ في الاتصال. حاول مرة أخرى');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await fetch('/api/portal/logout', { method: 'POST', credentials: 'include' });
    setData(null);
    setStaffData(null);
    setQrImage('');
    setPhone('');
    setViewerOpen(false);
    setTab('visits');
  };

  const activeCode = staffData ? staffData.staff.staffCode || '' : data?.member.memberCode || '';

  // ===== Loading =====
  if (checking) {
    return (
      <div className="min-h-screen bg-dark flex flex-col items-center justify-center gap-4">
        <img src="/power-logo.jpg" alt="POWER 111" className="w-16 h-16 rounded-xl animate-pulse motion-reduce:animate-none" />
        <div className="text-gray-500 text-sm">جاري التحميل…</div>
      </div>
    );
  }

  // ===== Login =====
  if (!data && !staffData) {
    return (
      <div className="min-h-screen bg-dark flex flex-col items-center justify-center px-5 py-10">
        <Reveal y={0} scale={0.9} duration={700}>
          <Link to="/" className="block">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-24 h-24 rounded-2xl ring-1 ring-amber-500/40" />
          </Link>
        </Reveal>
        <h1 className="mt-6 text-2xl font-extrabold text-white">
          <RevealWords text="بوابة الأعضاء" delay={150} step={140} />
        </h1>
        <Reveal delay={320} y={12}>
          <p className="mt-2 text-gray-400 text-sm">دخول برقم الموبايل بس — من غير كود عضو</p>
        </Reveal>

        <Reveal delay={420} className="w-full">
          <form onSubmit={handleLogin} className="mt-8 w-full max-w-sm mx-auto border border-white/10 bg-dark-card rounded-2xl p-6 space-y-5">
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-lg text-rose-400 text-sm text-center">{error}</div>
            )}
            <div>
              <label htmlFor="portal-phone" className="block text-sm font-medium text-gray-300 mb-2">رقم الموبايل</label>
              <input
                id="portal-phone"
                type="tel"
                required
                autoFocus
                dir="ltr"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full px-4 py-4 bg-dark border border-dark-border rounded-xl text-white text-center text-lg tracking-wider transition-colors duration-200 focus:outline-none focus:border-amber-500/70"
              />
              <p className="mt-2 text-xs text-gray-500">اكتب الرقم المسجل عند الجيم (11 رقم) واضغط دخول</p>
            </div>
            <button
              type="submit"
              disabled={submitting || phone.replace(/\D/g, '').length < 10}
              className={`w-full ${goldBtn}`}
            >
              {submitting ? 'جاري الدخول…' : 'دخول'}
            </button>
            <p className="text-center text-xs text-gray-500 leading-relaxed">
              الموظفين والمدربين بيدخلوا برقمهم كمان ويحصلوا على كارت الوردية
            </p>
          </form>
        </Reveal>

        <Reveal delay={560}>
          <div className="mt-6 flex items-center gap-4 text-sm">
            <Link to="/" className="text-gray-400 transition-colors sm:hover:text-amber-400">
              ← العودة للصفحة الرئيسية
            </Link>
            <a
              href={whatsappLink(SUPPORT_PHONE, 'مش قادر أدخل بوابة الأعضاء') || `tel:${SUPPORT_PHONE}`}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-400 transition-colors sm:hover:text-emerald-300"
            >
              مساعده واتساب
            </a>
          </div>
        </Reveal>
      </div>
    );
  }

  // ===== Shared chrome =====
  const header = (
    <header className="sticky top-0 z-40 bg-dark/90 backdrop-blur-md border-b border-white/10">
      <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 min-h-10 transition-transform duration-200 active:scale-95">
          <img src="/power-logo.jpg" alt="POWER 111" className="w-9 h-9 rounded-lg ring-1 ring-amber-500/40" />
          <span className="font-extrabold text-white">POWER <span className="text-amber-500">111</span></span>
        </Link>
        <button
          onClick={handleLogout}
          className="px-4 py-2 rounded-full min-h-10 text-sm text-gray-300 border border-white/15 transition-colors duration-200 active:scale-95 sm:hover:bg-white/5"
        >
          خروج
        </button>
      </div>
    </header>
  );

  const codeSection = (
    <section className={`${panel} p-6 text-center`}>
      <SectionTitle hint="اعرض الكود ده على الماسح عند الاستقبال">{staffData ? 'كود ختم الوردية' : 'كود الحضور الخاص بك'}</SectionTitle>
      <button
        type="button"
        onClick={() => setViewerOpen(true)}
        aria-label="تكبير الكود"
        className="relative mt-5 inline-block bg-white p-4 rounded-2xl transition-transform duration-200 active:scale-95 sm:hover:scale-[1.02]"
      >
        {qrImage ? (
          <img src={qrImage} alt="كود الحضور" className="w-52 h-52 sm:w-56 sm:h-56" />
        ) : (
          <div className="w-52 h-52 sm:w-56 sm:h-56 flex items-center justify-center text-gray-500 text-sm">جاري التحميل…</div>
        )}
      </button>
      <p className="mt-4 text-xs text-gray-500">اضغط على الكود لعرضه fullscreen وإضاءة أعلى</p>
      <p className="mt-2 font-mono text-lg tracking-[0.25em] text-amber-500" dir="ltr">{activeCode}</p>
    </section>
  );

  const cardSection = (
    <section className={`${panel} p-6`}>
      <SectionTitle hint={staffData ? 'نفس كارت العضو — بيختم بيه الدخول والخروج' : 'كرت باسمك وكودك — حمّله كصورة أو PDF واطبعه، الاستقبال بيمسح الباركود'}>
        {staffData ? 'كارت الموظف' : 'بطاقة العضوية'}
      </SectionTitle>

      <canvas ref={cardCanvasRef} className="mt-5 block w-full h-auto rounded-xl border border-white/10 bg-dark" />

      {cardError && <p className="mt-3 text-sm text-rose-400 text-center">{cardError}</p>}

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button onClick={() => handleDownload('png')} disabled={!!downloading} className={goldBtn}>
          {downloading === 'png' ? 'جاري التحضير…' : 'تحميل صورة'}
        </button>
        <button onClick={() => handleDownload('pdf')} disabled={!!downloading} className={ghostBtn}>
          {downloading === 'pdf' ? 'جاري التحضير…' : 'PDF للطباعة'}
        </button>
      </div>
    </section>
  );

  const viewer = (
    <CodeViewer
      open={viewerOpen}
      code={activeCode}
      image={qrImage}
      label={staffData ? 'كود ختم الوردية' : 'كود الحضور'}
      onClose={() => setViewerOpen(false)}
    />
  );

  // ===== Staff dashboard =====
  if (staffData) {
    return (
      <div className="min-h-screen bg-dark pb-16">
        {header}
        <main className="max-w-2xl mx-auto px-4 mt-6 space-y-5">
          <Reveal>
            <div className={`${panel} p-6`}>
              <p className="text-gray-400 text-sm">لوحة الموظفين</p>
              <h1 className="text-2xl font-extrabold mt-1 text-white">{staffData.staff.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 font-mono tracking-widest" dir="ltr">
                  {staffData.staff.staffCode}
                </span>
                <span className="px-3 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                  {STAFF_ROLE_TEXT[staffData.staff.role] || staffData.staff.role}
                </span>
                {staffData.staff.branches.map(b => (
                  <span key={b.id} className="px-3 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                    فرع {b.name}
                  </span>
                ))}
              </div>
              <p className={`mt-3 text-sm font-medium ${staffData.present ? 'text-emerald-400' : 'text-gray-400'}`}>
                {staffData.present ? 'انت داخل الوردية دلوقتي — مختمش انصراف لسه' : 'مش في أي وردية دلوقتي'}
              </p>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <section className="grid grid-cols-3 gap-3">
              <div className={`${panel} p-4 text-center`}>
                <p className="text-[11px] text-gray-500">ساعات اليوم</p>
                <p className="text-base sm:text-lg font-extrabold text-amber-500 mt-1">{staffData.hoursTodayLabel}</p>
              </div>
              <div className={`${panel} p-4 text-center`}>
                <p className="text-[11px] text-gray-500">ساعات الشهر</p>
                <p className="text-base sm:text-lg font-extrabold text-amber-500 mt-1">{staffData.hoursMonthLabel}</p>
              </div>
              <div className={`${panel} p-4 text-center`}>
                <p className="text-[11px] text-gray-500">أيام العمل</p>
                <p className="text-base sm:text-lg font-extrabold text-white mt-1">{staffData.daysWorkedMonth}</p>
              </div>
            </section>
          </Reveal>

          <Reveal delay={140}>{codeSection}</Reveal>
          <Reveal delay={80}>{cardSection}</Reveal>

          <Reveal delay={80}>
            <section className={`${panel} p-6`}>
              <SectionTitle>آخر ١٤ يوم حضور</SectionTitle>
              {staffData.shifts.length === 0 ? (
                <p className="text-sm text-gray-400 mt-3">لسه مفيش ورديات مسجلة</p>
              ) : (
                <ul className="mt-4 divide-y divide-white/5">
                  {staffData.shifts.map(s => (
                    <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white">{formatDate(s.checkInTime)}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{s.branchName}</p>
                      </div>
                      <div className="text-left flex-shrink-0">
                        <p className="text-sm font-mono text-gray-200" dir="ltr">
                          {fmtClock(s.checkInTime)} → {fmtClock(s.checkOutTime)}
                        </p>
                        <p className="text-xs text-amber-500 mt-0.5">{fmtShiftMinutes(s.minutes)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </Reveal>
        </main>
        {viewer}
      </div>
    );
  }

  // ===== Dashboard =====
  if (!data) return null;
  const { member, currentSubscription, totalVisits, currentlyInBranch } = data;
  const remaining = currentSubscription ? daysRemaining(currentSubscription.endDate) : 0;
  const start = currentSubscription ? new Date(currentSubscription.startDate).getTime() : 0;
  const end = currentSubscription ? new Date(currentSubscription.endDate).getTime() : 1;
  const progress = currentSubscription ? Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100)) : 0;
  const duePiasters = currentSubscription ? currentSubscription.pricePiasters - currentSubscription.paidPiasters : 0;
  const isActive = currentSubscription && remaining > 0 && currentSubscription.status !== 'CANCELLED';

  const tabContent = (
    <section className={`${panel} p-6`}>
      <div className="flex items-stretch border-b border-white/10 -mx-2">
        {TABS.map(t => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              aria-pressed={active}
              className={`relative flex-1 px-1 py-3 min-h-12 text-xs sm:text-sm font-bold transition-colors duration-200 ${
                active ? 'text-amber-500' : 'text-gray-400 active:text-gray-200'
              }`}
            >
              {t.label}
              <span
                className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-amber-500"
                style={{
                  transform: active ? 'scaleX(1)' : 'scaleX(0)',
                  transition: 'transform 260ms cubic-bezier(.16,.84,.44,1)'
                }}
              />
            </button>
          );
        })}
      </div>

      <div key={tab} className="pt-1">
        {tab === 'visits' && (
          data.attendances.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">لم يتم تسجيل أي زيارة بعد</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5">
              {data.attendances.map((att, i) => (
                <Reveal key={att.id} delay={i * 60} y={10} duration={380}>
                  <li className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{formatDate(att.checkInTime)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{att.branch.name}</div>
                    </div>
                    <div className="text-xs text-gray-400" dir="ltr">
                      {new Date(att.checkInTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}
                    </div>
                  </li>
                </Reveal>
              ))}
            </ul>
          )
        )}

        {tab === 'payments' && (
          data.payments.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">لا توجد مدفوعات مسجلة</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5">
              {data.payments.map((pay, i) => (
                <Reveal key={pay.id} delay={i * 60} y={10} duration={380}>
                  <li className="py-3 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{pay.subscription.plan.nameAr}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{formatDate(pay.createdAt)} • {METHOD_TEXT[pay.method] || pay.method}</div>
                    </div>
                    <div className="text-sm font-bold text-emerald-400">{formatEGP(pay.amountPiasters)}</div>
                  </li>
                </Reveal>
              ))}
            </ul>
          )
        )}

        {tab === 'history' && (
          data.pastSubscriptions.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">لا توجد اشتراكات سابقة</p>
          ) : (
            <ul className="mt-2 divide-y divide-white/5">
              {data.pastSubscriptions.map((sub, i) => (
                <Reveal key={sub.id} delay={i * 60} y={10} duration={380}>
                  <li className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white">{sub.plan.nameAr}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {formatDate(sub.startDate)} — {formatDate(sub.endDate)}
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs border shrink-0 ${STATUS_STYLE[sub.status] || STATUS_STYLE.INACTIVE}`}>
                      {STATUS_TEXT[sub.status] || sub.status}
                    </span>
                  </li>
                </Reveal>
              ))}
            </ul>
          )
        )}
      </div>
    </section>
  );

  return (
    <div className="min-h-screen bg-dark pb-16">
      {header}

      <main className="max-w-2xl mx-auto px-4 mt-6 space-y-5">
        <Reveal>
          <div className={`${panel} p-6`}>
            <p className="text-gray-400 text-sm">أهلاً بيك</p>
            <h1 className="text-2xl font-extrabold mt-1 text-white leading-tight">{member.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 font-mono tracking-widest" dir="ltr">
                {member.memberCode}
              </span>
              <span className="px-3 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
                فرع {member.branch.name}
              </span>
              <span className={`px-3 py-1 rounded-full text-xs border ${isActive ? STATUS_STYLE.ACTIVE : STATUS_STYLE.EXPIRED}`}>
                {isActive ? 'عضوية نشطة' : 'عضوية غير نشطة'}
              </span>
            </div>
          </div>
        </Reveal>

        <Reveal delay={80}>{codeSection}</Reveal>

        {currentSubscription ? (
          <Reveal delay={120}>
            <section className={`${panel} p-6`}>
              <div className="flex items-center justify-between gap-3">
                <SectionTitle>اشتراكك الحالي</SectionTitle>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold border shrink-0 ${currentSubscription.isFrozen ? STATUS_STYLE.FROZEN : STATUS_STYLE[currentSubscription.status] || STATUS_STYLE.INACTIVE}`}>
                  {currentSubscription.isFrozen ? 'مجمّد' : STATUS_TEXT[currentSubscription.status] || currentSubscription.status}
                </span>
              </div>

              <div className="mt-5 flex items-center gap-5">
                <ProgressRing percent={progress} tone={remaining > 7 ? 'text-amber-500' : 'text-rose-500'} />
                <div className="min-w-0">
                  <div className="text-lg sm:text-xl font-extrabold text-amber-500 leading-snug">{currentSubscription.plan.nameAr}</div>
                  <div className={`mt-1 text-sm font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {remaining > 0 ? `متبقي ${remaining} يوم` : 'انتهى الاشتراك'}
                  </div>
                  <div className="mt-3 text-xs text-gray-500 leading-relaxed" dir="rtl">
                    {formatDate(currentSubscription.startDate)}
                    <span className="mx-1.5">←</span>
                    {formatDate(currentSubscription.endDate)}
                  </div>
                </div>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-dark border border-white/5 p-3">
                  <div className="text-xs text-gray-500">إجمالي الاشتراك</div>
                  <div className="mt-1 font-bold text-white">{formatEGP(currentSubscription.pricePiasters)}</div>
                </div>
                <div className="rounded-xl bg-dark border border-white/5 p-3">
                  <div className="text-xs text-gray-500">{duePiasters > 0 ? 'المتبقي عليك' : 'مدفوع بالكامل'}</div>
                  <div className={`mt-1 font-bold ${duePiasters > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                    {duePiasters > 0 ? formatEGP(duePiasters) : '✓'}
                  </div>
                </div>
              </div>

              {remaining <= 7 && (
                <a
                  href={whatsappLink(member.branch.phone || SUPPORT_PHONE, `أريد تجديد اشتراكي — ${member.name} كود ${member.memberCode}`) || `tel:${member.branch.phone || SUPPORT_PHONE}`}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-5 w-full ${goldBtn}`}
                >
                  جدّد اشتراكك دلوقتي
                </a>
              )}
            </section>
          </Reveal>
        ) : (
          <Reveal delay={120}>
            <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
              <h2 className="text-lg font-bold text-rose-400">لا يوجد اشتراك نشط</h2>
              <p className="text-sm text-gray-400 mt-2">راجع موظف الاستقبال في فرع {member.branch.name} لتجديد اشتراكك</p>
              {member.branch.phone && (
                <a href={`tel:${member.branch.phone}`} dir="ltr" className={`mt-4 ${goldBtn}`}>
                  اتصل بالفرع
                </a>
              )}
            </section>
          </Reveal>
        )}

        <Reveal delay={80}>
          <section className="grid grid-cols-3 gap-3">
            <StatCard value={totalVisits} label="إجمالي الزيارات" />
            <StatCard value={currentlyInBranch} label="في الفرع حالياً" tone="text-emerald-400" />
            <div className={`${panel} p-4 text-center`}>
              <div className={`text-xl sm:text-2xl font-extrabold ${isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
                {isActive ? '✓' : '!'}
              </div>
              <div className="mt-1 text-[11px] sm:text-xs text-gray-400 leading-snug">حالة العضوية</div>
            </div>
          </section>
        </Reveal>

        <Reveal delay={80}>{cardSection}</Reveal>
        <Reveal delay={80}>{tabContent}</Reveal>

        <p className="text-center text-xs text-gray-600 pt-4">POWER 111 — لياقة • صحة • تغذية</p>
      </main>
      {viewer}
    </div>
  );
}
