# Indian Job Portal Platform (Monorepo)

Monorepo architecture for the Indian Job Portal platform connecting Employers, Intermediaries, and Job Seekers.

## Quickstart Setup (<5 commands)

```bash
cp .env.example .env
pnpm install
pnpm build
pnpm test
docker compose up -d
```

## Workspaces Overview

- `apps/web`: Next.js (App Router, TS, Tailwind CSS)
- `apps/api`: NestJS on Fastify adapter (`@nestjs/platform-fastify`, `nestjs-zod`, `@fastify/multipart`)
- `apps/worker`: Plain Node.js background process + BullMQ
- `packages/database`: Supabase SQL migrations & PostgreSQL schema definitions
- `packages/validation`: Shared Zod validation schemas
- `packages/ui`: Shared UI components

## Development Commands

- `pnpm dev`: Start local development across all workspaces
- `pnpm lint`: Run ESLint across all apps and packages
- `pnpm typecheck`: Run strict TypeScript compiler verification
- `pnpm test`: Execute Vitest test suite
- `pnpm build`: Build all workspaces
