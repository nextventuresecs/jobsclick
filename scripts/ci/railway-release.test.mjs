import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { deployRelease, probeHttpHealth, workerIsReady, waitForEnvironment } from './railway-release.mjs';

const deployments = { api: 'api-id', web: 'web-id', worker: 'worker-id' };
const healthy = Object.fromEntries(Object.entries(deployments).map(([service, id]) => [service, { id, status: 'SUCCESS' }]));

function fixture(snapshots, probe = async () => true, environment = 'staging') {
  let round = 0;
  return {
    environment,
    deployments,
    readLatest: async (service) => snapshots[round]?.[service],
    probe,
    pause: async () => { round++; },
    attempts: snapshots.length,
  };
}

test('waits for the exact three deploys and requires two healthy rounds', async () => {
  const old = { ...healthy, api: { id: 'previous-id', status: 'SUCCESS' } };
  const building = { ...healthy, api: { id: 'api-id', status: 'BUILDING' } };
  let calls = 0;
  await waitForEnvironment(fixture([old, building, healthy, healthy, healthy], async () => ++calls !== 1));
  assert.equal(calls, 9);
});

test('fails on a crashed deployment even if the public probes would pass', async () => {
  await assert.rejects(waitForEnvironment(fixture([
    { ...healthy, worker: { id: 'worker-id', status: 'CRASHED' } },
  ])), /worker.*CRASHED/);
});

test('fails if the deployment is superseded during verification', async () => {
  await assert.rejects(waitForEnvironment(fixture([
    healthy,
    { ...healthy, web: { id: 'new-id', status: 'SUCCESS' } },
  ])), /web.*superseded/);
});

test('times out when one service never passes its probe', async () => {
  await assert.rejects(waitForEnvironment(fixture([healthy, healthy], async (service) => service !== 'worker')), /Timed out.*worker/);
});

test('supports production environment verification labels', async () => {
  await assert.rejects(
    waitForEnvironment(fixture([{ ...healthy, api: { id: 'api-id', status: 'FAILED' } }], async () => true, 'production')),
    /Production api deployment is unhealthy \(FAILED\)/,
  );
});

test('requires the HTTP response to identify the expected deployment', async () => {
  const url = new URL('https://example.test/health');
  const response = (deploymentId, status = 200) => async () => Response.json({ status: 'ok', deploymentId }, { status });
  assert.equal(await probeHttpHealth(url, 'new-id', response('old-id')), false);
  assert.equal(await probeHttpHealth(url, 'new-id', response('new-id', 503)), false);
  assert.equal(await probeHttpHealth(url, 'new-id', response('new-id')), true);
});

test('requires a fresh ready heartbeat in the exact worker deployment log', () => {
  const now = Date.parse('2026-11-23T12:00:00Z');
  const message = '[Worker Readiness] ready';
  const log = (age, text = message) => JSON.stringify({ message: text, timestamp: new Date(now - age).toISOString() });
  assert.equal(workerIsReady(log(5_000), now), true);
  assert.equal(workerIsReady(log(60_000), now), false);
  assert.equal(workerIsReady(`${log(5_000)}\n${log(1_000, '[Worker Readiness] unavailable')}`, now), false);
});

test('production requires the healthy SHA from staging, and container matrix builds api/worker/web from export', () => {
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  const production = workflow.split('  deploy-production:')[1];
  assert.match(production, /needs: \[deploy-staging\]/);
  assert.match(production, /needs\.deploy-staging\.outputs\.healthy_sha == github\.sha/);
  assert.doesNotMatch(production, /github\.event_name == 'push'/);
  const staging = workflow.split('  deploy-staging:')[1].split('  deploy-production:')[0];
  for (const job of [staging, production]) {
    assert.match(job, /github\.event_name == 'workflow_dispatch'/);
  }
  assert.match(production, /github\.event\.inputs\.deploy_target == 'production'/);
  assert.match(workflow, /deploy_target:\s*description:[^\n]+\s*type: choice/);
  assert.match(staging, /needs: \[verify, db-security-gate, db-integration, container-build\]/);

  const containerBuild = workflow.split('  container-build:')[1].split('  deploy-staging:')[0];
  for (const service of ['api', 'worker', 'web']) {
    assert.match(containerBuild, new RegExp(`- service: ${service}\\b`));
  }
  assert.equal(workflow.match(/context: \$\{\{ steps\.source\.outputs\.path \}\}/g)?.length, 1);
});

