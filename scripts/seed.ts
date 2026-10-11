import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const OWNER_EMAIL = 'owner@power111.com';
const OWNER_PASSWORD = 'power1112026';
const ADMIN_EMAIL = 'admin@power111.com';
const ADMIN_PASSWORD = 'admin123';

async function main() {
  console.log('Seeding database...');

  // Create branches
  const branches = await prisma.branch.createMany({
    data: [
      { code: 'BR01', name: 'POWER 111 — الفرع الرئيسي', address: 'القاهرة', phone: '01000000001' },
      { code: 'BR02', name: 'POWER 111 — فرع 6 أكتوبر', address: '6 أكتوبر', phone: '01000000002' },
      { code: 'BR03', name: 'POWER 111 — فرع المعادي', address: 'المعادي', phone: '01000000003' },
      { code: 'BR04', name: 'POWER 111 — فرع مدينة نصر', address: 'مدينة نصر', phone: '01000000004' }
    ],
    skipDuplicates: true
  });
  console.log(`Created ${branches.count} branches`);

  // Create plans for each branch
  const branchList = await prisma.branch.findMany();
  for (const branch of branchList) {
    await prisma.plan.createMany({
      data: [
        { branchId: branch.id, name: 'Monthly', nameAr: 'اشتراك شهري', durationDays: 30, pricePiasters: 50000, isActive: true },
        { branchId: branch.id, name: 'Quarterly', nameAr: 'اشتراك 3 شهور', durationDays: 90, pricePiasters: 130000, isActive: true },
        { branchId: branch.id, name: 'Annual', nameAr: 'اشتراك سنوي', durationDays: 365, pricePiasters: 450000, isActive: true }
      ],
      skipDuplicates: true
    });
  }
  console.log('Created plans for all branches');

  // Create a test member (idempotent)
  const person = await prisma.person.upsert({
    where: { phoneNormalized: '201555123456' },
    update: {},
    create: {
      name: 'أحمد محمد',
      phone: '01555123456',
      phoneNormalized: '201555123456',
      email: 'ahmed.test@example.com',
      gender: 'Male'
    }
  });

  const member = await prisma.member.upsert({
    where: { memberCode: 'AB12CD34' },
    update: {},
    create: {
      personId: person.id,
      branchId: branchList[0].id,
      memberCode: 'AB12CD34',
      status: 'ACTIVE'
    }
  });
  console.log(`Member ready: ${member.memberCode}`);

  // Create owner account if missing (idempotent)
  const existingOwner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL } });
  if (!existingOwner) {
    const passwordHash = await bcrypt.hash(OWNER_PASSWORD, 10);
    const owner = await prisma.user.create({
      data: {
        email: OWNER_EMAIL,
        passwordHash,
        name: 'المالك',
        role: 'OWNER'
      }
    });
    const ownerPermissions = [
      'VIEW_MEMBERS', 'CREATE_MEMBERS', 'EDIT_MEMBERS', 'DELETE_MEMBERS',
      'VIEW_SUBSCRIPTIONS', 'CREATE_SUBSCRIPTIONS', 'EDIT_SUBSCRIPTIONS', 'RENEW_SUBSCRIPTIONS', 'FREEZE_SUBSCRIPTIONS',
      'VIEW_ATTENDANCE', 'CHECKIN_MEMBERS',
      'VIEW_PRODUCTS', 'CREATE_PRODUCTS', 'EDIT_PRODUCTS', 'DELETE_PRODUCTS',
      'VIEW_SALES', 'CREATE_SALES', 'MANAGE_DISCOUNTS',
      'VIEW_EXPENSES', 'CREATE_EXPENSES', 'EDIT_EXPENSES', 'DELETE_EXPENSES',
      'VIEW_REPORTS', 'VIEW_FINANCIAL_REPORTS',
      'VIEW_BRANCHES', 'EDIT_BRANCHES',
      'VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'DELETE_USERS',
      'MANAGE_SETTINGS',
      'VIEW_DASHBOARD', 'VIEW_ALL_BRANCHES_DASHBOARD',
      'VIEW_DASHBOARD_REVENUE', 'VIEW_DASHBOARD_EXPENSES', 'VIEW_DASHBOARD_PROFIT', 'VIEW_DASHBOARD_OUTSTANDING'
    ];
    await prisma.userPermission.createMany({
      data: ownerPermissions.map(permission => ({ userId: owner.id, permission: permission as any }))
    });
    console.log(`Created owner: ${owner.email}`);
  } else {
    console.log('Owner already exists, skipping');
  }

  // Create admin account if missing (idempotent)
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const admin = await prisma.user.create({
      data: {
        email: ADMIN_EMAIL,
        passwordHash,
        name: 'المدير',
        role: 'OWNER'
      }
    });
    const adminPermissions = [
      'VIEW_MEMBERS', 'CREATE_MEMBERS', 'EDIT_MEMBERS', 'DELETE_MEMBERS',
      'VIEW_SUBSCRIPTIONS', 'CREATE_SUBSCRIPTIONS', 'EDIT_SUBSCRIPTIONS', 'RENEW_SUBSCRIPTIONS', 'FREEZE_SUBSCRIPTIONS',
      'VIEW_ATTENDANCE', 'CHECKIN_MEMBERS',
      'VIEW_PRODUCTS', 'CREATE_PRODUCTS', 'EDIT_PRODUCTS', 'DELETE_PRODUCTS',
      'VIEW_SALES', 'CREATE_SALES', 'MANAGE_DISCOUNTS',
      'VIEW_EXPENSES', 'CREATE_EXPENSES', 'EDIT_EXPENSES', 'DELETE_EXPENSES',
      'VIEW_REPORTS', 'VIEW_FINANCIAL_REPORTS',
      'VIEW_BRANCHES', 'EDIT_BRANCHES',
      'VIEW_USERS', 'CREATE_USERS', 'EDIT_USERS', 'DELETE_USERS',
      'MANAGE_SETTINGS',
      'VIEW_DASHBOARD', 'VIEW_ALL_BRANCHES_DASHBOARD',
      'VIEW_DASHBOARD_REVENUE', 'VIEW_DASHBOARD_EXPENSES', 'VIEW_DASHBOARD_PROFIT', 'VIEW_DASHBOARD_OUTSTANDING'
    ];
    await prisma.userPermission.createMany({
      data: adminPermissions.map(permission => ({ userId: admin.id, permission: permission as any }))
    });
    console.log(`Created admin: ${admin.email}`);
  } else {
    console.log('Admin already exists, skipping');
  }

  console.log('Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
