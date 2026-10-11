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

dotenv.config();

export const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;

// Railway terminates TLS upstream; trust the proxy so secure cookies work
app.set('trust proxy', 1);

// Middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      connectSrc: ["'self'", "https://fonts.googleapis.com", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "blob:", "http:", "https:"],
    },
  },
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
