import { useState, useEffect, useRef } from 'react';
import { arDate } from '../utils/dates';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { addPendingOperation } from '../utils/offlineDb';
import JsBarcode from 'jsbarcode';
import { whatsappLink, displayPhone } from '../utils/whatsapp';
import { bmiOf } from '../utils/bodyMetrics';
import { elementText, openPrintWindow } from '../utils/printDocument';
import BmiIndicator from '../components/BmiIndicator';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';
import MemberFormModal, { MemberFormValues } from '../components/MemberFormModal';
import SubscriptionsPanel from '../components/SubscriptionsPanel';
import { Badge, Btn, SectionTitle, Loading, UiIcon, CARD } from '../components/ui';
import { Stagger } from '../components/Motion';

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
    photoPath?: string | null;
    weightKg?: number | null;
    heightCm?: number | null;
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
  const [showEdit, setShowEdit] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'subscriptions' | 'attendance'>('info');
  const [newSubSignal, setNewSubSignal] = useState(0);
  const [renewSignal, setRenewSignal] = useState(0);

  // Leaving a tab drops any pending «new subscription» or «renew» request so coming back stays quiet.
  const goTab = (next: 'info' | 'subscriptions' | 'attendance') => {
    setActiveTab(next);
    setNewSubSignal(0);
    setRenewSignal(0);
  };
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

  const handleMemberEdit = async (values: MemberFormValues) => {
    if (!member) return;
    if (!isOnline) {
      setEditError('تعديل بيانات العض محتاج إنترنت');
      return;
    }

    setEditSubmitting(true);
    setEditError('');
    try {
      const res = await fetch(`/api/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: values.name,
          phone: values.phone,
          email: values.email,
          gender: values.gender,
          status: values.status,
          memberCode: values.memberCode
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setEditError(data.message || 'حدث خطأ في تعديل العضو');
        return;
      }

      setShowEdit(false);
      setNotice({ kind: 'ok', text: `تم تحديث بيانات "${values.name}"` });
      fetchMember();
      fetchQR();
    } catch {
      setEditError('حدث خطأ في الاتصال بالخادم');
    } finally {
      setEditSubmitting(false);
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
    const tones: Record<string, { tone: 'green' | 'red' | 'amber' | 'gold'; label: string }> = {
      ACTIVE: { tone: 'green', label: 'نشط' },
      EXPIRED: { tone: 'red', label: 'منتهي' },
      SUSPENDED: { tone: 'amber', label: 'موقوف' },
      FROZEN: { tone: 'gold', label: 'مجمد' },
    };
    const c = tones[status] || tones.EXPIRED;
    return <Badge tone={c.tone}>{c.label}</Badge>;
  };

  const formatPrice = (piasters: number) => {
    return (piasters / 100).toLocaleString('ar-EG-u-nu-latn') + ' ج.م';
  };

  if (loading) {
    return <Loading />;
  }

  if (!member) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">العضو غير موجود</div>
      </div>
    );
  }

  const activeSubscription = member?.subscriptions.find(s => s.status === 'ACTIVE');
  const personBmi = bmiOf(member.person.weightKg, member.person.heightCm);
  const totalPaid = member?.subscriptions.reduce((sum, sub) => {
    return sum + sub.payments.reduce((pSum, p) => pSum + p.amountPiasters, 0);
  }, 0) || 0;

  return (
    <Stagger className="space-y-5 sm:space-y-7">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <button
            onClick={() => navigate('/admin/members')}
            aria-label="رجوع"
            className="w-11 h-11 sm:w-10 sm:h-10 flex items-center justify-center hover:bg-dark-card rounded-lg transition-colors shrink-0"
          >
            <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {member.person.photoPath && (
            <img
              src={member.person.photoPath}
              alt=""
              className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl object-cover border border-dark-border bg-dark-card shrink-0"
            />
          )}
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white truncate">{member.person.name}</h1>
            <p className="text-gray-400 mt-1 text-xs sm:text-sm">
              {member.branch.name} • {member.memberCode}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {getStatusBadge(member.status)}
          {hasPermission(activeSubscription ? 'RENEW_SUBSCRIPTIONS' : 'CREATE_SUBSCRIPTIONS') && (
            <Btn
              variant="primary"
              icon={activeSubscription ? 'refresh' : 'plus'}
              onClick={() => {
                // Renewal has one home and it is right here: one tap opens the form for the
                // period that is running now, with the money fields already filled in.
                setActiveTab('subscriptions');
                if (activeSubscription) setRenewSignal(n => n + 1);
                else setNewSubSignal(n => n + 1);
              }}
            >
              {activeSubscription ? 'تجديد الاشتراك' : 'إضافة اشتراك'}
            </Btn>
          )}
          {hasPermission('EDIT_MEMBERS') && (
            <Btn
              variant="ghost"
              icon="edit"
              onClick={() => {
                setEditError('');
                setShowEdit(true);
              }}
            >
              تعديل البيانات
            </Btn>
          )}
          {hasPermission('DELETE_MEMBERS') && (
            <Btn variant="danger" icon="trash" onClick={() => setConfirmOpen(true)}>
              حذف العضو
            </Btn>
          )}
        </div>
      </div>

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Tabs */}
      <div className="flex gap-2 border-b border-dark-border">
        <button
          onClick={() => goTab('info')}
          className={`px-4 py-2.5 min-h-11 text-sm font-medium transition-colors ${
            activeTab === 'info'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          المعلومات
        </button>
        <button
          onClick={() => goTab('subscriptions')}
          className={`px-4 py-2.5 min-h-11 text-sm font-medium transition-colors ${
            activeTab === 'subscriptions'
              ? 'text-primary border-b-2 border-primary'
              : 'text-gray-400 hover:text-white'
          }`}
        >
          الاشتراكات ({member?.subscriptions.length || 0})
        </button>
        <button
          onClick={() => goTab('attendance')}
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
          <div className={`lg:col-span-2 ${CARD} p-6`}>
            <div className="mb-4">
              <SectionTitle>معلومات العضو</SectionTitle>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">الاسم</label>
                <p className="text-white font-medium">{member.person.name}</p>
              </div>
              <div className="min-w-0">
                <label className="block text-sm text-gray-400 mb-1">الهاتف</label>
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-white font-medium">{displayPhone(member.person.phone)}</p>
                  {whatsappLink(member.person.phone) && (
                    <a
                      href={whatsappLink(member.person.phone) as string}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-center gap-1.5 px-2.5 py-1 min-h-[44px] sm:min-h-[36px] rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-medium"
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
                <p className="text-white font-medium">
                  {member.person.gender === 'Male' ? 'ذكر' : member.person.gender === 'Female' ? 'أنثى' : '—'}
                </p>
              </div>
              {personBmi !== null && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">الوزن</label>
                    <p className="text-white font-medium" dir="ltr">{member.person.weightKg} كجم</p>
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">الطول</label>
                    <p className="text-white font-medium" dir="ltr">{member.person.heightCm} سم</p>
                  </div>
                </>
              )}
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
                  {arDate(member.createdAt)}
                </p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">إجمالي المدفوعات</label>
                <p className="text-emerald-400 font-bold">{formatPrice(totalPaid)}</p>
              </div>
            </div>
          </div>

          {/* QR & Barcode Card */}
          <div className={`${CARD} p-6`}>
            <div className="mb-4">
              <SectionTitle>بطاقة العضو</SectionTitle>
            </div>
            <div className="space-y-4">
              {qrImage && (
                <div className="bg-white p-4 rounded-lg flex items-center justify-center">
                  <img src={qrImage} alt="QR Code" className="w-48 h-48" />
                </div>
              )}
              <div className="bg-white p-4 rounded-lg flex items-center justify-center">
                <svg ref={barcodeRef} className="w-full"></svg>
              </div>
              <Btn
                onClick={() => {
                  openPrintWindow({
                    title: `بطاقة ${member.person.name}`,
                    css: `body { font-family: Arial; text-align: center; padding: 20px; }
                      .qr { margin: 20px auto; }
                      .barcode { margin: 20px auto; }
                      .name { font-size: 24px; font-weight: bold; margin: 10px 0; }
                      .code { font-size: 18px; color: #666; }`,
                    build: (doc) => {
                      const qr = doc.createElement('div');
                      qr.className = 'qr';
                      if (qrImage) {
                        const img = doc.createElement('img');
                        img.src = qrImage;
                        qr.appendChild(img);
                      }
                      const barcode = doc.createElement('div');
                      barcode.className = 'barcode';
                      if (barcodeRef.current) barcode.appendChild(doc.importNode(barcodeRef.current, true));
                      return [
                        elementText(doc, 'div', 'name', member.person.name),
                        elementText(doc, 'div', 'code', member.memberCode),
                        qr,
                        barcode
                      ];
                    }
                  })?.print();
                }}
                variant="primary"
                icon="print"
                className="w-full"
              >
                طباعة البطاقة
              </Btn>
            </div>
          </div>

          {personBmi !== null && (
            <div className="lg:col-span-2">
              <BmiIndicator
                weightKg={member.person.weightKg}
                heightCm={member.person.heightCm}
                title="مؤشر كتلة الجسم للعضو"
              />
            </div>
          )}
        </div>
      )}

      {/* Subscriptions Tab — the whole subscriptions workspace scoped to this member,
          so renewal, payment, freezing and the receipt all happen without leaving his page. */}
      {activeTab === 'subscriptions' && (
        <SubscriptionsPanel
          memberId={member.id}
          openNewSignal={newSubSignal}
          renewSignal={renewSignal}
          renewSubscriptionId={activeSubscription?.id}
          onChanged={fetchMember}
        />
      )}

      {/* Attendance Tab */}
      {activeTab === 'attendance' && (
        <div className={`${CARD} overflow-hidden`}>
          <div className="p-4 sm:p-5 border-b border-dark-border">
            <SectionTitle>سجل الحضور (آخر 10 زيارات)</SectionTitle>
          </div>
          {member?.attendances.length === 0 ? (
            <div className="p-8 text-center text-gray-400">لا يوجد سجل حضور</div>
          ) : (
            <div className="divide-y divide-dark-border">
              {member?.attendances.map(att => (
                <div key={att.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center text-primary">
                      <UiIcon name="clock" className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-white font-medium">
                        {arDate(att.checkInTime)}
                      </p>
                      <p className="text-sm text-gray-400">
                        {new Date(att.checkInTime).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className="text-left">
                    <Badge tone={att.method === 'QR_CODE' ? 'gold' : att.method === 'BARCODE' ? 'amber' : 'gray'}>
                      {att.method === 'QR_CODE' ? 'QR' : att.method === 'BARCODE' ? 'باركود' : 'يدوي'}
                    </Badge>
                    {att.checkOutTime && (
                      <p className="text-xs text-gray-400 mt-1">
                        خروج: {new Date(att.checkOutTime).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showEdit && member && (
        <MemberFormModal
          key={member.id}
          mode="edit"
          initial={{
            name: member.person.name,
            phone: member.person.phone.startsWith('pending-') ? '' : member.person.phone,
            memberCode: member.memberCode,
            email: member.person.email || '',
            gender: member.person.gender === 'Female' ? 'Female' : 'Male',
            branchId: member.branch.id,
            status: member.status
          }}
          branches={[]}
          lockedBranchName={member.branch.name}
          submitting={editSubmitting}
          offline={!isOnline}
          error={editError}
          onClose={() => { setShowEdit(false); setEditError(''); }}
          onSubmit={handleMemberEdit}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="حذف العضو"
        description={member ? `سيتم حذف "${member.person.name}" نهائياً مع اشتراكاته وسجل حضوره.` : ''}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </Stagger>
  );
}

export default MemberDetailPage;
