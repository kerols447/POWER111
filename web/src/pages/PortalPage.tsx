import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  drawMembershipCard,
  downloadCardAsPng,
  downloadCardAsPdf
} from '../utils/membershipCard';

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

function buildCardData(data: PortalData, qrDataUrl: string) {
  const sub = data.currentSubscription;
  return {
    memberName: data.member.name,
    memberCode: data.member.memberCode,
    branchName: data.member.branch.name,
    planName: sub ? (sub.plan.nameAr || sub.plan.name) : 'عضوية',
    validUntil: sub ? formatDate(sub.endDate) : 'بدون اشتراك',
    isActive: !!sub && daysRemaining(sub.endDate) > 0 && sub.status !== 'CANCELLED',
    qrDataUrl
  };
}

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
    if (!canvas || !qrImage) return;
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
        isActive: true,
        qrDataUrl: qrImage
      }).catch(() => setCardError('تعذر رسم البطاقة، حاول مرة أخرى'));
      return;
    }

    if (data) {
      drawMembershipCard(canvas, buildCardData(data, qrImage)).catch(() =>
        setCardError('تعذر رسم البطاقة، حاول مرة أخرى')
      );
    }
  }, [data, staffData, qrImage]);

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
  };

  // ===== Loading =====
  if (checking) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <div className="animate-pulse text-gray-500">جاري التحميل…</div>
      </div>
    );
  }

  // ===== Login =====
  if (!data && !staffData) {
    return (
      <div className="min-h-screen bg-dark flex flex-col items-center justify-center px-5 py-10">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-80 h-80 bg-yellow-500/10 rounded-full blur-3xl pointer-events-none" />
        <Link to="/" className="relative">
          <img src="/power-logo.jpg" alt="POWER 111" className="w-24 h-24 rounded-2xl ring-1 ring-yellow-500/40 shadow-xl" />
        </Link>
        <h1 className="relative mt-6 text-2xl font-extrabold">بوابة الأعضاء</h1>
        <p className="relative mt-2 text-gray-400 text-sm">دخول برقم الموبايل بس — من غير كود عضو</p>

        <form onSubmit={handleLogin} className="relative mt-8 w-full max-w-sm bg-dark-card border border-white/10 rounded-2xl p-6 space-y-5">
          {error && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/40 rounded-lg text-rose-400 text-sm text-center">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">رقم الموبايل</label>
            <input
              type="tel"
              required
              autoFocus
              dir="ltr"
              inputMode="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="01xxxxxxxxx"
              className="w-full px-4 py-4 bg-dark border border-dark-border rounded-xl text-white text-center text-lg tracking-wider focus:outline-none focus:border-yellow-500/60"
            />
            <p className="mt-2 text-xs text-gray-500">اكتب الرقم المسجل عند الجيم (11 رقم) واضغط دخول</p>
          </div>
          <button
            type="submit"
            disabled={submitting || phone.replace(/\D/g, '').length < 10}
            className="w-full py-3.5 rounded-xl bg-gradient-to-l from-yellow-600 to-yellow-500 text-black font-bold hover:opacity-90 disabled:opacity-40 transition-opacity"
          >
            {submitting ? 'جاري الدخول…' : 'دخول'}
          </button>
          <p className="text-center text-xs text-gray-500 leading-relaxed">
            الموظفين والمدربين بيدخلوا برقمهم كمان ويحصلوا على كارت الوردية
          </p>
        </form>

        <Link to="/" className="relative mt-6 text-sm text-gray-400 hover:text-yellow-500 transition-colors">
          ← العودة للصفحة الرئيسية
        </Link>
      </div>
    );
  }

  // ===== Staff dashboard =====
  if (staffData) {
    return (
      <div className="min-h-screen bg-dark pb-16">
        <header className="sticky top-0 z-40 bg-dark/90 backdrop-blur-md border-b border-white/10">
          <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-2.5">
              <img src="/power-logo.jpg" alt="POWER 111" className="w-9 h-9 rounded-lg ring-1 ring-yellow-500/40" />
              <span className="font-extrabold">POWER <span className="text-yellow-500">111</span></span>
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-full min-h-10 text-sm text-gray-300 border border-white/15 hover:bg-white/5 transition-colors"
            >
              خروج
            </button>
          </div>
        </header>

        <main className="max-w-2xl mx-auto px-4 mt-6 space-y-5">
          <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-yellow-500/10 to-transparent p-6">
            <p className="text-gray-400 text-sm">لوحة الموظفين</p>
            <h1 className="text-2xl font-extrabold mt-1">{staffData.staff.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 font-mono tracking-widest" dir="ltr">
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
            <p className="mt-3 text-sm text-gray-400">
              {staffData.present ? 'انت داخل الوردية دلوقتي — مختمش انصراف لسه' : 'مش في أي وردية دلوقتي'}
            </p>
          </div>

          <section className="grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-white/10 bg-dark-card p-4 text-center">
              <p className="text-xs text-gray-500">ساعات اليوم</p>
              <p className="text-lg font-extrabold text-yellow-500 mt-1">{staffData.hoursTodayLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-dark-card p-4 text-center">
              <p className="text-xs text-gray-500">ساعات الشهر</p>
              <p className="text-lg font-extrabold text-yellow-500 mt-1">{staffData.hoursMonthLabel}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-dark-card p-4 text-center">
              <p className="text-xs text-gray-500">أيام العمل</p>
              <p className="text-lg font-extrabold text-white mt-1">{staffData.daysWorkedMonth}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
            <h2 className="text-lg font-bold">كود الحضور الخاص بك</h2>
            <p className="text-sm text-gray-400 mt-1">اعرض الكود ده على الماسع عند الاستقبال لختم الدخول أو الانصراف</p>
            <div className="mt-5 inline-block bg-white p-4 rounded-2xl">
              {qrImage ? (
                <img src={qrImage} alt="QR Code" className="w-56 h-56" />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-gray-500 text-sm">جاري التحميل…</div>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-dark-card p-6">
            <h2 className="text-lg font-bold">كارت الموظف</h2>
            <p className="text-sm text-gray-400 mt-1">نفس كارت العضو — بيختم بيه الدخول والخروج</p>

            <canvas ref={cardCanvasRef} className="mt-5 w-full h-auto rounded-xl" />

            {cardError && (
              <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/40 rounded-lg text-rose-400 text-sm text-center">{cardError}</div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => handleDownload('png')}
                disabled={!qrImage || downloading !== ''}
                className="py-3 rounded-xl bg-gradient-to-l from-yellow-600 to-yellow-500 text-black font-bold text-sm disabled:opacity-50 transition-opacity"
              >
                {downloading === 'png' ? 'جاري التحميل…' : 'تحميل الكارت'}
              </button>
              <button
                onClick={() => handleDownload('pdf')}
                disabled={!qrImage || downloading !== ''}
                className="py-3 rounded-xl border border-white/15 text-sm font-bold text-gray-200 hover:bg-white/5 disabled:opacity-50 transition-colors"
              >
                {downloading === 'pdf' ? 'جاري التحميل…' : 'PDF للطباعة'}
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-dark-card p-6">
            <h2 className="text-lg font-bold">آخر ١٤ يوم حضور</h2>
            {staffData.shifts.length === 0 ? (
              <p className="text-sm text-gray-400 mt-3">لسه مفيش ورديات مسجلة</p>
            ) : (
              <ul className="mt-4 divide-y divide-white/5">
                {staffData.shifts.map(s => (
                  <li key={s.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{formatDate(s.checkInTime)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{s.branchName}</p>
                    </div>
                    <div className="text-left flex-shrink-0">
                      <p className="text-sm font-mono" dir="ltr">
                        {fmtClock(s.checkInTime)} → {fmtClock(s.checkOutTime)}
                      </p>
                      <p className="text-xs text-yellow-500 mt-0.5">{fmtShiftMinutes(s.minutes)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
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

  return (
    <div className="min-h-screen bg-dark pb-16">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-dark/90 backdrop-blur-md border-b border-white/10">
        <div className="max-w-2xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-9 h-9 rounded-lg ring-1 ring-yellow-500/40" />
            <span className="font-extrabold">POWER <span className="text-yellow-500">111</span></span>
          </Link>
          <button
            onClick={handleLogout}
            className="px-4 py-2 rounded-full min-h-10 text-sm text-gray-300 border border-white/15 hover:bg-white/5 transition-colors"
          >
            خروج
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 mt-6 space-y-5">
        {/* Welcome */}
        <div className="rounded-2xl border border-white/10 bg-gradient-to-b from-yellow-500/10 to-transparent p-6">
          <p className="text-gray-400 text-sm">أهلاً بيك</p>
          <h1 className="text-2xl font-extrabold mt-1">{member.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-500 border border-yellow-500/30 font-mono tracking-widest" dir="ltr">
              {member.memberCode}
            </span>
            <span className="px-3 py-1 rounded-full bg-white/5 text-gray-300 border border-white/10">
              فرع {member.branch.name}
            </span>
          </div>
        </div>

        {/* QR Card */}
        <section className="rounded-2xl border border-white/10 bg-dark-card p-6 text-center">
          <h2 className="text-lg font-bold">كود الحضور الخاص بك</h2>
          <p className="text-sm text-gray-400 mt-1">اعرض الكود ده على الماسح عند الاستقبال لتسجيل حضورك</p>
          <div className="mt-5 inline-block bg-white p-4 rounded-2xl">
            {qrImage ? (
              <img src={qrImage} alt="QR Code" className="w-56 h-56" />
            ) : (
              <div className="w-56 h-56 flex items-center justify-center text-gray-500 text-sm">جاري التحميل…</div>
            )}
          </div>
        </section>

        {/* Membership card */}
        <section className="rounded-2xl border border-white/10 bg-dark-card p-6">
          <h2 className="text-lg font-bold">بطاقة العضوية</h2>
          <p className="text-sm text-gray-400 mt-1">كرت باسمك وكودك — حمّله كصورة أو PDF واستخدمه في الحضور</p>

          <canvas
            ref={cardCanvasRef}
            className="mt-5 block w-full h-auto rounded-xl border border-white/10 bg-dark"
          />

          {cardError && (
            <p className="mt-3 text-sm text-rose-400 text-center">{cardError}</p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <button
              onClick={() => handleDownload('png')}
              disabled={!!downloading}
              className="py-3 rounded-xl bg-gradient-to-l from-yellow-600 to-yellow-500 text-black font-bold text-sm hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {downloading === 'png' ? 'جاري التحضير…' : 'تحميل صورة'}
            </button>
            <button
              onClick={() => handleDownload('pdf')}
              disabled={!!downloading}
              className="py-3 rounded-xl border border-yellow-500/40 text-yellow-500 font-bold text-sm hover:bg-yellow-500/10 disabled:opacity-50 transition-colors"
            >
              {downloading === 'pdf' ? 'جاري التحضير…' : 'تحميل PDF'}
            </button>
          </div>
        </section>

        {/* Subscription */}
        {currentSubscription ? (
          <section className="rounded-2xl border border-white/10 bg-dark-card p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">اشتراكك الحالي</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold border ${currentSubscription.isFrozen ? STATUS_STYLE.FROZEN : STATUS_STYLE[currentSubscription.status] || STATUS_STYLE.INACTIVE}`}>
                {currentSubscription.isFrozen ? 'مجمّد' : STATUS_TEXT[currentSubscription.status] || currentSubscription.status}
              </span>
            </div>

            <div className="mt-4 flex items-baseline justify-between">
              <div className="text-xl font-extrabold text-yellow-500">{currentSubscription.plan.nameAr}</div>
              <div className={`text-sm font-bold ${remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {remaining > 0 ? `متبقي ${remaining} يوم` : 'انتهى الاشتراك'}
              </div>
            </div>

            <div className="mt-3 h-2.5 bg-dark rounded-full overflow-hidden border border-white/5">
              <div
                className={`h-full rounded-full ${remaining > 7 ? 'bg-gradient-to-l from-yellow-600 to-yellow-500' : 'bg-gradient-to-l from-rose-600 to-rose-500'}`}
                style={{ width: `${progress}%` }}
              />
            </div>

            <div className="mt-2 flex justify-between text-xs text-gray-500">
              <span>{formatDate(currentSubscription.startDate)}</span>
              <span>{formatDate(currentSubscription.endDate)}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl bg-dark border border-white/5 p-3">
                <div className="text-xs text-gray-500">إجمالي الاشتراك</div>
                <div className="mt-1 font-bold">{formatEGP(currentSubscription.pricePiasters)}</div>
              </div>
              <div className="rounded-xl bg-dark border border-white/5 p-3">
                <div className="text-xs text-gray-500">{duePiasters > 0 ? 'المتبقي عليك' : 'مدفوع بالكامل'}</div>
                <div className={`mt-1 font-bold ${duePiasters > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                  {duePiasters > 0 ? formatEGP(duePiasters) : '✓'}
                </div>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-6 text-center">
            <h2 className="text-lg font-bold text-rose-400">لا يوجد اشتراك نشط</h2>
            <p className="text-sm text-gray-400 mt-2">راجع موظف الاستقبال في فرع {member.branch.name} لتجديد اشتراكك</p>
            {member.branch.phone && (
              <a href={`tel:${member.branch.phone}`} dir="ltr" className="inline-block mt-4 px-6 py-2.5 rounded-full bg-yellow-500 text-black font-bold text-sm hover:bg-yellow-400">
                اتصل بالفرع
              </a>
            )}
          </section>
        )}

        {/* Visits summary */}
        <section className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-white/10 bg-dark-card p-5 text-center">
            <div className="text-3xl font-extrabold text-yellow-500">{totalVisits}</div>
            <div className="mt-1 text-sm text-gray-400">إجمالي الزيارات</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-dark-card p-5 text-center">
            <div className="text-3xl font-extrabold text-primary">{currentlyInBranch}</div>
            <div className="mt-1 text-sm text-gray-400">في الفرع حالياً</div>
          </div>
          <div className="rounded-2xl border border-white/10 bg-dark-card p-5 text-center">
            <div className={`text-3xl font-extrabold ${isActive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {member.status === 'ACTIVE' ? '✓' : '!'}
            </div>
            <div className="mt-1 text-sm text-gray-400">حالة العضوية</div>
          </div>
        </section>

        {/* Attendance history */}
        <section className="rounded-2xl border border-white/10 bg-dark-card p-6">
          <h2 className="text-lg font-bold">آخر الزيارات</h2>
          {data.attendances.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">لم يتم تسجيل أي زيارة بعد</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/5">
              {data.attendances.map(att => (
                <li key={att.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">
                      {formatDate(att.checkInTime)}
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">{att.branch.name}</div>
                  </div>
                  <div className="text-xs text-gray-400" dir="ltr">
                    {new Date(att.checkInTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Cairo' })}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Payments */}
        <section className="rounded-2xl border border-white/10 bg-dark-card p-6">
          <h2 className="text-lg font-bold">سجل المدفوعات</h2>
          {data.payments.length === 0 ? (
            <p className="mt-4 text-sm text-gray-500">لا توجد مدفوعات مسجلة</p>
          ) : (
            <ul className="mt-4 divide-y divide-white/5">
              {data.payments.map(pay => (
                <li key={pay.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{pay.subscription.plan.nameAr}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{formatDate(pay.createdAt)} • {METHOD_TEXT[pay.method] || pay.method}</div>
                  </div>
                  <div className="text-sm font-bold text-emerald-400">{formatEGP(pay.amountPiasters)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Past subscriptions */}
        {data.pastSubscriptions.length > 0 && (
          <section className="rounded-2xl border border-white/10 bg-dark-card p-6">
            <h2 className="text-lg font-bold">الاشتراكات السابقة</h2>
            <ul className="mt-4 divide-y divide-white/5">
              {data.pastSubscriptions.map(sub => (
                <li key={sub.id} className="py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{sub.plan.nameAr}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {formatDate(sub.startDate)} — {formatDate(sub.endDate)}
                    </div>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs border ${STATUS_STYLE[sub.status] || STATUS_STYLE.INACTIVE}`}>
                    {STATUS_TEXT[sub.status] || sub.status}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="text-center text-xs text-gray-600 pt-4">
          POWER 111 — لياقة • صحة • تغذية
        </p>
      </main>
    </div>
  );
}
