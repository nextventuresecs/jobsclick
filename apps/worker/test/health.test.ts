import { describe, it, expect } from 'vitest';
import { getWorkerHealthStatus, reportWorkerError } from '../src/health.js';

describe('Worker Health Check & Observability', () => {
  it('returns healthy status and valid uptime', () => {
    const health = getWorkerHealthStatus();
    expect(health.status).toBe('healthy');
    expect(typeof health.uptime).toBe('number');
    expect(health.timestamp).toBeDefined();
  });

  it('captures exception for Sentry logging', () => {
    const errId = reportWorkerError(new Error('Test worker exception'));
    expect(errId).toBeDefined();
  });
});
