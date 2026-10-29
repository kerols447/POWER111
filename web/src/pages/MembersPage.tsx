import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { arDate, localDate } from '../utils/dates';
import { addPendingOperation } from '../utils/offlineDb';
import { whatsappLink, displayPhone } from '../utils/whatsapp';
import { downloadWorkbook } from '../utils/downloadWorkbook';
import ConfirmDialog from '../components/ConfirmDialog';
import MemberAvatar from '../components/MemberAvatar';
import NoticeBanner from '../components/NoticeBanner';
import MemberFormModal, { MemberFormValues } from '../components/MemberFormModal';
import SubscriptionsPanel from '../components/SubscriptionsPanel';
import PlansSection from '../components/PlansSection';
import {
  PageHeader, Btn, StatTile, Badge, TableShell, Th, Td, Row, ListCard,
  EmptyState, Loading, Picker, SearchField, SectionTitle, Segmented, UiIcon, CARD, TONE, OfflineBanner,
  type IconName
} from '../components/ui';
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
    photoPath?: string;
  };
  branch: {
    id: string;
    name: string;
    code: string;
  };
  subscriptions: Array<{
    id: string;
    endDate: string;
    status: string;
  }>;
  createdAt: string;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

type MembersTab = 'members' | 'subscriptions' | 'plans';

