# Multi-stage Dockerfile for Next.js Web App
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

ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_APP_ENV
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_RAZORPAY_KEY_ID
ARG NEXT_PUBLIC_SENTRY_DSN
ARG NEXT_PUBLIC_SENTRY_ENVIRONMENT
ARG NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN

ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_APP_ENV=$NEXT_PUBLIC_APP_ENV
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=$NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID
ENV NEXT_PUBLIC_SENTRY_DSN=$NEXT_PUBLIC_SENTRY_DSN
ENV NEXT_PUBLIC_SENTRY_ENVIRONMENT=$NEXT_PUBLIC_SENTRY_ENVIRONMENT
ENV NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=$NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN

ENV NEXT_OUTPUT_STANDALONE=1
RUN pnpm --filter @indian-job-portal/web... build

FROM node:22-alpine@sha256:1314fb30ec37592d5845e5a160d522c0e680972aa534549940b8d73bde88481a AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --chown=nextjs:nodejs --from=builder /app/apps/web/.next/standalone ./
COPY --chown=nextjs:nodejs --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --chown=nextjs:nodejs --from=builder /app/apps/web/public ./apps/web/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "apps/web/server.js"]
