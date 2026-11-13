import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

const nextBin = path.resolve(__dirname, '../node_modules/next/dist/bin/next');
const webDir = path.resolve(__dirname, '..');

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runNextStart(
  envOverrides: Record<string, string | undefined>,
  options: { waitForReady?: boolean; timeoutMs?: number } = {},
): Promise<SpawnResult> {
  const { waitForReady = false, timeoutMs = 15000 } = options;
  const port = Math.floor(Math.random() * 5000) + 40000;

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    let isResolved = false;

    // Filter out ambient host env variables that could interfere
    const filteredEnv: Record<string, string | undefined> = {};
    for (const [k, v] of Object.entries(process.env)) {
      if (
        !k.startsWith('NEXT_PUBLIC_') &&
        k !== 'JWT_SECRET' &&
        k !== 'NODE_ENV' &&
        k !== 'PORT' &&
        k !== 'NEXT_PHASE'
      ) {
        filteredEnv[k] = v;
      }
    }

    const proc = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
      cwd: webDir,
      env: {
        ...filteredEnv,
        NODE_ENV: 'production',
        ...envOverrides,
      },
    });

    const timeout = setTimeout(() => {
      if (!isResolved) {
        isResolved = true;
        proc.kill('SIGKILL');
        reject(new Error(`Next.js start timed out after ${timeoutMs}ms. Output: ${stdout}\nStderr: ${stderr}`));
      }
    }, timeoutMs);

    proc.stdout?.on('data', (d: Buffer) => {
      const chunk = d.toString('utf8');
      stdout += chunk;
      if (waitForReady && (chunk.includes('Ready in') || chunk.includes('ready') || stdout.includes('Ready in'))) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeout);
          proc.kill();
          resolve({ code: 0, stdout, stderr });
        }
      }
    });

    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });

    proc.on('close', (code) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        resolve({ code, stdout, stderr });
      }
    });

    proc.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });
  });
}

describe('Next.js Production Startup Verification (Finding 4)', () => {
  it('precondition: .next production build exists', () => {
    expect(fs.existsSync(path.join(webDir, '.next/BUILD_ID'))).toBe(true);
  });

  it('fails startup with non-zero exit code when mandatory JWT_SECRET is missing', async () => {
    const result = await runNextStart({
      JWT_SECRET: '',
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[FATAL] Next.js production runtime environment validation failed');
    expect(result.stderr).toContain('JWT_SECRET must be set');
  }, 20000);

  it('fails startup when JWT_SECRET violates 64-hex format requirement', async () => {
    const result = await runNextStart({
      JWT_SECRET: 'a'.repeat(32),
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[FATAL] Next.js production runtime environment validation failed');
    expect(result.stderr).toContain('must be a 64-character hexadecimal string');
  }, 20000);

  it('fails startup when JWT_SECRET contains obvious weak repeating pattern', async () => {
    const result = await runNextStart({
      JWT_SECRET: '0'.repeat(64),
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[FATAL] Next.js production runtime environment validation failed');
    expect(result.stderr).toContain('contains an obvious weak repeating pattern');
  }, 20000);

  it('fails startup when NEXT_PUBLIC_API_URL does not use HTTPS in production', async () => {
    const result = await runNextStart({
      JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
      NEXT_PUBLIC_API_URL: 'http://insecure-api.example.com',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[FATAL] Next.js production runtime environment validation failed');
    expect(result.stderr).toContain('NEXT_PUBLIC_API_URL must use HTTPS in production');
  }, 20000);

  it('successfully starts server when valid production configuration is supplied', async () => {
    const result = await runNextStart(
      {
        JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
        NEXT_PUBLIC_API_URL: 'https://api.example.com',
        NEXT_PUBLIC_APP_URL: 'https://jobsclick.live',
      },
      { waitForReady: true, timeoutMs: 15000 },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Ready in');
  }, 20000);
});
