import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const services = ['api', 'worker', 'web'];
const pending = new Set(['BUILDING', 'DEPLOYING', 'INITIALIZING', 'NEEDS_APPROVAL', 'QUEUED', 'WAITING']);
const deploymentIdPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const readinessPrefix = '[Worker Readiness] ';

export async function probeHttpHealth(url, deploymentId, fetchHealth = fetch) {
  try {
    const response = await fetchHealth(url, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return false;
    }
    const body = await response.json();
    return body?.status === 'ok' && body.deploymentId === deploymentId;
  } catch {
    return false;
  }
}

export function workerIsReady(output, now = Date.now()) {
  let latestReady = -Infinity;
  let latestUnavailable = -Infinity;
  for (const line of output.trim().split('\n')) {
    if (!line) continue;
    const { message, timestamp } = JSON.parse(line);
    const time = Date.parse(timestamp);
    if (!Number.isFinite(time) || time > now + 10_000) continue;
    if (message === `${readinessPrefix}ready`) latestReady = Math.max(latestReady, time);
    if (message === `${readinessPrefix}unavailable`) latestUnavailable = Math.max(latestUnavailable, time);
  }
  return latestReady > latestUnavailable && now - latestReady <= 45_000;
}

export async function waitForStaging({
  deployments,
  readLatest,
  probe,
  pause = () => sleep(10_000),
  attempts = 90,
  timeoutMs = 15 * 60_000,
}) {
  const deadline = Date.now() + timeoutMs;
  const entries = Object.entries(deployments);
  const observed = new Set();
  let healthyRounds = 0;
  let waitingOn = [];

  for (let round = 0; round < attempts && Date.now() < deadline; round++) {
    const latest = await Promise.all(entries.map(([service]) => readLatest(service)));
    waitingOn = entries.flatMap(([service, id], index) => {
      const deployment = latest[index];
      if (deployment?.id !== id) {
        if (observed.has(service)) throw new Error(`Staging ${service} deployment was superseded`);
        return [service];
      }
      observed.add(service);
      const status = deployment.status;
      if (status === 'SUCCESS') return [];
      if (pending.has(status)) return [service];
      throw new Error(`Staging ${service} deployment is unhealthy (${/^[A-Z_]+$/.test(status) ? status : 'unknown status'})`);
    });

    if (waitingOn.length === 0) {
      const results = await Promise.all(entries.map(([service, id]) => probe(service, id)));
      waitingOn = entries.filter((_, index) => !results[index]).map(([service]) => service);
    }
    healthyRounds = waitingOn.length ? 0 : healthyRounds + 1;
    if (healthyRounds === 2 && Date.now() < deadline) return;
    if (round + 1 < attempts && Date.now() < deadline) await pause();
  }
  throw new Error(`Timed out waiting for staging health (${waitingOn.join(', ') || 'stable health'})`);
}

function httpsOrigin(env, setting, path) {
  const url = new URL(env[setting] ?? '');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error(`${setting} must be an HTTPS origin`);
  }
  return new URL(path, url);
}

export async function deployRelease(environment, cwd, sha, execute = run, env = process.env) {
  if (!['staging', 'production'].includes(environment) || !cwd || !/^[a-f\d]{40}$/i.test(sha ?? '') || !env.RAILWAY_TOKEN) {
    throw new Error('Release requires an environment, exported source directory, commit SHA, and Railway project token');
  }
  const urls = environment === 'staging' ? {
    api: httpsOrigin(env, 'STAGING_API_URL', '/health'),
    web: httpsOrigin(env, 'STAGING_WEB_URL', '/api/health'),
  } : null;
  const railway = async (args, label, timeout = 30_000) => {
    try {
      const { stdout } = await execute('railway', args, { cwd, env, timeout, maxBuffer: 2 * 1024 * 1024 });
      return stdout;
    } catch {
      throw new Error(`Railway command failed: ${label}`);
    }
  };
  const deployments = {};
  for (const service of services) {
    const output = await railway([
      'up', '.', '--path-as-root', '--service', service, '--environment', environment,
      '--detach', '--json', '--message', `GitHub commit ${sha}`,
    ], `submit ${service}`, 180_000);
    const { deploymentId } = JSON.parse(output);
    if (typeof deploymentId !== 'string' || !deploymentIdPattern.test(deploymentId)) {
      throw new Error(`Railway did not return a deployment ID for ${service}`);
    }
    deployments[service] = deploymentId;
    console.log(`Submitted ${environment} ${service} deployment ${deploymentId}`);
  }
  if (!urls) return;

  await waitForStaging({
    deployments,
    readLatest: async (service) => {
      const output = await railway([
        'deployment', 'list', '--service', service, '--environment', environment,
        '--limit', '1', '--json',
      ], `read ${service} deployment status`);
      return JSON.parse(output)[0];
    },
    probe: async (service, id) => service === 'worker'
      ? workerIsReady(await railway(['logs', id, '--deployment', '--lines', '200', '--json'], 'read worker readiness'))
      : probeHttpHealth(urls[service], id),
  });
  console.log(`Railway staging passed health checks for ${sha}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  deployRelease(...process.argv.slice(2)).catch((error) => {
    console.error(error instanceof SyntaxError ? 'Railway returned unexpected JSON' : error.message);
    process.exitCode = 1;
  });
}
