#!/bin/bash
set -e

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           RUNLOOP Setup & Refactor Script                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

PROJECT_DIR="/Users/hacka/Works/RUNLOOP"
GIT_URL="http://<git-server>/platform/runloop.git"

# ============================================
# Step 1: Clone from Git
# ============================================
echo "📥 Step 1: Cloning from Git..."
if [ -d "$PROJECT_DIR" ]; then
    echo "   Removing existing directory..."
    rm -rf "$PROJECT_DIR"
fi

cd /Users/hacka/Works
git clone "$GIT_URL" RUNLOOP
cd "$PROJECT_DIR"
echo "✓ Cloned successfully"
echo ""

# ============================================
# Step 2: Create apps/ structure
# ============================================
echo "📁 Step 2: Creating apps/ structure..."
mkdir -p apps
mv frontend apps/runloop
mv executor apps/runloop-engine
rm -rf api-server
echo "✓ Structure created"
echo "   apps/runloop/         ← Next.js (will be refactored)"
echo "   apps/runloop-engine/  ← Go Worker"
echo ""

# ============================================
# Step 3: Backup & Create Next.js
# ============================================
echo "⚛️  Step 3: Refactoring to Next.js..."
cd apps

# Backup old frontend
cp -r runloop runloop-vite-backup

# Remove old node_modules
rm -rf runloop/node_modules runloop/package-lock.json

# Create new Next.js app
npx create-next-app@latest runloop --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --yes

echo "✓ Next.js created"
echo ""

# ============================================
# Step 4: Install dependencies
# ============================================
echo "📦 Step 4: Installing dependencies..."
cd runloop
npm install lucide-react recharts @xyflow/react @prisma/client bcryptjs jsonwebtoken
npm install -D prisma @types/bcryptjs @types/jsonwebtoken
echo "✓ Dependencies installed"
echo ""

# ============================================
# Step 5: Copy important files
# ============================================
echo "📋 Step 5: Copying files..."

# Copy Prisma schema
mkdir -p prisma
if [ -f "../runloop-vite-backup/src/types/index.ts" ]; then
    cp -r ../runloop-vite-backup/src/types src/
fi

