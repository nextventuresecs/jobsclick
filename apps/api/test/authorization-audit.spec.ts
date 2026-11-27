import { describe, it, expect, beforeEach } from 'vitest';
import type { ArgumentsHost } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import {
  emitAuthorizationAuditEvent,
  getRecentAuthorizationAuditEvents,
  clearAuthorizationAuditState,
} from '../src/auth/authorization-audit.service.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { createActorAuthorizationContext, assertTenantMatchOrAdmin } from '../src/auth/authorization-context.js';

describe('ADR 0002 (AUTHZ-11): Structured Authorization Audit Logging & PII Scrubbing', () => {
  beforeEach(() => {
    clearAuthorizationAuditState();
  });

  it('scrubs JWTs, Bearer tokens, emails, and Indian phone numbers from audit events', () => {
    const fakeJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyXzEifQ.signaturepart';
    const record = emitAuthorizationAuditEvent({
      requestId: 'req-scrub-1',
      actorId: 'usr_1',
      role: 'employer',
      tenantId: 'usr_1',
      tenantType: 'business',
      action: `PUT /jobs/123?token=secret`,
      decision: 'deny',
      reasonCode: `Denied Bearer ${fakeJwt} for user@example.com phone 9876543210`,
      policyId: 'ADR-0002-TENANCY',
    });

    expect(record.action).toBe('PUT /jobs/123');
    expect(record.reasonCode).not.toContain(fakeJwt);
    expect(record.reasonCode).not.toContain('user@example.com');
    expect(record.reasonCode).not.toContain('9876543210');
    expect(record.reasonCode).toContain('[REDACTED]');
    expect(record.reasonCode).toContain('[EMAIL_REDACTED]');
    expect(record.reasonCode).toContain('[PHONE_REDACTED]');
  });

  it('captures 401 and 403 HTTP exceptions with correlation X-Request-Id header via HttpExceptionFilter', () => {
    const filter = new HttpExceptionFilter();
    const headersOut: Record<string, string> = {};
    let sentStatus = 0;

    const createHost = (method: string, url: string, user?: { id: string; role: string }) =>
      ({
        switchToHttp: () => ({
          getRequest: () => ({
            id: 'fast-req-42',
            method,
            url,
            headers: { 'x-request-id': 'corr-999' },
            user,
          }),
          getResponse: () => ({
            header: (k: string, v: string) => {
              headersOut[k] = v;
            },
            status: (code: number) => {
              sentStatus = code;
              return { send: () => undefined };
            },
          }),
        }),
      }) as unknown as ArgumentsHost;

    filter.catch(new UnauthorizedException('Invalid Bearer token'), createHost('GET', '/admin/export?includeContacts=true'));
    expect(sentStatus).toBe(401);
    expect(headersOut['X-Request-Id']).toBe('corr-999');

    filter.catch(
      new ForbiddenException({ code: 'CROSS_TENANT_ACCESS_DENIED', message: 'Denied' }),
      createHost('PUT', '/jobs/job_other', { id: 'emp_a', role: 'employer' }),
    );
    expect(sentStatus).toBe(403);

    const events = getRecentAuthorizationAuditEvents();
    expect(events).toHaveLength(2);
    expect(events[0]?.decision).toBe('deny');
    expect(events[0]?.action).toBe('GET /admin/export');
    expect(events[1]?.actorId).toBe('emp_a');
    expect(events[1]?.reasonCode).toBe('CROSS_TENANT_ACCESS_DENIED');
  });

  it('emits structured denial audit event when AuthorizationContext rejects cross-tenant access', () => {
    const ctx = createActorAuthorizationContext('emp_a', 'employer');
    expect(() => assertTenantMatchOrAdmin(ctx, 'emp_b')).toThrow(ForbiddenException);

    const events = getRecentAuthorizationAuditEvents();
    expect(events.some((e) => e.reasonCode === 'CROSS_TENANT_ACCESS_DENIED' && e.actorId === 'emp_a')).toBe(true);
  });
});
