import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { whatsappLink, displayPhone } from '../utils/whatsapp';
import {
  PageHeader, SectionTitle, Badge, Btn, Field, Picker, SearchField,
  Loading, EmptyState, Modal, CARD, FIELD, UiIcon
} from '../components/ui';
import { Stagger } from '../components/Motion';

interface Member {
  id: string;
  memberCode: string;
  status: string;
  person: { name: string; phone: string };
  branch: { id: string; name: string; code: string };
  subscriptions: Array<{ id: string; endDate: string; status: string }>;
}

interface Branch {
  id: string;
  name: string;
  code: string;
}

const TEMPLATES = [
  {
    key: 'welcome',
    label: 'ترحيب بعضو جديد',
    text: 'أهلاً {الاسم} في عائلة POWER 111 💪\n\nاشتراكك بدأ رسمياً، ونتمنى لك رحلة مليانة نتائج.\nلو محتاج أي مساعدة في الجدول أو التغذية، إحنا معاك.\n\nPOWER 111 — لياقة • صحة • تغذية'
  },
  {
    key: 'renew',
    label: 'تنبيه قرب انتهاء الاشتراك',
    text: 'مرحباً {الاسم} 👋\n\nاشتراكك في POWER 111 هينتهي قريب، ويهمنا إنك ما تقطعش مشوارك.\nتقدر تجدّد من الفرع أو ترسل لنا هنا ونرتب معاك.\n\nPOWER 111 — لياقة • صحة • تغذية'
  },
  {
    key: 'expired',
    label: 'اشتراك منتهي',
    text: 'مرحباً {الاسم} 👋\n\nاشتراكك في POWER 111 خلص، وبنفتقدك في التمرين 💪\nلو عايز تجدد أو تعرف العروض المتاحة، ابعت لنا هنا.\n\nPOWER 111 — لياقة • صحة • تغذية'
  },
  {
    key: 'offer',
    label: 'عرض خاص',
    text: 'عرض خاص من POWER 111 لـ {الاسم} 🔥\n\nعندك عرض حصري على الاشتراكات الفترة دي.\nابعت لنا هنا لو مهتم تفصيلات أكتر.\n\nPOWER 111 — لياقة • صحة • تغذية'
  }
];

type RecipientFilter = 'all' | 'active' | 'expiring' | 'expired';

const FILTERS: Array<{ key: RecipientFilter; label: string }> = [
  { key: 'all', label: 'كل الأعضاء' },
  { key: 'active', label: 'اشتراك نشط' },
  { key: 'expiring', label: 'ينتهي خلال أسبوع' },
  { key: 'expired', label: 'منتهي أو بدون اشتراك' }
];

function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function personalize(message: string, name: string): string {
  return message.replace(/\{الاسم\}/g, name);
}

