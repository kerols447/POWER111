import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Set test environment before importing app
process.env.NODE_ENV = 'test';

import app, { prisma } from '../index.js';

describe('Phase 2 — Members Tests', () => {
  let ownerAgent: request.SuperAgentTest;
  let branchAId: string;
  let branchBId: string;

  beforeAll(async () => {
    // Get branches
    const branches = await prisma.branch.findMany({ take: 2, orderBy: { code: 'asc' } });
    branchAId = branches[0].id;
    branchBId = branches[1].id;

    // Login as owner
    ownerAgent = request.agent(app);
    await ownerAgent
      .post('/api/auth/login')
      .send({ email: 'admin@power111.com', password: 'admin123' });
  });

  afterAll(async () => {
    // Cleanup test members
    await prisma.member.deleteMany({
      where: {
        person: {
          phone: { startsWith: '0100000' }
        }
      }
    });
    await prisma.person.deleteMany({
      where: { phone: { startsWith: '0100000' } }
    });
    await prisma.$disconnect();
  });

  describe('Member Creation', () => {
    it('should create a new member with unique code', async () => {
      const res = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Test Member 1',
          phone: '01000000001',
          email: 'test1@example.com',
          gender: 'Male',
          branchId: branchAId
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.memberCode).toBeDefined();
      expect(res.body.data.memberCode).toHaveLength(8);
    });

    it('should reject duplicate member at same branch', async () => {
      // Create first member
      await ownerAgent
        .post('/api/members')
        .send({
          name: 'Test Member 2',
          phone: '01000000002',
          branchId: branchAId
        });

      // Try to create same person at same branch
      const res = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Test Member 2',
          phone: '01000000002',
          branchId: branchAId
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('Duplicate');
    });

    it('should allow same person at different branch with warning', async () => {
      // First create at branchA
      await ownerAgent
        .post('/api/members')
        .send({
          name: 'Test Member 3',
          phone: '01000000003',
          branchId: branchAId
        });

      // Now create same person at branchB
      const res = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Test Member 3',
          phone: '01000000003',
          branchId: branchBId
        });

      expect(res.status).toBe(201);
      expect(res.body.warning).toBeDefined();
    });

    it('should reject invalid phone number', async () => {
      const res = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Test Member',
          phone: '123',
          branchId: branchAId
        });

      expect(res.status).toBe(400);
    });

    it('should reject missing required fields', async () => {
      const res = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Test'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('Member Search', () => {
    beforeAll(async () => {
      // Create test members
      await ownerAgent
        .post('/api/members')
        .send({
          name: 'Ahmed Mohamed',
          phone: '01000000010',
          branchId: branchAId
        });

      await ownerAgent
        .post('/api/members')
        .send({
          name: 'Sara Ali',
          phone: '01000000011',
          branchId: branchAId
        });
    });

    it('should search by name', async () => {
      const res = await ownerAgent
        .get('/api/members?search=Ahmed')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].person.name).toContain('Ahmed');
    });

    it('should search by phone', async () => {
      const res = await ownerAgent
        .get('/api/members?search=01000000011')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].person.phone).toContain('01000000011');
    });

    it('should search by member code', async () => {
      // Get a member first to get their code
      const membersRes = await ownerAgent.get('/api/members');
      const memberCode = membersRes.body.data[0].memberCode;

      const res = await ownerAgent
        .get(`/api/members?search=${memberCode}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0].memberCode).toBe(memberCode);
    });
  });

  describe('Member Filters', () => {
    it('should filter by branch', async () => {
      const res = await ownerAgent
        .get(`/api/members?branchId=${branchAId}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.every((m: any) => m.branchId === branchAId)).toBe(true);
    });

    it('should filter by status', async () => {
      const res = await ownerAgent
        .get('/api/members?status=ACTIVE')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.data.every((m: any) => m.status === 'ACTIVE')).toBe(true);
    });
  });

  describe('Member Update', () => {
    let memberId: string;

    beforeAll(async () => {
      const res = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Update Test',
          phone: '01000000020',
          branchId: branchAId
        });
      memberId = res.body.data.id;
    });

    it('should update member name', async () => {
      const res = await ownerAgent
        .patch(`/api/members/${memberId}`)
        .send({ name: 'Updated Name' });

      expect(res.status).toBe(200);
      expect(res.body.data.person.name).toBe('Updated Name');
    });

    it('should update member status', async () => {
      const res = await ownerAgent
        .patch(`/api/members/${memberId}`)
        .send({ status: 'SUSPENDED' });

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('SUSPENDED');
    });

    it('should reject update for non-existent member', async () => {
      const res = await ownerAgent
        .patch('/api/members/nonexistent')
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
    });
  });

  describe('Member Deactivation', () => {
    let memberId: string;

    beforeAll(async () => {
      const res = await ownerAgent
        .post('/api/members')
        .send({
          name: 'Deactivate Test',
          phone: '01000000030',
          branchId: branchAId
        });
      memberId = res.body.data.id;
    });

    it('should deactivate member (soft delete)', async () => {
      const res = await ownerAgent
        .delete(`/api/members/${memberId}`)
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify status changed
      const getRes = await ownerAgent.get(`/api/members/${memberId}`);
      expect(getRes.body.data.status).toBe('INACTIVE');
    });
  });

  describe('Unique Code Generation', () => {
    it('should generate unique codes for multiple members', async () => {
      const codes: string[] = [];

      for (let i = 0; i < 5; i++) {
        const res = await ownerAgent
          .post('/api/members')
          .send({
            name: `Code Test ${i}`,
            phone: `0100000004${i}`,
            branchId: branchAId
          });

        expect(res.status).toBe(201);
        codes.push(res.body.data.memberCode);
      }

      // All codes should be unique
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });
  });
});
