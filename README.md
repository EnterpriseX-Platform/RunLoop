# 🔁 RunLoop Monorepo

> Modern Scheduler Platform for Automated Workflows

RunLoop is a powerful, developer-friendly job scheduling platform built with Next.js, Go, and PostgreSQL.

## 📚 Documentation

- [Development Setup](./docs/development/SETUP.md)
- [Architecture Overview](./docs/architecture/OVERVIEW.md)

## 🏗️ Architecture

```
http://localhost:3081/
├── /runloop/                    ← Frontend (Next.js)
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

## 🚀 Quick Start

### Docker Deployment

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

Access the application:
- **Web App**: http://localhost:3081/runloop
- **Engine API**: http://localhost:3081/runloop/proxy/engine

## 📁 Project Structure

```
RUNLOOP/
├── apps/
│   ├── runloop/                 # Next.js 14 App (port 3081)
│   │   ├── src/app/             # App Router
│   │   ├── src/components/      # React components
│   │   ├── src/context/         # Auth & Project contexts
│   │   ├── src/lib/             # Prisma, Auth utilities
│   │   └── prisma/              # Database schema
│   │
│   └── runloop-engine/          # Go Engine (port 8092)
│       ├── internal/            # Internal packages
│       └── main.go              # Entry point
│
├── docker-compose.yml
├── package.json                 # Turborepo root
└── turbo.json
```

## 🛠️ Development Commands

```bash
# Install dependencies
npm install

# Start development
npm run dev

# Database
npm run db:migrate     # Run migrations
npm run db:studio      # Open Prisma Studio
npm run db:seed        # Seed database

# Docker
npm run docker:up      # Start services
npm run docker:down    # Stop services
```

## 🔌 API Endpoints

### Internal API (/runloop/api/*)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/runloop/api/auth/login` | Login |
| POST | `/runloop/api/auth/logout` | Logout |
| GET | `/runloop/api/auth/me` | Current user |
| GET | `/runloop/api/projects` | List projects |
| POST | `/runloop/api/projects` | Create project |
| GET | `/runloop/api/metrics/dashboard` | Dashboard stats |

### Engine Proxy (/runloop/proxy/engine/*)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/runloop/proxy/engine/health` | Health check |
| GET | `/runloop/proxy/engine/api/schedulers` | List schedulers |
| POST | `/runloop/proxy/engine/api/schedulers` | Create scheduler |
| GET | `/runloop/proxy/engine/api/executions` | List executions |

## 📝 License

MIT License