test('submits and verifies api, worker, and web for production using PRODUCTION_API_URL and PRODUCTION_WEB_URL', async () => {
  const submitCommands = [];
  const probedUrls = [];
  const sha = 'a'.repeat(40);
  const cwd = resolve('source-fixture');
  const ids = {
    api: '11111111-1111-4111-8111-111111111111',
    worker: '22222222-2222-4222-8222-222222222222',
    web: '33333333-3333-4333-8333-333333333333',
  };
  await deployRelease('production', cwd, sha, async (file, args, options) => {
    assert.equal(file, 'railway');
    assert.equal(options.cwd, cwd);
    if (args[0] === 'up') {
      submitCommands.push(args);
      const service = args[args.indexOf('--service') + 1];
      return { stdout: JSON.stringify({ deploymentId: ids[service] }) };
    }
    if (args[0] === 'deployment' && args[1] === 'list') {
      const service = args[args.indexOf('--service') + 1];
      return { stdout: JSON.stringify([{ id: ids[service], status: 'SUCCESS' }]) };
    }
    if (args[0] === 'logs') {
      assert.equal(args[1], ids.worker);
      return { stdout: JSON.stringify({ message: '[Worker Readiness] ready', timestamp: new Date().toISOString() }) };
    }
    throw new Error(`Unexpected railway command: ${args.join(' ')}`);
  }, {
    RAILWAY_TOKEN: 'fixture',
    PRODUCTION_API_URL: 'https://api.jobsclick.live',
    PRODUCTION_WEB_URL: 'https://jobsclick.live',
  }, {
    pause: async () => {},
    fetchHealth: async (url) => {
      const href = String(url);
      probedUrls.push(href);
      const deploymentId = href.startsWith('https://api.jobsclick.live') ? ids.api : ids.web;
      return Response.json({ status: 'ok', deploymentId }, { status: 200 });
    },
  });

  assert.deepEqual(submitCommands, ['api', 'worker', 'web'].map((service) => [
    'up', '.', '--path-as-root', '--service', service, '--environment', 'production',
    '--detach', '--json', '--message', `GitHub commit ${sha}`,
  ]));
  assert.ok(probedUrls.includes('https://api.jobsclick.live/health'));
  assert.ok(probedUrls.includes('https://jobsclick.live/api/health'));
});

test('production rejects missing or non-HTTPS PRODUCTION_API_URL and PRODUCTION_WEB_URL', async () => {
  const sha = 'a'.repeat(40);
  const cwd = resolve('source-fixture');
  await assert.rejects(
    deployRelease('production', cwd, sha, async () => ({ stdout: '{}' }), {
      RAILWAY_TOKEN: 'fixture',
      PRODUCTION_WEB_URL: 'https://jobsclick.live',
    }),
    /PRODUCTION_API_URL must be an HTTPS origin/,
  );
  await assert.rejects(
    deployRelease('production', cwd, sha, async () => ({ stdout: '{}' }), {
      RAILWAY_TOKEN: 'fixture',
      PRODUCTION_API_URL: 'http://api.jobsclick.live',
      PRODUCTION_WEB_URL: 'https://jobsclick.live',
    }),
    /PRODUCTION_API_URL must be an HTTPS origin/,
  );
  await assert.rejects(
    deployRelease('production', cwd, sha, async () => ({ stdout: '{}' }), {
      RAILWAY_TOKEN: 'fixture',
      PRODUCTION_API_URL: 'https://api.jobsclick.live',
    }),
    /PRODUCTION_WEB_URL must be an HTTPS origin/,
  );
});

test('production rejects mismatched deploymentId or stale worker readiness', async () => {
  const sha = 'a'.repeat(40);
  const cwd = resolve('source-fixture');
  const ids = {
    api: '11111111-1111-4111-8111-111111111111',
    worker: '22222222-2222-4222-8222-222222222222',
    web: '33333333-3333-4333-8333-333333333333',
  };
  await assert.rejects(
    deployRelease('production', cwd, sha, async (_file, args) => {
      if (args[0] === 'up') {
        const service = args[args.indexOf('--service') + 1];
        return { stdout: JSON.stringify({ deploymentId: ids[service] }) };
      }
      if (args[0] === 'deployment') {
        const service = args[args.indexOf('--service') + 1];
        return { stdout: JSON.stringify([{ id: ids[service], status: 'SUCCESS' }]) };
      }
      if (args[0] === 'logs') {
        return { stdout: JSON.stringify({ message: '[Worker Readiness] unavailable', timestamp: new Date().toISOString() }) };
      }
      throw new Error(`Unexpected command: ${args.join(' ')}`);
    }, {
      RAILWAY_TOKEN: 'fixture',
      PRODUCTION_API_URL: 'https://api.jobsclick.live',
      PRODUCTION_WEB_URL: 'https://jobsclick.live',
    }, {
      pause: async () => {},
      fetchHealth: async (url) => {
        const href = String(url);
        const deploymentId = href.startsWith('https://api.jobsclick.live') ? 'old-deployment-id' : ids.web;
        return Response.json({ status: 'ok', deploymentId }, { status: 200 });
      },
    }),
    /Timed out waiting for production health \(api, worker\)/,
  );
});

test('exports the selected commit without modified or untracked workspace files', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'release-export-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  git('init', '--quiet');
  writeFileSync(join(root, 'app.txt'), 'committed');
  git('add', 'app.txt');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test',
    '-c', `core.hooksPath=${join(root, 'no-hooks')}`, 'commit', '--quiet', '--no-gpg-sign', '-m', 'fixture');
  const commit = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'app.txt'), 'local modification');
  writeFileSync(join(root, 'dump.rdb'), 'synthetic local state');
  const githubOutput = join(root, 'github-output');

  execFileSync(process.execPath, [resolve('scripts/ci/export-release-source.mjs')], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_SHA: commit,
      GITHUB_OUTPUT: githubOutput,
      RUNNER_TEMP: root,
    },
  });
  const exported = readFileSync(githubOutput, 'utf8').trim().slice('path='.length);
  assert.deepEqual(readdirSync(exported), ['app.txt']);
  assert.equal(readFileSync(join(exported, 'app.txt'), 'utf8'), 'committed');
});
