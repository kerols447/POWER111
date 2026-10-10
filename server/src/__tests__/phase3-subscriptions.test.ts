import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

process.env.NODE_ENV = 'test';

import app, { prisma } from '../index.js';

describe('Phase 3 — Plans, Subscriptions, Payments Tests', () => {
  let ownerAgent: request.SuperAgentTest;
  let branchAId: string;
  let branchBId: string;
  let planId: string;
  let memberId: string;
  let subscriptionId: string;

  beforeAll(async () => {
    const branches = await prisma.branch.findMany({ take: 2, orderBy: { code: 'asc' } });
    branchAId = branches[0].id;
    branchBId = branches[1].id;

    ownerAgent = request.agent(app);
    await ownerAgent
      .post('/api/auth/login')
      .send({ email: 'admin@power111.com', password: 'admin123' });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.payment.deleteMany({
      where: { subscription: { member: { person: { phone: { startsWith: '0100001' } } } } }
    });
    await prisma.subscription.deleteMany({
      where: { member: { person: { phone: { startsWith: '0100001' } } } }
    });
    await prisma.member.deleteMany({
      where: { person: { phone: { startsWith: '0100001' } } }
    });
    await prisma.person.deleteMany({
      where: { phone: { startsWith: '0100001' } }
    });
    await prisma.plan.deleteMany({
      where: { name: { startsWith: 'Test Plan' } }
    });
    await prisma.$disconnect();
  });

  describe('Plans CRUD', () => {
    it('should create a plan', async () => {
      const res = await ownerAgent
        .post('/api/plans')
        .send({
          branchId: branchAId,
          name: 'Test Plan Monthly',
          nameAr: 'خطة اختبار شهرية',
          durationDays: 30,
          pricePiasters: 50000,
          description: 'Test monthly plan',
          descriptionAr: 'خطة اختبار شهرية'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe('Test Plan Monthly');
      expect(res.body.data.nameAr).toBe('خطة اختبار شهرية');
      expect(res.body.data.durationDays).toBe(30);
      expect(res.body.data.pricePiasters).toBe(50000);
      expect(res.body.data.isActive).toBe(true);
      planId = res.body.data.id;
    });

    it('should list plans for a branch', async () => {
      const res = await ownerAgent.get(`/api/plans?branchId=${branchAId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.some((p: any) => p.id === planId)).toBe(true);
    });

    it('should update a plan', async () => {
      const res = await ownerAgent
        .patch(`/api/plans/${planId}`)
        .send({ pricePiasters: 60000 });

      expect(res.status).toBe(200);
      expect(res.body.data.pricePiasters).toBe(60000);
    });

    it('should deactivate a plan (soft delete)', async () => {
      const res = await ownerAgent.delete(`/api/plans/${planId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const plan = await prisma.plan.findUnique({ where: { id: planId } });
      expect(plan!.isActive).toBe(false);

      // Reactivate for subscription tests
      await prisma.plan.update({ where: { id: planId }, data: { isActive: true } });
    });

    it('should reject plan creation without branch access', async () => {
      const res = await ownerAgent
        .post('/api/plans')
        .send({
          branchId: 'non-existent-branch-id',
          name: 'Bad Plan',
          nameAr: 'خطة سيئة',
          durationDays: 30,
          pricePiasters: 10000
        });

      // Should fail because branch doesn't exist (or no access)
      expect(res.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Subscription Lifecycle', () => {
    it('should create a member for subscription tests', async () => {
      const res = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Subscription Test Member',
          phone: '01000010001',
          gender: 'Male',
          branchId: branchAId
        });

      expect(res.status).toBe(201);
      memberId = res.body.data.id;
    });

    it('should create a subscription with full payment', async () => {
      const res = await ownerAgent
        .post('/api/subscriptions')
        .send({
          memberId,
          planId,
          startDate: '2026-10-09',
          discountPiasters: 0,
          paidPiasters: 60000,
          paymentMethod: 'CASH'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.pricePiasters).toBe(60000);
      expect(res.body.data.paidPiasters).toBe(60000);
      expect(res.body.data.outstandingPiasters).toBe(0);
      subscriptionId = res.body.data.id;

      // Verify dates
      const start = new Date(res.body.data.startDate);
      const end = new Date(res.body.data.endDate);
      const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
      expect(diffDays).toBe(30);
    });

    it('should create a subscription with partial payment (outstanding balance)', async () => {
      // Create another member
      const memberRes = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Partial Payment Member',
          phone: '01000010002',
          gender: 'Male',
          branchId: branchAId
        });

      const res = await ownerAgent
        .post('/api/subscriptions')
        .send({
          memberId: memberRes.body.data.id,
          planId,
          startDate: '2026-10-09',
          discountPiasters: 0,
          paidPiasters: 30000,
          paymentMethod: 'CASH'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.pricePiasters).toBe(60000);
      expect(res.body.data.paidPiasters).toBe(30000);
      expect(res.body.data.outstandingPiasters).toBe(30000);
    });

    it('should create a subscription with discount', async () => {
      const memberRes = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Discount Member',
          phone: '01000010003',
          gender: 'Male',
          branchId: branchAId
        });

      const res = await ownerAgent
        .post('/api/subscriptions')
        .send({
          memberId: memberRes.body.data.id,
          planId,
          startDate: '2026-10-09',
          discountPiasters: 10000,
          paidPiasters: 50000,
          paymentMethod: 'CASH'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.pricePiasters).toBe(50000); // 60000 - 10000
      expect(res.body.data.paidPiasters).toBe(50000);
      expect(res.body.data.outstandingPiasters).toBe(0);
    });

    it('should get subscription details with payments', async () => {
      const res = await ownerAgent.get(`/api/subscriptions/${subscriptionId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.member).toBeDefined();
      expect(res.body.data.plan).toBeDefined();
      expect(res.body.data.payments).toBeDefined();
      expect(res.body.data.payments.length).toBeGreaterThan(0);
      expect(res.body.data.outstandingPiasters).toBe(0);
    });

    it('should list subscriptions with filters', async () => {
      const res = await ownerAgent.get(`/api/subscriptions?branchId=${branchAId}&status=ACTIVE`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data.every((s: any) => s.status === 'ACTIVE')).toBe(true);
    });

    it('should search subscriptions by member name', async () => {
      const res = await ownerAgent.get('/api/subscriptions?search=Subscription Test');

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].member.person.name).toContain('Subscription');
    });
  });

  describe('Payments', () => {
    it('should record an additional payment for outstanding balance', async () => {
      // Get the partial payment subscription
      const subs = await ownerAgent.get('/api/subscriptions?search=Partial Payment');
      const subId = subs.body.data[0].id;

      const res = await ownerAgent
        .post(`/api/subscriptions/${subId}/payments`)
        .send({
          amountPiasters: 30000,
          method: 'BANK_TRANSFER',
          reference: 'REF-12345',
          notes: 'Remaining balance'
        });

      expect(res.status).toBe(201);
      expect(res.body.data.amountPiasters).toBe(30000);
      expect(res.body.data.method).toBe('BANK_TRANSFER');
      expect(res.body.outstandingPiasters).toBe(0);
    });

    it('should reject payment when no outstanding balance', async () => {
      const res = await ownerAgent
        .post(`/api/subscriptions/${subscriptionId}/payments`)
        .send({
          amountPiasters: 10000,
          method: 'CASH'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Freeze & Unfreeze', () => {
    it('should freeze an active subscription', async () => {
      const res = await ownerAgent.patch(`/api/subscriptions/${subscriptionId}/freeze`);

      expect(res.status).toBe(200);
      expect(res.body.data.isFrozen).toBe(true);
      expect(res.body.data.status).toBe('FROZEN');
      expect(res.body.data.frozenAt).toBeDefined();
    });

    it('should reject freezing an already frozen subscription', async () => {
      const res = await ownerAgent.patch(`/api/subscriptions/${subscriptionId}/freeze`);

      expect(res.status).toBe(400);
    });

    it('should unfreeze and extend endDate', async () => {
      const before = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
      const oldEndDate = before!.endDate;

      // Wait a tiny bit so frozen days > 0
      await new Promise(r => setTimeout(r, 1100));

      const res = await ownerAgent.patch(`/api/subscriptions/${subscriptionId}/unfreeze`);

      expect(res.status).toBe(200);
      expect(res.body.data.isFrozen).toBe(false);
      expect(res.body.data.status).toBe('ACTIVE');

      const newEndDate = new Date(res.body.data.endDate);
      expect(newEndDate.getTime()).toBeGreaterThanOrEqual(oldEndDate.getTime());
    });
  });

  describe('Renewal', () => {
    it('should renew a subscription', async () => {
      const res = await ownerAgent.post(`/api/subscriptions/${subscriptionId}/renew`).send({});

      expect(res.status).toBe(201);
      expect(res.body.data.status).toBe('ACTIVE');
      expect(res.body.data.memberId).toBe(memberId);
      expect(res.body.data.planId).toBe(planId);

      // New subscription should start from old endDate
      const oldSub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
      const newStart = new Date(res.body.data.startDate);
      expect(newStart.getTime()).toBeGreaterThanOrEqual(oldSub!.endDate.getTime());
    });
  });

  describe('Receipt', () => {
    it('should generate receipt data', async () => {
      const res = await ownerAgent.get(`/api/subscriptions/${subscriptionId}/receipt`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.receiptNumber).toBeDefined();
      expect(res.body.data.member).toBeDefined();
      expect(res.body.data.plan).toBeDefined();
      expect(res.body.data.payments).toBeDefined();
      expect(res.body.data.pricePiasters).toBeDefined();
      expect(res.body.data.paidPiasters).toBeDefined();
    });
  });

  describe('Branch Scoping', () => {
    it('should not allow creating subscription with plan from different branch', async () => {
      // Create a plan on branch B
      const planRes = await ownerAgent
        .post('/api/plans')
        .send({
          branchId: branchBId,
          name: 'Test Plan Branch B',
          nameAr: 'خطة فرع ب',
          durationDays: 30,
          pricePiasters: 40000
        });

      const branchBPlanId = planRes.body.data.id;

      // Try to create subscription for branch A member with branch B plan
      const res = await ownerAgent
        .post('/api/subscriptions')
        .send({
          memberId,
          planId: branchBPlanId,
          startDate: '2026-10-09',
          paidPiasters: 40000
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('الخطة لا تنتمي لفرع العضو');

      // Cleanup
      await prisma.plan.delete({ where: { id: branchBPlanId } });
    });
  });
});
