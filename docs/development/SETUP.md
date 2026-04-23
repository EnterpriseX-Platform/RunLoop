# 🚀 Development Guide

## เริ่มต้น Development Mode

### 1. Start Database (Docker)

```bash
# Start PostgreSQL only
docker-compose -f docker-compose.db.yml up -d

# หรือใช้ npm script
npm run db:start
```

Database จะรันที่:
- **Host**: localhost:5433
- **Database**: runloop
- **User**: runloop
- **Password**: runloop_secret

### 2. Setup Database Schema

```bash
# Install dependencies
npm install

# Generate Prisma Client
cd apps/runloop
npx prisma generate

# Push schema to database
npx prisma db push

# Seed data (optional)
npx prisma db seed
```

### 3. Start Applications (Dev Mode)

#### Terminal 1: Go Engine
```bash
cd apps/runloop-engine
go mod download
go run main.go
```
Engine จะรันที่: http://localhost:8092

#### Terminal 2: Next.js Web
```bash
cd apps/runloop
npm install
npm run dev
```
Web จะรันที่: http://localhost:3081/runloop

### 4. Access Application

- **Web App**: http://localhost:3081/runloop
- **Engine Health**: http://localhost:3081/runloop/proxy/engine/health
- **Engine Stats**: http://localhost:3081/runloop/proxy/engine/stats
- **Direct Engine**: http://localhost:8092/runloop-engine/health

---

## URL Structure

```
http://localhost:3081/
├── /runloop/                    ← Next.js Frontend (Port 3081)
│   ├── /login
│   ├── /dashboard
│   ├── /projects
│   ├── /schedulers
│   ├── /executions
│   └── /settings
│
├── /runloop/api/*               ← Next.js Internal API
│   ├── /auth/login
│   ├── /auth/logout
│   ├── /auth/me
│   └── /projects
│
└── /runloop/proxy/engine/*      ← Proxy → Go Engine (Port 8092)
    ├── /health
    ├── /stats
    ├── /api/schedulers
    ├── /api/executions
    └── /api/executions/metrics
```

---

## Common Commands

```bash
# Database
npm run db:start     # Start database
npm run db:stop      # Stop database
npm run db:logs      # View database logs

# Development
npm run dev          # Start all apps (turbo)

# Database Operations
cd apps/runloop
npx prisma db push         # Push schema
npx prisma migrate dev     # Create migration
npx prisma db seed         # Seed data
npx prisma studio          # Open Prisma Studio
```

---

## Environment Variables

### apps/runloop/.env.local
```env
DATABASE_URL=postgres://runloop:runloop_secret@localhost:5433/runloop?sslmode=disable
JWT_SECRET=dev-secret-key-change-in-production
NEXT_PUBLIC_SKIP_AUTH=true
ENGINE_URL=http://localhost:8092
```

### apps/runloop-engine/.env
```env
EXECUTOR_PORT=8092
BASE_PATH=/runloop-engine
DATABASE_URL=postgres://runloop:runloop_secret@localhost:5433/runloop?sslmode=disable
JWT_SECRET=dev-secret-key-change-in-production
LOG_LEVEL=debug
```

---

## Troubleshooting

### Database connection failed
```bash
# Check if database is running
docker ps

# Restart database
npm run db:stop
npm run db:start
```

### Port already in use
```bash
# Kill process on port 3081
lsof -ti:3081 | xargs kill -9

# Kill process on port 8092
lsof -ti:8092 | xargs kill -9

# Kill process on port 5433
lsof -ti:5433 | xargs kill -9
```

### Prisma Client not found
```bash
cd apps/runloop
npx prisma generate
```
