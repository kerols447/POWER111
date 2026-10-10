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
        qrbox: isMobile
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
        method: 'OFFLINE_SCAN',
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
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-white">الحضور والانصراف</h1>
          <p className="text-sm text-gray-400">مسح QR Code أو الباركود لتسجيل الحضور</p>
        </div>
        {!isOnline && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="w-2 h-2 bg-yellow-400 rounded-full animate-pulse" />
            <span className="text-xs text-yellow-400 font-medium">وضع عدم الاتصال</span>
          </div>
        )}
      </div>

      {/* Branch selector */}
      {!singleBranchUser && (
        <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
          <label className="block text-xs font-medium text-gray-400 mb-2">الفرع</label>
          <select
            value={selectedBranch}
            onChange={(e) => setSelectedBranch(e.target.value)}
            className="w-full bg-dark border border-dark-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
          >
            {branches.map(branch => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => { setActiveTab('scanner'); stopScanner(); }}
          className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'scanner'
              ? 'bg-primary text-white'
              : 'bg-dark-card border border-dark-border text-gray-300 hover:bg-dark-hover'
          }`}
        >
          📷 تسجيل الحضور
        </button>
        <button
          onClick={() => { setActiveTab('today'); stopScanner(); fetchTodayAttendance(); }}
          className={`flex-1 sm:flex-none px-4 sm:px-6 py-2.5 rounded-lg font-medium text-sm transition-colors ${
            activeTab === 'today'
              ? 'bg-primary text-white'
              : 'bg-dark-card border border-dark-border text-gray-300 hover:bg-dark-hover'
          }`}
        >
          📋 حضور اليوم
          {summary.total > 0 && (
            <span className="mr-2 bg-white/20 px-1.5 py-0.5 rounded text-xs">{summary.total}</span>
          )}
        </button>
      </div>

      {/* Scanner Tab */}
      {activeTab === 'scanner' && (
        <div className="space-y-4">
          {/* Scan Mode Toggle */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-400">نوع المسح:</span>
              <div className="flex bg-dark rounded-lg p-1">
                <button
                  onClick={() => setScanMode('qr')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    scanMode === 'qr' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  QR Code
                </button>
                <button
                  onClick={() => setScanMode('barcode')}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    scanMode === 'barcode' ? 'bg-primary text-white' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  Barcode
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm sm:text-base font-semibold text-white">
                  {scanMode === 'qr' ? 'ماسح QR Code' : 'ماسح الباركود'}
                </h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {scanMode === 'qr' ? 'وجّه الكاميرا نحو كود QR الخاص بالعضو' : 'وجّه الكاميرا نحو الباركود الخاص بالعضو'}
                </p>
              </div>
              {!scanning ? (
                <button
                  onClick={startScanner}
                  className="px-4 py-2 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium transition-colors"
                >
                  تشغيل الكاميرا
                </button>
              ) : (
                <button
                  onClick={stopScanner}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  إيقاف
                </button>
              )}
            </div>
          </div>

          {/* Scanner Area */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4">
            {scannerError && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                {scannerError}
              </div>
            )}

            <div className="relative">
              <div
                id="qr-scanner-region"
                className="w-full max-w-sm mx-auto rounded-xl overflow-hidden bg-black"
              />
              {scanning && (
                <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-green-400 flex items-center gap-1">
                  <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                  يمسح...
                </div>
              )}
            </div>

            {/* Scan counter */}
            {scanCount > 0 && (
              <div className="mt-3 text-center">
                <span className="text-xs text-gray-400">تم تسجيل </span>
                <span className="text-sm font-bold text-green-400">{scanCount}</span>
                <span className="text-xs text-gray-400"> عملية اليوم</span>
              </div>
            )}

            {/* Manual entry */}
            <form onSubmit={handleManualCheckin} className="mt-4 pt-4 border-t border-dark-border">
              <label className="block text-xs font-medium text-gray-400 mb-2">
                أو أدخل كود العضو يدوياً
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualCode}
                  onChange={(e) => setManualCode(e.target.value)}
                  placeholder="كود العضو..."
                  className="flex-1 bg-dark border border-dark-border text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-primary"
                />
                <button
                  type="submit"
                  disabled={!manualCode.trim()}
                  className="px-5 py-2.5 bg-primary hover:bg-primary-dark text-white rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  تسجيل
                </button>
              </div>
            </form>
          </div>

          {/* Last scan result */}
          {lastScan && (
            <div className={`p-4 rounded-xl border transition-all ${
              lastScan.type === 'success'
                ? 'bg-green-500/10 border-green-500/30'
                : lastScan.type === 'warning'
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-start gap-3">
                <span className="text-xl">
                  {lastScan.type === 'success' ? '✅' : lastScan.type === 'warning' ? '⚠️' : '❌'}
                </span>
                <div>
                  {lastScan.memberName && (
                    <p className={`text-sm font-bold ${
                      lastScan.type === 'success' ? 'text-green-400' :
                      lastScan.type === 'warning' ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {lastScan.memberName}
                    </p>
                  )}
                  <p className={`text-sm ${
                    lastScan.type === 'success' ? 'text-green-400/80' :
                    lastScan.type === 'warning' ? 'text-yellow-400/80' : 'text-red-400/80'
                  }`}>
                    {lastScan.message}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Today's Attendance Tab */}
      {activeTab === 'today' && (
        <div className="space-y-4">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-white">{summary.total}</p>
              <p className="text-xs text-gray-400 mt-1">إجمالي الحضور</p>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-green-400">{summary.checkedIn}</p>
              <p className="text-xs text-gray-400 mt-1">حاضر الآن</p>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-blue-400">{summary.checkedOut}</p>
              <p className="text-xs text-gray-400 mt-1">انصرف</p>
            </div>
            <div className="bg-dark-card border border-dark-border rounded-xl p-3 sm:p-4 text-center">
              <p className="text-xl sm:text-2xl font-bold text-red-400">{summary.flagged}</p>
              <p className="text-xs text-gray-400 mt-1">تنبيهات</p>
            </div>
          </div>

          {/* Attendance List */}
          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            {loading ? (
              <div className="p-12 text-center text-gray-400">جاري التحميل...</div>
            ) : todayAttendance.length === 0 ? (
              <div className="p-8 sm:p-12 text-center">
                <span className="text-4xl block mb-3">📋</span>
                <p className="text-gray-400">لا يوجد حضور اليوم</p>
              </div>
            ) : (
              <>
                {/* Mobile Cards */}
                <div className="sm:hidden divide-y divide-dark-border">
                  {todayAttendance.map(record => (
                    <div key={record.id} className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-sm font-medium text-white">{record.memberName}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{record.memberCode} • {record.memberPhone}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {record.flagged ? (
                            <span className="px-2 py-0.5 bg-red-500/10 text-red-400 rounded text-xs">
                              ⚠️ {record.flagReason}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-green-500/10 text-green-400 rounded text-xs">
                              ✓ سليم
                            </span>
                          )}
                          {!record.checkOutTime && (
                            <button
                              onClick={() => handleCheckout(record.id)}
                              className="mt-1 px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs"
                            >
                              انصراف
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>حضور: {formatTime(record.checkInTime)}</span>
                        {record.checkOutTime && (
                          <span>انصراف: {formatTime(record.checkOutTime)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-dark">
                      <tr>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">العضو</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">الكود</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">وقت الحضور</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">وقت الانصراف</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">الحالة</th>
                        <th className="text-right py-3 px-4 text-xs font-medium text-gray-400">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {todayAttendance.map(record => (
                        <tr key={record.id} className="border-t border-dark-border hover:bg-dark-hover transition-colors">
                          <td className="py-3 px-4">
                            <div className="text-sm text-white">{record.memberName}</div>
                            <div className="text-xs text-gray-500">{record.memberPhone}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-mono text-sm text-gray-300">{record.memberCode}</span>
                          </td>
                          <td className="py-3 px-4 text-sm text-gray-300">{formatTime(record.checkInTime)}</td>
                          <td className="py-3 px-4 text-sm text-gray-300">
                            {record.checkOutTime ? formatTime(record.checkOutTime) : '—'}
                          </td>
                          <td className="py-3 px-4">
                            {record.flagged ? (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 rounded text-xs">
                                <span>⚠️</span>
                                <span>{record.flagReason}</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded text-xs">
                                <span>✓</span>
                                <span>سليم</span>
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            {!record.checkOutTime && (
                              <button
                                onClick={() => handleCheckout(record.id)}
                                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-medium transition-colors"
                              >
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
