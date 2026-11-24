# Cloudflare Origin Lockdown & Client IP Resolution

## Overview

Accurate client IP resolution is vital for bot detection, Cloudflare Turnstile token validation, and distributed rate limiting (OTP send abuse prevention).

In production and staging environments, the API runs behind reverse proxies and Cloudflare CDN/WAF. Without strict controls, an attacker connecting directly to an exposed origin could spoof headers like `CF-Connecting-IP` or `X-Forwarded-For` to bypass rate limits or exhaust quotas of arbitrary victim IPs.

## Architecture & Defense-in-Depth

### 1. Unified Client IP Mechanism
- **Fastify Native Proxy Trust**: The Fastify HTTP adapter is initialized with `trustProxy: TRUSTED_PROXY_CIDRS.split(',')`. Fastify's native `trustProxy` mechanism inspects `X-Forwarded-For` from verified upstream peers.
- **Validation at Boot**: In production and staging, `TRUSTED_PROXY_CIDRS` is required. The bootloader parses all CIDR blocks and rejects wildcard CIDRs (`0.0.0.0/0` and `::/0`).
- **Standard Header**: All controllers and services read client IP via `getClientIp(req)`.
- **Validation with `net.isIP()`**: Every header-derived IP (`CF-Connecting-IP` or `X-Forwarded-For`) must pass `net.isIP(ip) !== 0`. Any malformed or garbage values (such as `1.2.3.4:x`, `a,b`, or oversized headers) are discarded, falling back to the verified socket peer.

### 2. `CF-Connecting-IP` Gating (`CF_ORIGIN_LOCKED=1`)
The `CF-Connecting-IP` header is sent by Cloudflare edges to identify the original client IP. However:
- If the application origin is reachable directly (e.g., origin IP known or firewall rules incomplete), untrusted peers can spoof `CF-Connecting-IP: <victim-ip>`.
- To prevent this, `getClientIp(req)` honors `CF-Connecting-IP` **only if**:
  1. `CF_ORIGIN_LOCKED=1` is explicitly set in the environment.
  2. The direct socket peer (`req.raw.socket.remoteAddress`) is confirmed to reside within `TRUSTED_PROXY_CIDRS`.
  3. The header value is a valid IP address per `net.isIP()`.
- In all other configurations (dev, test, or open origin), `req.ip` (derived from trusted upstream hops via `X-Forwarded-For`) or socket peer address is used.

### 3. IP Normalization
To prevent quota fragmentation and evasion:
- **IPv4**: Standardized canonical dotted-quad format (e.g. `192.168.1.1`).
- **IPv4-mapped IPv6**: `::ffff:a.b.c.d` and hex format `::ffff:7f00:1` are normalized to dotted-quad IPv4.
- **IPv6**: Standardized to lowercase `/64` prefix notation (e.g. `2001:db8:abcd:12::/64`) so dynamic residential and mobile `/64` allocations share quota. Zone IDs (e.g. `%eth0`) are stripped.
- **Loopback**: `127.0.0.1` and `::1` are preserved.

### 4. Atomic Rate Limiting (Single Lua Script)
OTP send limits are enforced atomically via a single Redis Lua command (`checkAndIncrementOtpLimits`):
- `auth:cooldown:{phone}`: 60s cooldown per normalized 10-digit mobile number.
- `auth:daily:{phone}`: Daily rolling cap (default 10) per phone with rolling 24h expiration (no date in key).
- `auth:ip_rate:{normIp}`: Hourly sliding window (default 200) via sorted set.
- `auth:ip_phone:{normIp}:{phone}`: Daily cap per (IP, phone) pair (default 5).

Rejections return `HTTP 429 Too Many Requests` with the `Retry-After` header. Generic messages are returned for IP-based rejections to protect victim privacy.
