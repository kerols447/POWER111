# POWER 111 — Gym Management System

نظام إدارة الجيم متكامل يدعم 4 فروع مع موقع عام وبوابة للأعضاء ولوحة تحكم.

## Tech Stack

- **Frontend:** React + TypeScript + Tailwind CSS
- **Backend:** Node.js + Express (TypeScript)
- **Database:** PostgreSQL + Prisma ORM
- **Testing:** Vitest + Supertest + Playwright

## Prerequisites

- Node.js >= 20.0.0
- Docker & Docker Compose (for PostgreSQL)
- npm

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Setup environment

```bash
cp .env.example .env
```

Edit `.env` if you need to change database credentials or ports.

### 3. Start PostgreSQL

```bash
npm run docker:up
```

Wait for the database to be ready (check with `npm run docker:logs`).

### 4. Run database migrations

```bash
npm run db:migrate
```

### 5. Seed the database (development only)

```bash
npm run db:seed
```

This creates:
- 4 branches
- Owner account: `admin@power111.com` / `admin123`
- Sample membership plans

### 6. Start development servers

```bash
npm run dev
```

This starts both:
- Backend API: http://localhost:3000
- Frontend: http://localhost:5173

### 7. Open the app

Visit http://localhost:5173

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both server and web in development mode |
| `npm run dev:server` | Start only the backend server |
| `npm run dev:web` | Start only the frontend |
| `npm run build` | Build everything for production |
| `npm run test` | Run all tests |
| `npm run db:migrate` | Run database migrations |
| `npm run db:seed` | Seed the database with sample data |
| `npm run db:reset` | Reset the database (WARNING: deletes all data) |
| `npm run db:studio` | Open Prisma Studio (database GUI) |
| `npm run docker:up` | Start PostgreSQL container |
| `npm run docker:down` | Stop PostgreSQL container |
| `npm run docker:logs` | View PostgreSQL logs |

## Project Structure

```
POWER111/
├── server/          # Express backend API
│   └── src/
│       ├── routes/      # API routes
│       ├── middleware/   # Auth, validation, etc.
│       ├── services/    # Business logic
│       └── utils/       # Helpers
├── web/             # React frontend
│   └── src/
│       ├── components/  # Reusable components
│       ├── pages/       # Page components
│       ├── hooks/       # Custom hooks
│       └── utils/       # Frontend helpers
├── shared/          # Shared types and utilities
│   └── src/
├── prisma/          # Database schema and migrations
│   ├── schema.prisma
│   └── migrations/
├── scripts/         # Utility scripts
│   └── seed.ts
├── docker-compose.yml
├── package.json
└── .env.example
```

## Key Features (Planned)

- ✅ Multi-branch support (4 branches)
- ✅ Role-based access control (Owner, Manager, Receptionist, Accountant)
- ✅ Member management with unique random codes
- ✅ Subscription & payment tracking
- ✅ Attendance tracking (QR/barcode/manual)
- ✅ Products & inventory management
- ✅ POS system
- ✅ Accounting & expense tracking
- ✅ Public website (Arabic RTL)
- ✅ Member portal (self-service)
- ✅ Admin dashboard with reports
- ✅ Offline mode with sync (PWA)

## Important Notes

- All money is stored as **integer piasters** (EGP × 100) to avoid floating-point issues
- Timestamps are stored in **UTC**, displayed in **Africa/Cairo** timezone
- Financial records are **never deleted** — corrections use reversal entries
- Every important action is logged in an **audit log**
- Membership codes are **random, non-sequential, 8 characters**

## Development

### Database

Use Prisma Studio to view/edit data:

```bash
npm run db:studio
```

### Tests

```bash
npm run test          # Run all tests
npm run test:server   # Run only backend tests
npm run test:web      # Run only frontend tests
npm run test:e2e      # Run end-to-end tests
```

## License

Private — POWER 111
