import { vi } from 'vitest';
import { Module } from '@nestjs/common';
import { AuthController } from '../../src/auth/auth.controller.js';
import { AuthService } from '../../src/auth/auth.service.js';
import { JwtService } from '../../src/auth/jwt.service.js';
import { OtpRedisService } from '../../src/auth/otp-redis.service.js';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../src/auth/guards/roles.guard.js';
import { JobsController } from '../../src/jobs/jobs.controller.js';
import { JobsService } from '../../src/jobs/jobs.service.js';
import { ProfilesController } from '../../src/profiles/profiles.controller.js';
import { ProfilesService } from '../../src/profiles/profiles.service.js';
import { InstitutionCmsService } from '../../src/profiles/institution-cms.service.js';

export const id = '12345678-1234-4234-8234-123456789012';
export const jwt = new JwtService();
export let role = 'job_seeker', status = 'active', tokenVersion = 0;
const revoked = new Set<string>();
const redis = {
  isUserCacheTrusted: () => true,
  getAuthState: vi.fn(async () => ({ role, status, tokenVersion })),
  isAccessTokenRevoked: vi.fn(async (jti: string) => revoked.has(jti)),
  revokeAccessToken: vi.fn(async (jti: string) => { revoked.add(jti); }),
};
const auth = {
  verifyOtp: vi.fn(async () => ({ success: true, accessToken: await jwt.signAccessToken(id, 0, { role, status }), user: { id, role, status } })),
  revokeAllUserSessions: vi.fn(async () => { tokenVersion++; return { success: true }; }),
};
export const apply = vi.fn(async (applicantId: string) => ({ applicantId, status: 'applied' }));

@Module({ controllers: [AuthController, ProfilesController, JobsController], providers: [
  JwtService, JwtAuthGuard, RolesGuard,
  { provide: AuthService, useValue: auth }, { provide: OtpRedisService, useValue: redis },
  { provide: JobsService, useValue: { applyToJob: apply } },
  { provide: ProfilesService, useValue: { getSeekerProfileMe: async (userId: string) => ({ userId, fullName: 'Candidate' }) } },
  { provide: InstitutionCmsService, useValue: {} },
] })
export class PipelineModule {}


export function changeState(next: { role?: string; status?: string; tokenVersion?: number }) {
  if (next.role !== undefined) role = next.role;
  if (next.status !== undefined) status = next.status;
  if (next.tokenVersion !== undefined) tokenVersion = next.tokenVersion;
}
