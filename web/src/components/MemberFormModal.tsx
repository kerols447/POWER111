import { useState } from 'react';
import { whatsappLink } from '../utils/whatsapp';
import { Btn, CARD, FIELD, Field, Modal, Picker, Segmented, UiIcon } from './ui';

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

  const link = whatsappLink(form.phone);

  return (
    <Modal
      open
      width="max-w-lg"
      onClose={onClose}
      title={mode === 'edit' ? 'تعديل بيانات العضو' : 'إضافة عضو جديد'}
      subtitle={mode === 'edit' ? 'غيّر أي بيانات ناقصة واحفظ' : 'أدخل بيانات العضو أدناه'}
    >
      {error && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl border bg-rose-500/10 border-rose-500/30">
          <UiIcon name="warning" className="w-5 h-5 text-rose-400 shrink-0" />
          <p className="text-[13px] text-rose-400 font-medium">{error}</p>
        </div>
      )}

      <form onSubmit={e => { e.preventDefault(); onSubmit(form); }} className="space-y-4">
        <Field label="الاسم" required>
          <input
            type="text"
            required
            value={form.name}
            onChange={e => set({ name: e.target.value })}
            className={FIELD}
            placeholder="أدخل اسم العضو"
          />
        </Field>

        <Field label="الهاتف" required hint="الرقم هو اللي بيفتح بوابة الأعضاء — لازم يكون صحيح وغير مستخدم لعضو تاني">
          <div className="flex items-center gap-2">
            <input
              type="tel"
              required
              value={form.phone}
              onChange={e => set({ phone: e.target.value })}
              placeholder="01xxxxxxxxx"
              className={`${FIELD} font-mono`}
              dir="ltr"
            />
            {link && (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                title="فتح محادثة واتساب"
                className="shrink-0 inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl text-[12px] font-bold transition-colors bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20"
              >
                <UiIcon name="whatsapp" className="w-4 h-4" />
                واتساب
              </a>
            )}
          </div>
        </Field>

        <Field
          label="كود العضو"
          hint={mode === 'edit'
            ? 'لو عايز تغيّر الكود اكتب الجديد، وسيبه زي ما هو عشان يظل نفس الكود'
            : 'اكتب كود النظام القديم لو عايزه، وسيبه فاضي ياخد كود أوتوماتيك'}
        >
          <input
            type="text"
            value={form.memberCode}
            onChange={e => set({ memberCode: e.target.value.toUpperCase() })}
            placeholder={mode === 'edit' ? 'سيظل الكود الحالي' : 'سياتولد تلقائياً لو سيبته فاضي'}
            className={`${FIELD} font-mono`}
            dir="ltr"
          />
        </Field>

        {/* Status — only an existing member has a status to change */}
        {mode === 'edit' && (
          <Field label="حالة العضو">
            <Picker
              value={form.status}
              onChange={v => set({ status: v })}
              ariaLabel="حالة العضو"
              className="w-full"
              options={STATUS_OPTIONS}
            />
          </Field>
        )}

        <Field label="البريد الإلكتروني">
          <input
            type="email"
            value={form.email}
            onChange={e => set({ email: e.target.value })}
            className={FIELD}
            placeholder="example@email.com"
            dir="ltr"
          />
        </Field>

        <Field label="النوع">
          <Segmented
            value={form.gender}
            onChange={g => set({ gender: g })}
            ariaLabel="النوع"
            options={[{ key: 'Male', label: 'ذكر' }, { key: 'Female', label: 'أنثى' }]}
          />
        </Field>

        <Field label="الفرع" required>
          {lockedBranchName ? (
            <div className={`${CARD} min-h-[44px] px-4 py-2.5 flex items-center gap-2 text-gray-300 text-sm`}>
              <UiIcon name="check" className="w-4 h-4 text-primary" />
              {lockedBranchName}
            </div>
          ) : (
            <Picker
              value={form.branchId}
              onChange={v => set({ branchId: v })}
              ariaLabel="الفرع"
              className="w-full"
              options={[{ value: '', label: 'اختر الفرع' }, ...branches.map(b => ({ value: b.id, label: b.name }))]}
            />
          )}
        </Field>

        <div className="flex items-center gap-2.5 pt-4 border-t border-dark-border">
          <Btn type="button" variant="ghost" onClick={onClose} className="flex-1">إلغاء</Btn>
          <Btn type="submit" variant="primary" disabled={submitting} className="flex-1">
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-black/25 border-t-black rounded-full animate-spin" />
                جاري الحفظ...
              </span>
            ) : offline && mode === 'create' ? 'حفظ محلياً' : 'حفظ'}
          </Btn>
        </div>
      </form>
    </Modal>
  );
}

export default MemberFormModal;
