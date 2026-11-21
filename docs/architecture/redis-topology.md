# Redis Topology & Multi-Key Scripting Constraints

## Overview

The authentication and OTP rate limiting subsystem (`AUTH-03`) uses atomic Redis Lua scripts (`checkAndIncrementOtpLimits` and `releaseOtpLimits`) to guarantee that all limits are validated prior to mutating any rate-limit state.

## Architectural Invariants

### 1. Single-Primary Redis Deployment
The atomic check script executes across four distinct keys in a single EVAL transaction:
1. `auth:cooldown:{phone}` (String / EX)
2. `auth:daily:{phone}` (String counter / EX)
3. `auth:ip_rate:{normIp}` (Sorted Set / EX)
4. `auth:ip_phone:{normIp}:{phone}` (String counter / EX)

Because these four keys have different key prefixes and parameters (`phone` vs `normIp`), they hash to different slot numbers in a distributed **Redis Cluster**. Executing a multi-key Lua command across differing hash slots produces a Redis `CROSSSLOT Keys in request don't hash to the same slot` error.

**Requirement:**
- The platform mandates a **single-primary Redis instance** (e.g., standard Railway Redis, AWS ElastiCache for Redis in non-cluster mode, or Redis with Sentinel).
- Cross-slot sharding across Redis Cluster is explicitly unsupported without key-hash tag refactoring.

### 2. Monotonic Time via `redis.call('TIME')`
- The Lua script does not trust application server timestamps (preventing clock drift issues across multi-instance API deployments).
- Monotonic server time is fetched directly within the Lua script via `local time = redis.call('TIME')` and converted to milliseconds:
  `nowMs = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)`.

### 3. Fail-Closed Connection Policy
- The Redis client is configured with:
  - `enableOfflineQueue: false`
  - `commandTimeout: 1000` (1-second ceiling)
  - `maxRetriesPerRequest: 1`
  - `retryStrategy() { return null; }`
- If Redis becomes unavailable, requests fail closed within 2 seconds with HTTP 503 (`ServiceUnavailableException`). No SMS messages are dispatched when rate-limiting state cannot be verified.

### 4. Idempotent Rollback (`releaseOtpLimits`)
- When downstream delivery fails (e.g., SMS provider outage), `releaseOtpLimits` is invoked with the exact `zsetMember` returned by `checkAndIncrementOtpLimits`.
- The script checks that counter values are greater than 0 before decrementing (`math.max(0, ...)`), preventing negative counters.
- Double-release calls or calls after key TTL expiration are safely idempotent.
