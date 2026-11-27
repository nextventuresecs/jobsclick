import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';

export interface RemoteSslConfig {
  rejectUnauthorized: true;
  ca: string;
  servername?: string;
}

const INSECURE_PGSSLMODES = new Set(['disable', 'allow', 'prefer', 'no-verify']);

export function isStrictNodeEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  const nodeEnv = (env.NODE_ENV ?? 'development').trim().toLowerCase();
  return nodeEnv !== 'development' && nodeEnv !== 'test';
}

export function assertStrictTlsEnv(
  options: { isRemote?: boolean; env?: NodeJS.ProcessEnv } = {},
): void {
  const env = options.env ?? process.env;
  const strict = isStrictNodeEnv(env);

  const nodeTlsReject = (env.NODE_TLS_REJECT_UNAUTHORIZED ?? '').trim().toLowerCase();
  if (nodeTlsReject === '0' || nodeTlsReject === 'false') {
    throw new Error(
      'SECURITY ABORT: NODE_TLS_REJECT_UNAUTHORIZED=0/false is forbidden. Strict TLS verification is mandatory.',
    );
  }

  const allowInsecure = (env.DB_ALLOW_INSECURE_TLS ?? '').trim().toLowerCase();
  if ((strict || options.isRemote) && (allowInsecure === 'true' || allowInsecure === '1')) {
    throw new Error('FATAL: DB_ALLOW_INSECURE_TLS is forbidden in production/staging or remote connections.');
  }

  const pgSslMode = (env.PGSSLMODE ?? '').trim().toLowerCase();
  if ((strict || options.isRemote) && pgSslMode && INSECURE_PGSSLMODES.has(pgSslMode)) {
    throw new Error(
      `SECURITY ABORT: Insecure PGSSLMODE="${pgSslMode}" is forbidden for remote or strict environments.`,
    );
  }
}

export function resolveSupabaseCaCert(rawCertOrPath?: string): string {
  const raw = (rawCertOrPath ?? '').trim();
  if (!raw) {
    throw new Error(
      'CONFIGURATION ERROR: SUPABASE_CA_CERT is required for remote database connections. Provide a valid PEM certificate or file path.',
    );
  }

  let pemContent: string;
  if (raw.includes('BEGIN CERTIFICATE')) {
    pemContent = raw.includes('\\n') && !raw.includes('\n')
      ? raw.replace(/\\n/g, '\n')
      : raw;
    pemContent = pemContent.replace(/\r\n/g, '\n').trim();
  } else {
    let stat: fs.Stats;
    try {
      stat = fs.statSync(raw);
    } catch {
      throw new Error(
        'CONFIGURATION ERROR: SUPABASE_CA_CERT file path does not exist or is not accessible.',
      );
    }
    if (!stat.isFile()) {
      throw new Error('CONFIGURATION ERROR: SUPABASE_CA_CERT path is not a regular file.');
    }
    pemContent = fs.readFileSync(raw, 'utf8').replace(/\r\n/g, '\n').trim();
  }

  const certBlocks = pemContent.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  if (!certBlocks || certBlocks.length === 0) {
    throw new Error(
      'CONFIGURATION ERROR: SUPABASE_CA_CERT does not contain a valid PEM X.509 certificate block.',
    );
  }

  for (const block of certBlocks) {
    try {
      new crypto.X509Certificate(block);
    } catch {
      throw new Error(
        'CONFIGURATION ERROR: SUPABASE_CA_CERT contains an invalid or corrupt X.509 certificate.',
      );
    }
  }

  return pemContent;
}

export function buildRemoteSslConfig(
  host: string,
  env: NodeJS.ProcessEnv = process.env,
): RemoteSslConfig {
  assertStrictTlsEnv({ isRemote: true, env });
  const ca = resolveSupabaseCaCert(env.SUPABASE_CA_CERT);
  const ssl: RemoteSslConfig = {
    rejectUnauthorized: true,
    ca,
  };
  if (net.isIP(host) === 0) {
    ssl.servername = host;
  }
  return ssl;
}
