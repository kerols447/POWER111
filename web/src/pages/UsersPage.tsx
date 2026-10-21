import { useState, useEffect } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';
import {
  PageHeader, SectionTitle, StatTile, Badge, Btn, Field, LABEL, FIELD,
  TableShell, Th, Td, Row, ListCard, Loading, Modal, UiIcon, CARD, TONE
} from '../components/ui';

interface Branch {
  id: string;
  name: string;
  code: string;
}

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  phone?: string;
  staffCode?: string | null;
  salaryPiasters?: number | null;
  salaryBasis?: 'MONTHLY' | 'HOURLY';
  isActive: boolean;
  createdAt: string;
  branchAccess: {
    branch: Branch;
  }[];
  permissions: { permission: string }[];
}

interface PermissionsMap {
  [role: string]: string[];
}

const permissionLabels: Record<string, string> = {
  VIEW_MEMBERS: 'عرض الأعضاء',
  CREATE_MEMBERS: 'إضافة أعضاء',
  EDIT_MEMBERS: 'تعديل أعضاء',
  DELETE_MEMBERS: 'حذف أعضاء',
  VIEW_SUBSCRIPTIONS: 'عرض الاشتراكات',
  CREATE_SUBSCRIPTIONS: 'إنشاء اشتراكات',
  EDIT_SUBSCRIPTIONS: 'تعديل اشتراكات',
  RENEW_SUBSCRIPTIONS: 'تجديد اشتراكات',
  FREEZE_SUBSCRIPTIONS: 'تجميد اشتراكات',
  VIEW_ATTENDANCE: 'عرض الحضور',
  CHECKIN_MEMBERS: 'تسجيل حضور',
  VIEW_PRODUCTS: 'عرض المنتجات',
  CREATE_PRODUCTS: 'إضافة منتجات',
  EDIT_PRODUCTS: 'تعديل منتجات',
  DELETE_PRODUCTS: 'حذف منتجات',
  VIEW_SALES: 'عرض المبيعات',
  CREATE_SALES: 'إنشاء مبيعات',
  MANAGE_DISCOUNTS: 'إدارة الخصومات',
  VIEW_EXPENSES: 'عرض المصروفات',
  CREATE_EXPENSES: 'إضافة مصروفات',
  EDIT_EXPENSES: 'تعديل مصروفات',
  DELETE_EXPENSES: 'حذف مصروفات',
  VIEW_REPORTS: 'عرض التقارير',
  VIEW_FINANCIAL_REPORTS: 'التقارير المالية',
  VIEW_BRANCHES: 'عرض الفروع',
  EDIT_BRANCHES: 'تعديل الفروع',
  VIEW_USERS: 'عرض المستخدمين',
  CREATE_USERS: 'إضافة مستخدمين',
  EDIT_USERS: 'تعديل مستخدمين',
  DELETE_USERS: 'حذف مستخدمين',
  MANAGE_SETTINGS: 'الإعدادات',
  VIEW_DASHBOARD: 'لوحة التحكم',
  VIEW_ALL_BRANCHES_DASHBOARD: 'لوحة جميع الفروع',
  VIEW_DASHBOARD_REVENUE: 'إيرادات اليوم',
  VIEW_DASHBOARD_EXPENSES: 'مصروفات اليوم',
  VIEW_DASHBOARD_PROFIT: 'صافي الربح',
  VIEW_DASHBOARD_OUTSTANDING: 'المستحقات'
};

