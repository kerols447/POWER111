import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation } from '../utils/offlineDb';
import JsBarcode from 'jsbarcode';
import { whatsappLink } from '../utils/whatsapp';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';

interface Member {
  id: string;
  memberCode: string;
  status: string;
  person: {
    id: string;
    name: string;
    phone: string;
    email?: string;
    gender?: string;
    photoPath?: string;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  };
  subscriptions: Subscription[];
  attendances: Array<{
    id: string;
    checkInTime: string;
    checkOutTime?: string;
    method: string;
  }>;
  createdAt: string;
}

interface Subscription {
  id: string;
  startDate: string;
  endDate: string;
  status: string;
  plan: {
    id: string;
    name: string;
    nameAr?: string;
    durationDays: number;
    pricePiasters: number;
  };
  payments: Array<{
    id: string;
    amountPiasters: number;
    createdAt: string;
  }>;
}

function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, hasPermission } = useAuth();
  const isOnline = useOnlineStatus();
  const [member, setMember] = useState<Member | null>(null);
  const [qrImage, setQrImage] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'subscriptions' | 'attendance'>('info');
  const barcodeRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (id) {
      fetchMember();
      fetchQR();
    }
  }, [id]);

  useEffect(() => {
    if (member && barcodeRef.current) {
      JsBarcode(barcodeRef.current, member.memberCode, {
        format: 'CODE128',
        width: 2,
        height: 60,
        displayValue: true,
        fontSize: 14,
        margin: 10,
      });
    }
  }, [member]);

  const fetchMember = async () => {
    try {
      const res = await fetch(`/api/members/${id}`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.data) {
        setMember(data.data);
      } else {
        navigate('/admin/members');
      }
    } catch (err) {
      console.error('Error fetching member:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchQR = async () => {
    try {
      const res = await fetch(`/api/members/${id}/qr`, { credentials: 'include' });
      const data = await res.json();
      if (res.ok && data.data?.qrImage) {
        setQrImage(data.data.qrImage);
      }
    } catch (err) {
      console.error('Error fetching QR:', err);
    }
  };

  const handleDelete = async () => {
    if (!member) return;
    setDeleting(true);
    const memberName = member.person.name;

    if (!isOnline) {
      try {
        await addPendingOperation({
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'DELETE_MEMBER',
          payload: { memberId: member.id },
          timestamp: Date.now(),
          branchId: member.branch.id,
          userId: user!.id
        });
        setNotice({ kind: 'ok', text: 'تم حفظ الحذف محلياً — سيتم التزامن عند عودة الاتصال' });
        setTimeout(() => navigate('/admin/members'), 800);
      } catch {
        setNotice({ kind: 'err', text: 'تعذر حذف العضو — أعد المحاولة' });
      } finally {
        setDeleting(false);
        setConfirmOpen(false);
      }
      return;
    }

    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        navigate('/admin/members');
      } else {
        const data = await res.json().catch(() => ({}));
        setNotice({ kind: 'err', text: data.error || data.message || 'حدث خطأ في حذف العضو' });
      }
    } catch {
      try {
        await addPendingOperation({
          id: `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
          type: 'DELETE_MEMBER',
          payload: { memberId: member.id },
          timestamp: Date.now(),
          branchId: member.branch.id,
          userId: user!.id
        });
        setNotice({ kind: 'ok', text: `تم حفظ حذف "${memberName}" محلياً — سيُزامَن عند عودة الاتصال` });
        setTimeout(() => navigate('/admin/members'), 800);
      } catch {
        setNotice({ kind: 'err', text: 'تعذر حذف العضو — أعد المحاولة' });
      }
    } finally {
      setDeleting(false);
      setConfirmOpen(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      ACTIVE: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50',
      EXPIRED: 'bg-rose-500/20 text-rose-400 border-rose-500/50',
      SUSPENDED: 'bg-amber-500/20 text-amber-400 border-amber-500/50',
      FROZEN: 'bg-primary/10 text-primary border-primary/50',
    };
    const labels: Record<string, string> = {
      ACTIVE: 'نشط',
      EXPIRED: 'منتهي',
      SUSPENDED: 'موقوف',
      FROZEN: 'مجمد',
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs border ${colors[status] || colors.EXPIRED}`}>
        {labels[status] || status}
      </span>
    );
  };

  const formatPrice = (piasters: number) => {
    return (piasters / 100).toLocaleString('ar-EG') + ' ج.م';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">العضو غير موجود</div>
      </div>
    );
  }

  const activeSubscription = member?.subscriptions.find(s => s.status === 'ACTIVE');
  const totalPaid = member?.subscriptions.reduce((sum, sub) => {
    return sum + sub.payments.reduce((pSum, p) => pSum + p.amountPiasters, 0);
  }, 0) || 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/admin/members')}
            aria-label="رجوع"
            className="w-10 h-10 flex items-center justify-center hover:bg-dark-card rounded-lg transition-colors flex-shrink-0"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-white truncate">{member.person.name}</h1>
            <p className="text-gray-400 mt-1 text-xs sm:text-sm">
              {member.branch.name} • {member.memberCode}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge(member.status)}
          {hasPermission('DELETE_MEMBERS') && (
            <button
              onClick={() => setConfirmOpen(true)}
              className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-sm rounded-lg transition-colors"
            >
              حذف العضو
            </button>
          )}
        </div>
      </div>

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-dark-border">
        <button
          onClick={() => setActiveTab('info')}
          className={`px-4 py-2.5 min-h-11 text-sm font-medium transition-colors ${
            activeTab === 'info'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          المعلومات
        </button>
        <button
          onClick={() => setActiveTab('subscriptions')}
          className={`px-4 py-2.5 min-h-11 text-sm font-medium transition-colors ${
            activeTab === 'subscriptions'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          الاشتراكات ({member?.subscriptions.length || 0})
        </button>
        <button
          onClick={() => setActiveTab('attendance')}
          className={`px-4 py-2.5 min-h-11 text-sm font-medium transition-colors ${
            activeTab === 'attendance'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          الحضور
        </button>
      </div>

      {/* Info Tab */}
      {activeTab === 'info' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Member Info Card */}
          <div className="lg:col-span-2 bg-dark-card border border-dark-border rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">معلومات العضو</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">الاسم</label>
                <p className="text-white font-medium">{member.person.name}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">الهاتف</label>
                <div className="flex items-center gap-3">
                  <p className="text-white font-medium">{member.person.phone}</p>
                  {whatsappLink(member.person.phone) && (
                    <a
                      href={whatsappLink(member.person.phone) as string}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1 min-h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-medium"
                    >
                      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2z" />
                      </svg>
                      محادثة واتساب
                    </a>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">البريد الإلكتروني</label>
                <p className="text-white font-medium">{member.person.email || '—'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">النوع</label>
                <p className="text-white font-medium">{member.person.gender === 'Male' ? 'ذكر' : 'أنثى'}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">الكود</label>
                <p className="text-primary font-mono font-bold">{member.memberCode}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">الفرع</label>
                <p className="text-white font-medium">{member.branch.name}</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">تاريخ الانضمام</label>
                <p className="text-white font-medium">
                  {new Date(member.createdAt).toLocaleDateString('ar-EG')}
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">إجمالي المدفوعات</label>
                <p className="text-emerald-400 font-bold">{formatPrice(totalPaid)}</p>
              </div>
            </div>
          </div>

          {/* QR & Barcode Card */}
          <div className="bg-dark-card border border-dark-border rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">بطاقة العضو</h2>
            <div className="space-y-4">
              {qrImage && (
                <div className="bg-white p-4 rounded-lg flex items-center justify-center">
                  <img src={qrImage} alt="QR Code" className="w-48 h-48" />
                </div>
              )}
              <div className="bg-white p-4 rounded-lg flex items-center justify-center">
                <svg ref={barcodeRef} className="w-full"></svg>
              </div>
              <button
                onClick={() => {
                  const printWindow = window.open('', '_blank');
                  if (printWindow) {
                    printWindow.document.write(`
                      <html>
                        <head>
                          <title>بطاقة ${member.person.name}</title>
                          <style>
                            body { font-family: Arial; text-align: center; padding: 20px; }
                            .qr { margin: 20px auto; }
                            .barcode { margin: 20px auto; }
                            .name { font-size: 24px; font-weight: bold; margin: 10px 0; }
                            .code { font-size: 18px; color: #666; }
                          </style>
                        </head>
                        <body>
                          <div class="name">${member.person.name}</div>
                          <div class="code">${member.memberCode}</div>
                          <div class="qr"><img src="${qrImage}" /></div>
                          <div class="barcode">${barcodeRef.current?.outerHTML || ''}</div>
                        </body>
                      </html>
                    `);
                    printWindow.document.close();
                    printWindow.print();
                  }
                }}
                className="w-full py-2 bg-primary hover:bg-primary-dark text-white rounded-lg transition-colors"
              >
                طباعة البطاقة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-4">
          {/* Active Subscription Summary */}
          {activeSubscription && (
            <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-emerald-400">الاشتراك النشط</h3>
                {getStatusBadge(activeSubscription.status)}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">الخطة</label>
                  <p className="text-white font-bold">{activeSubscription.plan.nameAr || activeSubscription.plan.name}</p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">تاريخ البدء</label>
                  <p className="text-white font-medium">
                    {new Date(activeSubscription.startDate).toLocaleDateString('ar-EG')}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">تاريخ الانتهاء</label>
                  <p className="text-white font-medium">
                    {new Date(activeSubscription.endDate).toLocaleDateString('ar-EG')}
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">المدة</label>
                  <p className="text-white font-medium">{activeSubscription.plan.durationDays} يوم</p>
                </div>
              </div>
            </div>
          )}

          {/* All Subscriptions */}
          <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
            <div className="p-4 border-b border-dark-border">
              <h3 className="text-lg font-bold text-white">كل الاشتراكات</h3>
            </div>
            {member?.subscriptions.length === 0 ? (
              <div className="p-8 text-center text-gray-400">لا توجد اشتراكات</div>
            ) : (
              <div className="divide-y divide-dark-border">
                {member?.subscriptions.map(sub => (
                  <div key={sub.id} className="p-4 hover:bg-dark/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="font-bold text-white">{sub.plan.nameAr || sub.plan.name}</span>
                        {getStatusBadge(sub.status)}
                      </div>
                      <span className="text-sm text-gray-400">
                        {new Date(sub.startDate).toLocaleDateString('ar-EG')} - {new Date(sub.endDate).toLocaleDateString('ar-EG')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">
                        المدفوعات: {sub.payments.length} • الإجمالي: {formatPrice(sub.payments.reduce((s, p) => s + p.amountPiasters, 0))}
                      </span>
                      <span className="text-primary font-bold">{formatPrice(sub.plan.pricePiasters)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <div className="bg-dark-card border border-dark-border rounded-xl overflow-hidden">
          <div className="p-4 border-b border-dark-border">
            <h3 className="text-lg font-bold text-white">سجل الحضور (آخر 10 زيارات)</h3>
          </div>
          {member?.attendances.length === 0 ? (
            <div className="p-8 text-center text-gray-400">لا يوجد سجل حضور</div>
          ) : (
            <div className="divide-y divide-dark-border">
              {member?.attendances.map(att => (
                <div key={att.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                      <svg className="w-5 h-5 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        {new Date(att.checkInTime).toLocaleDateString('ar-EG')}
                      </p>
                      <p className="text-sm text-gray-400">
                        {new Date(att.checkInTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <span className={`px-2 py-1 rounded text-xs ${
                      att.method === 'QR_CODE' ? 'bg-purple-500/20 text-purple-400' :
                      att.method === 'BARCODE' ? 'bg-primary/20 text-primary' :
                      'bg-gray-500/20 text-gray-400'
                    }`}>
                      {att.method === 'QR_CODE' ? 'QR' : att.method === 'BARCODE' ? 'باركود' : 'يدوي'}
                    </span>
                    {att.checkOutTime && (
                      <p className="text-xs text-gray-400 mt-1">
                        خروج: {new Date(att.checkOutTime).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="حذف العضو"
        description={member ? `سيتم حذف "${member.person.name}" نهائياً مع اشتراكاته وسجل حضوره.` : ''}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default MemberDetailPage;