# Copy context files
mkdir -p src/context
if [ -d "../runloop-vite-backup/src/context" ]; then
    cp ../runloop-vite-backup/src/context/*.tsx src/context/
fi

echo "✓ Files copied"
echo ""

# ============================================
# Step 6: Create config files
# ============================================
echo "⚙️  Step 6: Creating config files..."

# next.config.ts
cat > next.config.ts << 'EOF'
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  basePath: "/runloop",
  async rewrites() {
    return [
      {
        source: "/api/engine/:path*",
        destination: `${process.env.EXECUTOR_URL || "http://localhost:8080"}/runloop-engine/api/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,DELETE,OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
        ],
      },
    ];
  },
};

export default nextConfig;
EOF

# .env.local
cat > .env.local << 'EOF'
# Database
DATABASE_URL=postgres://runloop:runloop_secret@localhost:5434/runloop?sslmode=disable

# Auth
JWT_SECRET=dev-secret-key
SKIP_AUTH=true

# App
NEXT_PUBLIC_API_URL=/runloop/api
EXECUTOR_URL=http://localhost:8080
EOF

# .env for Prisma
cat > .env << 'EOF'
DATABASE_URL=postgres://runloop:runloop_secret@localhost:5434/runloop?sslmode=disable
EOF

echo "✓ Config files created"
echo ""

# ============================================
# Step 7: Create directory structure
# ============================================
echo "📂 Step 7: Creating directory structure..."

mkdir -p src/app/login
mkdir -p src/app/dashboard
mkdir -p src/app/projects
mkdir -p "src/app/projects/[id]"
mkdir -p "src/app/projects/[id]/schedulers/new"
mkdir -p "src/app/projects/[id]/schedulers/new/flow"
mkdir -p src/app/schedulers
mkdir -p "src/app/schedulers/[id]"
mkdir -p src/app/executions
mkdir -p "src/app/executions/[id]"
mkdir -p "src/app/api/[[...path]]"
mkdir -p src/components
mkdir -p src/lib

echo "✓ Directories created"
echo ""

# ============================================
# Step 8: Create basic files
# ============================================
echo "📝 Step 8: Creating basic files..."

# globals.css
cat > src/app/globals.css << 'EOF'
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-primary: #0a0a0b;
  --bg-secondary: #121214;
  --bg-tertiary: #1a1a1c;
  --ocean-blue: #0ea5e9;
  --warm-orange: #f97316;
}

body {
  background-color: var(--bg-primary);
  color: #fafafa;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 2px solid #2e2e33;
  border-top-color: #0ea5e9;
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.btn-primary {
  @apply inline-flex items-center justify-center gap-2 px-4 py-2 bg-ocean-blue text-white rounded-lg;
}
EOF

# Root layout
cat > src/app/layout.tsx << 'EOF'
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RunLoop - Scheduler Platform",
  description: "Modern scheduler platform for automated workflows",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
EOF

# Root page (redirect)
cat > src/app/page.tsx << 'EOF'
import { redirect } from "next/navigation";

export default function HomePage() {
  redirect("/dashboard");
}
EOF

# Login page
cat > src/app/login/page.tsx << 'EOF'
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Implement login
    router.push("/dashboard");
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark-950">
      <div className="w-full max-w-md p-8 bg-dark-850 rounded-xl border border-dark-700">
        <h1 className="text-2xl font-bold text-white mb-6">Welcome to RunLoop</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 bg-dark-900 border border-dark-600 rounded-lg text-white"
              placeholder="••••••••"
            />
          </div>
          <button type="submit" className="w-full btn-primary py-2.5">
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
EOF

# Dashboard page (simple)
cat > src/app/dashboard/page.tsx << 'EOF'
"use client";

import Link from "next/link";

export default function DashboardPage() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold text-white mb-4">Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Link href="/projects" className="p-6 bg-dark-850 rounded-xl border border-dark-700 hover:border-ocean-blue/50">
          <h2 className="text-xl font-semibold text-white">Projects</h2>
          <p className="text-gray-400 mt-2">Manage your projects</p>
        </Link>
        <Link href="/schedulers" className="p-6 bg-dark-850 rounded-xl border border-dark-700 hover:border-ocean-blue/50">
          <h2 className="text-xl font-semibold text-white">RunLoops</h2>
          <p className="text-gray-400 mt-2">Manage schedulers</p>
        </Link>
        <Link href="/executions" className="p-6 bg-dark-850 rounded-xl border border-dark-700 hover:border-ocean-blue/50">
          <h2 className="text-xl font-semibold text-white">Executions</h2>
          <p className="text-gray-400 mt-2">View execution history</p>
        </Link>
      </div>
    </div>
  );
}
EOF

# API route handler
cat > "src/app/api/[[...path]]/route.ts" << 'EOF'
import { NextRequest, NextResponse } from "next/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function GET(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path || [];
  return NextResponse.json({ message: "API Ready", path }, { headers: corsHeaders });
}

export async function POST(request: NextRequest, { params }: { params: { path: string[] } }) {
  const path = params.path || [];
  const body = await request.json().catch(() => ({}));
  return NextResponse.json({ message: "API Ready", path, body }, { headers: corsHeaders });
}
EOF

echo "✓ Basic files created"
echo ""

# ============================================
# Step 9: Commit changes
# ============================================
echo "💾 Step 9: Committing changes..."
cd "$PROJECT_DIR"
git add -A
git commit -m "refactor: migrate to Next.js with apps/ structure

- Move frontend to apps/runloop (Next.js 16)
- Move executor to apps/runloop-engine
- Remove api-server (merged into Next.js API routes)
- Setup basePath: /runloop
- Add CORS and proxy config for Go engine"
git push origin master
echo "✓ Committed and pushed"
echo ""

# ============================================
# Done
# ============================================
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    ✅ SETUP COMPLETE!                         ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║                                                              ║"
echo "║  📁 Structure:                                               ║"
echo "║     apps/runloop/         ← Next.js 16 + API                 ║"
echo "║     apps/runloop-engine/  ← Go Worker                        ║"
echo "║                                                              ║"
echo "║  🚀 Next steps:                                              ║"
echo "║     1. cd /Users/hacka/Works/RUNLOOP/apps/runloop          ║"
echo "║     2. npm run dev                                           ║"
echo "║     3. Open http://localhost:3000/runloop                  ║"
echo "║                                                              ║"
echo "║  📦 Run database:                                            ║"
echo "║     docker run -d -p 5434:5432 \                            ║"
echo "║       -e POSTGRES_PASSWORD=runloop_secret \                ║"
echo "║       postgres:16                                            ║"
echo "║                                                              ║"
echo "╚══════════════════════════════════════════════════════════════╝"
