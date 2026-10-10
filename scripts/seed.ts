import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

  // Create a test member
  const person = await prisma.person.create({
    data: {
      name: 'أحمد محمد',
      phone: '01555123456',
      phoneNormalized: '201555123456',
      email: 'ahmed.test@example.com',
      gender: 'Male'
    }
  });

  const member = await prisma.member.create({
    data: {
      personId: person.id,
      branchId: branchList[0].id,
      memberCode: 'AB12CD34',
      status: 'ACTIVE'
    }
  });
  console.log(`Created member: ${member.memberCode}`);

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
