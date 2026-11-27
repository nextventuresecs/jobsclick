import { describe, it, expect } from 'vitest';
import { normalizeIp, isIpInCidr, isIpInCidrs, getClientIp } from './ip-normalizer.js';

describe('normalizeIp', () => {
  it('passes standard IPv4 through unchanged', () => {
    expect(normalizeIp('192.168.1.1')).toBe('192.168.1.1');
    expect(normalizeIp('10.0.0.5')).toBe('10.0.0.5');
    expect(normalizeIp('203.0.113.195')).toBe('203.0.113.195');
  });

  it('normalizes IPv4-mapped IPv6 (::ffff:a.b.c.d) to pure IPv4', () => {
    expect(normalizeIp('::ffff:192.168.1.1')).toBe('192.168.1.1');
    expect(normalizeIp('::ffff:10.0.0.1')).toBe('10.0.0.1');
    expect(normalizeIp('::ffff:203.0.113.50')).toBe('203.0.113.50');
  });

  it('normalizes hex IPv4-mapped IPv6 (::ffff:7f00:1) to pure IPv4', () => {
    expect(normalizeIp('::ffff:7f00:1')).toBe('127.0.0.1');
    expect(normalizeIp('::ffff:7f00:0001')).toBe('127.0.0.1');
    expect(normalizeIp('::ffff:c0a8:0101')).toBe('192.168.1.1');
  });

  it('normalizes pure IPv6 to a lowercase /64 subnet prefix', () => {
    // 2001:db8:abcd:0012:... -> 2001:db8:abcd:12::/64
    const ip1 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';
    expect(normalizeIp(ip1)).toBe('2001:db8:85a3:0::/64');

    const ip2 = '2001:db8:abcd:0012:0000:0000:0000:0001';
    expect(normalizeIp(ip2)).toBe('2001:db8:abcd:12::/64');

    expect(normalizeIp('2001:db8::1')).toBe('2001:db8:0:0::/64');
  });

  it('handles uppercase hex and canonicalizes to lowercase /64', () => {
    expect(normalizeIp('2001:DB8:ABCD:0012:0000:0000:0000:0001')).toBe('2001:db8:abcd:12::/64');
    expect(normalizeIp('2001:DB8::ABCD')).toBe('2001:db8:0:0::/64');
  });

  it('strips zone ID from IPv6 addresses', () => {
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80:0:0:0::/64');
    expect(normalizeIp('fe80::2%wlan0')).toBe('fe80:0:0:0::/64');
  });

  it('proves same /64 subnet shares a key and different /64 subnets do not', () => {
    const hostA = '2001:db8:1234:5678:0000:0000:0000:0001';
    const hostB = '2001:db8:1234:5678:ffff:ffff:ffff:ffff';
    const differentSubnet = '2001:db8:1234:5679:0000:0000:0000:0001';

    expect(normalizeIp(hostA)).toBe(normalizeIp(hostB));
    expect(normalizeIp(hostA)).not.toBe(normalizeIp(differentSubnet));
  });

  it('handles loopback addresses gracefully', () => {
    expect(normalizeIp('127.0.0.1')).toBe('127.0.0.1');
    expect(normalizeIp('::1')).toBe('::1');
  });
});

describe('isIpInCidr and isIpInCidrs', () => {
  it('correctly matches IPv4 in CIDRs', () => {
    expect(isIpInCidr('10.5.2.1', '10.0.0.0/8')).toBe(true);
    expect(isIpInCidr('192.168.1.50', '192.168.1.0/24')).toBe(true);
    expect(isIpInCidr('192.168.2.1', '192.168.1.0/24')).toBe(false);
    expect(isIpInCidr('127.0.0.1', '127.0.0.1/32')).toBe(true);
    expect(isIpInCidr('127.0.0.2', '127.0.0.1/32')).toBe(false);
  });

  it('correctly matches IPv6 in CIDRs', () => {
    expect(isIpInCidr('2001:db8::1', '2001:db8::/32')).toBe(true);
    expect(isIpInCidr('2001:db9::1', '2001:db8::/32')).toBe(false);
  });

  it('correctly matches IP in multiple CIDRs via isIpInCidrs', () => {
    const cidrs = ['10.0.0.0/8', '192.168.1.0/24'];
    expect(isIpInCidrs('10.1.2.3', cidrs)).toBe(true);
    expect(isIpInCidrs('192.168.1.42', cidrs)).toBe(true);
    expect(isIpInCidrs('172.16.0.1', cidrs)).toBe(false);
  });
});

describe('getClientIp', () => {
  it('prefers req.ip when CF_ORIGIN_LOCKED is false/unset', () => {
    delete process.env['CF_ORIGIN_LOCKED'];
    const mockReq = {
      ip: '203.0.113.10',
      headers: {
        'cf-connecting-ip': '1.2.3.4',
      },
      raw: { socket: { remoteAddress: '10.0.0.1' } },
    };
    expect(getClientIp(mockReq)).toBe('203.0.113.10');
  });

  it('uses cf-connecting-ip only when CF_ORIGIN_LOCKED is true and socket peer is trusted', () => {
    process.env['CF_ORIGIN_LOCKED'] = '1';
    process.env['TRUSTED_PROXY_CIDRS'] = '10.0.0.0/8,127.0.0.1';

    // Trusted peer with valid IP header
    const trustedReq = {
      ip: '10.0.0.1',
      headers: {
        'cf-connecting-ip': '198.51.100.55',
      },
      raw: { socket: { remoteAddress: '10.0.0.1' } },
    };
    expect(getClientIp(trustedReq)).toBe('198.51.100.55');

    // Untrusted peer attempting to spoof
    const untrustedReq = {
      ip: '203.0.113.5',
      headers: {
        'cf-connecting-ip': '198.51.100.55',
      },
      raw: { socket: { remoteAddress: '203.0.113.5' } },
    };
    expect(getClientIp(untrustedReq)).toBe('203.0.113.5');
  });

  it('rejects garbage header values and falls back to socket peer', () => {
    process.env['CF_ORIGIN_LOCKED'] = '1';
    process.env['TRUSTED_PROXY_CIDRS'] = '10.0.0.0/8,127.0.0.1';

    const testGarbage = (val: string) => ({
      ip: '10.0.0.1',
      headers: {
        'cf-connecting-ip': val,
      },
      raw: { socket: { remoteAddress: '10.0.0.1' } },
    });

    // 1.2.3.4:x (invalid IP port notation)
    expect(getClientIp(testGarbage('1.2.3.4:x'))).toBe('10.0.0.1');

    // a,b (multiple or malformed)
    expect(getClientIp(testGarbage('a,b'))).toBe('10.0.0.1');

    // empty string
    expect(getClientIp(testGarbage(''))).toBe('10.0.0.1');

    // 10KB string
    const largeGarbage = 'A'.repeat(10240);
    expect(getClientIp(testGarbage(largeGarbage))).toBe('10.0.0.1');
  });
});
