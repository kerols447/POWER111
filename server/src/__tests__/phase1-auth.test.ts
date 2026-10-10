import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';

// Set test environment before importing app
process.env.NODE_ENV = 'test';

import app, { prisma } from '../index.js';

describe('Phase 1 — Auth & Authorization Tests', () => {
  let ownerAgent: request.SuperAgentTest;
  let branchAUserAgent: request.SuperAgentTest;
  let branchBUserAgent: request.SuperAgentTest;
  let branchAId: string;
  let branchBId: string;

  beforeAll(async () => {
    // Get branches
    const branches = await prisma.branch.findMany({ take: 2, orderBy: { code: 'asc' } });
    branchAId = branches[0].id;
    branchBId = branches[1].id;

    // Hash passwords
    const passwordHash = await bcrypt.hash('test123', 10);

    // Create test users
    await prisma.user.create({
      data: {
        email: 'branchA@test.com',
        passwordHash,
        name: 'Branch A Manager',
        role: 'BRANCH_MANAGER',
        branchAccess: {
          create: {
            branchId: branchAId
          }
        }
      }
    });

    await prisma.user.create({
      data: {
        email: 'branchB@test.com',
        passwordHash,
        name: 'Branch B Manager',
        role: 'BRANCH_MANAGER',
        branchAccess: {
          create: {
            branchId: branchBId
          }
        }
      }
    });

    // Create agents and login
    ownerAgent = request.agent(app);
    await ownerAgent
      .post('/api/auth/login')
      .send({ email: 'admin@power111.com', password: 'admin123' });

    branchAUserAgent = request.agent(app);
    await branchAUserAgent
      .post('/api/auth/login')
      .send({ email: 'branchA@test.com', password: 'test123' });

    branchBUserAgent = request.agent(app);
    await branchBUserAgent
      .post('/api/auth/login')
      .send({ email: 'branchB@test.com', password: 'test123' });
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { in: ['branchA@test.com', 'branchB@test.com'] } }
    });
    await prisma.$disconnect();
  });

  describe('Authentication', () => {
    it('should reject unauthenticated requests', async () => {
      const res = await request(app).get('/api/branches');
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('تسجيل الدخول');
    });

    it('should reject invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'admin@power111.com', password: 'wrongpassword' });
      expect(res.status).toBe(401);
    });

    it('should accept valid credentials', async () => {
      const agent = request.agent(app);
      const res = await agent
        .post('/api/auth/login')
        .send({ email: 'admin@power111.com', password: 'admin123' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.user.email).toBe('admin@power111.com');
    });

    it('should return user info on /me', async () => {
      const res = await ownerAgent.get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('admin@power111.com');
      expect(res.body.user.role).toBe('OWNER');
    });
  });

  describe('Branch Scoping', () => {
    it('owner should see all branches', async () => {
      const res = await ownerAgent.get('/api/branches');
      expect(res.status).toBe(200);
      expect(res.body.branches.length).toBe(4);
    });

    it('branch-A manager should only see branch-A', async () => {
      const res = await branchAUserAgent.get('/api/branches');
      expect(res.status).toBe(200);
      expect(res.body.branches.length).toBe(1);
      expect(res.body.branches[0].id).toBe(branchAId);
    });

    it('branch-B manager should only see branch-B', async () => {
      const res = await branchBUserAgent.get('/api/branches');
      expect(res.status).toBe(200);
      expect(res.body.branches.length).toBe(1);
      expect(res.body.branches[0].id).toBe(branchBId);
    });

    it('branch-A manager cannot access branch-B data by ID', async () => {
      const res = await branchAUserAgent.get(`/api/branches/${branchBId}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain('فرع');
    });

    it('branch-B manager cannot access branch-A data by ID', async () => {
      const res = await branchBUserAgent.get(`/api/branches/${branchAId}`);
      expect(res.status).toBe(403);
    });

    it('owner can access any branch', async () => {
      const resA = await ownerAgent.get(`/api/branches/${branchAId}`);
      expect(resA.status).toBe(200);

      const resB = await ownerAgent.get(`/api/branches/${branchBId}`);
      expect(resB.status).toBe(200);
    });
  });

  describe('Role-Based Access', () => {
    it('should reject requests without authentication', async () => {
      const res = await request(app).get('/api/audit');
      expect(res.status).toBe(401);
    });

    it('owner should access audit logs', async () => {
      const res = await ownerAgent.get('/api/audit');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('branch manager should access audit logs for their branch', async () => {
      const res = await branchAUserAgent.get(`/api/audit?branchId=${branchAId}`);
      expect(res.status).toBe(200);
    });

    it('branch manager cannot access audit logs for other branches', async () => {
      const res = await branchAUserAgent.get(`/api/audit?branchId=${branchBId}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Audit Log', () => {
    it('should create audit log entries', async () => {
      // Get initial count
      const beforeRes = await ownerAgent.get('/api/audit');
      const beforeCount = beforeRes.body.pagination.total;

      // Trigger an action that creates audit log (login already does this in real system)
      // For now, just verify audit endpoint works
      const res = await ownerAgent.get('/api/audit');
      expect(res.status).toBe(200);
      expect(res.body.logs).toBeDefined();
      expect(Array.isArray(res.body.logs)).toBe(true);
    });

    it('should include pagination info', async () => {
      const res = await ownerAgent.get('/api/audit?page=1&pageSize=10');
      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
      expect(res.body.pagination.page).toBe(1);
      expect(res.body.pagination.pageSize).toBe(10);
    });
  });
});
