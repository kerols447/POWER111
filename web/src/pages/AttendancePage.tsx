import { useState, useEffect, useRef } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation, getCachedMember, cacheMembers } from '../utils/offlineDb';

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

/* ─────────────────────── SVG Icon Components ─────────────────────── */

const CameraIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
);

const ClipboardIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

const QrCodeIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="8" height="8" rx="1" />
    <rect x="14" y="2" width="8" height="8" rx="1" />
    <rect x="2" y="14" width="8" height="8" rx="1" />
    <rect x="14" y="14" width="4" height="4" rx="0.5" />
    <path d="M20 14h2v2" />
    <path d="M20 20h2v2" />
    <path d="M14 20h2v2" />
  </svg>
);

const BarcodeIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 5v14" />
    <path d="M6 5v14" />
    <path d="M9 5v14" />
    <path d="M13 5v14" />
    <path d="M16 5v14" />
    <path d="M19 5v14" />
    <path d="M21 5v14" />
  </svg>
);

const CheckCircleIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const AlertTriangleIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const XCircleIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const WifiOffIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <line x1="12" y1="20" x2="12.01" y2="20" />
  </svg>
);

const UsersIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

const LogOutIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <polyline points="16 17 21 12 16 7" />
    <line x1="21" y1="12" x2="9" y2="12" />
  </svg>
);

const ClockIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const SearchIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const BuildingIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="2" width="16" height="20" rx="2" ry="2" />
    <path d="M9 22v-4h6v4" />
    <line x1="8" y1="6" x2="8" y2="6" />
    <line x1="12" y1="6" x2="12" y2="6" />
    <line x1="16" y1="6" x2="16" y2="6" />
    <line x1="8" y1="10" x2="8" y2="10" />
    <line x1="12" y1="10" x2="12" y2="10" />
    <line x1="16" y1="10" x2="16" y2="10" />
    <line x1="8" y1="14" x2="8" y2="14" />
    <line x1="12" y1="14" x2="12" y2="14" />
    <line x1="16" y1="14" x2="16" y2="14" />
  </svg>
);

const StopIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
  </svg>
);

const PlayIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const EmptyBoxIcon = ({ className = 'w-12 h-12' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const ScanLineIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7V5a2 2 0 0 1 2-2h2" />
    <path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
    <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <line x1="7" y1="12" x2="17" y2="12" />
  </svg>
);

const ChevronDownIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="6 9 12 15 18 9" />
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
  const [lastScan, setLastScan] = useState<{ success: boolean; message: string; memberName?: string; type: 'success' | 'error' | 'warning' } | null>(null);
  const [manualCode, setManualCode] = useState('');
  const [scanMode, setScanMode] = useState<'qr' | 'barcode'>('qr');
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [scannerError, setScannerError] = useState<string | null>(null);
  const [scanCount, setScanCount] = useState(0);

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
      if (branchList.length > 0 && !selectedBranch) {
        setSelectedBranch(branchList[0].id);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchTodayAttendance = async () => {
    if (!isOnline) return;
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

    try {
      const html5Qrcode = new Html5Qrcode('qr-scanner-region', {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.DATA_MATRIX,
          Html5QrcodeSupportedFormats.PDF_417,
        ],
        verbose: false
      });
      scannerRef.current = html5Qrcode;

      const isMobile = window.innerWidth < 768;
      const config = {
        fps: 15,
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
    } catch (error) {
      console.error('Error starting scanner:', error);
      setScannerError('فشل في تشغيل الكاميرا. تأكد من إعطاء الصلاحيات المطلوبة.');
      setScanning(false);
    }
  };

  const stopScanner = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        scannerRef.current = null;
      } catch (error) {
        console.error('Error stopping scanner:', error);
      }
    }
    setScanning(false);
  };

  const onScanSuccess = async (decodedText: string) => {
    let memberCode = decodedText;

    try {
      const data = JSON.parse(decodedText);
      if (data.memberCode) {
        memberCode = data.memberCode;
      }
    } catch {
      // Plain text - use as-is (barcode typically returns plain member code)
    }

    await handleCheckin(memberCode);
    if (navigator.vibrate) {
      navigator.vibrate(200);
    }
  };

  const handleCheckin = async (memberCode: string) => {
    if (!selectedBranch) {
      setLastScan({ success: false, message: 'الرجاء اختيار الفرع أولاً', type: 'error' });
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
        setLastScan({
          success: true,
          message: data.message || `تم تسجيل حضور ${data.data.memberName}`,
          memberName: data.data.memberName,
          type: data.data.flagged ? 'warning' : 'success'
        });
        if (activeTab === 'today') {
          fetchTodayAttendance();
        }
      } else if (res.status === 409) {
        setLastScan({
          success: false,
          message: data.message || 'العضو مسجل حضوره بالفعل اليوم',
          type: 'warning'
        });
      } else {
        setLastScan({
          success: false,
          message: data.message || 'حدث خطأ في تسجيل الحضور',
          type: 'error'
        });
      }
    } catch (error) {
      console.error('Error checking in:', error);
      await handleOfflineCheckin(memberCode);
    }

    setTimeout(() => setLastScan(null), 5000);
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
      setLastScan({
        success: true,
        message: `تم حفظ الحضور محلياً: ${cached.name}`,
        memberName: cached.name,
        type: 'warning'
      });
    } else {
      setLastScan({
        success: true,
        message: `تم حفظ الحضور محلياً لكود: ${memberCode}`,
        type: 'warning'
      });
    }

    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    setTimeout(() => setLastScan(null), 5000);
  };

  const handleManualCheckin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    await handleCheckin(manualCode.trim());
    setManualCode('');
  };

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
      setLastScan({
        success: true,
        message: `تم حفظ الانصراف محلياً${record ? `: ${record.memberName}` : ''}`,
        memberName: record?.memberName,
        type: 'warning'
      });
      if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
      setTimeout(() => setLastScan(null), 5000);
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
      setLastScan({
        success: true,
        message: `تم حفظ الانصراف محلياً${record ? `: ${record.memberName}` : ''}`,
        memberName: record?.memberName,
        type: 'warning'
      });
      setTimeout(() => setLastScan(null), 5000);
    }
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('ar-EG', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="min-h-screen space-y-4 sm:space-y-6">
      {/* ─── Decorative Background Gradient ─── */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-amber-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -left-20 w-60 h-60 bg-amber-500/3 rounded-full blur-3xl" />
      </div>

      {/* ─── Header ─── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-dark-card via-dark-card to-amber-500/5 border border-dark-border p-4 sm:p-6">
        {/* Decorative corner accent */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-amber-500/10 to-transparent rounded-bl-full" />
        <div className="absolute bottom-0 left-0 w-20 h-20 bg-gradient-to-tr from-amber-500/5 to-transparent rounded-tr-full" />

        <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Icon badge */}
            <div className="flex-shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <ScanLineIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">الحضور والانصراف</h1>
              <p className="text-xs sm:text-sm text-gray-400 mt-0.5">مسح QR Code أو الباركود لتسجيل الحضور</p>
            </div>
          </div>
          {!isOnline && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl backdrop-blur-sm self-start sm:self-center">
              <WifiOffIcon className="w-4 h-4 text-amber-400" />
              <div className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
              <span className="text-xs text-amber-400 font-medium">وضع عدم الاتصال</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Branch Selector ─── */}
      {!singleBranchUser && (
        <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5 transition-all duration-300 hover:border-amber-500/20">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
          <div className="flex items-center gap-2 mb-3">
            <BuildingIcon className="w-4 h-4 text-amber-500/70" />
            <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider">الفرع</label>
          </div>
          <div className="relative">
            <select
              value={selectedBranch}
              onChange={(e) => setSelectedBranch(e.target.value)}
              className="w-full bg-dark border border-dark-border text-white rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all appearance-none cursor-pointer"
            >
              {branches.map(branch => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            <ChevronDownIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
          </div>
        </div>
      )}

      {/* ─── Tabs ─── */}
      <div className="flex gap-2 p-1 bg-dark-card/50 rounded-2xl border border-dark-border">
        <button
          onClick={() => { setActiveTab('scanner'); stopScanner(); }}
          className={`relative flex-1 flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${
            activeTab === 'scanner'
              ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <CameraIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>تسجيل الحضور</span>
        </button>
        <button
          onClick={() => { setActiveTab('today'); stopScanner(); fetchTodayAttendance(); }}
          className={`relative flex-1 flex items-center justify-center gap-2 px-4 sm:px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 ${
            activeTab === 'today'
              ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-500/25'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <ClipboardIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          <span>حضور اليوم</span>
          {summary.total > 0 && (
            <span className="ml-1 min-w-[1.25rem] h-5 flex items-center justify-center bg-white/20 backdrop-blur-sm px-1.5 rounded-full text-xs font-bold">
              {summary.total}
            </span>
          )}
        </button>
      </div>

      {/* ═══════════════ Scanner Tab ═══════════════ */}
      {activeTab === 'scanner' && (
        <div className="space-y-4 sm:space-y-5">

          {/* Scan Mode + Controls Card */}
          <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border transition-all duration-300 hover:border-amber-500/15">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <div className="p-4 sm:p-5">
              {/* Scan mode toggle */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">نوع المسح</span>
                  <div className="flex bg-dark rounded-xl p-1 border border-dark-border">
                    <button
                      onClick={() => setScanMode('qr')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        scanMode === 'qr'
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/20'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <QrCodeIcon className="w-3.5 h-3.5" />
                      QR Code
                    </button>
                    <button
                      onClick={() => setScanMode('barcode')}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-200 ${
                        scanMode === 'barcode'
                          ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md shadow-amber-500/20'
                          : 'text-gray-400 hover:text-white'
                      }`}
                    >
                      <BarcodeIcon className="w-3.5 h-3.5" />
                      Barcode
                    </button>
                  </div>
                </div>

                {/* Camera toggle button */}
                {!scanning ? (
                  <button
                    onClick={startScanner}
                    className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white rounded-xl text-sm font-semibold shadow-lg shadow-amber-500/20 hover:shadow-amber-500/30 transition-all duration-300 active:scale-[0.98]"
                  >
                    <PlayIcon className="w-4 h-4 transition-transform group-hover:scale-110" />
                    <span>تشغيل الكاميرا</span>
                  </button>
                ) : (
                  <button
                    onClick={stopScanner}
                    className="group flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white rounded-xl text-sm font-semibold shadow-lg shadow-rose-500/20 hover:shadow-rose-500/30 transition-all duration-300 active:scale-[0.98]"
                  >
                    <StopIcon className="w-4 h-4 transition-transform group-hover:scale-110" />
                    <span>إيقاف</span>
                  </button>
                )}
              </div>

              {/* Title row */}
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                  scanMode === 'qr'
                    ? 'bg-amber-500/10 text-amber-500'
                    : 'bg-emerald-500/10 text-emerald-500'
                }`}>
                  {scanMode === 'qr' ? <QrCodeIcon className="w-4.5 h-4.5" /> : <BarcodeIcon className="w-4.5 h-4.5" />}
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
          </div>

          {/* Scanner Area Card */}
          <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border transition-all duration-300 hover:border-amber-500/15">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
            <div className="p-4 sm:p-5">
              {scannerError && (
                <div className="mb-4 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
                  <XCircleIcon className="w-5 h-5 text-rose-400 flex-shrink-0 mt-0.5" />
                  <p className="text-rose-400 text-sm">{scannerError}</p>
                </div>
              )}

              {/* Scanner viewport */}
              <div className="relative rounded-xl overflow-hidden bg-black/80 ring-1 ring-white/5">
                <div
                  id="qr-scanner-region"
                  className="w-full max-w-sm mx-auto"
                />
                {!scanning && (
                  <div className="flex flex-col items-center justify-center py-12 sm:py-16 px-4">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 flex items-center justify-center mb-4 border border-amber-500/10">
                      <CameraIcon className="w-8 h-8 sm:w-10 sm:h-10 text-amber-500/40" />
                    </div>
                    <p className="text-sm text-gray-500 text-center">اضغط على "تشغيل الكاميرا" لبدء المسح</p>
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
                    <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-gray-400">تم تسجيل</span>
                    <span className="text-sm font-bold text-emerald-400">{scanCount}</span>
                    <span className="text-xs text-gray-400">عملية اليوم</span>
                  </div>
                </div>
              )}

              {/* Manual entry */}
              <div className="mt-5 pt-5 border-t border-dark-border/60">
                <div className="flex items-center gap-2 mb-3">
                  <SearchIcon className="w-3.5 h-3.5 text-gray-500" />
                  <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    أو أدخل كود العضو يدوياً
                  </label>
                </div>
                <form onSubmit={handleManualCheckin} className="flex gap-2">
                  <input
                    type="text"
                    value={manualCode}
                    onChange={(e) => setManualCode(e.target.value)}
                    placeholder="كود العضو..."
                    className="flex-1 min-w-0 bg-dark border border-dark-border text-white rounded-xl px-4 py-3 text-sm placeholder:text-gray-600 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!manualCode.trim()}
                    className="flex-shrink-0 px-5 sm:px-6 py-3 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white rounded-xl text-sm font-semibold disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:from-amber-500 disabled:hover:to-amber-600 shadow-lg shadow-amber-500/15 hover:shadow-amber-500/25 transition-all duration-300 active:scale-[0.98]"
                  >
                    تسجيل
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* ─── Last Scan Result Toast ─── */}
          {lastScan && (
            <div className={`relative overflow-hidden rounded-2xl border transition-all duration-500 animate-in fade-in slide-in-from-top-2 ${
              lastScan.type === 'success'
                ? 'bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20'
                : lastScan.type === 'warning'
                ? 'bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20'
                : 'bg-gradient-to-br from-rose-500/10 to-rose-600/5 border-rose-500/20'
            }`}>
              {/* Accent bar */}
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${
                lastScan.type === 'success'
                  ? 'bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent'
                  : lastScan.type === 'warning'
                  ? 'bg-gradient-to-r from-transparent via-amber-500/50 to-transparent'
                  : 'bg-gradient-to-r from-transparent via-rose-500/50 to-transparent'
              }`} />
              <div className="p-4 sm:p-5">
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    lastScan.type === 'success'
                      ? 'bg-emerald-500/15'
                      : lastScan.type === 'warning'
                      ? 'bg-amber-500/15'
                      : 'bg-rose-500/15'
                  }`}>
                    {lastScan.type === 'success' && <CheckCircleIcon className="w-5 h-5 text-emerald-400" />}
                    {lastScan.type === 'warning' && <AlertTriangleIcon className="w-5 h-5 text-amber-400" />}
                    {lastScan.type === 'error' && <XCircleIcon className="w-5 h-5 text-rose-400" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    {lastScan.memberName && (
                      <p className={`text-sm font-bold truncate ${
                        lastScan.type === 'success' ? 'text-emerald-300' :
                        lastScan.type === 'warning' ? 'text-amber-300' : 'text-rose-300'
                      }`}>
                        {lastScan.memberName}
                      </p>
                    )}
                    <p className={`text-sm mt-0.5 ${
                      lastScan.type === 'success' ? 'text-emerald-400/70' :
                      lastScan.type === 'warning' ? 'text-amber-400/70' : 'text-rose-400/70'
                    }`}>
                      {lastScan.message}
                    </p>
                  </div>
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
            {/* Total */}
            <div className="group relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5 transition-all duration-300 hover:border-amber-500/20 hover:shadow-lg hover:shadow-amber-500/5">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />
              <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-amber-500/5 rounded-full blur-xl group-hover:bg-amber-500/10 transition-colors" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
                    <UsersIcon className="w-4 h-4 text-amber-500" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-white tracking-tight">{summary.total}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">إجمالي الحضور</p>
              </div>
            </div>

            {/* Checked In */}
            <div className="group relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5 transition-all duration-300 hover:border-emerald-500/20 hover:shadow-lg hover:shadow-emerald-500/5">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent" />
              <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-emerald-500/5 rounded-full blur-xl group-hover:bg-emerald-500/10 transition-colors" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                    <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-emerald-400 tracking-tight">{summary.checkedIn}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">حاضر الآن</p>
              </div>
            </div>

            {/* Checked Out */}
            <div className="group relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5 transition-all duration-300 hover:border-sky-500/20 hover:shadow-lg hover:shadow-sky-500/5">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-sky-500/20 to-transparent" />
              <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-sky-500/5 rounded-full blur-xl group-hover:bg-sky-500/10 transition-colors" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
                    <LogOutIcon className="w-4 h-4 text-sky-500" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-sky-400 tracking-tight">{summary.checkedOut}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">انصرف</p>
              </div>
            </div>

            {/* Flagged */}
            <div className="group relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border p-4 sm:p-5 transition-all duration-300 hover:border-rose-500/20 hover:shadow-lg hover:shadow-rose-500/5 col-span-2 lg:col-span-1">
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-rose-500/20 to-transparent" />
              <div className="absolute -bottom-2 -right-2 w-16 h-16 bg-rose-500/5 rounded-full blur-xl group-hover:bg-rose-500/10 transition-colors" />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-xl bg-rose-500/10 flex items-center justify-center">
                    <AlertTriangleIcon className="w-4 h-4 text-rose-500" />
                  </div>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-rose-400 tracking-tight">{summary.flagged}</p>
                <p className="text-xs text-gray-500 mt-1 font-medium">تنبيهات</p>
              </div>
            </div>
          </div>

          {/* ─── Attendance List Card ─── */}
          <div className="relative overflow-hidden rounded-2xl bg-dark-card border border-dark-border transition-all duration-300">
            <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent" />

            {loading ? (
              <div className="p-12 sm:p-16 flex flex-col items-center justify-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center animate-pulse">
                  <ClockIcon className="w-5 h-5 text-amber-500" />
                </div>
                <p className="text-gray-500 text-sm">جاري التحميل...</p>
              </div>
            ) : todayAttendance.length === 0 ? (
              <div className="p-8 sm:p-16 flex flex-col items-center justify-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500/10 to-amber-600/5 flex items-center justify-center border border-amber-500/10">
                  <EmptyBoxIcon className="w-8 h-8 text-amber-500/30" />
                </div>
                <p className="text-gray-500 text-sm mt-2">لا يوجد حضور اليوم</p>
              </div>
            ) : (
              <>
                {/* ── Mobile Cards ── */}
                <div className="sm:hidden divide-y divide-dark-border/50">
                  {todayAttendance.map(record => (
                    <div key={record.id} className="p-4 hover:bg-white/[0.02] transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{record.memberName}</p>
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="font-mono text-xs text-amber-500/70 bg-amber-500/5 px-1.5 py-0.5 rounded">{record.memberCode}</span>
                            <span className="text-xs text-gray-600">•</span>
                            <p className="text-xs text-gray-500 truncate">{record.memberPhone}</p>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                          {record.flagged ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-rose-500/10 border border-rose-500/15 text-rose-400 rounded-lg text-xs font-medium">
                              <AlertTriangleIcon className="w-3 h-3" />
                              {record.flagReason}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 rounded-lg text-xs font-medium">
                              <CheckCircleIcon className="w-3 h-3" />
                              سليم
                            </span>
                          )}
                          {!record.checkOutTime && (
                            <button
                              onClick={() => handleCheckout(record.id)}
                              className="mt-0.5 flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white rounded-lg text-xs font-semibold shadow-sm shadow-amber-500/15 transition-all duration-200 active:scale-[0.97]"
                            >
                              <LogOutIcon className="w-3 h-3" />
                              انصراف
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                        <span className="flex items-center gap-1">
                          <ClockIcon className="w-3 h-3" />
                          حضور: {formatTime(record.checkInTime)}
                        </span>
                        {record.checkOutTime && (
                          <span className="flex items-center gap-1">
                            <LogOutIcon className="w-3 h-3" />
                            انصراف: {formatTime(record.checkOutTime)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* ── Desktop Table ── */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-dark-border/50">
                        <th className="text-right py-3.5 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">العضو</th>
                        <th className="text-right py-3.5 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">الكود</th>
                        <th className="text-right py-3.5 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">وقت الحضور</th>
                        <th className="text-right py-3.5 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">وقت الانصراف</th>
                        <th className="text-right py-3.5 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">الحالة</th>
                        <th className="text-right py-3.5 px-5 text-xs font-semibold text-gray-500 uppercase tracking-wider">إجراء</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-dark-border/30">
                      {todayAttendance.map(record => (
                        <tr key={record.id} className="group hover:bg-white/[0.02] transition-colors">
                          <td className="py-3.5 px-5">
                            <div className="text-sm font-medium text-white">{record.memberName}</div>
                            <div className="text-xs text-gray-500 mt-0.5">{record.memberPhone}</div>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className="font-mono text-sm text-amber-500/80 bg-amber-500/5 px-2 py-1 rounded-md">{record.memberCode}</span>
                          </td>
                          <td className="py-3.5 px-5">
                            <span className="inline-flex items-center gap-1.5 text-sm text-gray-300">
                              <ClockIcon className="w-3.5 h-3.5 text-gray-500" />
                              {formatTime(record.checkInTime)}
                            </span>
                          </td>
                          <td className="py-3.5 px-5 text-sm text-gray-300">
                            {record.checkOutTime ? (
                              <span className="inline-flex items-center gap-1.5">
                                <LogOutIcon className="w-3.5 h-3.5 text-gray-500" />
                                {formatTime(record.checkOutTime)}
                              </span>
                            ) : (
                              <span className="text-gray-600">—</span>
                            )}
                          </td>
                          <td className="py-3.5 px-5">
                            {record.flagged ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-rose-500/10 border border-rose-500/15 text-rose-400 rounded-lg text-xs font-medium">
                                <AlertTriangleIcon className="w-3.5 h-3.5" />
                                {record.flagReason}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 rounded-lg text-xs font-medium">
                                <CheckCircleIcon className="w-3.5 h-3.5" />
                                سليم
                              </span>
                            )}
                          </td>
                          <td className="py-3.5 px-5">
                            {!record.checkOutTime && (
                              <button
                                onClick={() => handleCheckout(record.id)}
                                className="group/btn inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white rounded-lg text-xs font-semibold shadow-sm shadow-amber-500/15 hover:shadow-amber-500/25 transition-all duration-200 active:scale-[0.97]"
                              >
                                <LogOutIcon className="w-3.5 h-3.5 transition-transform group-hover/btn:translate-x-[-2px]" />
                                انصراف
                              </button>
                            )}
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
    </div>
  );
}
