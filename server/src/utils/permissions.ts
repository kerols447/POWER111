import { prisma } from '../index.js';

// Default permissions for each role
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  OWNER: [
    // All permissions for owner
    'VIEW_MEMBERS', 'CREATE_MEMBERS', 'EDIT_MEMBERS', 'DELETE_MEMBERS',
    'EXPORT_MEMBERS', 'VIEW_MEMBER_STATS',
    'VIEW_SUBSCRIPTIONS', 'CREATE_SUBSCRIPTIONS', 'EDIT_SUBSCRIPTIONS', 'RENEW_SUBSCRIPTIONS', 'FREEZE_SUBSCRIPTIONS',
    'VIEW_ATTENDANCE', 'CHECKIN_MEMBERS',
    'VIEW_PRODUCTS', 'CREATE_PRODUCTS', 'EDIT_PRODUCTS', 'DELETE_PRODUCTS',
    'VIEW_SALES', 'CREATE_SALES', 'MANAGE_DISCOUNTS',
    'VIEW_EXPENSES', 'CREATE_EXPENSES', 'EDIT_EXPENSES', 'DELETE_EXPENSES', 'MANAGE_SALARIES',
    'VIEW_REPORTS', 'VIEW_FINANCIAL_REPORTS',
    'VIEW_BRANCHES', 'EDIT_BRANCHES',
    'VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'DELETE_USERS',
    'MANAGE_SETTINGS',
    'VIEW_DASHBOARD', 'VIEW_ALL_BRANCHES_DASHBOARD',
    'VIEW_DASHBOARD_REVENUE', 'VIEW_DASHBOARD_EXPENSES', 'VIEW_DASHBOARD_PROFIT', 'VIEW_DASHBOARD_OUTSTANDING',
    'USE_ASSISTANT',
    'VIEW_PHYSIO', 'MANAGE_PHYSIO'
  ],
  BRANCH_MANAGER: [
    'VIEW_MEMBERS', 'CREATE_MEMBERS', 'EDIT_MEMBERS', 'DELETE_MEMBERS',
    'EXPORT_MEMBERS', 'VIEW_MEMBER_STATS',
    'VIEW_SUBSCRIPTIONS', 'CREATE_SUBSCRIPTIONS', 'EDIT_SUBSCRIPTIONS', 'RENEW_SUBSCRIPTIONS', 'FREEZE_SUBSCRIPTIONS',
    'VIEW_ATTENDANCE', 'CHECKIN_MEMBERS',
    'VIEW_PRODUCTS', 'CREATE_PRODUCTS', 'EDIT_PRODUCTS',
    'VIEW_SALES', 'CREATE_SALES',
    'VIEW_EXPENSES', 'CREATE_EXPENSES', 'MANAGE_SALARIES',
    'VIEW_REPORTS', 'VIEW_FINANCIAL_REPORTS',
    'VIEW_BRANCHES',
    'VIEW_DASHBOARD',
    'VIEW_DASHBOARD_REVENUE', 'VIEW_DASHBOARD_EXPENSES', 'VIEW_DASHBOARD_PROFIT', 'VIEW_DASHBOARD_OUTSTANDING',
    'USE_ASSISTANT',
    'VIEW_PHYSIO', 'MANAGE_PHYSIO'
  ],
  // The reception desk's whole job: staff, expenses, new member, renewals, attendance, and
  // selling from the buffet. What it does NOT hold: the members sheet, the member census,
  // the till (revenue, expenses total, net profit, outstanding), the financial reports and
  // the assistant that reads them. His screen is the floor — who came in, who is inside,
  // whose subscription is about to end — and the four doors that do the work.
  RECEPTIONIST: [
    'VIEW_MEMBERS', 'CREATE_MEMBERS', 'EDIT_MEMBERS',
    'VIEW_SUBSCRIPTIONS', 'CREATE_SUBSCRIPTIONS', 'RENEW_SUBSCRIPTIONS',
    'VIEW_ATTENDANCE', 'CHECKIN_MEMBERS',
    'VIEW_EXPENSES', 'CREATE_EXPENSES',
    'VIEW_PRODUCTS', 'CREATE_PRODUCTS',
    'VIEW_SALES', 'CREATE_SALES',
    'VIEW_DASHBOARD',
    'VIEW_PHYSIO'
  ],
  ACCOUNTANT: [
    'VIEW_MEMBERS', 'EXPORT_MEMBERS', 'VIEW_MEMBER_STATS',
    'VIEW_SUBSCRIPTIONS',
    'VIEW_ATTENDANCE',
    'VIEW_PRODUCTS',
    'VIEW_SALES', 'CREATE_SALES',
    'VIEW_EXPENSES', 'CREATE_EXPENSES', 'EDIT_EXPENSES', 'MANAGE_SALARIES',
    'VIEW_REPORTS', 'VIEW_FINANCIAL_REPORTS',
    'VIEW_DASHBOARD',
    'VIEW_DASHBOARD_REVENUE', 'VIEW_DASHBOARD_EXPENSES', 'VIEW_DASHBOARD_PROFIT', 'VIEW_DASHBOARD_OUTSTANDING',
    'USE_ASSISTANT'
  ],
  TRAINER: [
    'VIEW_MEMBERS', 'EXPORT_MEMBERS', 'VIEW_MEMBER_STATS',
    'VIEW_ATTENDANCE', 'CHECKIN_MEMBERS',
    'VIEW_SUBSCRIPTIONS',
    'VIEW_DASHBOARD',
    'USE_ASSISTANT',
    'VIEW_PHYSIO'
  ],
  CONTENT_MANAGER: [
    'VIEW_PRODUCTS', 'CREATE_PRODUCTS', 'EDIT_PRODUCTS', 'DELETE_PRODUCTS',
    'VIEW_SALES',
    'VIEW_DASHBOARD',
    'USE_ASSISTANT'
  ]
};

// Check if user has a specific permission
export async function userHasPermission(userId: string, permission: string): Promise<boolean> {
  // Get user with permissions
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      permissions: true
    }
  });

  if (!user) return false;

  // Owner has all permissions
  if (user.role === 'OWNER') return true;

  // Check if user has the specific permission
  return user.permissions.some(p => p.permission === permission);
}

// Get user's accessible branch IDs
export async function getUserBranchIds(userId: string): Promise<string[]> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      branchAccess: {
        select: { branchId: true }
      }
    }
  });

  if (!user) return [];

  // Owner has access to all branches
  if (user.role === 'OWNER') {
    const allBranches = await prisma.branch.findMany({ select: { id: true } });
    return allBranches.map(b => b.id);
  }

  return user.branchAccess.map(ba => ba.branchId);
}

// Initialize default permissions for a user based on their role
export async function initializeUserPermissions(userId: string, role: string): Promise<void> {
  const permissions = ROLE_PERMISSIONS[role] || [];

  // Delete existing permissions
  await prisma.userPermission.deleteMany({
    where: { userId }
  });

  // Create new permissions
  if (permissions.length > 0) {
    await prisma.userPermission.createMany({
      data: permissions.map(permission => ({
        userId,
        permission: permission as any
      }))
    });
  }
}
