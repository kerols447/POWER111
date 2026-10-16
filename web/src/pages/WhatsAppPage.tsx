import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { whatsappLink, displayPhone } from '../utils/whatsapp';

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
      alert('المتصفح مانع فتح نافذة جديدة — اسمح بالنوافذ المنبثقة لهذا الموقع ثم كمّل.');
      return;
    }
    setSentIds((prev) => new Set(prev).add(current.id));
    setQueueIndex((prev) => prev + 1);
  };

  const skipCurrent = () => setQueueIndex((prev) => prev + 1);

  const progress = selectedMembers.length
    ? Math.round((queueIndex / selectedMembers.length) * 100)
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white tracking-tight">
          رسائل واتساب
        </h1>
        <p className="text-sm text-gray-400 mt-1">اكتب الرسالة مرة واحدة وابعتها لكل الأعضاء المحددين</p>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {!singleBranchUser && (
            <div>
              <label className="block text-sm text-gray-400 mb-2">الفرع</label>
              <select
                value={selectedBranch}
                onChange={(e) => {
                  setSelectedBranch(e.target.value);
                  setSelectedIds(new Set());
                }}
                className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-2">بحث سريع</label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم أو هاتف أو كود العضو"
              className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 placeholder:text-gray-600"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3.5 py-2 min-h-10 rounded-lg text-xs font-medium border transition-all ${
                filter === f.key
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-dark border-dark-border text-gray-400 hover:border-gray-500'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-5 space-y-4">
        <h2 className="text-base font-bold text-white">نص الرسالة</h2>

        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setActiveTemplate(t.key);
                setMessage(t.text);
              }}
              className={`px-3.5 py-2 min-h-10 rounded-lg text-xs font-medium border transition-all ${
                activeTemplate === t.key
                  ? 'bg-primary/10 border-primary/40 text-primary'
                  : 'bg-dark border-dark-border text-gray-400 hover:border-gray-500'
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
          className="w-full px-4 py-3 bg-dark border border-dark-border rounded-xl text-white text-sm leading-relaxed focus:outline-none focus:border-primary/60 resize-y"
          placeholder="اكتب رسالتك هنا…"
        />

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-gray-500">
            استخدم <span className="text-primary font-mono">{'{الاسم}'}</span> ليحل محله اسم كل عضو تلقائياً
          </p>
          <button
            onClick={() => setMessage(message + '{الاسم}')}
            className="px-3 py-2 min-h-10 rounded-lg bg-dark border border-dark-border text-gray-300 hover:border-primary/40 text-xs font-medium transition-all"
          >
            + إدراج اسم العضو
          </button>
        </div>

        {selectedMembers[0] && (
          <div className="bg-dark rounded-xl p-4 border border-dark-border">
            <p className="text-xs text-gray-500 mb-2">معاينة على: {selectedMembers[0].person.name}</p>
            <div className="bg-emerald-900/30 border border-emerald-800/40 rounded-2xl rounded-tr-sm px-4 py-2.5 max-w-md mr-auto">
              <p className="text-sm text-white whitespace-pre-line leading-relaxed">
                {personalize(message, selectedMembers[0].person.name)}
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="bg-dark-card border border-dark-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-base font-bold text-white">
            المستلمون
            <span className="text-gray-500 text-sm font-normal mr-2">
              ({selectedIds.size} مختار من {recipients.length})
            </span>
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleSelectVisible}
              className="px-3 py-2 min-h-10 rounded-lg bg-dark border border-dark-border text-gray-300 hover:border-primary/40 text-xs font-medium transition-all"
            >
              {recipients.every((m) => selectedIds.has(m.id)) ? 'إلغاء التحديد' : 'تحديد الكل'}
            </button>
            <button
              onClick={startSending}
              disabled={selectedIds.size === 0}
              className="px-4 py-2 min-h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold transition-all"
            >
              ابدأ الإرسال
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500 py-6 text-center">جاري التحميل…</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-gray-500 py-6 text-center">لا يوجد أعضاء مطابقون</p>
        ) : (
          <div className="max-h-80 overflow-y-auto space-y-1.5 pr-1">
            {recipients.map((member) => {
              const days = daysUntil(member.subscriptions[0]?.endDate);
              const isSelected = selectedIds.has(member.id);
              return (
                <label
                  key={member.id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-primary/5 border-primary/30'
                      : 'bg-dark border-dark-border hover:border-primary/30'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleSelect(member.id)}
                    className="w-4 h-4 rounded accent-amber-500 flex-shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-white truncate">{member.person.name}</p>
                    <p className="text-xs text-gray-500 font-mono" dir="ltr">{displayPhone(member.person.phone)}</p>
                  </div>
                  <span
                    className={`text-[11px] px-2 py-0.5 rounded-md font-medium flex-shrink-0 ${
                      days === null || days <= 0
                        ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                        : days <= 7
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    }`}
                  >
                    {days === null ? 'بدون اشتراك' : days <= 0 ? 'منتهي' : `${days} يوم`}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {sending && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-dark-card border border-dark-border rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">إرسال الرسائل</h3>
              <button
                onClick={() => setSending(false)}
                className="w-10 h-10 shrink-0 rounded-lg bg-dark border border-dark-border text-gray-400 hover:text-white transition-colors"
              >
                ✕
              </button>
            </div>

            <div>
              <div className="flex items-center justify-between text-xs text-gray-400 mb-2">
                <span>تم إرسال {sentIds.size} ومتخطى {queueIndex - sentIds.size} من {selectedMembers.length}</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 bg-dark rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
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
                  <div className="bg-emerald-900/30 border border-emerald-800/40 rounded-2xl rounded-tr-sm px-3 py-2 max-h-40 overflow-y-auto">
                    <p className="text-xs text-white whitespace-pre-line leading-relaxed">
                      {personalize(message, current.person.name)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={openCurrent}
                    disabled={!whatsappLink(current.person.phone)}
                    className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2z" />
                    </svg>
                    افتح واتساب وأرسل للعضو
                  </button>
                  <button
                    onClick={skipCurrent}
                    className="w-full py-2.5 rounded-xl bg-dark border border-dark-border text-gray-400 hover:text-white text-sm font-medium transition-all"
                  >
                    تخطي هذا العضو
                  </button>
                </div>
                <p className="text-xs text-gray-500 text-center leading-relaxed">
                  هتفتح محادثة {current.person.name} والرسالة جاهزة — دوس إرسال في واتساب، وارجع كمّل للتالي.
                </p>
              </>
            ) : (
              <div className="text-center py-6 space-y-3">
                <div className="w-14 h-14 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                  <span className="text-2xl">✓</span>
                </div>
                <p className="text-sm text-white font-medium">
                  {remaining.length === 0
                    ? `خلصت القائمة — تم إرسال ${sentIds.size} رسالة`
                    : 'مفيش أعضاء تانية في القائمة'}
                </p>
                <button
                  onClick={() => setSending(false)}
                  className="px-5 py-2.5 rounded-xl bg-primary text-black text-sm font-bold hover:bg-primary/90 transition-all"
                >
                  إنهاء
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatsAppPage;
