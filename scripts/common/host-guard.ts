/**
 * Host Guard Utility
 * Enforces strict localhost/127.0.0.1 boundaries on test setups, destructive reset scripts,
 * and security attack drills to prevent accidental execution against remote staging/production databases.
 */

const ALLOWED_LOCALHOST_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
]);

export function extractHostFromConnectionString(connectionString: string): string {
  if (!connectionString || typeof connectionString !== 'string') {
    throw new Error('[SECURITY REFUSAL] Invalid or empty connection string provided.');
  }

  try {
    const url = new URL(connectionString);
    return url.hostname.toLowerCase();
  } catch {
    // Fallback regex matching @hostname:port or @hostname/
    const match = connectionString.match(/@([^:/]+)/);
    if (match && match[1]) {
      return match[1].toLowerCase();
    }
    throw new Error('[SECURITY REFUSAL] Failed to parse target host from connection string.');
  }
}

export function isLocalhost(connectionString: string): boolean {
  try {
    const host = extractHostFromConnectionString(connectionString);
    return ALLOWED_LOCALHOST_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function assertLocalhostOnly(connectionString: string, context: string): void {
  const host = extractHostFromConnectionString(connectionString);
  if (!ALLOWED_LOCALHOST_HOSTS.has(host)) {
    throw new Error(
      `[SECURITY REFUSAL] ${context}: Target host "${host}" is strictly FORBIDDEN! ` +
      `Destructive operations, schema/database drops, security attack drills, and test fixtures ` +
      `are permitted ONLY against localhost / 127.0.0.1. ` +
      `Refusing connection to remote or non-localhost target.`
    );
  }
}
