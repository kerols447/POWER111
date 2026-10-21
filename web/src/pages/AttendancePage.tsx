import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation, getCachedMember, cacheMembers } from '../utils/offlineDb';
import {
  PageHeader, Btn, StatTile, Badge, TableShell, Th, Td, Row, ListCard,
  EmptyState, Loading, Picker, UiIcon, CARD, TONE, LABEL, FIELD
} from '../components/ui';

const AUTO_CAMERA_KEY = 'power111AutoCamera';
const BRANCH_KEY = 'power111AttendanceBranch';
const rememberedBranch = () => localStorage.getItem(BRANCH_KEY) || '';

interface AttendanceRecord {
  id: string;
  memberId: string;
  memberName: string;
  memberCode: string;
  memberPhone: string;
  branchId: string;
  branchName: string;
  checkInTime: string;
  checkOutTime: string | null;
  method: string;
  flagged: boolean;
  flagReason: string | null;
  hasActiveSubscription: boolean;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/* ─────────────────────── SVG Icon Components ───────────────────────
   Only glyphs the shared kit does not draw live here; everything else uses <UiIcon>.
   All kept on the kit's 1.6 stroke weight with rounded joins so no icon reads heavier. */

const CameraIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const ClipboardIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

const QrCodeIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="8" height="8" rx="1" />
    <rect x="14" y="2" width="8" height="8" rx="1" />
    <rect x="2" y="14" width="8" height="8" rx="1" />
    <rect x="14" y="14" width="4" height="4" rx="0.5" />
    <path d="M20 14h2v2" />
    <path d="M20 20h2v2" />
    <path d="M14 20h2v2" />
  </svg>
);

const LogOutIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const StopIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
  </svg>
);

const PlayIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

/* ─────────────────────── Main Component ─────────────────────── */

