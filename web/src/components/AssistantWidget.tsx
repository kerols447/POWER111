import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import NoticeBanner from './NoticeBanner';
import ConfirmDialog from './ConfirmDialog';
import { Badge, Btn, UiIcon } from './ui';

interface Message {
  role: 'user' | 'assistant';
  text: string;
  tools?: string[];
  at: string;
}

interface HistoryEntry {
  id: string;
  at: string;
  question: string;
  answer?: string;
  tools?: string[];
}

// Every answer names the report it came from, so the owner can always see the number was
// read from the system rather than invented.
const TOOL_LABELS: Record<string, string> = {
  list_branches: 'قائمة الفروع',
  financial_summary: 'تقرير الإيراد والمصروف',
  branch_comparison: 'مقارنة الفروع',
  members_census: 'جرد الأعضاء',
  attendance_counts: 'تقرير الحضور',
  expenses_breakdown: 'بنود المصروفات',
  daily_journal: 'سجل العمليات',
  subscriptions_watch: 'الاشتراكات القريبة',
  stock_check: 'جرد البضاعة',
  sales_check: 'تقرير المبيعات',
  find_member: 'البحث عن عضو',
  staff_shifts: 'مناوبات الموظفين',
  physio_sessions: 'جلسات العلاج الطبيعي',
  calculate: 'الحاسبة'
};

const SUGGESTIONS = [
  'كام عضو نشط دلوقتي؟',
  'كسبنا كام الشهر دا؟',
  'قارنلي شهر ٩ بشهر ١٠',
  'إيه حالة الجيم النهارده؟',
  '12500 + 8300 - 4700',
  'اكتبلي رسالة تذكير للأعضاء اللي اشتراكهم خلص'
];

function timeLabel(value: string) {
  return new Date(value).toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
}

// The journal on the server is the conversation, newest first, so it becomes the thread
// back-to-front and survives a reload, another device, or a cleared browser.
function threadFrom(entries: HistoryEntry[]): Message[] {
  const thread: Message[] = [];
  [...entries].reverse().forEach(entry => {
    if (!entry.question) return;
    thread.push({ role: 'user', text: entry.question, at: entry.at });
    if (entry.answer) {
      thread.push({ role: 'assistant', text: entry.answer, tools: entry.tools, at: entry.at });
    }
  });
  return thread.slice(-30);
}