function WhatsAppPage() {
  const { user, isOwner } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<RecipientFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState(TEMPLATES[0].text);
  const [activeTemplate, setActiveTemplate] = useState(TEMPLATES[0].key);
  const [sending, setSending] = useState(false);
  const [queueIndex, setQueueIndex] = useState(0);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const [popupBlocked, setPopupBlocked] = useState(false);

  const singleBranchUser = !isOwner && (user?.branches?.length || 0) === 1;

  useEffect(() => {
    fetchBranches();
  }, []);

  useEffect(() => {
    if (selectedBranch) fetchMembers();
  }, [selectedBranch]);

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.branches || [];
      setBranches(list);
      if (list.length > 0) setSelectedBranch(list[0].id);
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/members?branchId=${selectedBranch}&pageSize=1000`, {
        credentials: 'include'
      });
      const data = await res.json();
      setMembers(data.data || []);
    } catch (error) {
      console.error('Error fetching members:', error);
    } finally {
      setLoading(false);
    }
  };

  const recipients = useMemo(() => {
    return members.filter((member) => {
      const days = daysUntil(member.subscriptions[0]?.endDate);

      if (filter === 'active' && (days === null || days <= 0)) return false;
      if (filter === 'expiring' && (days === null || days <= 0 || days > 7)) return false;
      if (filter === 'expired' && days !== null && days > 0) return false;

      if (search) {
        const term = search.toLowerCase();
        return (
          member.person.name.toLowerCase().includes(term) ||
          member.person.phone.includes(term) ||
          member.memberCode.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [members, filter, search]);

  const selectedMembers = useMemo(
    () => members.filter((m) => selectedIds.has(m.id)),
    [members, selectedIds]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectVisible = () => {
    const allVisibleSelected = recipients.every((m) => selectedIds.has(m.id));
    setSelectedIds((prev) => {
      const next = new Set(prev);
      recipients.forEach((m) => (allVisibleSelected ? next.delete(m.id) : next.add(m.id)));
      return next;
    });
  };

  const startSending = () => {
    if (selectedMembers.length === 0) return;
    setSentIds(new Set());
    setQueueIndex(0);
    setPopupBlocked(false);
    setSending(true);
  };

  const current = selectedMembers[queueIndex];
  const remaining = selectedMembers.slice(queueIndex);

  const openCurrent = () => {
    if (!current) return;
    const link = whatsappLink(
      current.person.phone,
      personalize(message, current.person.name)
    );
    if (!link) return;
    const opened = window.open(link, '_blank', 'noopener,noreferrer');
    if (!opened) {
      setPopupBlocked(true);
      return;
    }
    setPopupBlocked(false);
    setSentIds((prev) => new Set(prev).add(current.id));
    setQueueIndex((prev) => prev + 1);
  };

  const skipCurrent = () => setQueueIndex((prev) => prev + 1);

  const progress = selectedMembers.length
    ? Math.round((queueIndex / selectedMembers.length) * 100)
    : 0;

  return (
    <Stagger className="space-y-5 sm:space-y-7">
      <PageHeader
        icon="whatsapp"
        title="رسائل واتساب"
        caption="اكتب الرسالة مرة واحدة وابعتها لكل الأعضاء المحددين"
      />

      {/* Branch + search + recipient filters */}
      <div className={`${CARD} p-4 sm:p-5 space-y-4`}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!singleBranchUser && (
            <Field label="الفرع">
              <Picker
                value={selectedBranch}
                onChange={(v) => {
                  setSelectedBranch(v);
                  setSelectedIds(new Set());
                }}
                ariaLabel="الفرع"
                className="w-full"
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </Field>
          )}

          <Field label="بحث سريع">
            <SearchField
              value={search}
              onChange={(v) => setSearch(v)}
              placeholder="اسم أو هاتف أو كود العضو"
              className="w-full"
            />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-2 min-h-[44px] rounded-xl text-[13px] font-semibold border transition-colors whitespace-nowrap ${
                filter === f.key
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-dark border-dark-border text-gray-400 hover:text-white hover:border-primary/30'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Message composer */}
      <div className={`${CARD} p-4 sm:p-5 space-y-4`}>
        <SectionTitle>نص الرسالة</SectionTitle>

        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setActiveTemplate(t.key);
                setMessage(t.text);
              }}
              className={`px-3.5 py-2 min-h-[44px] rounded-xl text-[13px] font-semibold border transition-colors whitespace-nowrap ${
                activeTemplate === t.key
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-dark border-dark-border text-gray-400 hover:text-white hover:border-primary/30'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={7}
          className={`${FIELD} resize-y leading-relaxed`}
          placeholder="اكتب رسالتك هنا…"
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            استخدم <span className="text-primary font-mono">{'{الاسم}'}</span> ليحل محله اسم كل عضو تلقائياً
          </p>
          <Btn
            variant="ghost"
            icon="plus"
            onClick={() => setMessage(message + '{الاسم}')}
          >
            إدراج اسم العضو
          </Btn>
        </div>

        {selectedMembers[0] && (
          <div className="bg-dark rounded-xl p-4 border border-dark-border">
            <p className="text-xs text-gray-500 mb-2">معاينة على: {selectedMembers[0].person.name}</p>
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-md mr-auto">
              <p className="text-sm text-white whitespace-pre-line leading-relaxed">
                {personalize(message, selectedMembers[0].person.name)}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Recipients */}
      <div className={`${CARD} p-4 sm:p-5 space-y-4`}>
        <SectionTitle
          right={
            <div className="flex items-center gap-2">
              <Btn variant="ghost" onClick={toggleSelectVisible}>
                {recipients.every((m) => selectedIds.has(m.id)) ? 'إلغاء التحديد' : 'تحديد الكل'}
              </Btn>
              <Btn
                variant="primary"
                icon="whatsapp"
                onClick={startSending}
                disabled={selectedIds.size === 0}
              >
                ابدأ الإرسال
              </Btn>
            </div>
          }
        >
          <span className="flex items-center gap-2">
            المستلمون
            <span className="text-gray-500 text-sm font-normal mr-2">
              ({selectedIds.size} مختار من {recipients.length})
            </span>
          </span>
        </SectionTitle>

        {loading ? (
          <Loading label="جاري التحميل…" />
        ) : recipients.length === 0 ? (
          <EmptyState icon="users" title="لا يوجد أعضاء مطابقون" />
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-2 pr-1">
            {recipients.map((member) => {
              const days = daysUntil(member.subscriptions[0]?.endDate);
              const isSelected = selectedIds.has(member.id);
              return (
                <label
                  key={member.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-primary/5 border-primary/30'
                      : 'bg-dark border-dark-border hover:border-primary/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(member.id)}
                    className="w-4 h-4 rounded accent-primary flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-white truncate">{member.person.name}</p>
                    <p className="text-xs text-gray-500 font-mono" dir="ltr">{displayPhone(member.person.phone)}</p>
                  </div>
                  <Badge
                    tone={days === null || days <= 0 ? 'red' : days <= 7 ? 'amber' : 'green'}
                    className="shrink-0"
                  >
                    {days === null ? 'بدون اشتراك' : days <= 0 ? 'منتهي' : `${days} يوم`}
                  </Badge>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Sending queue */}
      <Modal
        open={sending}
        title="إرسال الرسائل"
        onClose={() => { setSending(false); setPopupBlocked(false); }}
        width="max-w-md"
      >
        {popupBlocked && (
          <div className="bg-primary/10 border border-primary/30 rounded-xl p-3.5 flex items-start gap-2.5">
            <UiIcon name="warning" className="w-4 h-4 text-primary shrink-0 mt-0.5" />
            <p className="text-[12px] text-primary leading-relaxed">
              المتصفح مانع فتح نافذة جديدة — اسمح بالنوافذ المنبثقة لهذا الموقع ثم كمّل.
            </p>
          </div>
        )}
        <div>
          <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
            <span>تم إرسال {sentIds.size} ومتخطى {queueIndex - sentIds.size} من {selectedMembers.length}</span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-dark rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {current ? (
          <>
            <div className="bg-dark rounded-xl p-4 border border-dark-border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-white">{current.person.name}</p>
                <span className="text-xs text-gray-500 font-mono" dir="ltr">
                  {displayPhone(current.person.phone)}
                </span>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl rounded-tr-sm px-3 py-2 max-h-40 overflow-y-auto">
                <p className="text-xs text-white whitespace-pre-line leading-relaxed">
                  {personalize(message, current.person.name)}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Btn
                variant="primary"
                icon="whatsapp"
                onClick={openCurrent}
                disabled={!whatsappLink(current.person.phone)}
                className="w-full"
              >
                افتح واتساب وأرسل للعضو
              </Btn>
              <Btn variant="ghost" onClick={skipCurrent} className="w-full">
                تخطي هذا العضو
              </Btn>
            </div>
            <p className="text-xs text-gray-500 text-center leading-relaxed">
              هتفتح محادثة {current.person.name} والرسالة جاهزة — دوس إرسال في واتساب، وارجع كمّل للتالي.
            </p>
          </>
        ) : (
          <div className="text-center py-6 space-y-3">
            <span className="w-14 h-14 mx-auto rounded-full flex items-center justify-center bg-primary/10 border border-primary/20 text-primary">
              <UiIcon name="check" className="w-6 h-6" />
            </span>
            <p className="text-sm text-white font-semibold">
              {remaining.length === 0
                ? `خلصت القائمة — تم إرسال ${sentIds.size} رسالة`
                : 'مفيش أعضاء تانية في القائمة'}
            </p>
            <Btn variant="primary" onClick={() => setSending(false)}>
              إنهاء
            </Btn>
          </div>
        )}
      </Modal>
    </Stagger>
  );
}

export default WhatsAppPage;
