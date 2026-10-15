import { useState } from 'react';
import { whatsappLink } from '../utils/whatsapp';

export interface MemberFormValues {
  name: string;
  phone: string;
  memberCode: string;
  email: string;
  gender: 'Male' | 'Female';
  branchId: string;
  status: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'ACTIVE', label: 'نشط' },
  { value: 'EXPIRED', label: 'منتهي' },
  { value: 'SUSPENDED', label: 'موقوف' },
  { value: 'FROZEN', label: 'مثلج' },
  { value: 'INACTIVE', label: 'غير نشط' }
];

interface Props {
  mode: 'create' | 'edit';
  initial?: Partial<MemberFormValues>;
  branches: { id: string; name: string }[];
  lockedBranchName?: string | null;
  submitting: boolean;
  offline: boolean;
  error: string;
  onClose: () => void;
  onSubmit: (values: MemberFormValues) => void;
}

function MemberFormModal({
  mode,
  initial,
  branches,
  lockedBranchName,
  submitting,
  offline,
  error,
  onClose,
  onSubmit
}: Props) {
  const [form, setForm] = useState<MemberFormValues>({
    name: initial?.name || '',
    phone: initial?.phone || '',
    memberCode: initial?.memberCode || '',
    email: initial?.email || '',
    gender: initial?.gender === 'Female' ? 'Female' : 'Male',
    branchId: initial?.branchId || '',
    status: initial?.status || 'ACTIVE'
  });

  const set = (patch: Partial<MemberFormValues>) => setForm(prev => ({ ...prev, ...patch }));

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="relative overflow-hidden bg-dark-card border border-dark-border rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/50">
        {/* Modal Header Gradient */}
        <div className="relative bg-gradient-to-br from-primary/10 via-dark-card to-dark-card p-5 sm:p-6 border-b border-dark-border">
          <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-primary/60 via-primary/20 to-transparent" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-primary/20 to-primary/5 rounded-xl flex items-center justify-center border border-primary/10">
                <svg className="w-5 h-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3M2.25 9.75h19.5a2.25 2.25 0 012.25 2.25v6a2.25 2.25 0 01-2.25 2.25H2.25A2.25 2.25 0 010 18v-6a2.25 2.25 0 012.25-2.25z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">
                  {mode === 'edit' ? 'تعديل بيانات العضو' : 'إضافة عضو جديد'}
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {mode === 'edit' ? 'غيّر أي بيانات ناقصة واحفظ' : 'أدخل بيانات العضو أدناه'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-dark border border-dark-border text-gray-400 hover:text-white hover:border-gray-500 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {error && (
            <div className="mb-5 flex items-center gap-3 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <div className="w-8 h-8 bg-rose-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                </svg>
              </div>
              <p className="text-sm text-rose-400 font-medium">{error}</p>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit(form);
            }}
            className="space-y-4"
          >
            {/* Name */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                </svg>
                الاسم <span className="text-primary">*</span>
              </label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
                className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-600"
                placeholder="أدخل اسم العضو"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                </svg>
                الهاتف <span className="text-primary">*</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => set({ phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                  className="flex-1 min-w-0 px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-600 font-mono"
                  dir="ltr"
                />
                {(() => {
                  const link = whatsappLink(form.phone);
                  return link ? (
                    <a
                      href={link}
                      target="_blank"
                      rel="noreferrer"
                      title="فتح محادثة واتساب"
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20 transition-all text-xs font-medium flex-shrink-0"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12.04 2a9.9 9.9 0 0 0-8.51 14.94L2 22l5.2-1.49A9.9 9.9 0 1 0 12.04 2z" />
                      </svg>
                      واتساب
                    </a>
                  ) : null;
                })()}
              </div>
              <p className="mt-2 text-xs text-gray-500">الرقم هو اللي بيفتح بوابة الأعضاء — لازم يكون صحيح وغير مستخدم لعضو تاني</p>
            </div>

            {/* Member code */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 6v12m-3-7.5v7.5m-9-10.5h13.5a2.25 2.25 0 012.25 2.25v3a2.25 2.25 0 01-2.25 2.25H7.5A2.25 2.25 0 015.25 13.5v-3A2.25 2.25 0 017.5 8.25z" />
                </svg>
                كود العضو
              </label>
              <input
                type="text"
                value={form.memberCode}
                onChange={(e) => set({ memberCode: e.target.value.toUpperCase() })}
                placeholder={mode === 'edit' ? 'سيظل الكود الحالي' : 'سياتولد تلقائياً لو سيبته فاضي'}
                className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-600 font-mono"
                dir="ltr"
              />
              <p className="mt-2 text-xs text-gray-500">
                {mode === 'edit'
                  ? 'لو عايز تغيّر الكود اكتب الجديد، وسيبه زي ما هو عشان يظل نفس الكود'
                  : 'اكتب كود النظام القديم لو عايزه، وسيبه فاضي ياخد كود أوتوماتيك'}
              </p>
            </div>

            {/* Status — only an existing member has a status to change */}
            {mode === 'edit' && (
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                  <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  حالة العضو
                </label>
                <select
                  value={form.status}
                  onChange={(e) => set({ status: e.target.value })}
                  className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors appearance-none"
                >
                  {STATUS_OPTIONS.map(s => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                </svg>
                البريد الإلكتروني
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors placeholder:text-gray-600"
                placeholder="example@email.com"
                dir="ltr"
              />
            </div>

            {/* Gender */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0" />
                </svg>
                النوع
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => set({ gender: 'Male' })}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    form.gender === 'Male'
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-dark border-dark-border text-gray-400 hover:border-gray-500'
                  }`}
                >
                  ذكر
                </button>
                <button
                  type="button"
                  onClick={() => set({ gender: 'Female' })}
                  className={`py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    form.gender === 'Female'
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-dark border-dark-border text-gray-400 hover:border-gray-500'
                  }`}
                >
                  أنثى
                </button>
              </div>
            </div>

            {/* Branch */}
            <div>
              <label className="flex items-center gap-2 text-sm font-medium text-gray-300 mb-2">
                <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                </svg>
                الفرع <span className="text-primary">*</span>
              </label>
              {lockedBranchName ? (
                <div className="w-full px-4 py-2.5 bg-dark/50 border border-dark-border rounded-xl text-gray-400 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {lockedBranchName}
                </div>
              ) : (
                <select
                  required
                  value={form.branchId}
                  onChange={(e) => set({ branchId: e.target.value })}
                  className="w-full px-4 py-2.5 bg-dark border border-dark-border rounded-xl text-white text-sm focus:outline-none focus:border-primary/60 transition-colors appearance-none"
                >
                  <option value="">اختر الفرع</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4 border-t border-dark-border">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 bg-dark border border-dark-border text-white rounded-xl text-sm font-medium hover:bg-white/[0.03] hover:border-gray-600 transition-all"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`flex-1 py-2.5 text-white rounded-xl text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg ${
                  offline
                    ? 'bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-600 shadow-amber-900/20'
                    : 'bg-gradient-to-r from-primary to-amber-600 hover:from-amber-600 hover:to-primary shadow-primary/20'
                }`}
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    جاري الحفظ...
                  </span>
                ) : offline && mode === 'create' ? 'حفظ محلياً' : 'حفظ'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default MemberFormModal;
