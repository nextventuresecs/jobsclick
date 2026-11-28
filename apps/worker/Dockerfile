# Multi-stage Dockerfile for Worker
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
RUN pnpm --filter @indian-job-portal/worker... build
RUN pnpm --filter @indian-job-portal/worker --prod deploy /prod/worker \
  && cp -r /app/apps/worker/dist /prod/worker/dist \
  && rm -rf /prod/worker/src /prod/worker/Dockerfile /prod/worker/tsconfig*.json

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 workeruser

COPY --chown=workeruser:nodejs --from=builder /prod/worker ./

USER workeruser

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "const fs=require('fs'),os=require('os'),p=require('path');const f=process.env.WORKER_READY_FILE||p.join(os.tmpdir(),'jobsclick-worker-ready');const s=fs.statSync(f);if(Date.now()-s.mtimeMs>45000)process.exit(1);" || exit 1

CMD ["node", "dist/main.js"]
