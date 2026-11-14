import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'apps/web/src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60000,
    setupFiles: [path.resolve(__dirname, 'apps/api/test/setup.ts')],
    include: ['**/*.{test,spec,e2e-spec}.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.next/**'],
    server: {
      deps: {
        inline: [
          'qrcode',
          'react',
          'react-dom',
          '@react-pdf/renderer',
          'csv-parse',
          '@upstash/qstash',
          '@supabase/supabase-js',
          'bullmq',
          'ioredis',
          'ioredis-mock',
          '@bull-board/api',
          '@bull-board/fastify',
        ],
      },
    },
  },
});
