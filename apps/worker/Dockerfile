# Multi-stage Dockerfile for Worker
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV PNPM_CONFIG_MINIMUM_RELEASE_AGE=0
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @indian-job-portal/worker build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 workeruser

COPY --from=builder /app /app

USER workeruser

CMD ["node", "apps/worker/dist/main.js"]
