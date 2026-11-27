import type { ClientConfig } from 'pg';
import pg from 'pg';
import { assertStrictTlsEnv, buildRemoteSslConfig, isStrictNodeEnv } from './db-tls.ts';

const { Client } = pg;

export const TARGET_STAGING_PROJECT_REF = 'afxgvtfaofpnlhdsexnp';
export const FORBIDDEN_OLD_PROJECT_REF = 'aspahsnclunutwiqliau';

export type DbTargetEnvironment = 'staging' | 'production';

export interface ParseDbUrlOptions {
  environment: DbTargetEnvironment;
  expectedProjectRef: string;
  confirmedProjectRef?: string;
  forbiddenProjectRefs?: string[];
  allowlist?: string[];
  allowLocalhost?: boolean;
  env?: NodeJS.ProcessEnv;
}

const LOCALHOST_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '0.0.0.0']);
const FORBIDDEN_QUERY_PARAMS = new Set([
  'ssl',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'sslcrl',
  'options',
  'statement_timeout',
  'lock_timeout',
  'idle_in_transaction_session_timeout',
]);
const INSECURE_SSLMODES = new Set(['disable', 'allow', 'prefer', 'no-verify']);
const SAFE_DB_NAME_RE = /^[a-zA-Z0-9_-]+$/;

export function sanitizeErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  return raw.replace(/postgres(?:ql)?:\/\/[^\s'"]+/gi, 'postgresql://[REDACTED]');
}

function parseRawPostgresUrl(rawUrl: string): URL {
  let url = rawUrl.trim();
  if (!url) {
    throw new Error('CONFIGURATION ERROR: Database URL is required and cannot be empty.');
  }
  if ((url.startsWith('"') && url.endsWith('"')) || (url.startsWith("'") && url.endsWith("'"))) {
    url = url.slice(1, -1).trim();
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    const protoMatch = url.match(/^([^:]+):\/\//);
    if (!protoMatch) {
      throw new Error('Invalid database URL format');
    }
    const scheme = protoMatch[1];
    const remainder = url.slice(protoMatch[0].length);
    const atIdx = remainder.lastIndexOf('@');
    if (atIdx === -1) {
      throw new Error('Invalid database URL format');
    }
    const auth = remainder.slice(0, atIdx);
    const hostPath = remainder.slice(atIdx + 1);
    const colonIdx = auth.indexOf(':');
    if (colonIdx === -1) {
      throw new Error('Invalid database URL format');
    }
    const user = auth.slice(0, colonIdx);
    const rawPass = auth.slice(colonIdx + 1);
    try {
      parsed = new URL(`${scheme}://${user}:${encodeURIComponent(rawPass)}@${hostPath}`);
    } catch {
      throw new Error('Invalid database URL format');
    }
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error(
      `CONFIGURATION ERROR: Unsupported database protocol "${parsed.protocol}". Expected postgresql:// or postgres://.`,
    );
  }

  return parsed;
}

export function validateFinalClientConfig(config: ClientConfig, isRemote: boolean): void {
  if (!config.host || typeof config.host !== 'string') {
    throw new Error('CONFIGURATION ERROR: Valid database host is required.');
  }
  if (typeof config.port !== 'number' || !Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    throw new Error('CONFIGURATION ERROR: Valid database port (1-65535) is required.');
  }
  if (!config.user || typeof config.user !== 'string') {
    throw new Error('CONFIGURATION ERROR: Database username is required.');
  }
  if (!config.database || typeof config.database !== 'string') {
    throw new Error('CONFIGURATION ERROR: Database name is required.');
  }
  if (isRemote) {
    if (config.port !== 5432) {
      throw new Error(`SECURITY ABORT: Remote database migrations require port 5432. Found ${config.port}.`);
    }
    if (!config.password || typeof config.password !== 'string') {
      throw new Error('SECURITY ABORT: Database password is required for remote connections.');
    }
    if (
      typeof config.ssl !== 'object' ||
      config.ssl === null ||
      config.ssl.rejectUnauthorized !== true ||
      typeof config.ssl.ca !== 'string' ||
      !config.ssl.ca.includes('BEGIN CERTIFICATE')
    ) {
      throw new Error('SECURITY ABORT: Remote connections require strict TLS (rejectUnauthorized: true and valid CA).');
    }
  }
}

export function createValidatedPgClient(config: ClientConfig): pg.Client {
  const isRemote = !LOCALHOST_HOSTS.has((config.host ?? '').toLowerCase());
  validateFinalClientConfig(config, isRemote);
  return new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: config.ssl,
    statement_timeout: config.statement_timeout ?? 60000,
    query_timeout: config.query_timeout ?? 60000,
    connectionTimeoutMillis: config.connectionTimeoutMillis ?? 10000,
  });
}