function generateOperationId(): string {
  return `op_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// Opening a member and coming back must not throw away what he was looking at.
const FILTERS_KEY = 'members_filters';

function readStoredFilters() {
  const defaults = { search: '', branchFilter: '', statusFilter: '', page: 1 };
  try {
    const saved = JSON.parse(sessionStorage.getItem(FILTERS_KEY) || 'null');
    if (!saved) return defaults;
    return {
      search: typeof saved.search === 'string' ? saved.search : '',
      branchFilter: typeof saved.branchFilter === 'string' ? saved.branchFilter : '',
      statusFilter: typeof saved.statusFilter === 'string' ? saved.statusFilter : '',
      page: Number(saved.page) > 1 ? Number(saved.page) : 1
    };
  } catch {
    return defaults;
  }
}

function MembersPage() {
  const navigate = useNavigate();
  const { user, isOwner, hasPermission } = useAuth();
  const isOnline = useOnlineStatus();
  const [stored] = useState(readStoredFilters);
  const [members, setMembers] = useState<Member[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(stored.search);
  const [branchFilter, setBranchFilter] = useState(stored.branchFilter);
  const [statusFilter, setStatusFilter] = useState(stored.statusFilter);
  const [page, setPage] = useState(stored.page);
  // null while the account has no census permission: the pager then runs on "has more"
  // alone and never renders a total.
  const [totalPages, setTotalPages] = useState<number | null>(1);
  const [hasMore, setHasMore] = useState(false);
  const [statusCounts, setStatusCounts] = useState<Record<string, number> | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Members, their subscriptions and the plans they buy are one job at the desk, so they
  // live on this page as tabs instead of separate sidebar entries.
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<MembersTab>(() => {
    const requested = searchParams.get('tab');
    return requested === 'subscriptions' || requested === 'plans' ? requested : 'members';
  });

  // Bell and shortcut links can point at a tab while this page is already open, and a
  // same-page navigation never remounts the component, so the URL stays the source of truth.
  useEffect(() => {
    const requested = searchParams.get('tab');
    setTab(requested === 'subscriptions' || requested === 'plans' ? requested : 'members');
  }, [searchParams]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ search, branchFilter, statusFilter, page }));
    } catch { /* storage full or blocked — filters just won't persist */ }
  }, [search, branchFilter, statusFilter, page]);

  // Auto-fill branch for non-OWNER users with single branch
  const userBranchCount = user?.branches?.length || 0;
  const singleBranchUser = !isOwner && userBranchCount === 1;

  useEffect(() => {
    fetchMembers();
    fetchBranches();
  }, [page, search, branchFilter, statusFilter]);

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: '20'
      });
      if (search) params.set('search', search);
      if (branchFilter) params.set('branchId', branchFilter);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/members?${params}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setMembers(data.data);
        setTotalPages(data.pagination.totalPages ?? null);
        setHasMore(Boolean(data.pagination.hasMore));
        setStatusCounts(data.statusCounts || null);
        if (typeof data.pagination.totalPages === 'number') {
          const lastPage = Math.max(1, data.pagination.totalPages);
          if (page > lastPage) setPage(lastPage);
        }
      }
    } catch (err) {
      console.error('Error fetching members:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const branchList = Array.isArray(data) ? data : (data.branches || []);
      setBranches(branchList);
      setBranchFilter((current: string) =>
        !current || branchList.some((b: Branch) => b.id === current) ? current : ''
      );
    } catch (err) {
      console.error('Error fetching branches:', err);
    }
  };

  const handleExportExcel = async () => {
    if (!isOnline) {
      setNotice({ kind: 'err', text: 'تحميل ملف Excel يحتاج اتصال بالإنترنت' });
      return;
    }
    setExporting(true);
    try {
      const filename = await downloadWorkbook(
        '/api/exports/members',
        { branchId: branchFilter, status: statusFilter, search },
        `أعضاء-POWER111-${localDate()}.xlsx`
      );
      setNotice({ kind: 'ok', text: `تم تنزيل ${filename}` });
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : 'تعذر تحميل ملف Excel' });
    } finally {
      setExporting(false);
    }
  };

  const queueOfflineDelete = async (memberId: string) => {
    await addPendingOperation({
      id: generateOperationId(),
      type: 'DELETE_MEMBER',
      payload: { memberId },
      timestamp: Date.now(),
      branchId: branchFilter || user?.branches?.[0]?.id || '',
      userId: user!.id
    });
    setNotice({ kind: 'ok', text: 'تم حفظ الحذف محلياً — سيتم التزامن عند عودة الاتصال' });
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    const { id: memberId, name: memberName } = pendingDelete;
    setDeleting(true);

    if (!isOnline) {
      try {
        await queueOfflineDelete(memberId);
        fetchMembers();
      } catch {
        setNotice({ kind: 'err', text: 'تعذر حذف العضو — أعد المحاولة' });
      } finally {
        setDeleting(false);
        setPendingDelete(null);
      }
      return;
    }

    try {
      const res = await fetch(`/api/members/${memberId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        setNotice({ kind: 'ok', text: `تم حذف العضو "${memberName}"` });
        fetchMembers();
      } else {
        const data = await res.json();
        setNotice({ kind: 'err', text: data.error || data.message || 'حدث خطأ في حذف العضو' });
      }
    } catch {
      try {
        await queueOfflineDelete(memberId);
        fetchMembers();
      } catch {
        setNotice({ kind: 'err', text: 'حدث خطأ في حذف العضو' });
      }
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const handleEdit = (member: Member) => {
    setError('');
    setEditing(member);
    setShowModal(true);
  };

  const handleSubmit = async (values: MemberFormValues) => {
    setError('');
    setSubmitting(true);

    const branchId = singleBranchUser && user?.branches?.[0] ? user.branches[0].id : values.branchId;

    if (editing) {
      if (!isOnline) {
        setError('تعديل بيانات العض محتاج إنترنت');
        setSubmitting(false);
        return;
      }

      try {
        const res = await fetch(`/api/members/${editing.id}`, {
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
          setError(data.message || 'حدث خطأ في تعديل العضو');
          return;
        }

        setShowModal(false);
        setEditing(null);
        fetchMembers();
        setNotice({ kind: 'ok', text: `تم تحديث بيانات "${values.name}"` });
      } catch {
        setError('حدث خطأ في الاتصال بالخادم');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!isOnline) {
      try {
        await addPendingOperation({
          id: generateOperationId(),
          type: 'NEW_MEMBER',
          payload: { name: values.name, phone: values.phone, email: values.email || undefined, gender: values.gender, branchId },
          timestamp: Date.now(),
          branchId,
          userId: user!.id
        });
        setNotice({ kind: 'ok', text: 'تم حفظ العضو محلياً — سيتم التزامن عند عودة الاتصال' });
        setShowModal(false);
        fetchMembers();
      } catch {
        setError('حدث خطأ في الحفظ المحلي');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          name: values.name,
          phone: values.phone,
          email: values.email,
          gender: values.gender,
          memberCode: values.memberCode,
          branchId
        })
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || 'حدث خطأ في إنشاء العضو');
        return;
      }

      const newMemberId = data.data?.id;
      setShowModal(false);
      fetchMembers();

      if (newMemberId) {
        navigate(`/admin/members/${newMemberId}`);
      } else {
        setNotice({ kind: 'ok', text: data.warning || 'تم إنشاء العضو بنجاح' });
      }
    } catch (err) {
      try {
        await addPendingOperation({
          id: generateOperationId(),
          type: 'NEW_MEMBER',
          payload: { name: values.name, phone: values.phone, email: values.email || undefined, gender: values.gender, branchId },
          timestamp: Date.now(),
          branchId,
          userId: user!.id
        });
        setShowModal(false);
        setNotice({ kind: 'ok', text: 'تم حفظ العضو محلياً — سيتم التزامن عند عودة الاتصال' });
        fetchMembers();
      } catch {
        setError('حدث خطأ في الاتصال بالخادم');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const config: Record<string, { tone: 'gold' | 'green' | 'red' | 'amber' | 'gray'; label: string; dot: string }> = {
      ACTIVE: { tone: 'green', label: 'نشط', dot: 'bg-emerald-400' },
      EXPIRED: { tone: 'red', label: 'منتهي', dot: 'bg-rose-400' },
      SUSPENDED: { tone: 'amber', label: 'موقوف', dot: 'bg-amber-400' },
      FROZEN: { tone: 'gold', label: 'مجمد', dot: 'bg-primary' },
      INACTIVE: { tone: 'gray', label: 'غير نشط', dot: 'bg-gray-400' }
    };
    const c = config[status] || config.INACTIVE;
    return (
      <Badge tone={c.tone}>
        <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
        {c.label}
      </Badge>
    );
  };

  // The cards describe the whole filtered result across every page, not the 20 rows shown.
  const cardCounts = statusCounts
    ? {
        total: Object.values(statusCounts).reduce((sum, n) => sum + n, 0),
        active: statusCounts.ACTIVE || 0,
        expired: statusCounts.EXPIRED || 0,
        paused: (statusCounts.SUSPENDED || 0) + (statusCounts.FROZEN || 0)
      }
    : {
        total: members.length,
        active: members.filter(m => m.status === 'ACTIVE').length,
        expired: members.filter(m => m.status === 'EXPIRED').length,
        paused: members.filter(m => m.status === 'SUSPENDED' || m.status === 'FROZEN').length
      };

  const scopeLabel = search
    ? 'نتيجة البحث'
    : (branchFilter ? (branches.find(b => b.id === branchFilter)?.name || 'الفرع المحدد') : 'كل الفروع');

  const hasFilters = !!(search || branchFilter || statusFilter || page > 1);

  // Working the member list is not the same as holding the club's census or its sheet,
  // so both have their own permission and simply disappear for accounts without them.
  const canExportSheet = hasPermission('EXPORT_MEMBERS');
  const canSeeCensus = hasPermission('VIEW_MEMBER_STATS');

  const canSeeSubscriptions = hasPermission('VIEW_SUBSCRIPTIONS');
  const activeTab: MembersTab = canSeeSubscriptions ? tab : 'members';
  const goTab = (next: MembersTab) => {
    setTab(next);
    setSearchParams(next === 'members' ? {} : { tab: next }, { replace: true });
  };

  // The plans tab brings its own titled card, so only the other two need a page header.
  const headerMeta = activeTab === 'subscriptions'
    ? { icon: 'subscriptions' as IconName, title: 'الاشتراكات', caption: 'الحالة، التجميد، والمبالغ المتبقية' }
    : { icon: 'member' as IconName, title: 'الأعضاء', caption: 'إدارة أعضاء الجيم' };

  const filterByStatus = (value: string) => {
    setStatusFilter((current: string) => (current === value ? '' : value));
    setPage(1);
  };

  const clearFilters = () => {
    setSearch('');
    setBranchFilter('');
    setStatusFilter('');
    setPage(1);
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <Stagger className="space-y-5 sm:space-y-7">
      {/* Offline Banner — the subscriptions panel raises its own */}
      {!isOnline && activeTab !== 'subscriptions' && <OfflineBanner />}

      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      {activeTab !== 'plans' && (
        <PageHeader
          icon={headerMeta.icon}
          title={headerMeta.title}
          caption={headerMeta.caption}
          actions={
            // Buying and renewing happen on the member's own page, so the ledger writes nothing.
            activeTab === 'subscriptions' ? undefined : (
              <>
                {canExportSheet && (
                  <Btn icon="download" variant="ghost" onClick={handleExportExcel} disabled={exporting}>
                    {exporting ? 'جارٍ التحضير…' : 'تحميل Excel'}
                  </Btn>
                )}
                <Btn
                  icon="plus"
                  variant="primary"
                  onClick={() => {
                    setError('');
                    setEditing(null);
                    setShowModal(true);
                  }}
                >
                  إضافة عضو
                </Btn>
              </>
            )
          }
        />
      )}

      {canSeeSubscriptions && (
        <Segmented
          value={activeTab}
          onChange={goTab}
          ariaLabel="أقسام الأعضاء"
          options={[
            { key: 'members', label: 'الأعضاء' },
            { key: 'subscriptions', label: 'الاشتراكات' },
            { key: 'plans', label: 'الخطط' }
          ]}
        />
      )}

      {activeTab === 'subscriptions' && <SubscriptionsPanel />}

      {activeTab === 'plans' && <PlansSection />}

      {activeTab === 'members' && (
        <>
      {/* Stats Summary Cards — each one doubles as a one-tap filter */}
      {canSeeCensus && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <StatTile
            icon="users"
            tone={TONE.members}
            label="إجمالي الأعضاء"
            value={cardCounts.total}
            caption={scopeLabel}
            onClick={() => { setStatusFilter(''); setPage(1); }}
          />
          <StatTile
            icon="check"
            tone={TONE.revenue}
            label="نشط"
            value={cardCounts.active}
            caption="اشتراك فعّال"
            onClick={() => filterByStatus('ACTIVE')}
          />
          <StatTile
            icon="warning"
            tone={TONE.expenses}
            label="منتهي"
            value={cardCounts.expired}
            caption="بحاجة لتجديد"
            onClick={() => filterByStatus('EXPIRED')}
          />
          <StatTile
            icon="clock"
            tone={TONE.outstanding}
            label="موقوف / مجمد"
            value={cardCounts.paused}
            caption="غير نشط مؤقتاً"
            onClick={() => filterByStatus('SUSPENDED,FROZEN')}
          />
        </div>
      )}

      {/* Filters */}
      <div className={`${CARD} p-4 sm:p-5`}>
        <div className="mb-4">
          <SectionTitle
            right={
              hasFilters ? (
                <Btn variant="ghost" icon="close" onClick={clearFilters}>
                  إعادة الضبط
                </Btn>
              ) : undefined
            }
          >
            تصفية النتائج
          </SectionTitle>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          <SearchField
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder="بحث بالاسم، الهاتف، أو الكود..."
            className="w-full"
          />
          {!singleBranchUser && (
            <Picker
              value={branchFilter}
              onChange={(v) => { setBranchFilter(v); setPage(1); }}
              ariaLabel="تصفية بالفرع"
              className="w-full"
              options={[
                { value: '', label: 'كل الفروع' },
                ...branches.map(b => ({ value: b.id, label: b.name }))
              ]}
            />
          )}
          <Picker
            value={statusFilter}
            onChange={(v) => { setStatusFilter(v); setPage(1); }}
            ariaLabel="تصفية بالحالة"
            className="w-full"
            options={[
              { value: '', label: 'كل الحالات' },
              { value: 'ACTIVE', label: 'نشط' },
              { value: 'EXPIRED', label: 'منتهي' },
              { value: 'SUSPENDED', label: 'موقوف' },
              { value: 'FROZEN', label: 'مجمد' },
              { value: 'SUSPENDED,FROZEN', label: 'موقوف أو مجمد' },
              { value: 'INACTIVE', label: 'غير نشط' }
            ]}
          />
        </div>
      </div>

      {/* Members Table */}
      <div className={`${CARD} overflow-hidden`}>
        {members.length === 0 ? (
          <EmptyState icon="member" title="لا يوجد أعضاء" hint="جرّب تغيير معايير البحث أو أضف عضواً جديداً" />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden sm:block">
              <TableShell
                minWidth="min-w-[700px]"
                head={
                  <>
                    <Th>الكود</Th>
                    <Th>الاسم</Th>
                    <Th>الهاتف</Th>
                    <Th>الفرع</Th>
                    <Th>الحالة</Th>
                    <Th className="hidden xl:table-cell">تاريخ الإنشاء</Th>
                    <Th>إجراءات</Th>
                  </>
                }
              >
                {members.map(member => (
                  <Row key={member.id} onClick={() => navigate(`/admin/members/${member.id}`)}>
                    <Td>
                      <span className="text-sm font-mono font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-lg border border-primary/20">
                        {member.memberCode}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-3">
                        <MemberAvatar name={member.person.name} photoPath={member.person.photoPath} />
                        <span className="text-sm font-semibold text-white">
                          {member.person.name}
                        </span>
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-300 font-mono">{displayPhone(member.person.phone)}</span>
                        {whatsappLink(member.person.phone) && (
                          <a
                            href={whatsappLink(member.person.phone) as string}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            title="فتح محادثة واتساب"
                            className="inline-flex items-center justify-center min-h-[44px] sm:min-h-[36px] min-w-[44px] sm:min-w-[36px] text-emerald-400 hover:text-emerald-300 transition-colors"
                          >
                            <UiIcon name="whatsapp" className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 bg-dark rounded-lg flex items-center justify-center border border-dark-border">
                          <span className="text-[11px] font-bold text-gray-400">{member.branch.code.charAt(0)}</span>
                        </div>
                        <span className="text-sm text-gray-300">{member.branch.code}</span>
                      </div>
                    </Td>
                    <Td>{getStatusBadge(member.status)}</Td>
                    <Td className="hidden xl:table-cell">
                      <span className="text-sm text-gray-400">
                        {arDate(member.createdAt)}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-2">
                        {hasPermission('EDIT_MEMBERS') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleEdit(member);
                            }}
                            title="تعديل بيانات العضو"
                            className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg border border-primary/20 hover:border-primary/40 transition-colors"
                          >
                            <UiIcon name="edit" className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">تعديل</span>
                          </button>
                        )}
                        {hasPermission('DELETE_MEMBERS') && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setPendingDelete({ id: member.id, name: member.person.name });
                            }}
                            title="حذف العضو"
                            className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/20 hover:border-rose-500/40 transition-colors"
                          >
                            <UiIcon name="trash" className="w-3.5 h-3.5" />
                            <span className="hidden xl:inline">حذف</span>
                          </button>
                        )}
                      </div>
                    </Td>
                  </Row>
                ))}
              </TableShell>
            </div>

            {/* Mobile Cards */}
            <div className="sm:hidden p-3 space-y-3">
              {members.map(member => (
                <ListCard key={member.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/members/${member.id}`)}
                    className="w-full flex items-start justify-between gap-3 text-right"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <MemberAvatar name={member.person.name} photoPath={member.person.photoPath} className="w-11 h-11 rounded-xl" letterClassName="text-base font-bold" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white truncate">{member.person.name}</p>
                        <p className="text-xs text-gray-500 font-mono mt-0.5">{displayPhone(member.person.phone)}</p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {getStatusBadge(member.status)}
                      <span className="text-xs font-mono font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-lg border border-primary/20">
                        {member.memberCode}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-dark-border/30">
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-dark border border-dark-border text-[11px] font-medium text-gray-400">{member.branch.code}</span>
                      <span className="text-gray-600 mx-1">|</span>
                      <span className="text-xs text-gray-500">
                        {arDate(member.createdAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {whatsappLink(member.person.phone) && (
                        <a
                          href={whatsappLink(member.person.phone) as string}
                          target="_blank"
                          rel="noreferrer"
                          title="فتح محادثة واتساب"
                          className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg bg-emerald-500/5 text-emerald-400 hover:text-emerald-300 transition-colors"
                        >
                          <UiIcon name="whatsapp" className="w-4 h-4" />
                        </a>
                      )}
                      {hasPermission('EDIT_MEMBERS') && (
                        <button
                          onClick={() => handleEdit(member)}
                          title="تعديل بيانات العضو"
                          className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-primary/10 text-primary text-xs font-semibold border border-primary/20"
                        >
                          <UiIcon name="edit" className="w-3.5 h-3.5" />
                          تعديل
                        </button>
                      )}
                      {hasPermission('DELETE_MEMBERS') && (
                        <button
                          onClick={() => setPendingDelete({ id: member.id, name: member.person.name })}
                          title="حذف العضو"
                          className="inline-flex items-center gap-1 px-3 min-h-[44px] rounded-lg bg-rose-500/10 text-rose-400 text-xs font-semibold border border-rose-500/20"
                        >
                          <UiIcon name="trash" className="w-3.5 h-3.5" />
                          حذف
                        </button>
                      )}
                    </div>
                  </div>
                </ListCard>
              ))}
            </div>
          </>
        )}

        {/* Pagination — without the census permission there is no total to show, so the
            pager runs on the server's "there is a next page" flag alone. */}
        {(hasMore || (totalPages !== null && totalPages > 1)) && (
          <div className="flex items-center justify-between px-5 py-4 border-t border-dark-border">
            <Btn variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              السابق
            </Btn>
            <span className="text-sm text-gray-400 font-medium">
              صفحة <span className="text-primary font-bold">{page}</span>
              {totalPages !== null && (
                <> من <span className="text-white font-bold">{totalPages}</span></>
              )}
            </span>
            <Btn
              variant="ghost"
              onClick={() => setPage(p => p + 1)}
              disabled={totalPages === null ? !hasMore : page >= totalPages}
            >
              التالي
            </Btn>
          </div>
        )}
      </div>
        </>
      )}

      {/* Add Member Modal */}
      {showModal && (
        <MemberFormModal
          key={editing ? editing.id : 'new'}
          mode={editing ? 'edit' : 'create'}
          initial={
            editing
              ? {
                  name: editing.person.name,
                  phone: editing.person.phone.startsWith('pending-') ? '' : editing.person.phone,
                  memberCode: editing.memberCode,
                  email: editing.person.email || '',
                  gender: editing.person.gender === 'Female' ? 'Female' : 'Male',
                  branchId: editing.branch.id,
                  status: editing.status
                }
              : { branchId: singleBranchUser && user?.branches?.[0] ? user.branches[0].id : '' }
          }
          branches={branches}
          lockedBranchName={editing ? editing.branch.name : singleBranchUser ? user?.branches?.[0]?.name || null : null}
          submitting={submitting}
          offline={!isOnline}
          error={error}
          onClose={() => { setShowModal(false); setEditing(null); setError(''); }}
          onSubmit={handleSubmit}
        />
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف العضو"
        description={pendingDelete ? `سيتم حذف "${pendingDelete.name}" نهائياً مع اشتراكاته وسجل حضوره.` : ''}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Stagger>
  );
}

export default MembersPage;
