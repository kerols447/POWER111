import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import branchRoutes from './routes/branches.js';
import auditRoutes, { createAuditLog } from './routes/audit.js';
import memberRoutes from './routes/members.js';
import planRoutes from './routes/plans.js';
import subscriptionRoutes from './routes/subscriptions.js';
import attendanceRoutes from './routes/attendance.js';
import productRoutes from './routes/products.js';
import salesRoutes from './routes/sales.js';
import expenseRoutes from './routes/expenses.js';
import reportRoutes from './routes/reports.js';
import settingsRoutes from './routes/settings.js';
import userRoutes from './routes/users.js';
import staffRoutes from './routes/staff.js';
import assistantRoutes from './routes/assistant.js';
import portalRoutes from './routes/portal.js';
import physioRoutes from './routes/physio.js';
import publicRoutes from './routes/public.js';
import syncRoutes from './routes/sync.js';
import offerRoutes from './routes/offers.js';
import exportRoutes from './routes/exports.js';
import backupRoutes from './routes/backup.js';
import importRoutes from './routes/imports.js';
import { userHasPermission } from './utils/permissions.js';

dotenv.config();

export const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

// Railway terminates TLS upstream; trust the proxy so secure cookies work
app.set('trust proxy', 1);

// The signing key is made once and kept on disk, so a restart or a redeploy never logs
// everyone out by changing it, and nothing has to be pasted into a hosting dashboard.
function bootSessionSecret(): string {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  if (process.env.NODE_ENV === 'test') return 'test-only-secret';

  const file = path.join(process.cwd(), '.session-secret');
  try {
    const stored = fs.readFileSync(file, 'utf8').trim();
    if (stored) return stored;
  } catch {
    // First boot: the file does not exist yet.
  }
  const generated = crypto.randomBytes(32).toString('hex');
  try {
    fs.writeFileSync(file, generated, { mode: 0o600 });
  } catch {
    console.warn('Could not persist the session secret — sessions will reset on every restart.');
  }
  return generated;
}

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https://fonts.gstatic.com'],
      connectSrc: ["'self'", 'blob:', 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      mediaSrc: ["'self'", 'blob:', 'data:'],
      workerSrc: ["'self'", 'blob:'],
      childSrc: ["'self'", 'blob:'],
      frameSrc: ["'self'", 'blob:'],
      manifestSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  referrerPolicy: { policy: 'same-origin' },
  crossOriginEmbedderPolicy: false
}));
const allowedOrigins = (process.env.WEB_URL || 'http://localhost:5173').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true
}));
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
    skip: (req) => req.path === '/api/health'
  }));
}
// A restore body is a full dump of every table, so it needs more headroom than the default cap.
app.use('/api/backup/restore', express.json({ limit: '100mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: bootSessionSecret(),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Clear all data (owner only - for production cleanup)
app.post('/api/admin/clear-data', async (req, res) => {
  try {
    const sessionUser = (req.session as any).user;
    if (!sessionUser || sessionUser.role !== 'OWNER') {
      return res.status(403).json({ error: 'Owner only' });
    }

    await prisma.saleItem.deleteMany({});
    await prisma.sale.deleteMany({});
    await prisma.expense.deleteMany({});
    await prisma.attendance.deleteMany({});
    await prisma.payment.deleteMany({});
    await prisma.subscription.deleteMany({});
    await prisma.product.deleteMany({});
    await prisma.offer.deleteMany({});
    await prisma.member.deleteMany({});
    await prisma.person.deleteMany({});
    await prisma.plan.deleteMany({});
    await prisma.branch.deleteMany({});

    await createAuditLog(sessionUser.id, 'CLEAR_ALL_DATA', 'System', undefined, undefined, {
      confirmed: true,
      tables: ['saleItem', 'sale', 'expense', 'attendance', 'payment', 'subscription', 'product', 'offer', 'member', 'person', 'plan', 'branch']
    }, req.ip);

    res.json({ success: true, message: 'All data cleared' });
  } catch (error) {
    console.error('Error clearing data:', error);
    res.status(500).json({ error: 'Failed to clear data' });
  }
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/branches', branchRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/members', memberRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/products', productRoutes);
app.use('/api/sales', salesRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/users', userRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/offers', offerRoutes);
app.use('/api/exports', exportRoutes);
app.use('/api/backup', backupRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/staff', staffRoutes);
app.use('/api/physio', physioRoutes);
app.use('/api/assistant', assistantRoutes);

// Serve uploaded files. A member's photo is personal data, so it is never handed to
// whoever knows the URL — only that member, or staff allowed to open the members sheet.
const uploadsDir = path.join(process.cwd(), 'uploads');

app.get(/^\/uploads\/members\/([A-Za-z0-9._-]+)$/, async (req, res) => {
  try {
    const filename = (req.params as any)[0];
    const session = (req.session as any) || {};
    const filePath = path.join(uploadsDir, 'members', path.basename(filename));
    if (!filePath.startsWith(path.join(uploadsDir, 'members')) || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (session.member) {
      const own = await prisma.member.findUnique({
        where: { id: session.member.memberId },
        select: { person: { select: { photoPath: true } } }
      });
      if (own?.person?.photoPath === `/uploads/members/${filename}`) {
        return res.sendFile(filePath);
      }
      return res.status(403).json({ error: 'Forbidden' });
    }

    if (session.user) {
      if (session.user.role === 'OWNER' || await userHasPermission(session.user.id, 'VIEW_MEMBERS')) {
        return res.sendFile(filePath);
      }
    }
    return res.status(401).json({ error: 'Not authenticated' });
  } catch (error) {
    console.error('Error serving member photo:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use('/uploads', express.static(uploadsDir, { index: false, dotfiles: 'ignore' }));

// Serve web build in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistPath = path.resolve(__dirname, '../../web/dist');

app.use((req, res, next) => {
  // The service worker and the manifest must be re-checked every visit, otherwise a phone
  // keeps running an old build for hours after a deploy. Hashed assets never change.
  if (req.path === '/sw.js' || req.path === '/sw.js.map' || req.path === '/manifest.json' || req.path === '/manifest.webmanifest') {
    res.setHeader('Cache-Control', 'no-cache, must-revalidate');
  } else if (/^\/assets\/.+\.(js|css|woff2?|png|jpg|jpeg|svg|webp|mp4)$/.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  } else if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.setHeader('Cache-Control', 'no-cache');
  }
  next();
});

app.use(express.static(webDistPath, { index: false, dotfiles: 'ignore' }));
app.get('*', (_req, res) => {
  res.sendFile(path.join(webDistPath, 'index.html'));
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong' });
});

// Start server
async function start() {
  try {
    await prisma.$connect();
    console.log('✅ Database connected');

    // Don't start server in test mode
    if (process.env.NODE_ENV !== 'test') {
      app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

// Graceful shutdown
process.on('beforeExit', async () => {
  await prisma.$disconnect();
});

export default app;
