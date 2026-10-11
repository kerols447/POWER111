import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const OWNER_EMAIL = 'owner@power111.com';
const OWNER_PASSWORD = 'power1112026';
const ADMIN_EMAIL = 'admin@power111.com';
const ADMIN_PASSWORD = 'admin123';

async function main() {
  console.log('Seeding database...');

  // Create branches (idempotent - skip if code exists)
  const branchDefs = [
    { code: 'BR01', name: 'POWER 111 — الحي 11', address: 'المنطقة العاشرة من رمضان - الحي 11', phone: '01055002069' },
    { code: 'BR02', name: 'POWER 111 — مجاورة 55', address: 'المنطقة العاشرة من رمضان - مجاورة 55', phone: '01055002069' }
  ];

  for (const b of branchDefs) {
    await prisma.branch.upsert({
      where: { code: b.code },
      update: {},
      create: b
    });
  }
  console.log('Branches ensured');

  const branchList = await prisma.branch.findMany();
  console.log(`Found ${branchList.length} branches`);

  // Create plans for each branch (idempotent)
  for (const branch of branchList) {
    const existingPlans = await prisma.plan.count({ where: { branchId: branch.id } });
    if (existingPlans > 0) continue;

    await prisma.plan.createMany({
      data: [
        { branchId: branch.id, name: 'Monthly', nameAr: 'اشتراك شهري', durationDays: 30, pricePiasters: 50000, isActive: true },
        { branchId: branch.id, name: 'Quarterly', nameAr: 'اشتراك 3 شهور', durationDays: 90, pricePiasters: 130000, isActive: true },
        { branchId: branch.id, name: 'Annual', nameAr: 'اشتراك سنوي', durationDays: 365, pricePiasters: 450000, isActive: true }
      ]
    });
  }
  console.log('Plans ensured for all branches');

  // Check if members already exist
  const existingMemberCount = await prisma.member.count();
  if (existingMemberCount > 0) {
    console.log(`Already have ${existingMemberCount} members, skipping member/subscription/product/sales/expense/attendance/offer seeding`);
  } else {
    const membersData = [
      // Branch 0 - الحي 11 - 20 members
      { name: 'أحمد محمد علي', phone: '01012345678', gender: 'Male', branchIndex: 0, code: 'MEM001', status: 'ACTIVE' as const },
      { name: 'محمد حسن إبراهيم', phone: '01023456789', gender: 'Male', branchIndex: 0, code: 'MEM002', status: 'ACTIVE' as const },
      { name: 'سارة أحمد محمود', phone: '01034567890', gender: 'Female', branchIndex: 0, code: 'MEM003', status: 'ACTIVE' as const },
      { name: 'عمر خالد سعيد', phone: '01045678901', gender: 'Male', branchIndex: 0, code: 'MEM004', status: 'ACTIVE' as const },
      { name: 'فاطمة حسن علي', phone: '01056789012', gender: 'Female', branchIndex: 0, code: 'MEM005', status: 'ACTIVE' as const },
      { name: 'يوسف محمد عبدالرحمن', phone: '01067890123', gender: 'Male', branchIndex: 0, code: 'MEM006', status: 'ACTIVE' as const },
      { name: 'نور الدين أحمد', phone: '01078901234', gender: 'Male', branchIndex: 0, code: 'MEM007', status: 'ACTIVE' as const },
      { name: 'مريم عبدالله', phone: '01089012345', gender: 'Female', branchIndex: 0, code: 'MEM008', status: 'ACTIVE' as const },
      { name: 'خالد عمر حسين', phone: '01090123456', gender: 'Male', branchIndex: 0, code: 'MEM009', status: 'ACTIVE' as const },
      { name: 'هدى محمد صالح', phone: '01101234567', gender: 'Female', branchIndex: 0, code: 'MEM010', status: 'ACTIVE' as const },
      { name: 'عبدالرحمن سعيد', phone: '01112345678', gender: 'Male', branchIndex: 0, code: 'MEM011', status: 'ACTIVE' as const },
      { name: 'ياسمين خالد', phone: '01123456789', gender: 'Female', branchIndex: 0, code: 'MEM012', status: 'ACTIVE' as const },
      { name: 'مصطفى أحمد', phone: '01134567890', gender: 'Male', branchIndex: 0, code: 'MEM013', status: 'ACTIVE' as const },
      { name: 'رانيا محمد', phone: '01145678901', gender: 'Female', branchIndex: 0, code: 'MEM014', status: 'ACTIVE' as const },
      { name: 'حسن علي محمود', phone: '01156789012', gender: 'Male', branchIndex: 0, code: 'MEM015', status: 'ACTIVE' as const },
      { name: 'علي حسين أحمد', phone: '01167890123', gender: 'Male', branchIndex: 0, code: 'MEM016', status: 'ACTIVE' as const },
      { name: 'منى عبدالله', phone: '01178901234', gender: 'Female', branchIndex: 0, code: 'MEM017', status: 'ACTIVE' as const },
      { name: 'طارق حسن', phone: '01189012345', gender: 'Male', branchIndex: 0, code: 'MEM018', status: 'ACTIVE' as const },
      { name: 'دينا محمد', phone: '01190123456', gender: 'Female', branchIndex: 0, code: 'MEM019', status: 'ACTIVE' as const },
      { name: 'كريم سعيد', phone: '01200123456', gender: 'Male', branchIndex: 0, code: 'MEM020', status: 'ACTIVE' as const },

      // Branch 1 - مجاورة 55 - 20 members
      { name: 'إبراهيم محمد', phone: '01211234567', gender: 'Male', branchIndex: 1, code: 'MEM021', status: 'ACTIVE' as const },
      { name: 'سميرة أحمد', phone: '01222345678', gender: 'Female', branchIndex: 1, code: 'MEM022', status: 'ACTIVE' as const },
      { name: 'حسام خالد', phone: '01233456789', gender: 'Male', branchIndex: 1, code: 'MEM023', status: 'ACTIVE' as const },
      { name: 'لينا خالد', phone: '01244567890', gender: 'Female', branchIndex: 1, code: 'MEM024', status: 'ACTIVE' as const },
      { name: 'وليد محمد', phone: '01255678901', gender: 'Male', branchIndex: 1, code: 'MEM025', status: 'ACTIVE' as const },
      { name: 'دعاء سعيد', phone: '01266789012', gender: 'Female', branchIndex: 1, code: 'MEM026', status: 'ACTIVE' as const },
      { name: 'ماجد عبدالله', phone: '01277890123', gender: 'Male', branchIndex: 1, code: 'MEM027', status: 'ACTIVE' as const },
      { name: 'سلمى أحمد', phone: '01288901234', gender: 'Female', branchIndex: 1, code: 'MEM028', status: 'ACTIVE' as const },
      { name: 'شريف محمد', phone: '01299012345', gender: 'Male', branchIndex: 1, code: 'MEM029', status: 'ACTIVE' as const },
      { name: 'نجلاء أحمد', phone: '01300123456', gender: 'Female', branchIndex: 1, code: 'MEM030', status: 'ACTIVE' as const },
      { name: 'غادة سعيد', phone: '01311234567', gender: 'Female', branchIndex: 1, code: 'MEM031', status: 'ACTIVE' as const },
      { name: 'رامي محمد', phone: '01322345678', gender: 'Male', branchIndex: 1, code: 'MEM032', status: 'ACTIVE' as const },
      { name: 'منال حسن', phone: '01333456789', gender: 'Female', branchIndex: 1, code: 'MEM033', status: 'ACTIVE' as const },
      { name: 'فادي عبدالله', phone: '01344567890', gender: 'Male', branchIndex: 1, code: 'MEM034', status: 'ACTIVE' as const },
      { name: 'إيمان أحمد', phone: '01355678901', gender: 'Female', branchIndex: 1, code: 'MEM035', status: 'ACTIVE' as const },
      { name: 'أسامة محمد', phone: '01366789012', gender: 'Male', branchIndex: 1, code: 'MEM036', status: 'ACTIVE' as const },
      { name: 'حمزة أحمد', phone: '01377890123', gender: 'Male', branchIndex: 1, code: 'MEM037', status: 'ACTIVE' as const },
      { name: 'سارة حسن', phone: '01388901234', gender: 'Female', branchIndex: 1, code: 'MEM038', status: 'ACTIVE' as const },
      { name: 'عادل محمد', phone: '01399012345', gender: 'Male', branchIndex: 1, code: 'MEM039', status: 'ACTIVE' as const },
      { name: 'لمياء سعيد', phone: '01400123456', gender: 'Female', branchIndex: 1, code: 'MEM040', status: 'ACTIVE' as const }
    ];

    const createdMembers: any[] = [];
    for (const m of membersData) {
      const existingPerson = await prisma.person.findFirst({ where: { phoneNormalized: '2' + m.phone.slice(1) } });
      let personId: string;
      if (existingPerson) {
        personId = existingPerson.id;
      } else {
        const person = await prisma.person.create({
          data: {
            name: m.name,
            phone: m.phone,
            phoneNormalized: '2' + m.phone.slice(1),
            gender: m.gender as any
          }
        });
        personId = person.id;
      }

      const existingMember = await prisma.member.findUnique({ where: { memberCode: m.code } });
      if (existingMember) {
        createdMembers.push({ ...m, memberId: existingMember.id, personId });
        continue;
      }

      const member = await prisma.member.create({
        data: {
          personId,
          branchId: branchList[m.branchIndex].id,
          memberCode: m.code,
          status: m.status
        }
      });
      createdMembers.push({ ...m, memberId: member.id, personId });
    }
    console.log(`Created ${createdMembers.length} members`);

    // Create subscriptions
    const now = new Date();
    let subCount = 0;
    for (const m of createdMembers) {
      const existingSub = await prisma.subscription.findFirst({ where: { memberId: m.memberId } });
      if (existingSub) continue;

      const planIndex = Math.floor(Math.random() * 3);
      const plan = await prisma.plan.findFirst({ where: { branchId: branchList[m.branchIndex].id } });
      if (!plan) continue;

      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - Math.floor(Math.random() * 60));

      const durationDays = [30, 90, 365][planIndex];
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays);

      const pricePiasters = [50000, 130000, 450000][planIndex];
      const paidPiasters = Math.random() > 0.7 ? Math.floor(pricePiasters * 0.8) : pricePiasters;

      await prisma.subscription.create({
        data: {
          memberId: m.memberId,
          planId: plan.id,
          startDate,
          endDate,
          pricePiasters,
          paidPiasters,
          status: (endDate > now ? 'ACTIVE' : 'EXPIRED') as any,
          branchId: branchList[m.branchIndex].id
        }
      });
      subCount++;
    }
    console.log(`Created ${subCount} subscriptions`);

    // Create products for each branch
    const existingProductCount = await prisma.product.count();
    if (existingProductCount === 0) {
      const productsData = [
        { name: 'بروتين واي', nameAr: 'بروتين واي جولد', pricePiasters: 150000, quantity: 50, branchIndex: 0 },
        { name: 'كرياتين', nameAr: 'كرياتين مونوهيدرات', pricePiasters: 80000, quantity: 30, branchIndex: 0 },
        { name: 'BCAA', nameAr: 'بي سي أي أيه', pricePiasters: 120000, quantity: 25, branchIndex: 0 },
        { name: 'Pre-Workout', nameAr: 'بري ورك أوت', pricePiasters: 95000, quantity: 20, branchIndex: 0 },
        { name: 'Mass Gainer', nameAr: 'ماس جينر', pricePiasters: 180000, quantity: 15, branchIndex: 0 },
        { name: 'فيتامينات', nameAr: 'فيتامينات متعددة', pricePiasters: 60000, quantity: 40, branchIndex: 0 },
        { name: 'بروتين واي', nameAr: 'بروتين واي جولد', pricePiasters: 150000, quantity: 35, branchIndex: 1 },
        { name: 'كرياتين', nameAr: 'كرياتين مونوهيدرات', pricePiasters: 80000, quantity: 20, branchIndex: 1 },
        { name: 'BCAA', nameAr: 'بي سي أي أيه', pricePiasters: 120000, quantity: 18, branchIndex: 1 },
        { name: 'Pre-Workout', nameAr: 'بري ورك أوت', pricePiasters: 95000, quantity: 15, branchIndex: 1 },
        { name: 'Mass Gainer', nameAr: 'ماس جينر', pricePiasters: 180000, quantity: 12, branchIndex: 1 },
        { name: 'فيتامينات', nameAr: 'فيتامينات متعددة', pricePiasters: 60000, quantity: 25, branchIndex: 1 }
      ];

      for (const p of productsData) {
        await prisma.product.create({
          data: {
            name: p.name,
            nameAr: p.nameAr,
            pricePiasters: p.pricePiasters,
            quantity: p.quantity,
            branchId: branchList[p.branchIndex].id
          }
        });
      }
      console.log(`Created ${productsData.length} products`);
    }

    // Create sales - spread across last 7 days with realistic amounts
    const existingSaleCount = await prisma.sale.count();
    if (existingSaleCount === 0) {
      const salesData: any[] = [];
      // Create ~15 sales per day for 7 days = ~105 sales total
      for (let day = 0; day < 7; day++) {
        const salesPerDay = 12 + Math.floor(Math.random() * 6); // 12-17 sales per day
        for (let i = 0; i < salesPerDay; i++) {
          const branchIndex = Math.floor(Math.random() * branchList.length);
          const products = await prisma.product.findMany({ where: { branchId: branchList[branchIndex].id } });
          if (products.length === 0) continue;

          const product = products[Math.floor(Math.random() * products.length)];
          const quantity = Math.floor(Math.random() * 3) + 1;
          const totalPiasters = product.pricePiasters * quantity;

          const saleDate = new Date(now);
          saleDate.setDate(saleDate.getDate() - day);
          saleDate.setHours(Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60));

          salesData.push({
            branchId: branchList[branchIndex].id,
            productId: product.id,
            quantity,
            totalPiasters,
            saleDate,
          });
        }
      }

      for (let i = 0; i < salesData.length; i++) {
        const sale = salesData[i];
        const invoiceNumber = `INV-${String(i + 1).padStart(5, '0')}`;
        await prisma.sale.create({
          data: {
            branchId: sale.branchId,
            invoiceNumber,
            totalPiasters: sale.totalPiasters,
            finalTotalPiasters: sale.totalPiasters,
            paymentMethod: 'CASH' as any,
            createdAt: sale.saleDate,
            items: {
              create: {
                productId: sale.productId,
                quantity: sale.quantity,
                unitPricePiasters: sale.totalPiasters / sale.quantity,
                totalPiasters: sale.totalPiasters
              }
            }
          }
        });
      }
      console.log(`Created ${salesData.length} sales across 7 days`);
    }

    // Create expenses - spread across last 7 days with realistic amounts
    const existingExpenseCount = await prisma.expense.count();
    if (existingExpenseCount === 0) {
      const expenseCategories = ['إيجار', 'كهرباء', 'مياه', 'رواتب', 'صيانة', 'معدات', 'تنظيف', 'أخرى'];
      // Create ~4-6 expenses per day for 7 days = ~35 expenses total
      for (let day = 0; day < 7; day++) {
        const expensesPerDay = 4 + Math.floor(Math.random() * 3); // 4-6 expenses per day
        for (let i = 0; i < expensesPerDay; i++) {
          const branchIndex = Math.floor(Math.random() * branchList.length);
          const category = expenseCategories[Math.floor(Math.random() * expenseCategories.length)];
          // Realistic amounts: 500-3000 EGP for daily expenses
          const amountPiasters = Math.floor(Math.random() * 250000) + 50000;
          const expenseDate = new Date(now);
          expenseDate.setDate(expenseDate.getDate() - day);
          expenseDate.setHours(Math.floor(Math.random() * 8) + 9, Math.floor(Math.random() * 60));

          await prisma.expense.create({
            data: {
              branchId: branchList[branchIndex].id,
              category,
              description: `${category} - ${branchList[branchIndex].name}`,
              amountPiasters,
              date: expenseDate
            }
          });
        }
      }
      console.log('Created ~35 expenses across 7 days');
    }

    // Create attendance records
    const existingAttendanceCount = await prisma.attendance.count();
    if (existingAttendanceCount === 0) {
      for (let i = 0; i < 100; i++) {
        const member = createdMembers[Math.floor(Math.random() * createdMembers.length)];
        const checkInDate = new Date(now);
        checkInDate.setDate(checkInDate.getDate() - Math.floor(Math.random() * 30));
        checkInDate.setHours(Math.floor(Math.random() * 12) + 6, Math.floor(Math.random() * 60));

        const checkOutDate = new Date(checkInDate);
        checkOutDate.setHours(checkOutDate.getHours() + Math.floor(Math.random() * 3) + 1);

        await prisma.attendance.create({
          data: {
            memberId: member.memberId,
            branchId: branchList[member.branchIndex].id,
            checkInTime: checkInDate,
            checkOutTime: checkOutDate,
            method: 'QR_CODE' as any
          }
        });
      }
      console.log('Created 100 attendance records');
    }

    // Create offers
    const existingOfferCount = await prisma.offer.count();
    if (existingOfferCount === 0) {
      const offersData = [
        { title: 'عرض الصيف', titleAr: 'عرض الصيف - خصم 30%', descriptionAr: 'خصم 30% على جميع الاشتراكات', discountPercent: 30, startDate: new Date(now.getFullYear(), now.getMonth(), 1), endDate: new Date(now.getFullYear(), now.getMonth() + 1, 0), isPublished: true, branchId: null },
        { title: 'فرع الحي 11', titleAr: 'عرض افتتاح فرع الحي 11', descriptionAr: 'خصم 20% للاحتفال بافتتاح فرع الحي 11', discountPercent: 20, startDate: new Date(now.getFullYear(), now.getMonth(), 5), endDate: new Date(now.getFullYear(), now.getMonth() + 1, 5), isPublished: true, branchId: branchList[0]?.id || null },
        { title: 'طلاب', titleAr: 'خصم الطلاب', descriptionAr: 'خصم 15% للطلاب بجميع الفروع', discountPercent: 15, startDate: new Date(now.getFullYear(), now.getMonth() - 1, 15), endDate: new Date(now.getFullYear(), now.getMonth() + 2, 15), isPublished: true, branchId: null },
        { title: 'Black Friday', titleAr: 'معاينة البلاك فرايدي', descriptionAr: 'خصم 40% - عرض محدود', discountPercent: 40, startDate: new Date(now.getFullYear(), 10, 20), endDate: new Date(now.getFullYear(), 10, 30), isPublished: false, branchId: null }
      ];

      for (const offer of offersData) {
        await prisma.offer.create({
          data: {
            title: offer.title,
            titleAr: offer.titleAr,
            descriptionAr: offer.descriptionAr,
            discountPercent: offer.discountPercent,
            startDate: offer.startDate,
            endDate: offer.endDate,
            isPublished: offer.isPublished,
            branchId: offer.branchId
          }
        });
      }
      console.log(`Created ${offersData.length} offers`);
    }
  }

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
