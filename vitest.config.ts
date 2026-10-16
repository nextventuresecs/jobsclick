import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,
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
