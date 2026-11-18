import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import type { UserRepository } from '../src/database/repositories/user.repository.js';
import type { OtpRedisService } from '../src/auth/otp-redis.service.js';
import type { SmsGateway } from '../src/auth/sms.service.js';
import type { TurnstileVerifier } from '../src/auth/turnstile.service.js';
import type { RateLimitService } from '../src/auth/rate-limit.service.js';
import type { EmailService } from '../src/email/email.service.js';
import type { OtpGenerator } from '../src/auth/otp-generator.service.js';
import type { JwtService } from '../src/auth/jwt.service.js';

describe('AUTH-01 M1 phone-less invited legacy boundary', () => {
  it('does not hydrate or cache a legacy phone session for an email-only invited account', async () => {
    const row={id:randomUUID(),phone:null,email:'invited@example.invalid',role:'job_seeker',status:'invited',source:'disposable-fixture',token_version:0};
    const setSession=vi.fn();
    const service=new AuthService({findById:async()=>row} as unknown as UserRepository,{} as SmsGateway,{} as TurnstileVerifier,
      {getSession:async()=>undefined,setSession} as unknown as OtpRedisService,{} as RateLimitService,{} as JwtService,{} as OtpGenerator,{} as EmailService);
    await expect(service.findUserById(row.id)).resolves.toBeUndefined();
    expect(setSession).not.toHaveBeenCalled();
  });
});
