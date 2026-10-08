import { describe, it, expect } from 'vitest';
import { getWorkerHealthStatus } from '../src/health.js';

describe('Worker Health Check', () => {
  it('returns healthy status and valid uptime', () => {
    const health = getWorkerHealthStatus();
    expect(health.status).toBe('healthy');
    expect(typeof health.uptime).toBe('number');
    expect(health.timestamp).toBeDefined();
  });
});
