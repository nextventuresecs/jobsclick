import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Spec 0: Static Security Scan (No Escape Hatches in Source)', () => {
  const apiAuthDir = path.resolve(__dirname, '../src/auth');
  const webAuthSessionFile = path.resolve(__dirname, '../../web/src/lib/auth-session.ts');

  it('contains zero NODE_ENV branches or test-mode bypasses in apps/api/src/auth/', () => {
    const authFiles = fs.readdirSync(apiAuthDir).filter((f) => f.endsWith('.ts'));
    const offendingPatterns = [
      /process\.env\['NODE_ENV'\]\s*===\s*['"]test['"]/i,
      /process\.env\['NODE_ENV'\]\s*===\s*['"]development['"]/i,
      /rawEnv\s*===\s*['"]test['"]/i,
      /rawEnv\s*===\s*['"]development['"]/i,
      /isDevOrTest/i,
      /isTestMode/i,
    ];

    const violations: string[] = [];
    for (const file of authFiles) {
      const content = fs.readFileSync(path.join(apiAuthDir, file), 'utf8');
      for (const pattern of offendingPatterns) {
        if (pattern.test(content)) {
          violations.push(`File ${file} matches forbidden escape hatch pattern: ${pattern}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it('contains zero mock/sandbox gateway branching in apps/api/src/auth/sms.service.ts', () => {
    const smsFile = path.join(apiAuthDir, 'sms.service.ts');
    const content = fs.readFileSync(smsFile, 'utf8');

    expect(content).not.toMatch(/gatewayMode\s*===\s*['"]mock['"]/i);
    expect(content).not.toMatch(/gatewayMode\s*===\s*['"]sandbox['"]/i);
    expect(content).not.toMatch(/mock handler/i);
    expect(content).not.toMatch(/dummy-msg91-key/i);
  });

  it('contains zero fallback plaintext secret literal in apps/web/src/lib/auth-session.ts', () => {
    const content = fs.readFileSync(webAuthSessionFile, 'utf8');

    expect(content).not.toContain('jobsclick-jwt-secret-key-32-chars-min');
    expect(content).not.toMatch(/return\s+['"][a-zA-Z0-9_-]{20,}['"]/);
  });

  it('enforces required constructor dependencies in AuthService (no @Optional or ?? new)', () => {
    const authServiceFile = path.join(apiAuthDir, 'auth.service.ts');
    const content = fs.readFileSync(authServiceFile, 'utf8');

    // Constructor should not mark core providers with @Optional()
    expect(content).not.toMatch(/@Optional\(\)\s*@Inject\(TurnstileVerifier\)/);
    expect(content).not.toMatch(/@Optional\(\)\s*@Inject\(SmsGateway\)/);
    expect(content).not.toMatch(/@Optional\(\)\s*@Inject\(OtpRedisService\)/);
    expect(content).not.toMatch(/@Optional\(\)\s*@Inject\(JwtService\)/);
    expect(content).not.toMatch(/@Optional\(\)\s*@Inject\(RateLimitService\)/);

    // Constructor body should not use fallback instantiation
    expect(content).not.toContain('?? new OtpRedisService()');
    expect(content).not.toContain('?? new JwtService()');
    expect(content).not.toContain('?? new RateLimitService(');
  });
});