export function parseAndValidateDbUrl(rawUrl: string, options: ParseDbUrlOptions): ClientConfig {
  const env = options.env ?? process.env;
  const parsed = parseRawPostgresUrl(rawUrl);

  const host = parsed.hostname.toLowerCase();
  if (!host) {
    throw new Error('CONFIGURATION ERROR: Database URL is missing a hostname.');
  }

  const rawPort = parsed.port || '5432';
  if (!/^\d+$/.test(rawPort)) {
    throw new Error(`CONFIGURATION ERROR: Invalid database port "${rawPort}".`);
  }
  const port = parseInt(rawPort, 10);
  if (port < 1 || port > 65535) {
    throw new Error(`CONFIGURATION ERROR: Database port ${port} is out of valid range (1-65535).`);
  }

  const isLocalHost = LOCALHOST_HOSTS.has(host);
  const allowlist = (options.allowlist ?? []).map((h) => h.toLowerCase());
  const isAllowlisted = allowlist.includes(host);
  const expectedRef = options.expectedProjectRef.trim();
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  const dbName = parsed.pathname.replace(/^\/+/, '') || 'postgres';

  if (!SAFE_DB_NAME_RE.test(dbName)) {
    throw new Error(`CONFIGURATION ERROR: Invalid database name "${dbName}".`);
  }
  if (!user) {
    throw new Error('CONFIGURATION ERROR: Database username is required.');
  }

  // Reject connection-string parameter overrides
  for (const [key, value] of parsed.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    const lowerVal = value.toLowerCase();
    if (lowerKey === 'sslmode') {
      if (INSECURE_SSLMODES.has(lowerVal)) {
        throw new Error(`SECURITY ABORT: Connection string parameter sslmode=${value} is forbidden.`);
      }
      continue;
    }
    if (FORBIDDEN_QUERY_PARAMS.has(lowerKey)) {
      throw new Error(`SECURITY ABORT: Connection string parameter "${key}" cannot override validated client config.`);
    }
  }

  // Reject forbidden/cross-environment project references
  const forbiddenRefs = new Set<string>([
    FORBIDDEN_OLD_PROJECT_REF,
    ...(options.forbiddenProjectRefs ?? []),
  ].filter(Boolean));

  const urlLower = rawUrl.toLowerCase();
  for (const forbiddenRef of forbiddenRefs) {
    const refLower = forbiddenRef.toLowerCase();
    if (
      urlLower.includes(refLower) ||
      user.toLowerCase().includes(refLower) ||
      host.includes(refLower)
    ) {
      const label = options.environment === 'production'
        ? `Production connection string references staging/forbidden project ref "${forbiddenRef}". Expected production project ref "${expectedRef}".`
        : `Connection string references deprecated/forbidden ${options.environment} project ref "${forbiddenRef}". Target ${options.environment} project ref must be "${expectedRef}".`;
      throw new Error(`SECURITY ABORT: ${label}`);
    }
  }

  // Reject transaction pooler port 6543 everywhere
  if (port === 6543) {
    throw new Error(
      'CONFIGURATION ERROR: Port 6543 is a transaction-mode PgBouncer/Supavisor pooler and does NOT support DDL schema migrations or session advisory locks. Please use direct connection or session pooler on port 5432.',
    );
  }

  // Localhost policy
  if (isLocalHost) {
    const strictDeployment = isStrictNodeEnv(env) || env.CI_DEPLOY_TARGET === options.environment;
    if (options.environment === 'production' && !isAllowlisted) {
      throw new Error(`SECURITY ABORT: Refusing to run production bootstrap against local host "${host}".`);
    }
    if (options.allowLocalhost === false || (strictDeployment && !isAllowlisted)) {
      throw new Error(
        `SECURITY ABORT: Localhost target "${host}" is forbidden in strict ${options.environment} deployment mode.`,
      );
    }
  }

  // Remote host, credentials, confirmation, and tenant validation
  if (!isLocalHost) {
    const confirmedRef = options.confirmedProjectRef?.trim();
    if (!confirmedRef || confirmedRef !== expectedRef) {
      throw new Error(
        `SECURITY CONFIRMATION REQUIRED: Target is a remote host (${host}). You must explicitly provide --confirm-project-ref ${expectedRef} to proceed.`,
      );
    }

    if (!password) {
      throw new Error('SECURITY ABORT: Database password is required for remote connections.');
    }

    const expectedDirectHost = `db.${expectedRef}.supabase.co`;
    const isDirectAllowed = host === expectedDirectHost && port === 5432;
    const isPoolerHost = host.endsWith('.pooler.supabase.com');
    const isExpectedPoolerUser = user === `postgres.${expectedRef}`;
    const isAllowedDirectUser = user === 'postgres' || user === `postgres.${expectedRef}`;

    if (isPoolerHost) {
      if (!isExpectedPoolerUser) {
        throw new Error(
          `SECURITY ABORT: Pooler tenant mismatch. Connected user is "${user}", but expected user for ${options.environment} pooler is "postgres.${expectedRef}".`,
        );
      }
      if (port !== 5432) {
        const envTitle = options.environment.charAt(0).toUpperCase() + options.environment.slice(1);
        throw new Error(
          `SECURITY ABORT: ${envTitle} pooler must connect via Session Mode on port 5432. Found port ${port}.`,
        );
      }
    } else if (isDirectAllowed) {
      if (!isAllowedDirectUser) {
        throw new Error(
          `SECURITY ABORT: Unexpected database username "${user}" for direct Supabase host "${host}".`,
        );
      }
    } else if (!isAllowlisted) {
      throw new Error(
        `SECURITY ABORT: Host "${host}" is not permitted. Only project ref "${expectedRef}" direct host (${expectedDirectHost}:5432) or session pooler (*.pooler.supabase.com:5432 with user "postgres.${expectedRef}") is allowed.`,
      );
    }
  }

  // TLS configuration
  assertStrictTlsEnv({ isRemote: !isLocalHost, env });
  const ssl = isLocalHost ? false : buildRemoteSslConfig(host, env);

  // Strip any ssl* query params from normalized connectionString
  const normalizedUrl = new URL(parsed.toString());
  for (const key of ['sslmode', 'ssl', 'sslcert', 'sslkey', 'sslrootcert', 'sslcrl']) {
    normalizedUrl.searchParams.delete(key);
  }

  const config: ClientConfig = {
    connectionString: normalizedUrl.toString(),
    host,
    port,
    user,
    password,
    database: dbName,
    ssl,
    statement_timeout: 60000,
    query_timeout: 60000,
    connectionTimeoutMillis: 10000,
  };

  validateFinalClientConfig(config, !isLocalHost);
  return config;
}
