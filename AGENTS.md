# RunLoop - Agent Development Guide

> AI coding agent reference for the RunLoop project. This document provides essential information for understanding and working with the codebase.

---

## Project Overview

**RunLoop** is a modern job scheduling platform for automated workflows, built with a hybrid architecture:

- **Frontend**: Next.js 14 (App Router) - Web UI and Internal API
- **Engine**: Go (Fiber framework) - Scheduler, worker pool, and job execution
- **Database**: PostgreSQL - Data persistence via Prisma ORM

### Key Concepts

| Term | Description |
|------|-------------|
| **Task** | Workflow definition using React Flow. Defines WHAT to run. |
| **Scheduler** | Execution configuration. Defines WHEN and HOW to run. |
| **Execution** | A single run instance of a Task. |
| **Flow** | DAG-based visual workflow with nodes and edges. |

---

## Technology Stack

### Frontend (`apps/runloop/`)
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript
- **Styling**: Tailwind CSS with custom dark theme
- **UI Components**: Custom components + Lucide icons
- **State Management**: React Context (AuthContext, ProjectContext)
- **Database ORM**: Prisma
- **Charts**: Recharts
- **Flow Editor**: @xyflow/react (React Flow)

### Engine (`apps/runloop-engine/`)
- **Language**: Go 1.23
- **Web Framework**: Fiber v2
- **Scheduler**: go-co-op/gocron/v2
- **Database**: pgx (PostgreSQL driver)
- **WebSocket**: gofiber/websocket/v2
- **Logging**: rs/zerolog
- **Validation**: go-playground/validator/v10

### Infrastructure
- **Monorepo Tool**: Turborepo
- **Package Manager**: npm
- **Database**: PostgreSQL 16
- **Containerization**: Docker & Docker Compose

---

## Project Structure

```
RUNLOOP/
├── apps/
│   ├── runloop/                 # Next.js 14 Application
│   │   ├── src/
│   │   │   ├── app/             # App Router (pages)
│   │   │   │   ├── (protected)/ # Protected routes (require auth)
│   │   │   │   │   ├── dashboard/
│   │   │   │   │   ├── projects/
│   │   │   │   │   ├── schedulers/
│   │   │   │   │   ├── executions/
│   │   │   │   │   └── ...
│   │   │   │   ├── api/         # Internal API routes
│   │   │   │   ├── login/
│   │   │   │   └── ...
│   │   │   ├── components/      # React components
│   │   │   │   ├── flow/        # Flow editor components
│   │   │   │   │   ├── nodes/   # Flow node types
│   │   │   │   │   └── properties/
│   │   │   ├── context/         # React contexts
│   │   │   ├── lib/             # Utilities (auth, prisma, encryption)
│   │   │   ├── hooks/           # Custom hooks
│   │   │   └── types/           # TypeScript types
│   │   ├── prisma/
│   │   │   ├── schema.prisma    # Database schema
│   │   │   └── seed.ts          # Seed data
│   │   ├── next.config.js       # Next.js config with proxy
│   │   └── package.json
│   │
│   └── runloop-engine/          # Go Scheduler Engine
│       ├── internal/
│       │   ├── api/             # HTTP handlers
│       │   ├── config/          # Configuration management
│       │   ├── connector/       # External service connectors (S3, DB, etc.)
│       │   ├── db/              # Database layer
│       │   ├── executor/        # Job execution logic
│       │   ├── middleware/      # Auth middleware
│       │   ├── models/          # Data models
│       │   ├── scheduler/       # Cron scheduler manager
│       │   ├── webhook/         # Webhook handler
│       │   ├── websocket/       # WebSocket hub
│       │   └── worker/          # Worker pool
│       ├── main.go              # Entry point
│       └── go.mod
│
├── docs/                        # Documentation
│   ├── development/SETUP.md
│   └── architecture/OVERVIEW.md
│
├── docker-compose.yml           # Full stack deployment
├── docker-compose.db.yml        # Database only (dev)
├── turbo.json                   # Turborepo pipeline config
└── package.json                 # Root package.json
```

---

## Build and Development Commands

### Root Level Commands (Turborepo)

```bash
# Install dependencies
npm install

# Start all apps in development mode
npm run dev                    # Runs 'turbo dev' - starts Next.js and watches

# Build all apps
npm run build                  # Runs 'turbo build'

# Lint all apps
npm run lint                   # Runs 'turbo lint'

# Type check all apps
npm run typecheck              # Runs 'turbo typecheck'
```

### Database Commands

