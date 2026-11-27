import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './decorators/current-user.decorator.js';
import { emitAuthorizationAuditEvent } from './authorization-audit.service.js';

export type AuthorizationRole = AuthUser['role'] | 'institution';
export type AuthorizationTenantType = 'business' | 'institution' | 'user' | 'platform' | 'worker';

export type AuthorizationTenantScope = Readonly<{
  type: AuthorizationTenantType;
  id: string;
}>;

export type AuthorizationContext = Readonly<{
  actorId: string;
  actorType: 'user' | 'worker';
  role: AuthorizationRole | 'worker';
  tenant: AuthorizationTenantScope;
  permissions: readonly string[];
  requestId?: string;
}>;

const DEFAULT_ROLE_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  admin: [
    'platform:admin',
    'jobs:read',
    'jobs:write',
    'applications:read',
    'applications:write',
    'placement:read',
    'placement:write',
    'bulk:read',
    'bulk:write',
  ],
  msme_admin: ['placement:read', 'bulk:read', 'bulk:write', 'reports:read'],
  employer: ['jobs:read', 'jobs:write', 'applications:read', 'applications:write', 'placement:read', 'placement:write'],
  intermediary: ['placement:read', 'placement:write', 'bulk:read', 'bulk:write', 'sponsorship:manage'],
  institution: ['placement:read', 'placement:write', 'bulk:read', 'bulk:write', 'sponsorship:manage'],
  job_seeker: ['applications:read', 'applications:write', 'placement:read', 'placement:write', 'profile:write'],
};

/**
 * Constructs a frozen server-derived AuthorizationContext from an authenticated user.
 * Fails closed when actorId or role is missing.
 */
export function createActorAuthorizationContext(
  actorId: string,
  role: string,
  options?: {
    tenant?: AuthorizationTenantScope;
    extraPermissions?: readonly string[];
    requestId?: string;
  },
): AuthorizationContext {
  if (!actorId || !actorId.trim() || !role || !role.trim()) {
    throw new ForbiddenException('Missing authenticated actor or role for authorization context');
  }

  const normalizedRole = role as AuthorizationRole;
  const basePermissions = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
  if (!basePermissions) {
    throw new ForbiddenException(`Unrecognized role "${role}" in authorization context`);
  }

  const defaultTenant: AuthorizationTenantScope =
    normalizedRole === 'admin' || normalizedRole === 'msme_admin'
      ? { type: 'platform', id: actorId }
      : normalizedRole === 'employer'
        ? { type: 'business', id: actorId }
        : normalizedRole === 'intermediary' || normalizedRole === 'institution'
          ? { type: 'institution', id: actorId }
          : { type: 'user', id: actorId };

  const tenant = options?.tenant ?? defaultTenant;
  if (!tenant.id || !tenant.id.trim()) {
    throw new ForbiddenException('Authorization context requires a valid tenant identifier');
  }

  const mergedPermissions = options?.extraPermissions
    ? Object.freeze(Array.from(new Set([...basePermissions, ...options.extraPermissions])))
    : basePermissions;

  return Object.freeze({
    actorId: actorId.trim(),
    actorType: 'user',
    role: normalizedRole,
    tenant: Object.freeze({ type: tenant.type, id: tenant.id.trim() }),
    permissions: mergedPermissions,
    ...(options?.requestId ? { requestId: options.requestId } : {}),
  });
}

/**
 * Constructs an explicit AuthorizationContext for non-interactive worker processes.
 * Worker contexts never masquerade as end users.
 */
export function createWorkerAuthorizationContext(
  workerName: string,
  permissions: readonly string[],
  requestId?: string,
): AuthorizationContext {
  if (!workerName || !workerName.trim()) {
    throw new ForbiddenException('Worker authorization context requires a non-empty worker identity');
  }

  return Object.freeze({
    actorId: `worker:${workerName.trim()}`,
    actorType: 'worker',
    role: 'worker',
    tenant: Object.freeze({ type: 'worker', id: workerName.trim() }),
    permissions: Object.freeze([...permissions]),
    ...(requestId ? { requestId } : {}),
  });
}

export function requireAuthorizationContext(ctx: AuthorizationContext | null | undefined): AuthorizationContext {
  if (!ctx || !ctx.actorId || !ctx.tenant?.id) {
    throw new ForbiddenException('Valid server-derived AuthorizationContext is required');
  }
  return ctx;
}

export function requirePermission(ctx: AuthorizationContext, permission: string): void {
  const verified = requireAuthorizationContext(ctx);
  if (verified.role === 'admin' && verified.actorType === 'user') {
    return;
  }
  if (!verified.permissions.includes(permission)) {
    emitAuthorizationAuditEvent({
      requestId: verified.requestId,
      actorId: verified.actorId,
      actorType: verified.actorType,
      role: verified.role,
      tenantId: verified.tenant.id,
      tenantType: verified.tenant.type,
      action: `permission:${permission}`,
      decision: 'deny',
      reasonCode: 'MISSING_REQUIRED_PERMISSION',
      policyId: 'ADR-0002-RBAC',
    });
    throw new ForbiddenException(`Missing required permission: ${permission}`);
  }
}

export function isPlatformAdminContext(ctx: AuthorizationContext): boolean {
  return ctx.actorType === 'user' && (ctx.role === 'admin' || ctx.role === 'msme_admin');
}

export function requireTenantScope(
  ctx: AuthorizationContext,
  allowedTypes: readonly AuthorizationTenantType[],
): AuthorizationTenantScope {
  const verified = requireAuthorizationContext(ctx);
  if (!allowedTypes.includes(verified.tenant.type)) {
    emitAuthorizationAuditEvent({
      requestId: verified.requestId,
      actorId: verified.actorId,
      actorType: verified.actorType,
      role: verified.role,
      tenantId: verified.tenant.id,
      tenantType: verified.tenant.type,
      action: 'tenant:scope_check',
      decision: 'deny',
      reasonCode: 'INVALID_TENANT_SCOPE',
      policyId: 'ADR-0002-TENANCY',
    });
    throw new ForbiddenException(`Invalid tenant scope "${verified.tenant.type}" for operation`);
  }
  return verified.tenant;
}

export function assertTenantMatchOrAdmin(ctx: AuthorizationContext, targetTenantId: string): void {
  const verified = requireAuthorizationContext(ctx);
  if (verified.actorType === 'user' && verified.role === 'admin') {
    return;
  }
  if (!targetTenantId || verified.tenant.id !== targetTenantId) {
    emitAuthorizationAuditEvent({
      requestId: verified.requestId,
      actorId: verified.actorId,
      actorType: verified.actorType,
      role: verified.role,
      tenantId: verified.tenant.id,
      tenantType: verified.tenant.type,
      resourceId: targetTenantId || null,
      action: 'tenant:ownership_check',
      decision: 'deny',
      reasonCode: 'CROSS_TENANT_ACCESS_DENIED',
      policyId: 'ADR-0002-TENANCY',
    });
    throw new ForbiddenException('Cross-tenant access denied');
  }
}
