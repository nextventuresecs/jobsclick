import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthorizationTenantType } from './authorization-context.js';

export interface AuthorizationAuditInput {
  requestId?: string;
  actorId?: string | null;
  actorType?: 'user' | 'worker' | 'anonymous';
  role?: string | null;
  tenantId?: string | null;
  tenantType?: AuthorizationTenantType | 'unknown';
  resourceType?: string;
  resourceId?: string | null;
  action: string;
  decision: 'allow' | 'deny';
  reasonCode: string;
  policyId?: string;
}

export interface AuthorizationAuditRecord {
  eventId: string;
  timestamp: string;
  requestId: string;
  actorId: string;
  actorType: 'user' | 'worker' | 'anonymous';
  role: string;
  tenantId: string | null;
  tenantType: AuthorizationTenantType | 'unknown';
  resourceType: string;
  resourceId: string | null;
  action: string;
  decision: 'allow' | 'deny';
  reasonCode: string;
  policyId: string;
}

const MAX_RECENT_EVENTS = 200;
const DENIAL_BURST_WINDOW_MS = 60_000;
const DENIAL_BURST_THRESHOLD = 10;

const authzLogger = new Logger('AuthorizationAudit');
const recentEvents: AuthorizationAuditRecord[] = [];
const denialWindows = new Map<string, number[]>();

function sanitizeTokenAndPii(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, '[JWT_REDACTED]')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL_REDACTED]')
    .replace(/\b(?:\+?91)?[6-9]\d{9}\b/g, '[PHONE_REDACTED]')
    .slice(0, 160);
}

/**
 * Emits a zero-PII structured authorization audit event for denials and privileged actions.
 */
export function emitAuthorizationAuditEvent(input: AuthorizationAuditInput): AuthorizationAuditRecord {
  const actorId = input.actorId?.trim() || 'anonymous';
  const actorType = input.actorType ?? (actorId.startsWith('worker:') ? 'worker' : actorId === 'anonymous' ? 'anonymous' : 'user');
  const record: AuthorizationAuditRecord = {
    eventId: randomUUID(),
    timestamp: new Date().toISOString(),
    requestId: input.requestId?.trim() || randomUUID(),
    actorId,
    actorType,
    role: input.role?.trim() || 'anonymous',
    tenantId: input.tenantId ?? null,
    tenantType: input.tenantType ?? 'unknown',
    resourceType: input.resourceType?.trim() || 'api_endpoint',
    resourceId: input.resourceId ?? null,
    action: sanitizeTokenAndPii(input.action.split('?')[0] || input.action),
    decision: input.decision,
    reasonCode: sanitizeTokenAndPii(input.reasonCode),
    policyId: input.policyId || 'ADR-0002-INVARIANT-5',
  };

  recentEvents.push(record);
  if (recentEvents.length > MAX_RECENT_EVENTS) {
    recentEvents.shift();
  }

  if (record.decision === 'deny') {
    const now = Date.now();
    const bucketKey = `${record.actorId}:${record.action}`;
    const timestamps = (denialWindows.get(bucketKey) ?? []).filter((ts) => now - ts < DENIAL_BURST_WINDOW_MS);
    timestamps.push(now);
    denialWindows.set(bucketKey, timestamps);

    authzLogger.warn(JSON.stringify({ type: 'AUTHZ_AUDIT', ...record }));
    if (timestamps.length >= DENIAL_BURST_THRESHOLD) {
      authzLogger.error(
        JSON.stringify({
          type: 'AUTHZ_DENY_BURST',
          actorId: record.actorId,
          action: record.action,
          denialsInWindow: timestamps.length,
          windowMs: DENIAL_BURST_WINDOW_MS,
          policyId: record.policyId,
        }),
      );
    }
  } else {
    authzLogger.log(JSON.stringify({ type: 'AUTHZ_AUDIT', ...record }));
  }

  return record;
}

export function getRecentAuthorizationAuditEvents(): readonly AuthorizationAuditRecord[] {
  return recentEvents;
}

export function clearAuthorizationAuditState(): void {
  recentEvents.length = 0;
  denialWindows.clear();
}

@Injectable()
export class AuthorizationAuditService {
  emit(input: AuthorizationAuditInput): AuthorizationAuditRecord {
    return emitAuthorizationAuditEvent(input);
  }

  getRecent(): readonly AuthorizationAuditRecord[] {
    return getRecentAuthorizationAuditEvents();
  }
}
