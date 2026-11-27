import net from 'node:net';

/**
 * Normalizes an IP address for rate-limiting and quota tracking:
 * - IPv4: preserved as canonical dotted-quad (e.g. "192.168.1.1").
 * - IPv4-mapped IPv6 (::ffff:a.b.c.d or ::ffff:hex:hex): stripped to pure IPv4 ("a.b.c.d").
 * - IPv6: normalized to its /64 prefix in lowercase (e.g. "2001:db8:abcd:12::/64") to group
 *   residential and mobile /64 subnets together. Uppercase hex is canonicalized.
 * - IPv6 Zone ID (e.g. "fe80::1%eth0"): stripped before normalization.
 * - Loopback (::1, 127.0.0.1): preserved.
 */
export function normalizeIp(rawIp: string): string {
  if (!rawIp || typeof rawIp !== 'string') {
    return '0.0.0.0';
  }

  // Strip IPv6 zone ID if present (e.g. fe80::1%eth0 -> fe80::1)
  const withoutZone = rawIp.split('%')[0]!.trim();

  // 1. Check for standard IPv4-mapped IPv6 dotted-quad (e.g., ::ffff:192.168.1.1)
  const v4MappedMatch = withoutZone.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i);
  if (v4MappedMatch && v4MappedMatch[1]) {
    return v4MappedMatch[1];
  }

  // 2. Check for hex IPv4-mapped IPv6 (e.g., ::ffff:7f00:1 -> 127.0.0.1)
  const v4HexMatch = withoutZone.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (v4HexMatch && v4HexMatch[1] && v4HexMatch[2]) {
    const p1 = parseInt(v4HexMatch[1], 16);
    const p2 = parseInt(v4HexMatch[2], 16);
    const b1 = (p1 >> 8) & 0xff;
    const b2 = p1 & 0xff;
    const b3 = (p2 >> 8) & 0xff;
    const b4 = p2 & 0xff;
    return `${b1}.${b2}.${b3}.${b4}`;
  }

  const ipType = net.isIP(withoutZone);
  if (ipType === 4) {
    return withoutZone;
  }

  if (ipType === 6) {
    if (withoutZone === '::1') {
      return '::1';
    }

    // Expand IPv6 address to 8 distinct 16-bit segments
    const segments = expandIpv6(withoutZone);
    if (segments && segments.length === 8) {
      // First 4 segments represent the /64 prefix
      const prefixSegments = segments.slice(0, 4).map((s) => parseInt(s, 16).toString(16));
      return `${prefixSegments.join(':')}::/64`;
    }
    return withoutZone.toLowerCase();
  }

  return withoutZone;
}

function expandIpv6(ip: string): string[] | null {
  try {
    const parts = ip.split('::');
    if (parts.length > 2) return null; // Invalid multiple ::

    let left: string[] = [];
    let right: string[] = [];

    if (parts[0]) {
      left = parts[0].split(':').filter(Boolean);
    }

    if (parts.length === 2 && parts[1]) {
      right = parts[1].split(':').filter(Boolean);
    }

    const missingCount = 8 - (left.length + right.length);
    if (missingCount < 0) return null;

    const middle = Array<string>(missingCount).fill('0');
    return [...left, ...middle, ...right];
  } catch {
    return null;
  }
}

function ipv4ToNumber(ip: string): number {
  return ip.split('.').reduce((acc, octet) => ((acc << 8) + Number(octet)) >>> 0, 0);
}

function ipv6ToBigInt(ip: string): bigint | null {
  const segments = expandIpv6(ip);
  if (!segments || segments.length !== 8) return null;
  let val = 0n;
  for (const seg of segments) {
    val = (val << 16n) + BigInt(parseInt(seg, 16));
  }
  return val;
}

export function isIpInCidr(rawIp: string, cidr: string): boolean {
  const ip = (rawIp || '').split('/')[0]!.trim();
  const [targetIp, prefixStr] = cidr.split('/');
  if (!targetIp) return false;

  const targetIpType = net.isIP(targetIp);
  const checkIpType = net.isIP(ip);
  if (targetIpType === 0 || targetIpType !== checkIpType) return false;

  if (prefixStr === undefined) {
    return ip.toLowerCase() === targetIp.toLowerCase();
  }

  const prefix = Number(prefixStr);
  if (targetIpType === 4) {
    const ipNum = ipv4ToNumber(ip);
    const targetNum = ipv4ToNumber(targetIp);
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipNum & mask) === (targetNum & mask);
  } else {
    const ipBig = ipv6ToBigInt(ip);
    const targetBig = ipv6ToBigInt(targetIp);
    if (ipBig === null || targetBig === null) return false;
    const mask = prefix === 0 ? 0n : (~0n << BigInt(128 - prefix)) & ((1n << 128n) - 1n);
    return (ipBig & mask) === (targetBig & mask);
  }
}

export function isIpInCidrs(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => isIpInCidr(ip, cidr.trim()));
}

export function getClientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
  raw?: { socket?: { remoteAddress?: string } };
}): string {
  const cfOriginLocked = process.env['CF_ORIGIN_LOCKED'] === '1' || process.env['CF_ORIGIN_LOCKED'] === 'true';
  const socketPeer = req.raw?.socket?.remoteAddress;
  const trustedProxiesEnv = process.env['TRUSTED_PROXY_CIDRS'] || '127.0.0.1,::1';
  const trustedCidrs = trustedProxiesEnv.split(',').map((s) => s.trim()).filter(Boolean);

  // Fastify trustProxy reads X-Forwarded-For; CF-Connecting-IP is evaluated only when CF_ORIGIN_LOCKED is active
  // AND the direct socket peer is in TRUSTED_PROXY_CIDRS
  if (cfOriginLocked && socketPeer && isIpInCidrs(socketPeer, trustedCidrs)) {
    const cfIpRaw = req.headers?.['cf-connecting-ip'];
    const cfIp = typeof cfIpRaw === 'string' ? cfIpRaw.trim() : Array.isArray(cfIpRaw) ? cfIpRaw[0]?.trim() : undefined;
    if (cfIp && net.isIP(cfIp) !== 0) {
      return cfIp;
    }
  }

  // Fallback to Fastify's req.ip (which parses X-Forwarded-For if socket peer was trusted by trustProxy)
  if (req.ip && net.isIP(req.ip.trim()) !== 0) {
    return req.ip.trim();
  }

  if (socketPeer && net.isIP(socketPeer.trim()) !== 0) {
    return socketPeer.trim();
  }

  return '127.0.0.1';
}
