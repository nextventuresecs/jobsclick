import { describe, it, expect, beforeAll } from 'vitest';
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import net from 'node:net';

const nextBin = path.resolve(__dirname, '../node_modules/next/dist/bin/next');
const webDir = path.resolve(__dirname, '..');

interface SpawnResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close((err) => (err ? reject(err) : resolve(port)));
    });
  });
}

async function runNextStart(
  envOverrides: Record<string, string | undefined>,
  options: {
    waitForReady?: boolean;
    timeoutMs?: number;
    checkServer?: (origin: string) => Promise<void>;
  } = {},
): Promise<SpawnResult> {
  const { waitForReady = false, timeoutMs = 30000, checkServer } = options;
  const port = await getAvailablePort();

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
        k !== 'NEXT_PHASE' &&
        k !== 'APP_ENV'
      ) {
        filteredEnv[k] = v;
      }
    }

    const proc = spawn(process.execPath, [nextBin, 'start', '-H', '127.0.0.1', '-p', String(port)], {
      cwd: webDir,
      env: {
        ...filteredEnv,
        NODE_ENV: 'production',
        APP_ENV: 'production',
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

    let checking = false;
    proc.stdout?.on('data', async (d: Buffer) => {
      const chunk = d.toString('utf8');
      stdout += chunk;
      if (!waitForReady || isResolved || checking || !stdout.includes('Ready in')) return;
      checking = true;
      try {
        await checkServer?.(`http://127.0.0.1:${port}`);
        resolve({ code: 0, stdout, stderr });
      } catch (error) {
        reject(error);
      } finally {
        isResolved = true;
        clearTimeout(timeout);
        proc.kill();
      }
    });

    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString('utf8');
    });

    proc.on('close', (code) => {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeout);
        if (waitForReady) {
          reject(new Error(`Next.js closed before readiness checks finished (exit ${code}).\n${stdout}\n${stderr}`));
        } else {
          resolve({ code, stdout, stderr });
        }
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
  beforeAll(async () => {
    const buildIdPath = path.join(webDir, '.next/BUILD_ID');
    if (!fs.existsSync(buildIdPath)) {
      if (process.env.CI) {
        throw new Error(
          'Missing Next.js production build (.next/BUILD_ID) in CI environment. Expected `pnpm build` to be executed before running test suite.',
        );
      }
      // Local environment fallback: build the web app
      console.log('[startup.integration.spec] .next/BUILD_ID not found, building web application...');
      const { execSync } = await import('node:child_process');
      execSync('npx next build', {
        cwd: webDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          APP_ENV: 'production',
          NEXT_PUBLIC_APP_ENV: 'production',
          NEXT_PUBLIC_API_URL: 'https://api.example.com',
          NEXT_PUBLIC_APP_URL: 'https://jobsclick.live',
          JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
        },
      });
    }
  }, 180000);
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
  }, 40000);

  it('fails startup when JWT_SECRET violates 64-hex format requirement', async () => {
    const result = await runNextStart({
      JWT_SECRET: 'a'.repeat(32),
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[FATAL] Next.js production runtime environment validation failed');
    expect(result.stderr).toContain('must be a 64-character hexadecimal string');
  }, 40000);

  it('fails startup when JWT_SECRET contains obvious weak repeating pattern', async () => {
    const result = await runNextStart({
      JWT_SECRET: '0'.repeat(64),
      NEXT_PUBLIC_API_URL: 'https://api.example.com',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[FATAL] Next.js production runtime environment validation failed');
    expect(result.stderr).toContain('contains an obvious weak repeating pattern');
  }, 40000);

  it('fails startup when NEXT_PUBLIC_API_URL does not use HTTPS in production', async () => {
    const result = await runNextStart({
      JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
      NEXT_PUBLIC_API_URL: 'http://insecure-api.example.com',
    });

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('[FATAL] Next.js production runtime environment validation failed');
    expect(result.stderr).toContain('NEXT_PUBLIC_API_URL must use HTTPS in production');
  }, 40000);

  it('successfully starts server when valid production configuration is supplied', async () => {
    const result = await runNextStart(
      {
        JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
        NEXT_PUBLIC_API_URL: 'https://api.example.com',
        NEXT_PUBLIC_APP_URL: 'https://jobsclick.live',
      },
      { waitForReady: true, timeoutMs: 30000 },
    );

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Ready in');
  }, 40000);

  it.each([
    ['/hi', 'भारत के कुशल कार्यबल को जोड़ना'],
    ['/hi/jobs', 'भारत में उपलब्ध नौकरियां देखें'],
  ])('renders Hindi HTML at %s on the first visit', async (route, heading) => {
    await runNextStart(
      {
        JWT_SECRET: 'de4772a0c0f3aa1c09aaa18a7ffde65b791b9a8324fe72e6465a533fa219a4b1',
        NEXT_PUBLIC_API_URL: 'https://api.example.com',
        NEXT_PUBLIC_APP_URL: 'https://jobsclick.live',
        API_URL: 'http://127.0.0.1:1',
      },
      {
        waitForReady: true,
        checkServer: async (origin) => {
          for (const headers of [undefined, { cookie: 'NEXT_LOCALE=en' }]) {
            const query = route === '/hi/jobs' ? '?keyword=welder&employmentType=Part-time' : '';
            const response = await fetch(`${origin}${route}${query}`, { headers, redirect: 'manual' });
            expect(response.status).toBe(200);
            expect(response.headers.get('link')).toContain(`https://jobsclick.live${route}>; rel="alternate"; hreflang="hi"`);
            const html = await response.text();
            expect(html.match(/<html lang="([^"]+)"/)?.[1]).toBe('hi');
            expect(html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/)?.[0]).toContain(heading);
            expect(html.includes('aria-label="नेविगेशन मेनू"')).toBe(true);
            expect(html.includes('href="/hi/how-it-works"')).toBe(true);
            if (query) {
              expect(html).toMatch(/<form\b[^>]*action="\/hi\/jobs"/);
              expect(html).toMatch(/<input\b[^>]*name="keyword"[^>]*value="welder"/);
              expect(html).toMatch(/<label\b[^>]*for="jobs-keyword"/);
              expect(html).toContain('नौकरियां अभी उपलब्ध नहीं हैं');
              expect(html).toContain('फिर कोशिश करें');
              expect(html).toContain('प्रकार: अंशकालिक');
            }
          }
        },
      },
    );
  }, 40000);
});
