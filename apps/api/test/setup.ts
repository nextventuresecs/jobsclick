import crypto from 'node:crypto';

// Vitest global setup: generate cryptographically secure random secrets per test run
// Ensures tests run against valid entropy without hardcoding literal secrets in src
if (!process.env['JWT_SECRET']) {
  process.env['JWT_SECRET'] = crypto.randomBytes(32).toString('hex');
}
if (!process.env['OTP_PEPPER']) {
  process.env['OTP_PEPPER'] = crypto.randomBytes(32).toString('hex');
}
