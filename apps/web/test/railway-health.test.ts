import { afterEach, expect, it, vi } from 'vitest';
import { dynamic, GET } from '../src/app/api/health/route';

afterEach(() => vi.unstubAllEnvs());

it('returns the deployment ID from the web runtime without caching', async () => {
  vi.stubEnv('RAILWAY_DEPLOYMENT_ID', 'fixture-web-deployment');
  const result = GET();
  expect(dynamic).toBe('force-dynamic');
  expect(result.status).toBe(200);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(await result.json()).toEqual({ status: 'ok', deploymentId: 'fixture-web-deployment' });
});