export default function AssistantWidget({ hidden = false }: { hidden?: boolean }) {
  const online = useOnlineStatus();
  const { hasPermission } = useAuth();
  const navigate = useNavigate();
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  // A read can take a few rounds of reports, so the wait shows seconds passing —
  // otherwise the screen looks stuck and he assumes it died.
  const [waited, setWaited] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const canAsk = hasPermission('VIEW_DASHBOARD');

  useEffect(() => {
    if (!canAsk) return;
    let active = true;
    Promise.all([
      fetch('/api/assistant/status', { credentials: 'include' }).then(r => r.json()),
      fetch('/api/assistant/history', { credentials: 'include' })
        .then(r => (r.ok ? r.json() : { data: [] }))
        .catch(() => ({ data: [] }))
    ])
      .then(([statusBody, historyBody]) => {
        if (!active) return;
        setEnabled(Boolean(statusBody?.enabled));
        setMessages(threadFrom(historyBody?.data || []));
      })
      .catch(() => {
        if (active) setEnabled(false);
      });
    return () => {
      active = false;
    };
  }, [canAsk]);

  useEffect(() => {
    if (!sending) {
      setWaited(0);
      return;
    }
    const tick = window.setInterval(() => setWaited(seconds => seconds + 1), 1000);
    return () => window.clearInterval(tick);
  }, [sending]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (hidden || !canAsk || !enabled) return null;

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || sending) return;
    if (!online) {
      setError('المساعد شغال على السيرفر — لازم يكون في إنترنت.');
      return;
    }
    setError(null);
    setSessionExpired(false);
    setNotice(null);
    setDraft('');
    setMessages(prev => [...prev, { role: 'user', text: question, at: new Date().toISOString() }]);
    setSending(true);
    try {
      const res = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: question,
          history: messages.slice(-6).map(m => ({ role: m.role, text: m.text }))
        })
      });
      const j = await res.json();
      if (res.status === 401) {
        // The session on the server can end while this widget stays open; the question
        // goes back in the box so he only has to press إرسال again.
        setSessionExpired(true);
        setError('انتهت جلسة الدخول على السيرفر — سجّل دخولك تاني، وسؤالك هيفضل في الخانة.');
        setDraft(question);
        setMessages(prev => prev.slice(0, -1));
        return;
      }
      if (!res.ok || !j.success) {
        setError(j.message || 'المساعد مرجّعش رد — حاول تاني.');
        setMessages(prev => prev.slice(0, -1));
        return;
      }
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          text: j.answer,
          tools: Array.from(new Set(((j.tools || []) as any[]).map(t => t.name))),
          at: new Date().toISOString()
        }
      ]);
    } catch {
      setError('حصل خطأ في الاتصال بالمساعد — حاول تاني.');
      setMessages(prev => prev.slice(0, -1));
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const clearThread = async () => {
    setClearing(true);
    try {
      const res = await fetch('/api/assistant/history', {
        method: 'DELETE',
        credentials: 'include'
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.success) {
        setError(j?.message || 'معرفتش أمسح المحادثة — حاول تاني.');
        return;
      }
      setMessages([]);
      setConfirmOpen(false);
      setError(null);
      setNotice('تمسحت المحادثة — التقارير نفسها مااتأثرتش.');
    } finally {
      setClearing(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(value => !value)}
        aria-label={open ? 'إغلاق المساعد' : 'افتح مساعد POWER 111'}
        aria-expanded={open}
        className={`fixed z-40 bottom-4 left-4 sm:bottom-5 sm:left-5 w-14 h-14 sm:w-[52px] sm:h-[52px] rounded-2xl overflow-hidden ring-1 transition-all hover:scale-[1.04] ${
          open ? 'ring-primary/70 opacity-90' : 'ring-yellow-500/30'
        }`}
      >
        <img src="/power-logo.jpg" alt="POWER 111" className="w-full h-full object-cover" />
      </button>

      {open && (
        <div className="fixed z-40 bg-dark-card border border-dark-border rounded-2xl shadow-2xl shadow-black/60 flex flex-col overflow-hidden inset-3 sm:inset-auto sm:left-5 sm:bottom-[80px] sm:w-[400px] sm:h-[min(620px,calc(100dvh-6.5rem))]">
          <div className="flex items-center gap-2.5 px-3.5 sm:px-4 py-3 border-b border-dark-border shrink-0">
            <img src="/power-logo.jpg" alt="POWER 111" className="w-8 h-8 rounded-lg object-cover ring-1 ring-yellow-500/30 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-extrabold text-white leading-none">مساعد POWER 111</p>
              <p className="text-[10px] text-gray-600 mt-1 leading-none">أسئلة عادية وحسابات، وأرقام الجيم من تقارير النظام</p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={() => setConfirmOpen(true)}
                aria-label="مسح المحادثة"
                className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-rose-400 hover:bg-white/5 transition-colors"
              >
                <UiIcon name="trash" className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="إغلاق"
              className="w-11 h-11 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
            >
              <UiIcon name="close" className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-3.5 space-y-3.5">
            {messages.length === 0 && !sending && (
              <div className="pt-1.5">
                <p className="text-[13px] text-gray-400 leading-relaxed">
                  اسألني بالعامية عن أي حاجة — تقرير من النظام، عملية حسابية، أو حتى رأي في صياغة رسالة.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {SUGGESTIONS.map(item => (
                    <button
                      key={item}
                      onClick={() => send(item)}
                      className="text-[12px] font-semibold text-gray-300 bg-dark border border-dark-border rounded-xl px-3.5 py-2.5 min-h-[44px] hover:border-primary/50 hover:text-white transition-colors text-right"
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((message, index) => (
              <div key={`${message.at}-${index}`} className={message.role === 'user' ? 'flex justify-start' : 'flex justify-end'}>
                <div className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 ${
                  message.role === 'user'
                    ? 'bg-dark border border-dark-border text-gray-100'
                    : 'bg-primary/10 border border-primary/30 text-white'
                }`}>
                  <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{message.text}</p>
                  {message.tools && message.tools.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                      <span className="text-[10px] text-gray-500 font-semibold">المصدر:</span>
                      {message.tools.map(tool => (
                        <Badge key={tool} tone="gold">{TOOL_LABELS[tool] || tool}</Badge>
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 text-[10px] text-gray-600">{timeLabel(message.at)}</p>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-end">
                <div className="rounded-2xl px-3.5 py-2.5 bg-primary/10 border border-primary/30 flex items-center gap-2.5">
                  <UiIcon name="reports" className="w-4 h-4 text-primary animate-pulse" />
                  <span className="text-[12px] font-semibold text-primary">
                    {waited > 3 ? `بيقرأ من تقارير النظام • ${waited} ثانية` : 'بجهّز ردك'}
                  </span>
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>

          {(error || notice) && (
            <div className="px-3.5 pb-2.5 space-y-2.5">
              {error && (
                <NoticeBanner kind="err" text={error} onDismiss={() => { setError(null); setSessionExpired(false); }} />
              )}
              {notice && !error && <NoticeBanner kind="ok" text={notice} onDismiss={() => setNotice(null)} />}
              {sessionExpired && (
                <Btn variant="ghost" icon="refresh" onClick={() => navigate('/login')}>
                  تسجيل الدخول تاني
                </Btn>
              )}
            </div>
          )}

          <div className="border-t border-dark-border p-3 shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                rows={1}
                maxLength={500}
                disabled={sending}
                placeholder="اكتب سؤالك بالعامية..."
                aria-label="سؤالك للمساعد"
                className="flex-1 resize-none bg-dark border border-dark-border rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-primary/60 transition-colors min-h-[44px] max-h-24 disabled:opacity-50"
              />
              <Btn variant="primary" icon="bolt" onClick={() => send(draft)} disabled={sending || !draft.trim()}>
                <span className="hidden sm:inline">إرسال</span>
              </Btn>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="مسح المحادثة؟"
        description="هتشيل كل الأسئلة والأجوبة المحفوظة ليك على السيرفر. التقارير نفسها زي ما هي — المحادثة بس هي اللي هتمسح."
        confirmLabel="مسح"
        busy={clearing}
        onConfirm={clearThread}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