const permissionGroups = [
  { label: 'الأعضاء', permissions: ['VIEW_MEMBERS', 'CREATE_MEMBERS', 'EDIT_MEMBERS', 'DELETE_MEMBERS'] },
  { label: 'الاشتراكات', permissions: ['VIEW_SUBSCRIPTIONS', 'CREATE_SUBSCRIPTIONS', 'EDIT_SUBSCRIPTIONS', 'RENEW_SUBSCRIPTIONS', 'FREEZE_SUBSCRIPTIONS'] },
  { label: 'الحضور', permissions: ['VIEW_ATTENDANCE', 'CHECKIN_MEMBERS'] },
  { label: 'المنتجات', permissions: ['VIEW_PRODUCTS', 'CREATE_PRODUCTS', 'EDIT_PRODUCTS', 'DELETE_PRODUCTS'] },
  { label: 'المبيعات', permissions: ['VIEW_SALES', 'CREATE_SALES', 'MANAGE_DISCOUNTS'] },
  { label: 'المصروفات', permissions: ['VIEW_EXPENSES', 'CREATE_EXPENSES', 'EDIT_EXPENSES', 'DELETE_EXPENSES'] },
  { label: 'التقارير', permissions: ['VIEW_REPORTS', 'VIEW_FINANCIAL_REPORTS', 'VIEW_ALL_BRANCHES_DASHBOARD'] },
  { label: 'الفروع', permissions: ['VIEW_BRANCHES', 'EDIT_BRANCHES'] },
  { label: 'المستخدمين', permissions: ['VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'DELETE_USERS'] },
  { label: 'الإعدادات', permissions: ['MANAGE_SETTINGS'] },
  { label: 'الصفحة الرئيسية', permissions: ['VIEW_DASHBOARD', 'VIEW_DASHBOARD_REVENUE', 'VIEW_DASHBOARD_EXPENSES', 'VIEW_DASHBOARD_PROFIT', 'VIEW_DASHBOARD_OUTSTANDING'] }
];

const roleLabels: Record<string, string> = {
  OWNER: 'مالك',
  BRANCH_MANAGER: 'مدير فرع',
  RECEPTIONIST: 'موظف استقبال',
  ACCOUNTANT: 'محاسب',
  TRAINER: 'مدرب',
  CONTENT_MANAGER: 'مدير محتوى'
};

const emptyForm = () => ({
  email: '',
  password: '',
  name: '',
  role: 'RECEPTIONIST',
  phone: '',
  staffCode: '',
  salaryEgp: '',
  salaryBasis: 'MONTHLY' as 'MONTHLY' | 'HOURLY',
  branchIds: [] as string[],
  permissions: [] as string[]
});

function salaryLabel(user: User): string | null {
  if (!user.salaryPiasters) return null;
  const egp = (user.salaryPiasters / 100).toLocaleString('ar-EG-u-nu-latn');
  return user.salaryBasis === 'HOURLY' ? `${egp} ج.م / ساعة` : `${egp} ج.م شهرياً`;
}

type BadgeTone = 'gold' | 'green' | 'red' | 'amber' | 'blue' | 'gray';

// The checkbox rows of the permission editor — one kit token set, ≥44px touch target.
const PERM_CHECK = 'w-4 h-4 rounded bg-dark border-dark-border text-primary focus:outline-none shrink-0';
const PERM_ROW = 'flex items-center gap-2.5 min-h-[44px] px-2 rounded-lg cursor-pointer hover:bg-white/5 transition-colors';

function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rolePermissions, setRolePermissions] = useState<PermissionsMap>({});
  const [allPermissionsList, setAllPermissionsList] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [permissionsUser, setPermissionsUser] = useState<User | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState(emptyForm());
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<User | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    fetchUsers();
    fetchBranches();
    fetchPermissionsList();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchBranches = async () => {
    try {
      const res = await fetch('/api/branches', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setBranches(data);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchPermissionsList = async () => {
    try {
      const res = await fetch('/api/users/permissions/list', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setRolePermissions(data.permissions);
        setAllPermissionsList(data.allPermissions);
      }
    } catch (error) {
      console.error('Error fetching permissions:', error);
    }
  };

  const handleRoleChange = (role: string) => {
    setFormData({ ...formData, role, permissions: rolePermissions[role] || [] });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const url = editingUser ? `/api/users/${editingUser.id}` : '/api/users';
      const method = editingUser ? 'PUT' : 'POST';

      const payload: any = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
        phone: formData.phone,
        branchIds: formData.branchIds
      };

      // Staff card code — left empty on create so the server assigns the next S-number
      if (formData.role !== 'OWNER' && formData.staffCode.trim()) {
        payload.staffCode = formData.staffCode.trim();
      }

      // Wage is typed in pounds and stored in piasters; blank means "no salary yet"
      if (formData.role !== 'OWNER') {
        const egp = Number(formData.salaryEgp);
        payload.salaryPiasters = formData.salaryEgp.trim() && Number.isFinite(egp) && egp > 0
          ? Math.round(egp * 100)
          : null;
        payload.salaryBasis = formData.salaryBasis;
      }

      if (formData.password) {
        payload.password = formData.password;
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        const userData = await res.json();
        if (formData.role !== 'OWNER' && formData.permissions.length > 0) {
          await fetch(`/api/users/${userData.id}/permissions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ permissions: formData.permissions })
          });
        }
        setShowModal(false);
        setEditingUser(null);
        setFormData(emptyForm());
        setNotice({ kind: 'ok', text: editingUser ? 'تم تحديث المستخدم' : 'تم إضافة المستخدم وكارت الوردية بتاعه' });
        fetchUsers();
      } else {
        const data = await res.json();
        setNotice({ kind: 'err', text: data.message || data.error || 'حدث خطأ' });
      }
    } catch (error) {
      console.error('Error saving user:', error);
      setNotice({ kind: 'err', text: 'حدث خطأ في حفظ البيانات' });
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setFormData({
      ...emptyForm(),
      email: user.email,
      name: user.name,
      role: user.role,
      phone: user.phone || '',
      staffCode: user.staffCode || '',
      salaryEgp: user.salaryPiasters ? String(user.salaryPiasters / 100) : '',
      salaryBasis: user.salaryBasis || 'MONTHLY',
      branchIds: user.branchAccess.map(ba => ba.branch.id),
      permissions: rolePermissions[user.role] || []
    });
    setShowModal(true);
  };

  const handleDelete = async () => {
    const user = pendingDelete;
    if (!user) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        setNotice({ kind: 'ok', text: `تم حذف ${user.name}` });
        fetchUsers();
      } else {
        const data = await res.json();
        setNotice({ kind: 'err', text: data.message || data.error || 'حدث خطأ' });
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      setNotice({ kind: 'err', text: 'حدث خطأ في حذف المستخدم' });
    } finally {
      setDeleting(false);
      setPendingDelete(null);
    }
  };

  const handleToggleActive = async (user: User) => {
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isActive: !user.isActive })
      });

      if (res.ok) {
        fetchUsers();
      }
    } catch (error) {
      console.error('Error toggling user:', error);
    }
  };

  const toggleBranch = (branchId: string) => {
    setFormData(prev => ({
      ...prev,
      branchIds: prev.branchIds.includes(branchId)
        ? prev.branchIds.filter(id => id !== branchId)
        : [...prev.branchIds, branchId]
    }));
  };

  const togglePermission = (permission: string) => {
    setFormData(prev => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter(p => p !== permission)
        : [...prev.permissions, permission]
    }));
  };

  const openPermissionsEditor = (user: User) => {
    setPermissionsUser(user);
    setCustomPermissions(user.permissions.map(p => p.permission));
    setShowPermissionsModal(true);
  };

  const toggleCustomPermission = (permission: string) => {
    setCustomPermissions(prev =>
      prev.includes(permission)
        ? prev.filter(p => p !== permission)
        : [...prev, permission]
    );
  };

  const savePermissions = async () => {
    if (!permissionsUser) return;

    try {
      const res = await fetch(`/api/users/${permissionsUser.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ permissions: customPermissions })
      });

      if (res.ok) {
        setShowPermissionsModal(false);
        setPermissionsUser(null);
        setNotice({ kind: 'ok', text: 'تم حفظ الصلاحيات' });
        fetchUsers();
      } else {
        setNotice({ kind: 'err', text: 'حدث خطأ في حفظ الصلاحيات' });
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      setNotice({ kind: 'err', text: 'حدث خطأ في حفظ الصلاحيات' });
    }
  };

  const getRoleBadgeTone = (role: string): BadgeTone => {
    switch (role) {
      case 'OWNER': return 'gold';
      case 'BRANCH_MANAGER': return 'amber';
      case 'RECEPTIONIST': return 'green';
      case 'ACCOUNTANT': return 'amber';
      case 'TRAINER': return 'blue';
      case 'CONTENT_MANAGER': return 'red';
      default: return 'gray';
    }
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <div className="space-y-5 sm:space-y-7" dir="rtl">
      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      <PageHeader
        icon="users"
        title="إدارة المستخدمين"
        caption="إدارة حسابات وصلاحيات المستخدمين"
        actions={
          <Btn
            icon="plus"
            variant="primary"
            onClick={() => {
              setEditingUser(null);
              setFormData({ ...emptyForm(), permissions: rolePermissions['RECEPTIONIST'] || [] });
              setShowModal(true);
            }}
          >
            إضافة مستخدم جديد
          </Btn>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatTile
          icon="users"
          tone={TONE.members}
          label="إجمالي المستخدمين"
          value={users.length}
        />
        <StatTile
          icon="check"
          tone={TONE.revenue}
          label="النشطين"
          value={users.filter(u => u.isActive).length}
        />
        <StatTile
          icon="settings"
          tone={TONE.outstanding}
          label="المالكين"
          value={users.filter(u => u.role === 'OWNER').length}
        />
        <StatTile
          icon="branches"
          tone={TONE.staff}
          label="مديري الفروع"
          value={users.filter(u => u.role === 'BRANCH_MANAGER').length}
        />
      </div>

      {/* Users Table */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="hidden sm:block">
          <TableShell
            minWidth="min-w-[700px]"
            head={
              <>
                <Th>الاسم</Th>
                <Th className="hidden md:table-cell">البريد الإلكتروني</Th>
                <Th>الدور</Th>
                <Th className="hidden xl:table-cell">الهاتف</Th>
                <Th className="hidden sm:table-cell">الفروع</Th>
                <Th className="hidden sm:table-cell">الصلاحيات</Th>
                <Th>الحالة</Th>
                <Th>إجراءات</Th>
              </>
            }
          >
            {users.map((user) => (
              <Row key={user.id}>
                <Td>
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${TONE.members}14`, color: TONE.members }}
                    >
                      <span className="text-sm font-bold">{user.name.charAt(0)}</span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{user.name}</p>
                      <p className="text-xs text-gray-500 md:hidden">{user.email}</p>
                      {user.staffCode && (
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-mono text-primary">
                          <span className="text-gray-500">كارت</span>
                          <span dir="ltr">{user.staffCode}</span>
                        </span>
                      )}
                      {salaryLabel(user) && (
                        <p className="text-xs text-emerald-400 mt-1">{salaryLabel(user)}</p>
                      )}
                    </div>
                  </div>
                </Td>
                <Td className="hidden md:table-cell max-w-[150px]">
                  <span className="block truncate text-sm text-gray-400 font-mono" title={user.email}>{user.email}</span>
                </Td>
                <Td>
                  <Badge tone={getRoleBadgeTone(user.role)}>{roleLabels[user.role] || user.role}</Badge>
                </Td>
                <Td className="hidden xl:table-cell">
                  <span className="text-sm text-gray-400 font-mono">{user.phone || '—'}</span>
                </Td>
                <Td className="hidden sm:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {user.branchAccess.map(ba => (
                      <span key={ba.branch.id} className="inline-flex px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary rounded-lg border border-primary/20">
                        {ba.branch.code}
                      </span>
                    ))}
                  </div>
                </Td>
                <Td className="hidden sm:table-cell">
                  {user.role === 'OWNER' ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
                      <UiIcon name="check" className="w-4 h-4" />
                      كل الصلاحيات
                    </span>
                  ) : (
                    <button
                      onClick={() => openPermissionsEditor(user)}
                      className="inline-flex items-center gap-1.5 px-3 min-h-[44px] sm:min-h-[36px] text-xs font-semibold bg-white/5 text-gray-300 rounded-lg border border-dark-border hover:border-primary/50 hover:text-white transition-colors"
                    >
                      <UiIcon name="settings" className="w-3.5 h-3.5" />
                      تعديل ({user.permissions.length})
                    </button>
                  )}
                </Td>
                <Td>
                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] sm:min-h-[36px] rounded-lg text-xs font-semibold border transition-colors ${
                      user.isActive
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                    {user.isActive ? 'نشط' : 'معطل'}
                  </button>
                </Td>
                <Td>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleEdit(user)}
                      title="تعديل"
                      className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold rounded-lg border border-primary/20 hover:border-primary/40 transition-colors"
                    >
                      <UiIcon name="edit" className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">تعديل</span>
                    </button>
                    <button
                      onClick={() => setPendingDelete(user)}
                      title="حذف"
                      className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 min-h-[44px] sm:min-h-[36px] bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-semibold rounded-lg border border-rose-500/20 hover:border-rose-500/40 transition-colors"
                    >
                      <UiIcon name="trash" className="w-3.5 h-3.5" />
                      <span className="hidden xl:inline">حذف</span>
                    </button>
                  </div>
                </Td>
              </Row>
            ))}
          </TableShell>
        </div>

        {/* Phone: one card per user, no sideways scrolling */}
        <div className="sm:hidden p-3 space-y-3">
          {users.map((user) => (
            <ListCard key={user.id}>
              <div className="flex items-start gap-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${TONE.members}14`, color: TONE.members }}
                >
                  <span className="text-base font-bold">{user.name.charAt(0)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 font-mono break-all mt-0.5">{user.email}</p>
                  {user.staffCode && (
                    <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-mono text-primary">
                      <span className="text-gray-500">كارت</span>
                      <span dir="ltr">{user.staffCode}</span>
                    </span>
                  )}
                  {salaryLabel(user) && (
                    <p className="text-xs text-emerald-400 mt-1.5">{salaryLabel(user)}</p>
                  )}
                </div>
                <div className="shrink-0">
                  <Badge tone={getRoleBadgeTone(user.role)}>{roleLabels[user.role] || user.role}</Badge>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                <div className="font-mono">{user.phone || '—'}</div>
                {user.branchAccess.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.branchAccess.map(ba => (
                      <span key={ba.branch.id} className="inline-flex px-2 py-0.5 text-xs font-semibold bg-primary/10 text-primary rounded-lg border border-primary/20">
                        {ba.branch.code}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions sit beside the info block — never inside a tappable wrapper */}
              <div className="mt-3 pt-3 border-t border-dark-border/30 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleToggleActive(user)}
                  className={`inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-lg text-xs font-semibold border transition-colors ${
                    user.isActive
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 active:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 active:bg-emerald-500/20'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  {user.isActive ? 'تعطيل' : 'تفعيل'}
                </button>
                {user.role !== 'OWNER' && (
                  <button
                    onClick={() => openPermissionsEditor(user)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold bg-white/5 text-gray-300 rounded-lg border border-dark-border hover:border-primary/50 hover:text-white transition-colors"
                  >
                    <UiIcon name="settings" className="w-3.5 h-3.5" />
                    <span>الصلاحيات ({user.permissions.length})</span>
                  </button>
                )}
                <button
                  onClick={() => handleEdit(user)}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold bg-primary/10 text-primary rounded-lg border border-primary/20"
                >
                  <UiIcon name="edit" className="w-3.5 h-3.5" />
                  <span>تعديل</span>
                </button>
                <button
                  onClick={() => setPendingDelete(user)}
                  className="inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-semibold bg-rose-500/10 text-rose-400 rounded-lg border border-rose-500/20"
                >
                  <UiIcon name="trash" className="w-3.5 h-3.5" />
                  <span>حذف</span>
                </button>
              </div>
            </ListCard>
          ))}
        </div>
      </div>

      {/* Create/Edit Modal */}
      <Modal
        open={showModal}
        title={editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
        onClose={() => {
          setShowModal(false);
          setEditingUser(null);
          setFormData(emptyForm());
        }}
        footer={
          <>
            <Btn type="button" variant="ghost" onClick={() => {
              setShowModal(false);
              setEditingUser(null);
              setFormData(emptyForm());
            }}>
              إلغاء
            </Btn>
            <Btn type="submit" form="user-form" icon="check" variant="primary">
              {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
            </Btn>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="الاسم" required>
              <input
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className={FIELD}
                placeholder="محمد أحمد"
              />
            </Field>

            <Field label="البريد الإلكتروني" required>
              <input
                type="email"
                required
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className={`${FIELD} font-mono`}
                placeholder="user@power111.com"
                dir="ltr"
              />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label={`كلمة المرور${editingUser ? ' (اتركها فارغة)' : ''}`} required={!editingUser}>
              <input
                type="password"
                required={!editingUser}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className={FIELD}
                placeholder="••••••••"
              />
            </Field>

            <Field label="الدور" required>
              <select
                required
                value={formData.role}
                onChange={(e) => handleRoleChange(e.target.value)}
                className={`${FIELD} cursor-pointer`}
              >
                <option value="OWNER">مالك</option>
                <option value="BRANCH_MANAGER">مدير فرع</option>
                <option value="RECEPTIONIST">موظف استقبال</option>
                <option value="ACCOUNTANT">محاسب</option>
                <option value="TRAINER">مدرب</option>
                <option value="CONTENT_MANAGER">مدير محتوى</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="رقم الهاتف">
              <input
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className={`${FIELD} font-mono`}
                placeholder="01234567890"
                dir="ltr"
              />
            </Field>

            {formData.role !== 'OWNER' && (
              <Field
                label="كود كارت الوردية"
                hint={
                  editingUser
                    ? 'اكتب رقم الكارت نفسه اللي على البطاقة، مثلاً S01. سيبه فاضي لو عايز يظل زي ما هو.'
                    : 'سيبه فاضي ياخد أقرب رقم فاضي (S04 مثلاً).'
                }
              >
                <input
                  type="text"
                  value={formData.staffCode}
                  onChange={(e) => setFormData({ ...formData, staffCode: e.target.value })}
                  className={`${FIELD} font-mono`}
                  placeholder={editingUser ? '' : 'يتعيّن تلقائياً'}
                  dir="ltr"
                  maxLength={8}
                />
              </Field>
            )}
          </div>

          {formData.role !== 'OWNER' && (
            <div className={`${CARD} grid grid-cols-1 sm:grid-cols-2 gap-4 p-4`}>
              <Field label={formData.salaryBasis === 'HOURLY' ? 'سعر الساعة (ج.م)' : 'المرتب الشهري (ج.م)'} hint="سيبه فاضي لو لسه مش محدد.">
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  step="1"
                  value={formData.salaryEgp}
                  onChange={(e) => setFormData({ ...formData, salaryEgp: e.target.value })}
                  className={`${FIELD} font-mono`}
                  placeholder="5000"
                  dir="ltr"
                />
              </Field>
              <Field label="طريقة الحساب" hint="كل عملية سداد بتتنزل أوتوماتيك في مصروفات «رواتب» بتاعة الفرع.">
                <select
                  value={formData.salaryBasis}
                  onChange={(e) => setFormData({ ...formData, salaryBasis: e.target.value as 'MONTHLY' | 'HOURLY' })}
                  className={`${FIELD} cursor-pointer`}
                >
                  <option value="MONTHLY">مرتب شهري ثابت</option>
                  <option value="HOURLY">بالساعة</option>
                </select>
              </Field>
            </div>
          )}

          <Field label="الفروع المسموحة">
            <div className={`${CARD} grid grid-cols-1 sm:grid-cols-2 gap-1 p-3`}>
              {branches.map((branch) => (
                <label key={branch.id} className={PERM_ROW}>
                  <input
                    type="checkbox"
                    checked={formData.branchIds.includes(branch.id)}
                    onChange={() => toggleBranch(branch.id)}
                    className={PERM_CHECK}
                  />
                  <span className="text-sm text-gray-300">
                    {branch.code} - {branch.name}
                  </span>
                </label>
              ))}
            </div>
          </Field>

          {/* Permissions Section */}
          {formData.role !== 'OWNER' && (
            <div>
              <label className={LABEL}>
                الصلاحيات
                <span className="text-xs text-gray-500 mr-2">(افتراضي حسب الدور - يمكنك التعديل)</span>
              </label>
              <div className="space-y-3">
                {permissionGroups.map(group => {
                  const groupPerms = group.permissions.filter(p => allPermissionsList.includes(p));
                  if (groupPerms.length === 0) return null;
                  return (
                    <div key={group.label} className={`${CARD} p-4`}>
                      <div className="mb-2">
                        <SectionTitle>{group.label}</SectionTitle>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {groupPerms.map(perm => (
                          <label key={perm} className={PERM_ROW}>
                            <input
                              type="checkbox"
                              checked={formData.permissions.includes(perm)}
                              onChange={() => togglePermission(perm)}
                              className={PERM_CHECK}
                            />
                            <span className="text-xs text-gray-300">
                              {permissionLabels[perm] || perm}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </form>
      </Modal>

      {/* Permissions Editor Modal */}
      {showPermissionsModal && permissionsUser && (
        <Modal
          open
          title={`تعديل صلاحيات: ${permissionsUser.name}`}
          subtitle={`الدور: ${roleLabels[permissionsUser.role] || permissionsUser.role}`}
          onClose={() => {
            setShowPermissionsModal(false);
            setPermissionsUser(null);
          }}
          footer={
            <>
              <Btn type="button" variant="ghost" onClick={() => {
                setShowPermissionsModal(false);
                setPermissionsUser(null);
              }}>
                إلغاء
              </Btn>
              <Btn type="button" variant="primary" icon="check" onClick={savePermissions}>
                حفظ الصلاحيات
              </Btn>
            </>
          }
        >
          <div className="space-y-3">
            {permissionGroups.map(group => {
              const groupPerms = group.permissions.filter(p => allPermissionsList.includes(p));
              if (groupPerms.length === 0) return null;
              return (
                <div key={group.label} className={`${CARD} p-4`}>
                  <div className="mb-2">
                    <SectionTitle>{group.label}</SectionTitle>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                    {groupPerms.map(perm => (
                      <label key={perm} className={PERM_ROW}>
                        <input
                          type="checkbox"
                          checked={customPermissions.includes(perm)}
                          onChange={() => toggleCustomPermission(perm)}
                          className={PERM_CHECK}
                        />
                        <span className="text-xs text-gray-300">
                          {permissionLabels[perm] || perm}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف المستخدم"
        description={pendingDelete ? `سيتم حذف حساب "${pendingDelete.name}" نهائياً. سجل الحضور بتاعه هيتمسح معاه.` : ''}
        busy={deleting}
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}

export default UsersPage;