export default function AttendancePage() {
  const { user, isOwner } = useAuth();
  const isOnline = useOnlineStatus();
  const [activeTab, setActiveTab] = useState<'scanner' | 'today'>('scanner');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [summary, setSummary] = useState({ total: 0, checkedIn: 0, checkedOut: 0, flagged: 0 });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<{ success: boolean; message: string; memberName?: string; kind?: 'member' | 'staff'; code?: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [scanMode, setScanMode] = useState<'qr' | 'barcode'>('qr');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);
  const [autoCamera, setAutoCamera] = useState(() => localStorage.getItem(AUTO_CAMERA_KEY) !== '0');
  const scanBufferRef = useRef({ text: '', at: 0 });
  const lastCodeRef = useRef({ code: '', at: 0 });
  const submitRef = useRef<(code: string) => void>(() => {});
  const audioRef = useRef<AudioContext | null>(null);

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (selectedBranch && activeTab === 'today') {
      fetchTodayAttendance();
    }
  }, [selectedBranch, activeTab]);

  useEffect(() => {
    if (selectedBranch && isOnline) {
      prefetchMembersForBranch(selectedBranch);
    }
  }, [selectedBranch, isOnline]);

  const prefetchMembersForBranch = async (branchId: string) => {
    try {
      const res = await fetch(`/api/members?branchId=${branchId}&pageSize=500`, { credentials: 'include' });
      const data = await res.json();
      if (data.data) {
        await cacheMembers(
          data.data.map((m: any) => ({
            id: m.id,
            memberCode: m.memberCode,
            name: m.person?.name || m.name,
            phone: m.person?.phone || m.phone,
            branchId: m.branchId,
            hasActiveSubscription: m.hasActiveSubscription ?? false,
            cachedAt: Date.now()
          }))
        );
      }
    } catch {
      // Silently fail
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const branchList = Array.isArray(data) ? data : (data.branches || []);
      setBranches(branchList);
      if (branchList.length === 0) return;
      // Remember the branch this device last used, so reception never re-picks it
      // after a reload — but fall back to the first branch if that one is gone.
      const keep = branchList.find((b: Branch) => b.id === (selectedBranch || rememberedBranch()));
      setSelectedBranch(keep?.id || branchList[0].id);
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchTodayAttendance = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/attendance/today?branchId=${selectedBranch}`, { credentials: 'include' });
      const data = await res.json();
      if (data.success) {
        setTodayAttendance(data.data);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching attendance:', error);
    } finally {
      setLoading(false);
    }
  };

  const startScanner = async () => {
    setScannerError(null);
    setScanning(true);

    // The region only exists after React paints the scanner panel, and the auto-arm
    // timer fires before that commit — html5-qrcode throws on a missing node.
    for (let frame = 0; frame < 10 && !document.getElementById('qr-scanner-region'); frame++) {
      await new Promise(resolve => requestAnimationFrame(() => resolve(null)));
    }

    try {
      const html5Qrcode = new Html5Qrcode('qr-scanner-region', {
        // Only the symbologies a POWER 111 card can carry. Every extra format is a
        // full decode pass on each frame, so the shorter list reads noticeably faster.
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.ITF,
        ],
        // Chrome/Android ship a hardware barcode decoder; use it before falling back to WASM.
        useBarCodeDetectorIfSupported: true,
        verbose: false
      });
      scannerRef.current = html5Qrcode;

      const isMobile = window.innerWidth < 768;
      const config = {
        fps: 10,
        qrBox: isMobile
          ? { width: Math.min(250, window.innerWidth - 80), height: Math.min(250, window.innerWidth - 80) }
          : { width: 280, height: 280 },
        aspectRatio: 1.0,
        experimentalFeatures: {
          grayShadeFallback: true
        }
      };

      await html5Qrcode.start(
        { facingMode: 'environment' },
        config,
        onScanSuccess,
        () => {}
      );
      rememberAutoCamera(true);
    } catch (error) {
      console.error('Error starting scanner:', error);
      setScannerError('فشل في تشغيل الكاميرا. تأكد من إعطاء الصلاحيات المطلوبة.');
      setScanning(false);
    }
  };

  const rememberAutoCamera = (on: boolean) => {
    localStorage.setItem(AUTO_CAMERA_KEY, on ? '1' : '0');
    setAutoCamera(on);
  };

  const closeScanner = async () => {
    const scanner = scannerRef.current;
    scannerRef.current = null;
    if (!scanner) return;
    try {
      await scanner.stop();
      scanner.clear();
    } catch {
      // Already stopped, or the tab was swapped before the stream opened.
    }
  };

  const stopScanner = async () => {
    rememberAutoCamera(false);
    await closeScanner();
    setScanning(false);
  };

  // Staff card codes are "S" + digits (S01, S02…); member codes are always 8 characters,
  // so a short S-code can never be mistaken for a member.
  const isStaffCode = (code: string) => /^S\d{1,6}$/i.test(code.trim());

  // A camera keeps decoding the same card while it sits in the frame, and a handheld
  // gun can fire the same burst twice. One code is honoured once every few seconds.
  const acceptCode = (raw: string) => {
    const code = raw.trim();
    if (!code) return false;
    const now = Date.now();
    const last = lastCodeRef.current;
    if (last.code === code && now - last.at < 4000) return false;
    lastCodeRef.current = { code, at: now };
    return true;
  };

  const beep = (kind: 'ok' | 'bad') => {
    try {
      const Ctor = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctor) return;
      const ctx = audioRef.current || (audioRef.current = new Ctor());
      if (ctx.state === 'suspended') ctx.resume();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = kind === 'ok' ? 880 : 320;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.18);
    } catch {
      // No audio is never a reason to lose a check-in.
    }
  };

  // A queue moves fast: the result banner clears itself quickly so the next member
  // sees a fresh one instead of the previous name.
  const toastTimerRef = useRef<number | undefined>(undefined);
  const flash = (result: NonNullable<typeof lastScan>) => {
    setLastScan(result);
    beep(result.type === 'error' ? 'bad' : 'ok');
    window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setLastScan(null), result.type === 'success' ? 2600 : 3800);
  };

  const onScanSuccess = async (decodedText: string) => {
    if (!acceptCode(decodedText)) return;

    let code = decodedText;
    let staffCode: string | null = null;

    try {
      const data = JSON.parse(decodedText);
      if (data.staffCode) {
        staffCode = data.staffCode;
      } else if (data.memberCode) {
        code = data.memberCode;
      }
    } catch {
      // Plain text - use as-is (barcode typically returns plain member code)
    }

    if (!staffCode && isStaffCode(code)) {
      staffCode = code.trim().toUpperCase();
    }

    if (staffCode) {
      await handleStaffPunch(staffCode);
    } else {
      await handleCheckin(code);
    }

    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
  };

  const handleCheckin = async (memberCode: string) => {
    if (!selectedBranch) {
      flash({ success: false, message: 'الرجاء اختيار الفرع أولاً', type: 'error' });
      return;
    }

    if (!isOnline) {
      await handleOfflineCheckin(memberCode);
      return;
    }

    try {
      const res = await fetch('/api/attendance/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          memberCode,
          branchId: selectedBranch,
          method: scanMode === 'barcode' ? 'BARCODE' : 'QR_CODE'
        })
      });

      const data = await res.json();

      if (data.success) {
        setScanCount(prev => prev + 1);
        flash({
          success: true,
          message: data.message || `تم تسجيل حضور ${data.data.memberName}`,
          memberName: data.data.memberName,
          kind: 'member',
          code: data.data.memberCode,
          type: data.data.flagged ? 'warning' : 'success'
        });
        if (activeTab === 'today') {
          fetchTodayAttendance();
        }
      } else if (res.status === 409) {
        flash({
          success: false,
          message: data.message || 'العضو مسجل حضوره بالفعل اليوم',
          type: 'warning'
        });
      } else {
        flash({
          success: false,
          message: data.message || 'حدث خطأ في تسجيل الحضور',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Error checking in:', error);
      await handleOfflineCheckin(memberCode);
    }
  };

  const handleStaffPunch = async (staffCode: string) => {
    if (!selectedBranch) {
      flash({ success: false, message: 'الرجاء اختيار الفرع أولاً', kind: 'staff', type: 'error' });
      return;
    }

    if (!isOnline) {
      flash({ success: false, message: 'ختم الموظفين محتاج إنترنت — اربط الجهاز بالشبكة الأول', kind: 'staff', code: staffCode, type: 'error' });
      return;
    }

    const method = scanMode === 'barcode' ? 'BARCODE' : 'QR_CODE';

    try {
      let res = await fetch('/api/staff/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ staffCode, branchId: selectedBranch, method })
      });
      let data = await res.json();

      // The same card scanned again closes the open shift — like a fingerprint machine
      if (res.status === 409 && data.data?.id) {
        res = await fetch(`/api/staff/${data.data.id}/checkout`, {
          method: 'POST',
          credentials: 'include'
        });
        data = await res.json();
      }

      if (data.success) {
        const rec = data.data || {};
        setScanCount(prev => prev + 1);
        flash({
          success: true,
          message: data.message,
          memberName: rec.staffName,
          kind: 'staff',
          code: rec.staffCode,
          type: 'success'
        });
      } else {
        flash({
          success: false,
          message: data.message || 'حدث خطأ في تسجيل الوردية',
          kind: 'staff',
          code: staffCode,
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Error recording staff shift:', error);
      flash({ success: false, message: 'حدث خطأ في تسجيل الوردية', kind: 'staff', code: staffCode, type: 'error' });
    }
  };

  const handleOfflineCheckin = async (memberCode: string) => {
    const cached = await getCachedMember(memberCode);

    const operationId = generateOperationId();
    await addPendingOperation({
      id: operationId,
      type: 'CHECKIN',
      payload: {
        memberCode,
        branchId: selectedBranch,
        method: 'OFFLINE_SYNC',
        checkInTime: new Date().toISOString()
      },
      timestamp: Date.now(),
      branchId: selectedBranch,
      userId: user!.id
    });

    setScanCount(prev => prev + 1);

    if (cached) {
      flash({
        success: true,
        message: `تم حفظ الحضور محلياً: ${cached.name}`,
        memberName: cached.name,
        type: 'warning'
      });
    } else {
      flash({
        success: true,
        message: `تم حفظ الحضور محلياً لكود: ${memberCode}`,
        type: 'warning'
      });
    }

    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  };

  const submitCode = (raw: string) => {
    const code = raw.trim();
    if (!code || !acceptCode(code)) return;
    setManualCode('');
    scanBufferRef.current = { text: '', at: 0 };
    if (isStaffCode(code)) {
      handleStaffPunch(code.toUpperCase());
    } else {
      handleCheckin(code);
    }
  };

  const handleManualCheckin = (e: React.FormEvent) => {
    e.preventDefault();
    submitCode(manualCode);
  };

  useEffect(() => {
    submitRef.current = submitCode;
  });

  // A handheld scanner is really a keyboard: it types the code and presses Enter.
  // Listening on the document means reception scans the moment the member walks up
  // instead of clicking into the code box first. Works from either tab, but a modal
  // on screen always wins — the gun must never fire behind a form.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (document.querySelector('.fixed.inset-0.z-50')) return;

      const buf = scanBufferRef.current;
      const now = Date.now();
      if (now - buf.at > 150) buf.text = '';
      buf.at = now;

      if (e.key === 'Enter') {
        if (!buf.text.trim()) return;
        e.preventDefault();
        submitRef.current(buf.text);
        return;
      }
      if (e.key.length !== 1) return;
      buf.text += e.key;
      setManualCode(buf.text);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // The camera opens with the tab, so the scanner is armed before the first member arrives.
  // It only runs while the scanner is on screen: the viewport unmounts on the other tab.
  useEffect(() => {
    if (activeTab !== 'scanner') {
      if (scannerRef.current) {
        closeScanner();
        setScanning(false);
      }
      return;
    }
    if (!autoCamera) return;
    const timer = window.setTimeout(() => {
      if (!scannerRef.current) startScanner();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [activeTab, autoCamera]);

  // Leaving the page has to hand the camera back, otherwise the light stays on.
  useEffect(() => () => { closeScanner(); }, []);

  const handleCheckout = async (attendanceId: string) => {
    if (!isOnline) {
      const record = todayAttendance.find(r => r.id === attendanceId);
      await addPendingOperation({
        id: generateOperationId(),
        type: 'CHECKOUT',
        payload: { attendanceId, memberCode: record?.memberCode, checkOutTime: new Date().toISOString() },
        timestamp: Date.now(),
        branchId: selectedBranch,
        userId: user!.id
      });
      flash({
        success: true,
        message: `تم حفظ الانصراف محلياً${record ? `: ${record.memberName}` : ''}`,
        memberName: record?.memberName,
        type: 'warning'
      });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      return;
    }

    try {
      const res = await fetch(`/api/attendance/${attendanceId}/checkout`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await res.json();

      if (data.success) {
        fetchTodayAttendance();
      }
    } catch (error) {
      console.error('Error checking out:', error);
      const record = todayAttendance.find(r => r.id === attendanceId);
      await addPendingOperation({
        id: generateOperationId(),
        type: 'CHECKOUT',
        payload: { attendanceId, memberCode: record?.memberCode, checkOutTime: new Date().toISOString() },
        timestamp: Date.now(),
        branchId: selectedBranch,
        userId: user!.id
      });
      flash({
        success: true,
        message: `تم حفظ الانصراف محلياً${record ? `: ${record.memberName}` : ''}`,
        memberName: record?.memberName,
        type: 'warning'
      });
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('ar-EG-u-nu-latn', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-5 sm:space-y-7">
      {/* ─── Header ─── */}
      <PageHeader
        icon="attendance"
        title="الحضور والانصراف"
        caption="مسح QR Code أو الباركود لتسجيل الحضور"
        actions={
          !isOnline ? (
            <div className="flex items-center gap-2 px-3 min-h-[44px] bg-primary/10 border border-primary/30 rounded-xl">
              <UiIcon name="wifiOff" className="w-4 h-4 text-primary" />
              <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
              <span className="text-xs text-primary font-semibold">وضع عدم الاتصال</span>
            </div>
          ) : undefined
        }
      />

      {/* ─── Branch Selector ─── */}
      {!singleBranchUser && (
        <div className={`${CARD} p-4 sm:p-5`}>
          <label className={LABEL}>
            <span className="inline-flex items-center gap-1.5">
              <UiIcon name="branches" className="w-4 h-4 text-primary" />
              الفرع
            </span>
          </label>
          <Picker
            value={selectedBranch}
            onChange={(v) => {
              setSelectedBranch(v);
              localStorage.setItem(BRANCH_KEY, v);
            }}
            ariaLabel="الفرع"
            className="w-full"
            options={branches.map(branch => ({ value: branch.id, label: branch.name }))}
          />
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex gap-1 border-b border-dark-border">
        <button
          onClick={() => { setActiveTab('scanner'); stopScanner(); }}
          className={`-mb-px flex items-center justify-center gap-2 px-4 sm:px-6 min-h-[44px] sm:min-h-[36px] border-b-2 font-bold text-sm transition-colors ${
            activeTab === 'scanner'
              ? 'text-primary border-primary'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <CameraIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>تسجيل الحضور</span>
        </button>
        <button
          onClick={() => { setActiveTab('today'); stopScanner(); fetchTodayAttendance(); }}
          className={`-mb-px flex items-center justify-center gap-2 px-4 sm:px-6 min-h-[44px] sm:min-h-[36px] border-b-2 font-bold text-sm transition-colors ${
            activeTab === 'today'
              ? 'text-primary border-primary'
              : 'text-gray-400 border-transparent hover:text-white'
          }`}
        >
          <ClipboardIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>حضور اليوم</span>
          {summary.total > 0 && (
            <span className="ml-1 min-w-[1.25rem] h-5 flex items-center justify-center bg-primary/15 text-primary px-1.5 rounded-full text-xs font-bold">
              {summary.total}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════ Scanner Tab ═══════════════ */}
      {activeTab === 'scanner' && (
        <div className="space-y-4 sm:space-y-5">

          {/* Scan Mode + Controls Card */}
          <div className={`${CARD} p-4 sm:p-5`}>
              {/* Scan mode toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-500">نوع المسح</span>
                  <div className="inline-flex items-center gap-1 bg-dark border border-dark-border rounded-xl p-1">
                    <button
                      onClick={() => setScanMode('qr')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors min-h-[44px] sm:min-h-[36px] ${
                        scanMode === 'qr' ? 'text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                      style={scanMode === 'qr' ? { background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' } : undefined}
                    >
                      <QrCodeIcon className="w-3.5 h-3.5" />
                      QR Code
                    </button>
                    <button
                      onClick={() => setScanMode('barcode')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[13px] font-semibold transition-colors min-h-[44px] sm:min-h-[36px] ${
                        scanMode === 'barcode' ? 'text-black' : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                      style={scanMode === 'barcode' ? { background: 'linear-gradient(135deg, #FCD34D, #F59E0B)' } : undefined}
                    >
                      <UiIcon name="barcode" className="w-3.5 h-3.5" />
                      Barcode
                    </button>
                  </div>
                </div>

                {/* Camera toggle button */}
                {!scanning ? (
                  <Btn variant="primary" onClick={startScanner}>
                    <PlayIcon className="w-4 h-4" />
                    <span>تشغيل الكاميرا</span>
                  </Btn>
                ) : (
                  <Btn variant="danger" onClick={stopScanner}>
                    <StopIcon className="w-4 h-4" />
                    <span>إيقاف</span>
                  </Btn>
                )}
              </div>

              {/* Title row */}
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  scanMode === 'qr'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-emerald-500/10 text-emerald-500'
                }`}>
                  {scanMode === 'qr' ? <QrCodeIcon className="w-5 h-5" /> : <UiIcon name="barcode" className="w-5 h-5" />}
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-white">
                    {scanMode === 'qr' ? 'ماسح QR Code' : 'ماسح الباركود'}
                  </h2>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {scanMode === 'qr' ? 'وجّه الكاميرا نحو كود QR الخاص بالعضو' : 'وجّه الكاميرا نحو الباركود الخاص بالعضو'}
                  </p>
                </div>
              </div>
          </div>

          {/* Scanner Area Card */}
          <div className={`${CARD} p-4 sm:p-5`}>
              {scannerError && (
                <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
                  <UiIcon name="close" className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-rose-400 text-sm">{scannerError}</p>
                </div>
              )}

              {/* Scanner viewport */}
              <div className="relative rounded-xl overflow-hidden bg-black ring-1 ring-white/5">
                <div
                  id="qr-scanner-region"
                  className="w-full max-w-sm mx-auto"
                />
                {!scanning && (
                  <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-primary/5 flex items-center justify-center mb-4 border border-dark-border">
                      <CameraIcon className="w-8 h-8 sm:w-10 sm:h-10 text-primary/40" />
                    </div>
                    <p className="text-sm text-gray-500 text-center">
                      {scannerError
                        ? 'الكاميرا مش شغالة — جهاز الباركود لسه بيشتغل من غير ضغط'
                        : autoCamera
                          ? 'جاري تشغيل الكاميرا...'
                          : 'اضغط على "تشغيل الكاميرا" لبدء المسح'}
                    </p>
                    {!scannerError && autoCamera && (
                      <p className="text-[11px] text-gray-600 text-center mt-2">لو الكاميرا اتقفلت، اضغط تشغيل من جديد</p>
                    )}
                  </div>
                )}
                {scanning && (
                  <div className="absolute top-3 left-3 flex items-center gap-2 px-3 py-1.5 bg-black/80 backdrop-blur-sm rounded-lg border border-emerald-500/20">
                    <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                    <span className="text-xs text-emerald-400 font-medium">يمسح...</span>
                  </div>
                )}
              </div>

              {/* Scan counter */}
              {scanCount > 0 && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/15 rounded-xl">
                    <UiIcon name="check" className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-gray-400">تم تسجيل</span>
                    <span className="text-sm font-bold text-emerald-400">{scanCount}</span>
                    <span className="text-xs text-gray-400">عملية اليوم</span>
                  </div>
                </div>
              )}

              {/* Manual entry */}
              <div className="mt-5 pt-5 border-t border-dark-border">
                <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mb-3">
                  <UiIcon name="search" className="w-3.5 h-3.5 text-gray-500" />
                  <label className="text-xs font-semibold text-gray-400">
                    كود العضو / الموظف
                  </label>
                  <span className="text-[11px] text-gray-600">جهاز الباركود بيكتب هنا لوحده ويسجّل على طول</span>
                </div>
                <form onSubmit={handleManualCheckin} className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="امسح الكارت بجهاز الباركود أو اكتب الكود"
                    autoComplete="off"
                    enterKeyHint="go"
                    className={`${FIELD} flex-1 min-w-0`}
                  />
                  <Btn type="submit" variant="primary" disabled={!manualCode.trim()} className="flex-shrink-0">
                    تسجيل
                  </Btn>
                </form>
              </div>
          </div>

          {/* ─── Last Scan Result Toast ─── */}
          {lastScan && (
            <div className={`rounded-2xl border p-4 sm:p-5 transition-all duration-500 animate-in fade-in slide-in-from-top-2 ${
              lastScan.type === 'success'
                ? 'bg-emerald-500/5 border-emerald-500/20'
                : lastScan.type === 'warning'
                ? 'bg-primary/5 border-primary/20'
                : 'bg-rose-500/5 border-rose-500/20'
            }`}>
              <div className="flex items-start gap-3">
                <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                  lastScan.type === 'success'
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : lastScan.type === 'warning'
                    ? 'bg-primary/10 text-primary'
                    : 'bg-rose-500/10 text-rose-400'
                }`}>
                  {lastScan.type === 'success' && <UiIcon name="check" className="w-5 h-5" />}
                  {lastScan.type === 'warning' && <UiIcon name="warning" className="w-5 h-5" />}
                  {lastScan.type === 'error' && <UiIcon name="close" className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  {lastScan.memberName && (
                    <p className={`text-sm font-bold truncate flex items-center gap-2 ${
                      lastScan.type === 'success' ? 'text-emerald-300' :
                      lastScan.type === 'warning' ? 'text-primary' : 'text-rose-300'
                    }`}>
                      {lastScan.memberName}
                      {lastScan.kind === 'staff' && (
                        <span className="flex-shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-300">
                          وردية موظف{lastScan.code ? ` · ${lastScan.code}` : ''}
                        </span>
                      )}
                    </p>
                  )}
                  <p className={`text-sm mt-0.5 ${
                    lastScan.type === 'success' ? 'text-emerald-400/70' :
                    lastScan.type === 'warning' ? 'text-primary/80' : 'text-rose-400/70'
                  }`}>
                    {lastScan.message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ Today's Attendance Tab ═══════════════ */}
      {activeTab === 'today' && (
        <div className="space-y-4 sm:space-y-5">

          {/* ─── Summary Cards ─── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <StatTile
              icon="users"
              tone={TONE.members}
              label="إجمالي الحضور"
              value={summary.total}
            />
            <StatTile
              icon="check"
              tone={TONE.revenue}
              label="حاضر الآن"
              value={summary.checkedIn}
            />
            <StatTile
              icon="clock"
              tone={TONE.attendance}
              label="انصرف"
              value={summary.checkedOut}
            />
            <StatTile
              icon="warning"
              tone={TONE.expenses}
              label="تنبيهات"
              value={summary.flagged}
            />
          </div>

          {/* ─── Attendance List Card ─── */}
          <div className={`${CARD} overflow-hidden`}>
            {loading ? (
              <Loading />
            ) : todayAttendance.length === 0 ? (
              <EmptyState title="لا يوجد حضور اليوم" />
            ) : (
              <>
                {/* ── Mobile Cards ── */}
                <div className="sm:hidden p-3 space-y-3">
                  {todayAttendance.map(record => (
                    <ListCard key={record.id}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{record.memberName}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="font-mono text-xs text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-lg">{record.memberCode}</span>
                            <span className="text-xs text-gray-600">•</span>
                            <p className="text-xs text-gray-500 truncate">{record.memberPhone}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {record.flagged ? (
                            <Badge tone="red">
                              <UiIcon name="warning" className="w-3 h-3" />
                              {record.flagReason}
                            </Badge>
                          ) : (
                            <Badge tone="green">
                              <UiIcon name="check" className="w-3 h-3" />
                              سليم
                            </Badge>
                          )}
                          {!record.checkOutTime && (
                            <Btn size="sm" variant="primary" onClick={() => handleCheckout(record.id)}>
                              <LogOutIcon className="w-3.5 h-3.5" />
                              انصراف
                            </Btn>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-dark-border/40 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <UiIcon name="clock" className="w-3 h-3" />
                          حضور: {formatTime(record.checkInTime)}
                        </span>
                        {record.checkOutTime && (
                          <span className="flex items-center gap-1">
                            <LogOutIcon className="w-3 h-3" />
                            انصراف: {formatTime(record.checkOutTime)}
                          </span>
                        )}
                      </div>
                    </ListCard>
                  ))}
                </div>

                {/* ── Desktop Table ── */}
                <div className="hidden sm:block">
                  <TableShell
                    head={
                      <>
                        <Th>العضو</Th>
                        <Th>الكود</Th>
                        <Th>وقت الحضور</Th>
                        <Th>وقت الانصراف</Th>
                        <Th>الحالة</Th>
                        <Th>إجراء</Th>
                      </>
                    }
                  >
                    {todayAttendance.map(record => (
                      <Row key={record.id}>
                        <Td>
                          <div className="text-sm font-semibold text-white">{record.memberName}</div>
                          <div className="text-xs text-gray-500 mt-0.5">{record.memberPhone}</div>
                        </Td>
                        <Td>
                          <span className="font-mono text-sm text-primary bg-primary/10 border border-primary/20 px-2 py-1 rounded-lg">{record.memberCode}</span>
                        </Td>
                        <Td>
                          <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                            <UiIcon name="clock" className="w-3.5 h-3.5 text-gray-500" />
                            {formatTime(record.checkInTime)}
                          </span>
                        </Td>
                        <Td>
                          {record.checkOutTime ? (
                            <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                              <LogOutIcon className="w-3.5 h-3.5 text-gray-500" />
                              {formatTime(record.checkOutTime)}
                            </span>
                          ) : (
                            <span className="text-gray-600">—</span>
                          )}
                        </Td>
                        <Td>
                          {record.flagged ? (
                            <Badge tone="red">
                              <UiIcon name="warning" className="w-3.5 h-3.5" />
                              {record.flagReason}
                            </Badge>
                          ) : (
                            <Badge tone="green">
                              <UiIcon name="check" className="w-3.5 h-3.5" />
                              سليم
                            </Badge>
                          )}
                        </Td>
                        <Td>
                          {!record.checkOutTime && (
                            <Btn size="sm" variant="primary" onClick={() => handleCheckout(record.id)}>
                              <LogOutIcon className="w-3.5 h-3.5" />
                              انصراف
                            </Btn>
                          )}
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
    </div>
  );
}
