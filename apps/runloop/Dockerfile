# Multi-stage build for Next.js application.
#
# OpenSSL note: Prisma 5 auto-detects the runtime OpenSSL version. On
# node:20-alpine we need to install `openssl` explicitly in every stage
# that touches Prisma (builder + runner) so it loads the
# linux-musl-openssl-3.0.x engine binary, not the legacy 1.1.x one.
FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat openssl

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app
COPY package.json ./
RUN npm install

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Build the application
ENV NEXT_TELEMETRY_DISABLED 1
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production
ENV NEXT_TELEMETRY_DISABLED 1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built application
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Copy Prisma files for migrations. We pull the whole prisma CLI tree
# (package + bin + schema-build wasm + engines) so `npx prisma db push`
# can run from the init container without a second npm install.
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.bin ./node_modules/.bin
COPY --from=builder /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder /app/package.json ./package.json

USER nextjs

EXPOSE 3081

ENV PORT 3081
ENV HOSTNAME "0.0.0.0"

CMD ["node", "server.js"]