```bash
# Start database only (Docker)
npm run db:start               # docker-compose -f docker-compose.db.yml up -d

# Stop database
npm run db:stop                # docker-compose -f docker-compose.db.yml down

# View database logs
npm run db:logs                # docker-compose -f docker-compose.db.yml logs -f

# Database operations (runs in apps/runloop)
npm run db:generate            # Generate Prisma client
npm run db:migrate             # Run migrations (development)
npm run db:push                # Push schema to database
npm run db:studio              # Open Prisma Studio
npm run db:seed                # Seed database with demo data

# Full setup
npm run setup                  # Install deps, start DB, push schema, seed
```

### Manual Development (without Docker Compose)

```bash
# Terminal 1: Start PostgreSQL
npm run db:start

# Terminal 2: Start Go Engine
cd apps/runloop-engine
go mod download
go run main.go                 # Runs on port 8092

# Terminal 3: Start Next.js
cd apps/runloop
npm install
npm run dev                    # Runs on port 3081
```

### Docker Deployment (Production)

```bash
# Copy environment file
cp .env.example .env

# Start all services
docker-compose up -d

# Run database migrations
docker-compose exec runloop npx prisma migrate deploy

# Create admin user (optional)
docker-compose exec runloop npm run db:seed
```

---

## Application URLs

### Development Mode

| Service | URL | Description |
|---------|-----|-------------|
| Web App | http://localhost:3081/runloop | Next.js frontend |
| Engine Health | http://localhost:3081/runloop/proxy/engine/health | Proxied to Go engine |
| Direct Engine | http://localhost:8092/rl/health | Direct access to Go |

### URL Structure

```
http://localhost:3081/
├── /runloop/                    ← Next.js Frontend
│   ├── /login
│   ├── /dashboard
│   ├── /projects
│   ├── /schedulers
│   ├── /executions
│   └── /settings
│
├── /runloop/api/*               ← Internal API (Next.js)
│   ├── /auth/login
│   ├── /auth/logout
│   ├── /auth/me
│   ├── /projects
│   ├── /schedulers (proxy to Engine)
│   ├── /executions (proxy to Engine)
│   └── /metrics/dashboard
│
└── /runloop/proxy/engine/*      ← Proxy to Go Engine
    ├── /health
    ├── /stats
    ├── /api/schedulers
    ├── /api/executions
    └── /api/executions/metrics
```

---

## Code Style Guidelines

### TypeScript / Next.js

1. **File Naming**: Use PascalCase for components (`FlowEditor.tsx`), camelCase for utilities (`auth.ts`)
2. **Imports**: Use path aliases defined in `tsconfig.json`:
   - `@/*` maps to `./src/*`
   - `@/components/*`, `@/lib/*`, `@/types/*`, `@/hooks/*`
3. **Component Structure**: Use functional components with explicit return types
4. **Styling**: Use Tailwind CSS classes. Custom colors defined in `tailwind.config.ts`
5. **Types**: Define shared types in `src/types/index.ts`

### Go

1. **Package Structure**: Organize by domain (`internal/scheduler`, `internal/worker`)
2. **Naming**: Use PascalCase for exported, camelCase for unexported
3. **Error Handling**: Explicit error returns, use `fmt.Errorf("...: %w", err)` for wrapping
4. **Logging**: Use zerolog (`log.Info()`, `log.Error().Err(err).Msg(...)`)
5. **Configuration**: Use `internal/config` package for env vars

### Database (Prisma)

1. **Naming**: Use snake_case for database fields with `@map()`
2. **Models**: Use PascalCase for model names
3. **Relations**: Explicit relation fields with `onDelete: Cascade` where appropriate
4. **Indexes**: Add indexes for frequently queried fields

---

## Testing Instructions

### Current State
The project does not have automated tests configured yet. Testing is currently done manually.

### Manual Testing Workflow

1. **Start the stack**:
   ```bash
   npm run db:start
   npm run db:push
   npm run db:seed
   npm run dev
   ```

2. **Login with seeded credentials**:
   - Email: `<seeded-admin-email>`
   - Password: `<seeded-password>`

3. **Test basic flows**:
   - Create a project
   - Create a scheduler (HTTP type recommended for testing)
   - Trigger manual execution
   - Check execution logs

4. **Development mode shortcut**:
   Set `NEXT_PUBLIC_SKIP_AUTH=true` to bypass authentication during development.

---

## Security Considerations

### Authentication & Authorization

- **JWT-based auth**: Tokens stored in cookies, validated by both Next.js and Go
- **Session management**: Sessions stored in database with expiration
- **Development mode**: `NEXT_PUBLIC_SKIP_AUTH=true` skips auth (NEVER in production)
- **Password hashing**: bcrypt with salt rounds 10

### Secrets Management

- **Encryption**: Secrets encrypted with AES-256 (see `src/lib/encryption.ts`)
- **Scope levels**: PROJECT, GLOBAL, ORGANIZATION
- **Access logs**: All secret access is audited in `SecretAccessLog`

