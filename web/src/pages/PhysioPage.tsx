import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import NoticeBanner from '../components/NoticeBanner';
import { displayPhone, whatsappLink } from '../utils/whatsapp';
import {
  PageHeader, StatTile, SectionTitle, Badge, Btn, Picker,
  TableShell, Th, Td, Row, ListCard, EmptyState, Loading, Modal, Field,
  UiIcon, CARD, FIELD, GOLD, TONE
} from '../components/ui';
import { Stagger } from '../components/Motion';

interface PhysioBooking {
  id: string;
  memberId: string;
  branchId: string;
  requestedDate: string;
  note: string | null;
  status: 'PENDING' | 'APPROVED' | 'DECLINED';
  pricePiasters: number | null;
  declineReason: string | null;
  decidedAt: string | null;
  createdAt: string;
  member: {
    id: string;
    memberCode: string;
    person: { name: string; phone: string };
  };
  branch: { id: string; name: string; code: string };
  decidedBy: { id: string; name: string } | null;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

type StatusTab = 'PENDING' | 'APPROVED' | 'DECLINED' | 'ALL';

const STATUS_META: Record<PhysioBooking['status'], { label: string; tone: 'gold' | 'green' | 'red' }> = {
  PENDING: { label: 'قيد المراجعة', tone: 'gold' },
  APPROVED: { label: 'تمت الموافقة', tone: 'green' },
  DECLINED: { label: 'مرفوضة', tone: 'red' }
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString('ar-EG-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

// The gym works the queue by session day, so the label says how far that day is.
function relativeDay(value: string): string | null {
  const target = new Date(value);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'النهاردة';
  if (days === 1) return 'غداً';
  if (days > 1) return `بعد ${days} يوم`;
  if (days === -1) return 'امبارح';
  return null;
}

function formatPrice(piasters: number): string {
  const egp = piasters / 100;
  return `${egp.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} جنيه`;
}

export default function PhysioPage() {
  const { isOwner, hasPermission, user } = useAuth();
  const canManage = hasPermission('MANAGE_PHYSIO');

  const [bookings, setBookings] = useState<PhysioBooking[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [statusTab, setStatusTab] = useState<StatusTab>('PENDING');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const [approving, setApproving] = useState<PhysioBooking | null>(null);
  const [priceInput, setPriceInput] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [declining, setDeclining] = useState<PhysioBooking | null>(null);
  const [reasonInput, setReasonInput] = useState<string>('');
  const [deciding, setDeciding] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (selectedBranch) fetchBookings();
  }, [selectedBranch]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const branchList: Branch[] = Array.isArray(data) ? data : (data.branches || []);
      setBranches(branchList);
      if (branchList.length > 0) {
        setSelectedBranch(branchList[0].id);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch && !isOwner) params.append('branchId', selectedBranch);
      if (selectedBranch && isOwner && branches.length > 1) params.append('branchId', selectedBranch);
      const res = await fetch(`/api/physio?${params}`, { credentials: 'include' });
      const data = await res.json();
      setBookings(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching physio bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const visible = bookings.filter(b => statusTab === 'ALL' || b.status === statusTab);
  const pendingCount = bookings.filter(b => b.status === 'PENDING').length;
  const approvedCount = bookings.filter(b => b.status === 'APPROVED').length;
  const declinedCount = bookings.filter(b => b.status === 'DECLINED').length;

  const openApprove = (booking: PhysioBooking) => {
    setApproving(booking);
    setPriceInput('');
  };

  const handleApprove = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!approving) return;
    const pounds = parseFloat(priceInput);
    if (!Number.isFinite(pounds) || pounds < 0) {
      setNotice({ kind: 'err', text: 'اكتب سعر الجلسة' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/physio/${approving.id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pricePiasters: Math.round(pounds * 100) })
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setNotice({ kind: 'ok', text: `تمت الموافقة على جلسة ${approving.member.person.name}` });
        setApproving(null);
        fetchBookings();
      } else {
        setNotice({ kind: 'err', text: data.message || data.error || 'حدث خطأ أثناء الموافقة' });
      }
    } catch {
      setNotice({ kind: 'err', text: 'حدث خطأ أثناء الموافقة' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!declining) return;
    setDeciding(true);
    try {
      const reason = reasonInput.trim();
      const res = await fetch(`/api/physio/${declining.id}/decline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason: reason || undefined })
      });
      const data = await res.json();
      if (res.ok && data.id) {
        setNotice({ kind: 'ok', text: `تم رفض طلب ${declining.member.person.name}` });
        setDeclining(null);
        setReasonInput('');
        fetchBookings();
      } else {
        setNotice({ kind: 'err', text: data.message || data.error || 'حدث خطأ أثناء الرفض' });
      }
    } catch {
      setNotice({ kind: 'err', text: 'حدث خطأ أثناء الرفض' });
    } finally {
      setDeciding(false);
    }
  };

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;
  const showBranchPicker = !singleBranchUser && branches.length > 1;

  const openDecline = (booking: PhysioBooking) => {
    setDeclining(booking);
    setReasonInput('');
  };

  const renderActions = (booking: PhysioBooking) => {
    if (booking.status !== 'PENDING' || !canManage) return null;
    return (
      <div className="flex items-center gap-2">
        <button
          onClick={() => openApprove(booking)}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 xl:px-3 min-w-[44px] min-h-[44px] sm:min-h-[36px] bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold rounded-lg border border-emerald-500/20 hover:border-emerald-500/40 transition-colors"
        >
          <UiIcon name="check" className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">موافقة وسعر</span>
          <span className="sm:hidden">موافقة</span>
        </button>
        <button
          onClick={() => openDecline(booking)}
          className="inline-flex items-center justify-center gap-1.5 px-2.5 xl:px-3 min-w-[44px] min-h-[44px] sm:min-h-[36px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/20 hover:border-rose-500/40 transition-colors"
        >
          <UiIcon name="close" className="w-3.5 h-3.5" />
          <span>رفض</span>
        </button>
      </div>
    );
  };

  const whatsappHref = (booking: PhysioBooking) => whatsappLink(booking.member.person.phone || '');

  return (
    <Stagger className="space-y-5 sm:space-y-7" dir="rtl">
      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      <PageHeader
        icon="physio"
        title="جلسات العلاج الطبيعي"
        caption="طلبات الجلسات اللي الأعضاء حجزوها من البوابة — وافق وسجّل السعر"
      />

      {/* Whole-dataset counts, whatever tab is open */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          icon="physio"
          tone={TONE.revenue}
          label="قيد المراجعة"
          value={pendingCount}
          caption="محتاجين رد"
        />
        <StatTile
          icon="check"
          tone={TONE.revenue}
          label="تمت الموافقة"
          value={approvedCount}
        />
        <StatTile
          icon="close"
          tone={TONE.expenses}
          label="مرفوضة"
          value={declinedCount}
        />
        <StatTile
          icon="subscriptions"
          tone={TONE.neutral}
          label="إجمالي الطلبات"
          value={bookings.length}
        />
      </div>

      {/* Tabs + branch picker */}
      <div className={`${CARD} p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3`}>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setStatusTab('PENDING')}
            aria-pressed={statusTab === 'PENDING'}
            className={`px-3 py-2 min-h-[44px] rounded-xl text-[13px] font-bold transition-colors ${
              statusTab === 'PENDING' ? 'text-black' : 'text-gray-400 hover:text-white bg-white/5'
            }`}
            style={statusTab === 'PENDING' ? { background: GOLD, boxShadow: '0 1px 10px rgba(0,0,0,.25)' } : undefined}
          >
            قيد المراجعة {pendingCount > 0 ? `(${pendingCount})` : ''}
          </button>
          <button
            onClick={() => setStatusTab('APPROVED')}
            aria-pressed={statusTab === 'APPROVED'}
            className={`px-3 py-2 min-h-[44px] rounded-xl text-[13px] font-bold transition-colors ${
              statusTab === 'APPROVED' ? 'text-black' : 'text-gray-400 hover:text-white bg-white/5'
            }`}
            style={statusTab === 'APPROVED' ? { background: GOLD, boxShadow: '0 1px 10px rgba(0,0,0,.25)' } : undefined}
          >
            تمت الموافقة {approvedCount > 0 ? `(${approvedCount})` : ''}
          </button>
          <button
            onClick={() => setStatusTab('DECLINED')}
            aria-pressed={statusTab === 'DECLINED'}
            className={`px-3 py-2 min-h-[44px] rounded-xl text-[13px] font-bold transition-colors ${
              statusTab === 'DECLINED' ? 'text-black' : 'text-gray-400 hover:text-white bg-white/5'
            }`}
            style={statusTab === 'DECLINED' ? { background: GOLD, boxShadow: '0 1px 10px rgba(0,0,0,.25)' } : undefined}
          >
            مرفوضة {declinedCount > 0 ? `(${declinedCount})` : ''}
          </button>
          <button
            onClick={() => setStatusTab('ALL')}
            aria-pressed={statusTab === 'ALL'}
            className={`px-3 py-2 min-h-[44px] rounded-xl text-[13px] font-bold transition-colors ${
              statusTab === 'ALL' ? 'text-black' : 'text-gray-400 hover:text-white bg-white/5'
            }`}
            style={statusTab === 'ALL' ? { background: GOLD, boxShadow: '0 1px 10px rgba(0,0,0,.25)' } : undefined}
          >
            الكل
          </button>
        </div>
        {showBranchPicker && (
          <Picker
            value={selectedBranch}
            onChange={(v) => setSelectedBranch(v)}
            ariaLabel="الفرع"
            className="w-full lg:w-auto"
            options={branches.map((branch) => ({ value: branch.id, label: branch.name }))}
          />
        )}
      </div>

      {/* Bookings list */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="p-4 sm:p-5 pb-0">
          <SectionTitle>طلبات الجلسات</SectionTitle>
        </div>
        {loading ? (
          <div className="py-6">
            <Loading />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon="physio"
            title={statusTab === 'PENDING' ? 'مفيش طلبات مستنياك' : 'مفيش طلبات هنا'}
            hint={statusTab === 'PENDING' ? 'هتلاقي الطلب هنا أول ما العضو يحجز من البوابة' : 'غيّر التبويب أو الفرع'}
          />
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block">
              <TableShell
                head={
                  <>
                    <Th>العضو</Th>
                    <Th>ميعاد الجلسة</Th>
                    <Th>الحالة</Th>
                    <Th>السعر</Th>
                    <Th className="hidden lg:table-cell">ملاحظة العضو</Th>
                    <Th>إجراءات</Th>
                  </>
                }
              >
                {visible.map((booking) => {
                  const wa = whatsappHref(booking);
                  return (
                    <Row key={booking.id}>
                      <Td>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-white truncate">{booking.member.person.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[11px] text-gray-500">{booking.member.memberCode}</span>
                            <span className="text-[11px] text-gray-500">·</span>
                            <span className="text-[11px] text-gray-400">{displayPhone(booking.member.person.phone)}</span>
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-semibold"
                              >
                                واتساب
                              </a>
                            )}
                          </div>
                        </div>
                      </Td>
                      <Td>
                        <div>
                          <span className="text-sm text-gray-300">{formatDate(booking.requestedDate)}</span>
                          {relativeDay(booking.requestedDate) && (
                            <p className="text-[11px] text-amber-400 mt-0.5">{relativeDay(booking.requestedDate)}</p>
                          )}
                        </div>
                      </Td>
                      <Td>
                        <Badge tone={STATUS_META[booking.status].tone}>{STATUS_META[booking.status].label}</Badge>
                        {booking.status === 'DECLINED' && booking.declineReason && (
                          <p className="text-[11px] text-rose-300/80 mt-1.5 max-w-[190px] leading-snug line-clamp-2">
                            {booking.declineReason}
                          </p>
                        )}
                      </Td>
                      <Td>
                        {booking.pricePiasters !== null ? (
                          <span className="text-sm font-bold text-emerald-400">{formatPrice(booking.pricePiasters)}</span>
                        ) : (
                          <span className="text-sm text-gray-600">—</span>
                        )}
                      </Td>
                      <Td className="hidden lg:table-cell">
                        <span className="text-sm text-gray-400 line-clamp-2">{booking.note || '—'}</span>
                      </Td>
                      <Td>{renderActions(booking)}</Td>
                    </Row>
                  );
                })}
              </TableShell>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden p-3 space-y-3">
              {visible.map((booking) => {
                const wa = whatsappHref(booking);
                return (
                  <ListCard key={booking.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white leading-snug truncate">{booking.member.person.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          <span className="text-[11px] text-gray-500">{booking.member.memberCode}</span>
                          <span className="text-[11px] text-gray-500">{displayPhone(booking.member.person.phone)}</span>
                        </div>
                      </div>
                      <Badge tone={STATUS_META[booking.status].tone}>{STATUS_META[booking.status].label}</Badge>
                    </div>

                    <div className="flex items-center justify-between gap-3 mt-3">
                      <div>
                        <p className="text-[11px] text-gray-500">ميعاد الجلسة</p>
                        <p className="text-sm text-gray-200 mt-0.5">
                          {formatDate(booking.requestedDate)}
                          {relativeDay(booking.requestedDate) && (
                            <span className="text-amber-400 text-[12px] mr-1.5">{relativeDay(booking.requestedDate)}</span>
                          )}
                        </p>
                      </div>
                      <div className="text-left">
                        <p className="text-[11px] text-gray-500">السعر</p>
                        <p className={`text-sm mt-0.5 ${booking.pricePiasters !== null ? 'font-bold text-emerald-400' : 'text-gray-600'}`}>
                          {booking.pricePiasters !== null ? formatPrice(booking.pricePiasters) : '—'}
                        </p>
                      </div>
                    </div>

                    {booking.note && (
                      <p className="text-[12px] text-gray-400 mt-3 leading-relaxed">«{booking.note}»</p>
                    )}

                    {booking.status === 'DECLINED' && booking.declineReason && (
                      <p className="text-[12px] text-rose-300/90 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2 mt-3 leading-relaxed">
                        سبب الرفض: {booking.declineReason}
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-dark-border/30">
                      {wa ? (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20"
                        >
                          <UiIcon name="whatsapp" className="w-3.5 h-3.5" />
                          واتساب
                        </a>
                      ) : (
                        <span className="text-xs text-gray-600">—</span>
                      )}
                      {renderActions(booking)}
                    </div>
                  </ListCard>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Approve modal — price is part of the acceptance */}
      <Modal
        open={!!approving}
        width="max-w-md"
        title="موافقة على الجلسة"
        onClose={() => setApproving(null)}
        footer={
          <>
            <Btn type="submit" form="physio-approve-form" variant="primary" disabled={submitting}>
              {submitting ? 'جاري الحفظ...' : 'موافقة على الجلسة'}
            </Btn>
            <Btn type="button" variant="ghost" onClick={() => setApproving(null)} disabled={submitting}>
              إلغاء
            </Btn>
          </>
        }
      >
        <form id="physio-approve-form" onSubmit={handleApprove} className="space-y-4">
          {approving && (
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
              <p className="text-sm font-semibold text-white">{approving.member.person.name}</p>
              <p className="text-[12px] text-gray-500 mt-1">
                ميعاد الجلسة: {formatDate(approving.requestedDate)}
                {relativeDay(approving.requestedDate) ? ` · ${relativeDay(approving.requestedDate)}` : ''}
              </p>
              {approving.note && <p className="text-[12px] text-gray-400 mt-1.5">«{approving.note}»</p>}
            </div>
          )}
          <Field label="سعر الجلسة (جنيه)" required>
            <input
              type="number"
              required
              min="0"
              step="0.5"
              inputMode="decimal"
              autoFocus
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="مثال: 250"
              className={FIELD}
            />
          </Field>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            العضو هيشوف السعر وحالة الموافقة في بوابة الأعضاء أول ما توافق.
          </p>
        </form>
      </Modal>

      {/* Decline modal — the reason is optional, the member reads it in the portal */}
      <Modal
        open={!!declining}
        width="max-w-md"
        title="رفض الطلب"
        onClose={() => setDeclining(null)}
        footer={
          <>
            <Btn type="submit" form="physio-decline-form" variant="danger" disabled={deciding}>
              {deciding ? 'جاري الحفظ...' : 'رفض الطلب'}
            </Btn>
            <Btn type="button" variant="ghost" onClick={() => setDeclining(null)} disabled={deciding}>
              إلغاء
            </Btn>
          </>
        }
      >
        <form id="physio-decline-form" onSubmit={handleDecline} className="space-y-4">
          {declining && (
            <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/10">
              <p className="text-sm font-semibold text-white">{declining.member.person.name}</p>
              <p className="text-[12px] text-gray-500 mt-1">ميعاد الجلسة: {formatDate(declining.requestedDate)}</p>
              {declining.note && <p className="text-[12px] text-gray-400 mt-1.5">«{declining.note}»</p>}
            </div>
          )}
          <Field label="سبب الرفض (اختياري)">
            <textarea
              rows={3}
              maxLength={300}
              value={reasonInput}
              onChange={(e) => setReasonInput(e.target.value)}
              placeholder="مثال: الموعد محجوز بالفعل، اختاري يوم تاني"
              className={`${FIELD} resize-none`}
            />
          </Field>
          <p className="text-[12px] text-gray-500 leading-relaxed">
            سيظهر السبب للعضو مع الرفض في بوابة الأعضاء. اتركه فاضي لو مش عايز تكتب حاجة.
          </p>
        </form>
      </Modal>
    </Stagger>
  );
}
