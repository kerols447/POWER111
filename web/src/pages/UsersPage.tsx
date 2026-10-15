import { useState, useEffect } from 'react';
import ConfirmDialog from '../components/ConfirmDialog';
import NoticeBanner from '../components/NoticeBanner';

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

// SVG Icons
const PlusIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const UsersIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
  </svg>
);

const UserCheckIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const CrownIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3l3.057-3L12 4l3.943-4L19 3l-2 7H7L5 3zm2 8v6a2 2 0 002 2h6a2 2 0 002-2v-6" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const EditIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
);

const CloseIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const KeyIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
  </svg>
);

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
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'RECEPTIONIST',
    phone: '',
    staffCode: '',
    branchIds: [] as string[],
    permissions: [] as string[]
  });
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
        setFormData({ email: '', password: '', name: '', role: 'RECEPTIONIST', phone: '', staffCode: '', branchIds: [], permissions: [] });
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
      email: user.email,
      password: '',
      name: user.name,
      role: user.role,
      phone: user.phone || '',
      staffCode: user.staffCode || '',
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

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'OWNER': return 'bg-amber-500/10 text-amber-300 border-amber-500/20';
      case 'BRANCH_MANAGER': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'RECEPTIONIST': return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20';
      case 'ACCOUNTANT': return 'bg-yellow-500/10 text-yellow-300 border-yellow-500/20';
      case 'TRAINER': return 'bg-blue-500/10 text-blue-300 border-blue-500/20';
      case 'CONTENT_MANAGER': return 'bg-rose-500/10 text-rose-300 border-rose-500/20';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <svg className="animate-spin w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span>جاري التحميل...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {notice && <NoticeBanner kind={notice.kind} text={notice.text} onDismiss={() => setNotice(null)} />}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <UsersIcon />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              إدارة المستخدمين
            </h1>
            <p className="text-sm text-gray-400 mt-0.5">إدارة حسابات وصلاحيات المستخدمين</p>
          </div>
        </div>
        <button
          onClick={() => {
            setEditingUser(null);
            setFormData({ email: '', password: '', name: '', role: 'RECEPTIONIST', phone: '', staffCode: '', branchIds: [], permissions: rolePermissions['RECEPTIONIST'] || [] });
            setShowModal(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl hover:shadow-amber-500/30 transform hover:-translate-y-0.5"
        >
          <PlusIcon />
          <span>إضافة مستخدم جديد</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <UsersIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">إجمالي المستخدمين</span>
            </div>
            <p className="text-2xl font-bold text-white">{users.length}</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-emerald-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                <UserCheckIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">النشطين</span>
            </div>
            <p className="text-2xl font-bold text-emerald-400">{users.filter(u => u.isActive).length}</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(251,191,36,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-yellow-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <CrownIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">المالكين</span>
            </div>
            <p className="text-2xl font-bold text-yellow-400">{users.filter(u => u.role === 'OWNER').length}</p>
          </div>
        </div>

        <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50 p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.06),transparent_50%)]"></div>
          <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <ShieldIcon />
              </div>
              <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">مديري الفروع</span>
            </div>
            <p className="text-2xl font-bold text-amber-400">{users.filter(u => u.role === 'BRANCH_MANAGER').length}</p>
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-800/80 via-gray-800/60 to-gray-900/80 backdrop-blur-sm rounded-2xl border border-gray-700/50">
        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/20 to-transparent"></div>
        <div className="hidden sm:block overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="border-b border-gray-700/50">
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الاسم</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">البريد الإلكتروني</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الدور</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden lg:table-cell">الهاتف</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">الفروع</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider hidden sm:table-cell">الصلاحيات</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">الحالة</th>
                <th className="px-4 sm:px-6 py-4 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700/30">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-amber-500/5 transition-colors duration-200">
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20 flex-shrink-0">
                        <span className="text-sm font-bold text-amber-300">{user.name.charAt(0)}</span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{user.name}</p>
                        <p className="text-xs text-gray-500 md:hidden">{user.email}</p>
                        {user.staffCode && (
                          <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/15 text-xs font-mono text-amber-300">
                            <span className="text-gray-500">كارت</span>
                            <span dir="ltr">{user.staffCode}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-gray-400 font-mono text-sm hidden md:table-cell">{user.email}</td>
                  <td className="px-4 sm:px-6 py-4">
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                      {roleLabels[user.role] || user.role}
                    </span>
                  </td>
                  <td className="px-4 sm:px-6 py-4 text-gray-400 font-mono text-sm hidden lg:table-cell">{user.phone || '—'}</td>
                  <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {user.branchAccess.map(ba => (
                        <span key={ba.branch.id} className="inline-flex px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-md border border-amber-500/15">
                          {ba.branch.code}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 sm:px-6 py-4 hidden sm:table-cell">
                    {user.role === 'OWNER' ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-300 font-medium">
                        <CrownIcon />
                        كل الصلاحيات
                      </span>
                    ) : (
                      <button
                        onClick={() => openPermissionsEditor(user)}
                        className="inline-flex items-center gap-1.5 text-xs bg-gray-700/30 hover:bg-gray-700/50 text-gray-300 px-3 py-1.5 rounded-lg border border-gray-600/30 transition-all duration-200"
                      >
                        <KeyIcon />
                        تعديل ({user.permissions.length})
                      </button>
                    )}
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <button
                      onClick={() => handleToggleActive(user)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200 ${
                        user.isActive
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 hover:bg-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-300 border border-rose-500/20 hover:bg-rose-500/20'
                      }`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                      {user.isActive ? 'نشط' : 'معطل'}
                    </button>
                  </td>
                  <td className="px-4 sm:px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(user)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20 hover:bg-amber-500/20 transition-all duration-200"
                      >
                        <EditIcon />
                        <span className="hidden sm:inline">تعديل</span>
                      </button>
                      <button
                        onClick={() => setPendingDelete(user)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 hover:bg-rose-500/20 transition-all duration-200"
                      >
                        <TrashIcon />
                        <span className="hidden sm:inline">حذف</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Phone: one card per user, no sideways scrolling */}
        <div className="sm:hidden divide-y divide-gray-700/30">
          {users.map((user) => (
            <div key={user.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-amber-500/20 to-amber-600/10 flex items-center justify-center border border-amber-500/20 shrink-0">
                  <span className="text-sm font-bold text-amber-300">{user.name.charAt(0)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 font-mono break-all mt-0.5">{user.email}</p>
                  {user.staffCode && (
                    <span className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/15 text-xs font-mono text-amber-300">
                      <span className="text-gray-500">كارت</span>
                      <span dir="ltr">{user.staffCode}</span>
                    </span>
                  )}
                </div>
                <span className={`shrink-0 inline-flex px-2.5 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                  {roleLabels[user.role] || user.role}
                </span>
              </div>

              <div className="mt-3 space-y-1.5 text-xs text-gray-400">
                <div className="font-mono">{user.phone || '—'}</div>
                {user.branchAccess.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {user.branchAccess.map(ba => (
                      <span key={ba.branch.id} className="inline-flex px-2 py-0.5 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-md border border-amber-500/15">
                        {ba.branch.code}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleToggleActive(user)}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-10 rounded-lg text-xs font-medium border transition-all duration-200 ${
                    user.isActive
                      ? 'bg-rose-500/10 text-rose-300 border-rose-500/20 active:bg-rose-500/20'
                      : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20 active:bg-emerald-500/20'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${user.isActive ? 'bg-emerald-400' : 'bg-rose-400'}`}></span>
                  {user.isActive ? 'تعطيل' : 'تفعيل'}
                </button>
                {user.role !== 'OWNER' && (
                  <button
                    onClick={() => openPermissionsEditor(user)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 text-xs font-medium bg-gray-700/30 text-gray-300 rounded-lg border border-gray-600/30 active:bg-gray-700/50 transition-all duration-200"
                  >
                    <KeyIcon />
                    <span>الصلاحيات ({user.permissions.length})</span>
                  </button>
                )}
                <button
                  onClick={() => handleEdit(user)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 text-xs font-medium bg-amber-500/10 text-amber-300 rounded-lg border border-amber-500/20 active:bg-amber-500/20 transition-all duration-200"
                >
                  <EditIcon />
                  <span>تعديل</span>
                </button>
                <button
                  onClick={() => setPendingDelete(user)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 min-h-10 text-xs font-medium bg-rose-500/10 text-rose-300 rounded-lg border border-rose-500/20 active:bg-rose-500/20 transition-all duration-200"
                >
                  <TrashIcon />
                  <span>حذف</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
          <div
            className="relative bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
                    <UsersIcon />
                  </div>
                  <h2 className="text-xl font-bold text-white">
                    {editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setShowModal(false);
                    setEditingUser(null);
                    setFormData({ email: '', password: '', name: '', role: 'RECEPTIONIST', phone: '', staffCode: '', branchIds: [], permissions: [] });
                  }}
                  className="w-10 h-10 shrink-0 rounded-lg bg-gray-700/50 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <CloseIcon />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">الاسم *</label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                      placeholder="محمد أحمد"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">البريد الإلكتروني *</label>
                    <input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                      placeholder="user@power111.com"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      كلمة المرور {editingUser ? '(اتركها فارغة)' : '*'}
                    </label>
                    <input
                      type="password"
                      required={!editingUser}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                      placeholder="••••••••"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">الدور *</label>
                    <select
                      required
                      value={formData.role}
                      onChange={(e) => handleRoleChange(e.target.value)}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                    >
                      <option value="OWNER">مالك</option>
                      <option value="BRANCH_MANAGER">مدير فرع</option>
                      <option value="RECEPTIONIST">موظف استقبال</option>
                      <option value="ACCOUNTANT">محاسب</option>
                      <option value="TRAINER">مدرب</option>
                      <option value="CONTENT_MANAGER">مدير محتوى</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">رقم الهاتف</label>
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                      placeholder="01234567890"
                      dir="ltr"
                    />
                  </div>

                  {formData.role !== 'OWNER' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-400 mb-2">كود كارت الوردية</label>
                      <input
                        type="text"
                        value={formData.staffCode}
                        onChange={(e) => setFormData({ ...formData, staffCode: e.target.value })}
                        className="w-full px-4 py-2.5 bg-gray-900/50 border border-gray-700/50 rounded-xl text-white font-mono placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all duration-200"
                        placeholder={editingUser ? '' : 'يتعيّن تلقائياً'}
                        dir="ltr"
                        maxLength={8}
                      />
                      <p className="mt-1.5 text-xs text-gray-500">
                        {editingUser
                          ? 'اكتب رقم الكارت نفسه اللي على البطاقة، مثلاً S01. سيبه فاضي لو عايز يظل زي ما هو.'
                          : 'سيبه فاضي ياخد أقرب رقم فاضي (S04 مثلاً).'}
                      </p>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-2">الفروع المسموحة</label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 p-4 bg-gray-900/30 border border-gray-700/30 rounded-xl">
                    {branches.map((branch) => (
                      <label key={branch.id} className="flex items-center gap-3 cursor-pointer group p-2 rounded-lg hover:bg-gray-700/20 transition-colors">
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={formData.branchIds.includes(branch.id)}
                            onChange={() => toggleBranch(branch.id)}
                            className="sr-only peer"
                          />
                          <div className="w-5 h-5 rounded-md border-2 border-gray-600 peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all duration-200 flex items-center justify-center">
                            {formData.branchIds.includes(branch.id) && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                        </div>
                        <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                          {branch.code} - {branch.name}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Permissions Section */}
                {formData.role !== 'OWNER' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">
                      الصلاحيات
                      <span className="text-xs text-gray-500 mr-2">(افتراضي حسب الدور - يمكنك التعديل)</span>
                    </label>
                    <div className="space-y-3 p-4 bg-gray-900/30 border border-gray-700/30 rounded-xl max-h-64 overflow-y-auto">
                      {permissionGroups.map(group => {
                        const groupPerms = group.permissions.filter(p => allPermissionsList.includes(p));
                        if (groupPerms.length === 0) return null;
                        return (
                          <div key={group.label}>
                            <p className="text-xs font-semibold text-amber-400/70 mb-2 uppercase tracking-wider">{group.label}</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              {groupPerms.map(perm => (
                                <label key={perm} className="flex items-center gap-2.5 cursor-pointer group p-1.5 rounded-lg hover:bg-gray-700/20 transition-colors">
                                  <div className="relative">
                                    <input
                                      type="checkbox"
                                      checked={formData.permissions.includes(perm)}
                                      onChange={() => togglePermission(perm)}
                                      className="sr-only peer"
                                    />
                                    <div className="w-4 h-4 rounded-md border-2 border-gray-600 peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all duration-200 flex items-center justify-center">
                                      {formData.permissions.includes(perm) && (
                                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </div>
                                  </div>
                                  <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
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

                <div className="flex gap-3 pt-2">
                  <button
                    type="submit"
                    className="flex-1 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl"
                  >
                    {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingUser(null);
                      setFormData({ email: '', password: '', name: '', role: 'RECEPTIONIST', phone: '', staffCode: '', branchIds: [], permissions: [] });
                    }}
                    className="flex-1 px-5 py-2.5 bg-gray-700/50 hover:bg-gray-700 text-white rounded-xl font-medium transition-all duration-200 border border-gray-600/30"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Editor Modal */}
      {showPermissionsModal && permissionsUser && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setShowPermissionsModal(false)}>
          <div
            className="relative bg-gradient-to-br from-gray-800 via-gray-800 to-gray-900 rounded-2xl border border-gray-700/50 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent"></div>
            <div className="p-6">
              {/* Modal Header */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center">
                    <KeyIcon />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white">
                      تعديل صلاحيات: {permissionsUser.name}
                    </h2>
                    <p className="text-sm text-gray-400">
                      الدور: {roleLabels[permissionsUser.role] || permissionsUser.role}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowPermissionsModal(false);
                    setPermissionsUser(null);
                  }}
                  className="w-10 h-10 shrink-0 rounded-lg bg-gray-700/50 flex items-center justify-center text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
                >
                  <CloseIcon />
                </button>
              </div>

              <div className="space-y-3 max-h-96 overflow-y-auto mt-4 p-4 bg-gray-900/30 border border-gray-700/30 rounded-xl">
                {permissionGroups.map(group => {
                  const groupPerms = group.permissions.filter(p => allPermissionsList.includes(p));
                  if (groupPerms.length === 0) return null;
                  return (
                    <div key={group.label}>
                      <p className="text-xs font-semibold text-amber-400/70 mb-2 uppercase tracking-wider">{group.label}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                        {groupPerms.map(perm => (
                          <label key={perm} className="flex items-center gap-2.5 cursor-pointer group p-1.5 rounded-lg hover:bg-gray-700/20 transition-colors">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={customPermissions.includes(perm)}
                                onChange={() => toggleCustomPermission(perm)}
                                className="sr-only peer"
                              />
                              <div className="w-4 h-4 rounded-md border-2 border-gray-600 peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all duration-200 flex items-center justify-center">
                                {customPermissions.includes(perm) && (
                                  <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            <span className="text-xs text-gray-300 group-hover:text-white transition-colors">
                              {permissionLabels[perm] || perm}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-4 mt-4 border-t border-gray-700/30">
                <button
                  onClick={savePermissions}
                  className="flex-1 px-5 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 text-white rounded-xl font-medium transition-all duration-300 shadow-lg shadow-amber-500/20 hover:shadow-xl"
                >
                  حفظ الصلاحيات
                </button>
                <button
                  onClick={() => {
                    setShowPermissionsModal(false);
                    setPermissionsUser(null);
                  }}
                  className="flex-1 px-5 py-2.5 bg-gray-700/50 hover:bg-gray-700 text-white rounded-xl font-medium transition-all duration-200 border border-gray-600/30"
                >
                  إلغاء
                </button>
              </div>
            </div>
          </div>
        </div>
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
