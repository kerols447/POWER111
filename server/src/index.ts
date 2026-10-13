import express from 'express';
import session from 'express-session';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.js';
import branchRoutes from './routes/branches.js';
import auditRoutes from './routes/audit.js';
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
import portalRoutes from './routes/portal.js';
import publicRoutes from './routes/public.js';
import syncRoutes from './routes/sync.js';
import offerRoutes from './routes/offers.js';
import exportRoutes from './routes/exports.js';
import backupRoutes from './routes/backup.js';

dotenv.config();

export const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

// Railway terminates TLS upstream; trust the proxy so secure cookies work
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for production - fonts and external resources needed
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
app.use(morgan('dev'));
// A restore body is a full dump of every table, so it needs more headroom than the default cap.
app.use('/api/backup/restore', express.json({ limit: '100mb' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
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

// Serve uploaded files
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Serve web build in production
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDistPath = path.resolve(__dirname, '../../web/dist');

app.use(express.static(webDistPath));
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
