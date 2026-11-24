import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';

test('BuildKit excludes local artifacts at the root and inside workspaces', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'docker-context-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const context = join(root, 'source');
  const output = join(root, 'output');
  const excluded = [
    'dump.rdb', 'apps/api/tmp.rdb', 'apps/worker/appendonlydir/redis.aof', '.scratch/state.json',
    'apps/api/scratch/state.json', 'apps/web/.env.local', 'apps/api/fixture.log',
    'apps/web/node_modules/module.js', 'supabase/.temp/state.json', 'supabase/.branches/state.json',
    'apps/web/.next/stale.js',
  ];
  const included = ['apps/api/src/main.ts', 'apps/web/.env.example', 'package.json', 'pnpm-lock.yaml'];
  for (const relative of [...excluded, ...included]) {
    const path = join(context, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, 'synthetic fixture');
  }
  copyFileSync('.dockerignore', join(context, '.dockerignore'));
  writeFileSync(join(context, 'Dockerfile'), 'FROM scratch\nCOPY . /context\n');
  execFileSync('docker', [
    'buildx', 'build', '--network', 'none', '--output', `type=local,dest=${output}`, context,
  ], { timeout: 90_000 });
  for (const path of excluded) assert.equal(existsSync(join(output, 'context', path)), false, path);
  for (const path of included) assert.equal(existsSync(join(output, 'context', path)), true, path);
});
