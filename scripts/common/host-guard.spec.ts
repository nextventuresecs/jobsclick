import { describe, it, expect } from 'vitest';
import { assertLocalhostOnly, isLocalhost, extractHostFromConnectionString } from './host-guard.ts';
import { drillFreshDatabase } from '../drill-fresh-database.ts';
import { runSecurityDrill } from '../db-security-drill.ts';

describe('Host Guard Security Restrictions', () => {
  describe('extractHostFromConnectionString', () => {
    it('correctly extracts hostname from postgresql URLs', () => {
      expect(extractHostFromConnectionString('postgresql://postgres:secret@127.0.0.1:54322/postgres')).toBe('127.0.0.1');
      expect(extractHostFromConnectionString('postgresql://postgres:secret@localhost:5432/postgres')).toBe('localhost');
      expect(extractHostFromConnectionString('postgresql://postgres.tenant:secret@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres')).toBe('aws-0-ap-northeast-2.pooler.supabase.com');
    });

    it('throws when string is empty or invalid', () => {
      expect(() => extractHostFromConnectionString('')).toThrow(/\[SECURITY REFUSAL\]/);
    });
  });

  describe('isLocalhost', () => {
    it('returns true for 127.0.0.1, localhost, ::1, and 0.0.0.0', () => {
      expect(isLocalhost('postgresql://postgres:postgres@127.0.0.1:54322/postgres')).toBe(true);
      expect(isLocalhost('postgresql://postgres:postgres@localhost:5432/postgres')).toBe(true);
      expect(isLocalhost('redis://127.0.0.1:6379')).toBe(true);
      expect(isLocalhost('http://localhost:54321')).toBe(true);
    });

    it('returns false for remote hosts', () => {
      expect(isLocalhost('postgresql://postgres.afxgvtfaofpnlhdsexnp:secret@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres')).toBe(false);
      expect(isLocalhost('postgresql://postgres:secret@db.afxgvtfaofpnlhdsexnp.supabase.co:5432/postgres')).toBe(false);
      expect(isLocalhost('postgresql://postgres:secret@192.168.1.100:5432/postgres')).toBe(false);
      expect(isLocalhost('rediss://default:token@concrete-fly-228071.upstash.io:6379')).toBe(false);
    });
  });

  describe('assertLocalhostOnly', () => {
    it('succeeds without error for local connection strings', () => {
      expect(() => assertLocalhostOnly('postgresql://postgres:postgres@127.0.0.1:54322/postgres', 'Local Drill')).not.toThrow();
      expect(() => assertLocalhostOnly('postgresql://postgres:postgres@localhost:54322/postgres', 'Local Drill')).not.toThrow();
    });

    it('strictly refuses and throws error when given remote pooler target', () => {
      expect(() =>
        assertLocalhostOnly(
          'postgresql://postgres.afxgvtfaofpnlhdsexnp:secret@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
          'Fresh Database Drill'
        )
      ).toThrow(/\[SECURITY REFUSAL\] Fresh Database Drill: Target host "aws-0-ap-northeast-2\.pooler\.supabase\.com" is strictly FORBIDDEN!/);
    });

    it('strictly refuses direct Supabase db hostname', () => {
      expect(() =>
        assertLocalhostOnly(
          'postgresql://postgres:secret@db.afxgvtfaofpnlhdsexnp.supabase.co:5432/postgres',
          'Database Reset Script'
        )
      ).toThrow(/\[SECURITY REFUSAL\] Database Reset Script: Target host "db\.afxgvtfaofpnlhdsexnp\.supabase\.co" is strictly FORBIDDEN!/);
    });

    it('strictly refuses non-loopback private network IPs', () => {
      expect(() =>
        assertLocalhostOnly('postgresql://postgres:secret@10.0.0.5:5432/postgres', 'Attack Drill')
      ).toThrow(/\[SECURITY REFUSAL\] Attack Drill: Target host "10\.0\.0\.5" is strictly FORBIDDEN!/);
    });
  });

  describe('Destructive Drill Refusal Proofs', () => {
    it('drillFreshDatabase immediately rejects non-localhost targets before connecting or dropping', async () => {
      await expect(
        drillFreshDatabase('postgresql://postgres.afxgvtfaofpnlhdsexnp:secret@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres')
      ).rejects.toThrow(/\[SECURITY REFUSAL\] Fresh Bootstrap Drill \(DROP\/CREATE DATABASE\)/);
    });

    it('runSecurityDrill immediately rejects remote targets before connecting or mutating', async () => {
      await expect(
        runSecurityDrill('postgresql://postgres:secret@db.afxgvtfaofpnlhdsexnp.supabase.co:5432/postgres')
      ).rejects.toThrow(/\[SECURITY REFUSAL\] Security Attack Drill/);
    });
  });
});
