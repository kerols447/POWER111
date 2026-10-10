import { useState, useEffect } from 'react';

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
    branchIds: [] as string[],
    permissions: [] as string[]
  });
  const [customPermissions, setCustomPermissions] = useState<string[]>([]);

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
        // Save custom permissions if not OWNER (OWNER always has all)
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
        setFormData({ email: '', password: '', name: '', role: 'RECEPTIONIST', phone: '', branchIds: [], permissions: [] });
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error saving user:', error);
      alert('حدث خطأ في حفظ البيانات');
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
      branchIds: user.branchAccess.map(ba => ba.branch.id),
      permissions: rolePermissions[user.role] || []
    });
    setShowModal(true);
  };

  const handleDelete = async (user: User) => {
    if (!confirm(`هل أنت متأكد من حذف المستخدم "${user.name}"؟`)) {
      return;
    }

    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (res.ok) {
        fetchUsers();
      } else {
        const data = await res.json();
        alert(data.error || 'حدث خطأ');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('حدث خطأ في حذف المستخدم');
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
        fetchUsers();
      } else {
        alert('حدث خطأ في حفظ الصلاحيات');
      }
    } catch (error) {
      console.error('Error saving permissions:', error);
      alert('حدث خطأ في حفظ الصلاحيات');
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'OWNER': return 'bg-purple-500/10 text-purple-400 border-purple-500/50';
      case 'BRANCH_MANAGER': return 'bg-blue-500/10 text-blue-400 border-blue-500/50';
      case 'RECEPTIONIST': return 'bg-green-500/10 text-green-400 border-green-500/50';
      case 'ACCOUNTANT': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/50';
      case 'TRAINER': return 'bg-orange-500/10 text-orange-400 border-orange-500/50';
      case 'CONTENT_MANAGER': return 'bg-pink-500/10 text-pink-400 border-pink-500/50';
      default: return 'bg-gray-500/10 text-gray-400 border-gray-500/50';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">جاري التحميل...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">إدارة المستخدمين</h1>
        <button
          onClick={() => {
            setEditingUser(null);
            setFormData({ email: '', password: '', name: '', role: 'RECEPTIONIST', phone: '', branchIds: [], permissions: rolePermissions['RECEPTIONIST'] || [] });
            setShowModal(true);
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          + إضافة مستخدم جديد
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">إجمالي المستخدمين</div>
          <div className="text-2xl font-bold text-white">{users.length}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">المستخدمين النشطين</div>
          <div className="text-2xl font-bold text-green-400">{users.filter(u => u.isActive).length}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">المالكين</div>
          <div className="text-2xl font-bold text-purple-400">{users.filter(u => u.role === 'OWNER').length}</div>
        </div>
        <div className="bg-dark-card border border-dark-border rounded-lg p-4">
          <div className="text-gray-400 text-sm mb-1">مديري الفروع</div>
          <div className="text-2xl font-bold text-blue-400">{users.filter(u => u.role === 'BRANCH_MANAGER').length}</div>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-dark-card border border-dark-border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-dark border-b border-dark-border">
            <tr>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الاسم</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">البريد الإلكتروني</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الدور</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الهاتف</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الفروع</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الصلاحيات</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">الحالة</th>
              <th className="text-right px-4 py-3 text-gray-400 font-medium">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-dark-border hover:bg-dark/50">
                <td className="px-4 py-3 text-white font-medium">{user.name}</td>
                <td className="px-4 py-3 text-gray-300 font-mono text-sm">{user.email}</td>
                <td className="px-4 py-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getRoleBadgeColor(user.role)}`}>
                    {roleLabels[user.role] || user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-300 font-mono">{user.phone || '-'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {user.branchAccess.map(ba => (
                      <span key={ba.branch.id} className="text-xs bg-blue-500/10 text-blue-400 px-2 py-1 rounded">
                        {ba.branch.code}
                      </span>
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {user.role === 'OWNER' ? (
                    <span className="text-xs text-purple-400">كل الصلاحيات</span>
                  ) : (
                    <button
                      onClick={() => openPermissionsEditor(user)}
                      className="text-xs bg-dark hover:bg-dark-hover text-gray-300 px-2 py-1 rounded border border-dark-border transition-colors"
                    >
                      تعديل الصلاحيات ({user.permissions.length})
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => handleToggleActive(user)}
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      user.isActive
                        ? 'bg-green-500/10 text-green-400 border border-green-500/50'
                        : 'bg-red-500/10 text-red-400 border border-red-500/50'
                    }`}
                  >
                    {user.isActive ? 'نشط' : 'معطل'}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(user)}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded transition-colors"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => handleDelete(user)}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
                    >
                      حذف
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4">
              {editingUser ? 'تعديل مستخدم' : 'إضافة مستخدم جديد'}
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">الاسم *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="محمد أحمد"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">البريد الإلكتروني *</label>
                <input
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  placeholder="user@power111.com"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  كلمة المرور {editingUser ? '(اتركها فارغة للإبقاء على الحالية)' : '*'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                  placeholder="••••••••"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">الدور *</label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => handleRoleChange(e.target.value)}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="OWNER">مالك</option>
                  <option value="BRANCH_MANAGER">مدير فرع</option>
                  <option value="RECEPTIONIST">موظف استقبال</option>
                  <option value="ACCOUNTANT">محاسب</option>
                  <option value="TRAINER">مدرب</option>
                  <option value="CONTENT_MANAGER">مدير محتوى</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">رقم الهاتف</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 bg-dark border border-dark-border rounded-lg text-white font-mono focus:outline-none focus:border-blue-500"
                  placeholder="01234567890"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">الفروع المسموحة</label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-dark border border-dark-border rounded-lg">
                  {branches.map((branch) => (
                    <label key={branch.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.branchIds.includes(branch.id)}
                        onChange={() => toggleBranch(branch.id)}
                        className="w-4 h-4 text-blue-600 bg-dark border-dark-border rounded focus:ring-blue-500"
                      />
                      <span className="text-sm text-white">
                        {branch.code} - {branch.name}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Permissions Section */}
              {formData.role !== 'OWNER' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    الصلاحيات
                    <span className="text-xs text-gray-500 mr-2">(افتراضي حسب الدور - يمكنك التعديل)</span>
                  </label>
                  <div className="space-y-3 p-3 bg-dark border border-dark-border rounded-lg max-h-64 overflow-y-auto">
                    {permissionGroups.map(group => {
                      const groupPerms = group.permissions.filter(p => allPermissionsList.includes(p));
                      if (groupPerms.length === 0) return null;
                      return (
                        <div key={group.label}>
                          <p className="text-xs font-medium text-gray-400 mb-1">{group.label}</p>
                          <div className="grid grid-cols-2 gap-1">
                            {groupPerms.map(perm => (
                              <label key={perm} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={formData.permissions.includes(perm)}
                                  onChange={() => togglePermission(perm)}
                                  className="w-3.5 h-3.5 text-blue-600 bg-dark border-dark-border rounded focus:ring-blue-500"
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

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                >
                  {editingUser ? 'حفظ التعديلات' : 'إضافة المستخدم'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowModal(false);
                    setEditingUser(null);
                    setFormData({ email: '', password: '', name: '', role: 'RECEPTIONIST', phone: '', branchIds: [], permissions: [] });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Permissions Editor Modal */}
      {showPermissionsModal && permissionsUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-dark-card border border-dark-border rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-1">
              تعديل صلاحيات: {permissionsUser.name}
            </h2>
            <p className="text-sm text-gray-400 mb-4">
              الدور: {roleLabels[permissionsUser.role] || permissionsUser.role}
            </p>

            <div className="space-y-3 max-h-96 overflow-y-auto">
              {permissionGroups.map(group => {
                const groupPerms = group.permissions.filter(p => allPermissionsList.includes(p));
                if (groupPerms.length === 0) return null;
                return (
                  <div key={group.label}>
                    <p className="text-xs font-medium text-gray-400 mb-1">{group.label}</p>
                    <div className="grid grid-cols-2 gap-1">
                      {groupPerms.map(perm => (
                        <label key={perm} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={customPermissions.includes(perm)}
                            onChange={() => toggleCustomPermission(perm)}
                            className="w-3.5 h-3.5 text-blue-600 bg-dark border-dark-border rounded focus:ring-blue-500"
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

            <div className="flex gap-3 pt-4 mt-4 border-t border-dark-border">
              <button
                onClick={savePermissions}
                className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                حفظ الصلاحيات
              </button>
              <button
                onClick={() => {
                  setShowPermissionsModal(false);
                  setPermissionsUser(null);
                }}
                className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default UsersPage;