### Environment Variables

**Required for Production:**
```env
# Database (required)
DATABASE_URL=postgres://user:pass@host:5432/runloop?sslmode=require

# JWT (required, use strong secret)
JWT_SECRET=your-256-bit-secret-key

# Engine (optional, defaults shown)
EXECUTOR_PORT=8092
BASE_PATH=/runloop-engine
WORKER_COUNT=10
WORKER_QUEUE_SIZE=100
LOG_LEVEL=info
LOG_FORMAT=json
```

**Security Checklist:**
- [ ] Change default JWT_SECRET in production
- [ ] Disable SKIP_AUTH in production
- [ ] Use SSL for database connections
- [ ] Enable firewall rules for ports 3081, 8092
- [ ] Rotate secrets regularly
- [ ] Review audit logs periodically

---

## Key Configuration Files

| File | Purpose |
|------|---------|
| `turbo.json` | Turborepo pipeline configuration |
| `package.json` | Root dependencies and scripts |
| `apps/runloop/next.config.js` | Next.js basePath and proxy rules |
| `apps/runloop/tsconfig.json` | TypeScript paths and options |
| `apps/runloop/tailwind.config.ts` | Theme and color definitions |
| `apps/runloop/prisma/schema.prisma` | Database schema |
| `apps/runloop-engine/go.mod` | Go dependencies |
| `apps/runloop-engine/internal/config/config.go` | Environment configuration |
| `docker-compose.yml` | Production deployment |
| `docker-compose.db.yml` | Development database only |

---

## Database Schema Overview

### Core Models

- **User**: Authentication, roles (USER/ADMIN/SUPERADMIN)
- **Project**: Organization unit, has members and schedulers
- **Scheduler**: Job definition with schedule (cron), type, config
- **Execution**: Individual job run with status, logs, output
- **Secret**: Encrypted key-value pairs for credentials
- **Session**: JWT token storage for auth

### Key Relationships

```
User 1-->* ProjectMember *--1 Project
Project 1-->* Scheduler
Project 1-->* Execution
Scheduler 1-->* Execution
User 1-->* Execution (as triggerUser)
Project 1-->* Secret
```

### Important Enums

- **JobType**: HTTP, DATABASE, SHELL, PYTHON, NODEJS, DOCKER
- **TriggerType**: SCHEDULE, MANUAL, WEBHOOK, API
- **ExecutionStatus**: PENDING, RUNNING, SUCCESS, FAILED, CANCELLED, TIMEOUT
- **SchedulerStatus**: ACTIVE, INACTIVE, PAUSED, ERROR

---

## Common Tasks for Agents

### Adding a New API Endpoint

1. **Next.js API Route** (if auth/validation needed in Next.js):
   - Create file in `apps/runloop/src/app/api/your-route/route.ts`
   - Export `GET`, `POST`, etc. handlers
   - Use `requireAuth(request)` for protected routes

2. **Go Engine Handler** (if execution/scheduling logic):
   - Add handler in `apps/runloop-engine/internal/api/handlers.go`
   - Register route in `main.go` within protected group
   - Add to Next.js proxy in `next.config.js` if needed

### Adding a New Flow Node Type

1. Create node component in `apps/runloop/src/components/flow/nodes/YourNode.tsx`
2. Create properties panel in `apps/runloop/src/components/flow/properties/YourNodeProperties.tsx`
3. Register in `apps/runloop/src/components/flow/nodes/index.ts`
4. Add executor logic in `apps/runloop-engine/internal/executor/` if needed

### Database Changes

1. Edit `apps/runloop/prisma/schema.prisma`
2. Run `npm run db:push` (development) or `npm run db:migrate` (production)
3. Run `npm run db:generate` to update Prisma Client
4. Update related types in `apps/runloop/src/types/index.ts`

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
# Kill process on port 3081 (Next.js)
lsof -ti:3081 | xargs kill -9

# Kill process on port 8092 (Go Engine)
lsof -ti:8092 | xargs kill -9

# Kill process on port 5433 (PostgreSQL dev)
lsof -ti:5433 | xargs kill -9
```

### Prisma Client not found
```bash
cd apps/runloop
npx prisma generate
```

### Go module issues
```bash
cd apps/runloop-engine
go mod tidy
go mod download
```

---

## Additional Resources

- [Development Setup Guide](./docs/development/SETUP.md)
- [Architecture Overview](./docs/architecture/OVERVIEW.md)
- [Next.js Documentation](https://nextjs.org/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Fiber Documentation](https://docs.gofiber.io/)
- [Turborepo Documentation](https://turbo.build/repo/docs)

---

*Last updated: 2026-02-24*
