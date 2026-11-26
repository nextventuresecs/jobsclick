# Multi-stage Dockerfile for Worker
FROM node:22-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PNPM_CONFIG_MINIMUM_RELEASE_AGE=0
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

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 workeruser

COPY --chown=workeruser:nodejs --from=builder /prod/worker ./

USER workeruser

CMD ["node", "dist/main.js"]
