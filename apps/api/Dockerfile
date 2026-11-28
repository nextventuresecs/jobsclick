# Multi-stage Dockerfile for API
FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY apps/worker/package.json ./apps/worker/
COPY packages/database/package.json ./packages/database/
COPY packages/ui/package.json ./packages/ui/
COPY packages/validation/package.json ./packages/validation/
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @indian-job-portal/api... build
RUN pnpm --filter @indian-job-portal/api --prod deploy /prod/api \
  && cp -r /app/apps/api/dist /prod/api/dist \
  && rm -rf /prod/api/src /prod/api/Dockerfile /prod/api/tsconfig*.json

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nestjs

COPY --chown=nestjs:nodejs --from=builder /prod/api ./

USER nestjs

EXPOSE 3001
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3001/health || exit 1

CMD ["node", "dist/main.js"]
