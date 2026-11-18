const net = require('node:net');
const localHosts = new Set(['127.0.0.1', 'localhost', '::1', '[::1]', '::ffff:127.0.0.1']);
const persistentPorts = new Set([5432, 54321, 54322, 6379]);

function assertAllowedConnection(host, port) {
  if (!localHosts.has(String(host || 'localhost').toLowerCase()) || persistentPorts.has(Number(port))) {
    throw new Error('TEST_NETWORK_TARGET_DENIED');
  }
}
function assertDisposableTargets(targets, manifest) {
  try {
    if (!manifest || manifest.version !== 1 || !/^jc-auth-test-[a-f0-9]{8}$/.test(manifest.runId)) throw Error();
    const ports = [manifest.databasePort, manifest.apiPort, manifest.redisPort];
    if (new Set(ports).size !== ports.length || ports.some(port => !Number.isInteger(port) || port < 1024 || port > 65535 || persistentPorts.has(port))) throw Error();
    for (const [name, protocol, port] of [['databaseUrl', 'postgresql:', manifest.databasePort], ['apiUrl', 'http:', manifest.apiPort], ['redisUrl', 'redis:', manifest.redisPort]]) {
      const url = new URL(targets[name]);
      assertAllowedConnection(url.hostname, url.port);
      if (url.protocol !== protocol || Number(url.port) !== port || url.search || url.hash) throw Error();
    }
  } catch { throw new Error('DISPOSABLE_TEST_TARGET_REQUIRED'); }
}
function installTestNetworkFence() {
  const installed = Symbol.for('jobsclick.testNetworkFence');
  if (net.Socket.prototype[installed]) return;
  const connect = net.Socket.prototype.connect;
  net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const options = typeof first === 'object' && first !== null ? first : { port: first, host: args[1] };
    // Unix/IPC pipes have no numeric TCP port; TCP targets must pass the fence.
    if (options.port !== undefined && /^\d+$/.test(String(options.port))) assertAllowedConnection(options.host, options.port);
    return connect.apply(this, args);
  };
  Object.defineProperty(net.Socket.prototype, installed, { value: true });
}
function parseCliStatus(text) {
  try {
    const status = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (typeof status.DB_URL !== 'string' || typeof status.API_URL !== 'string') throw Error();
    return status;
  } catch { throw new Error('DISPOSABLE_CLI_STATUS_INVALID'); }
}
async function assertDisposableDatabase(connectionString, manifestPath = process.env.JOBSCLICK_TEST_MANIFEST, apiUrl) {
  let manifest;
  try {
    if (!manifestPath) throw Error();
    manifest = JSON.parse(require('node:fs').readFileSync(manifestPath, 'utf8'));
    assertDisposableTargets({ databaseUrl: connectionString, apiUrl: apiUrl || 'http://127.0.0.1:' + manifest.apiPort, redisUrl: 'redis://127.0.0.1:' + manifest.redisPort }, manifest);
  } catch { throw new Error('DISPOSABLE_TEST_TARGET_REQUIRED'); }
  const client = new (require('pg').Client)({ connectionString, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    const marker = await client.query('select run_id from test_support.run_identity');
    if (marker.rows.length !== 1 || marker.rows[0].run_id !== manifest.runId) throw Error();
  } catch { throw new Error('DISPOSABLE_TEST_DATABASE_MARKER_REQUIRED'); }
  finally { await client.end(); }
}
module.exports = { assertDisposableTargets, assertAllowedConnection, installTestNetworkFence, parseCliStatus, assertDisposableDatabase };
