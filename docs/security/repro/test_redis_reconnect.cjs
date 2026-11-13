/**
 * DEF-01 Reproduction Harness: Permanent 503 Outage on Redis Network Drop
 * 
 * Verifies the defect documented in docs/audits/00-executive-summary.md and 04-battle-testing-resilience.md:
 * In apps/api/src/auth/otp-redis.service.ts (lines 205-207), the Redis client is configured with:
 *   retryStrategy() {
 *     return null;
 *   }
 * When a network blip or Redis restart occurs, ioredis calls retryStrategy(times). Returning null
 * instructs ioredis to permanently close the socket and transition status to 'end'.
 * Even after Redis is restored, all subsequent calls throw "Connection is closed" and status remains 'end'.
 */

const { execSync } = require('node:child_process');
const path = require('node:path');
function getIORedis() {
  try {
    return require('ioredis');
  } catch {
    try {
      return require(path.resolve(__dirname, '../../../node_modules/.pnpm/ioredis@5.11.1/node_modules/ioredis'));
    } catch {
      return require(path.resolve(__dirname, '../../../apps/api/node_modules/ioredis'));
    }
  }
}
const IORedis = getIORedis();

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('[DEF-01 Repro] Starting Redis reconnection harness...');
  console.log(`[DEF-01 Repro] Target Redis URL: ${REDIS_URL}`);

  // 1. Instantiate client with the exact configuration from apps/api/src/auth/otp-redis.service.ts
  let retryStrategyCallCount = 0;

  const client = new IORedis(REDIS_URL, {
    enableOfflineQueue: false,
    commandTimeout: 1000,
    maxRetriesPerRequest: 1,
    enableReadyCheck: false,
    retryStrategy(times) {
      retryStrategyCallCount++;
      console.log(`[DEF-01 Repro] retryStrategy(times=${times}) invoked -> returning null (DEF-01 behaviour)`);
      return null;
    },
  });

  client.on('error', (err) => {
    console.log(`[DEF-01 Repro] client 'error' event: ${err.message}`);
  });

  client.on('close', () => {
    console.log(`[DEF-01 Repro] client 'close' event emitted (status: ${client.status})`);
  });

  client.on('end', () => {
    console.log(`[DEF-01 Repro] client 'end' event emitted (status: ${client.status}) - permanently terminated`);
  });

  // Wait for initial connection
  console.log('[DEF-01 Repro] Step 1: Verifying initial Redis health...');
  try {
    if (client.status !== 'ready') {
      await new Promise((resolve, reject) => {
        client.once('ready', resolve);
        client.once('error', reject);
      });
    }
    const pong = await client.ping();
    console.log(`[DEF-01 Repro] Step 1 Success: Initial ping response: "${pong}", client.status="${client.status}"`);
  } catch (err) {
    console.error('[DEF-01 Repro] Failed to connect initially to Redis:', err.message);
    process.exit(1);
  }

  // 2. Simulate Redis network interruption / dropped connection
  console.log('[DEF-01 Repro] Step 2: Simulating network interruption (socket reset: ECONNRESET)...');
  client.stream.destroy(new Error('read ECONNRESET'));

  // Wait for ioredis disconnect & retryStrategy cycle
  await sleep(1500);
  console.log(`[DEF-01 Repro] Post-reset client.status = "${client.status}" (retryStrategy calls: ${retryStrategyCallCount})`);

  // 3. Restore Redis
  console.log('[DEF-01 Repro] Step 4: Restoring Redis via "docker start redis-local"...');
  try {
    execSync('docker start redis-local', { stdio: 'inherit' });
  } catch (err) {
    console.warn('[DEF-01 Repro] Could not start redis-local container:', err.message);
  }

  // Verify container is unpaused via redis-cli / docker
  await sleep(1000);
  try {
    const livePing = execSync('docker exec redis-local redis-cli ping', { encoding: 'utf8' }).trim();
    console.log(`[DEF-01 Repro] Direct verification: Redis container is UP and responding: "${livePing}"`);
  } catch (err) {
    console.warn('[DEF-01 Repro] Could not ping container directly:', err.message);
  }

  // 4. Test if the client recovers without restart
  console.log('[DEF-01 Repro] Step 5: Testing if existing client instance recovers after Redis restoration...');
  console.log(`[DEF-01 Repro] Client current status: "${client.status}"`);

  let recovered = false;
  try {
    const postRestorePing = await client.ping();
    console.log(`[DEF-01 Repro] Recovery SUCCESS: client responded with "${postRestorePing}"`);
    recovered = true;
  } catch (err) {
    console.log(`[DEF-01 Repro] Recovery FAILED: client threw: "${err.message}"`);
  }

  console.log('\n================ DEF-01 REPRODUCTION SUMMARY ================');
  console.log(`Client Status: "${client.status}"`);
  console.log(`retryStrategy() calls: ${retryStrategyCallCount}`);
  console.log(`Recovered without restart: ${recovered ? 'YES' : 'NO (CONFIRMED DEFECT)'}`);
  console.log('Conclusion: When Redis drops, retryStrategy returning null halts reconnection.');
  console.log('The client remains in status "end", permanently throwing 503 until API reboot.');
  console.log('=============================================================\n');

  // Disconnect cleanly if not already ended
  try { client.disconnect(); } catch {}
  process.exit(recovered ? 0 : 42); // Exit with 42 to indicate defect reproduced
}

main().catch((err) => {
  console.error('[DEF-01 Repro] Unexpected fatal script error:', err);
  process.exit(1);
});
