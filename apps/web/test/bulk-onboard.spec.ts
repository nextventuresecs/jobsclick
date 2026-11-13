import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { parseSharedCsv, normalizeIndianPhone } from '@indian-job-portal/validation';
import { POST as handlePostBatch } from '../src/app/api/bulk/batches/route';
import { signSessionToken, SESSION_COOKIE_NAME } from '@/lib/auth-session';

describe('PR 4: Bulk Onboarding (Web & Normalization)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    process.env.JWT_SECRET = 'a-super-secret-jwt-key-that-is-at-least-32-characters-long!';
  });

  describe('Shared Phone Normalizer', () => {
    it('normalizes various Indian phone formats to canonical 10-digit format', () => {
      expect(normalizeIndianPhone('+91 98765 43210')).toBe('9876543210');
      expect(normalizeIndianPhone('09876543210')).toBe('9876543210');
      expect(normalizeIndianPhone('91-9876543210')).toBe('9876543210');
      expect(normalizeIndianPhone('9876543210')).toBe('9876543210');
    });

    it('rejects invalid or non-Indian phone formats', () => {
      expect(normalizeIndianPhone('+14155552671')).toBeNull();
      expect(normalizeIndianPhone('1234567890')).toBeNull(); // starts with 1
      expect(normalizeIndianPhone('98765')).toBeNull(); // too short
      expect(normalizeIndianPhone('')).toBeNull();
    });
  });

  describe('RFC-4180 CSV Parsing', () => {
    it('handles quoted fields with commas and CRLF properly', () => {
      const csv = 'company_name,phone,ownership_type,company_size\r\n"Acme, Inc.",9876543210,Private Limited,11-50\r\n"Beta Corp",9876543211,Partnership,1-10';
      const parsed = parseSharedCsv(csv);
      expect(parsed).toHaveLength(2);
      expect(parsed[0]?.company_name).toBe('Acme, Inc.');
      expect(parsed[0]?.phone).toBe('9876543210');
      expect(parsed[1]?.company_name).toBe('Beta Corp');
    });

    it('handles multiline quoted values', () => {
      const csv = 'company_name,phone,description\n"Acme\nTechnologies",9876543210,"Building\nNextGen Products"';
      const parsed = parseSharedCsv(csv);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.company_name).toBe('Acme\nTechnologies');
      expect(parsed[0]?.description).toBe('Building\nNextGen Products');
    });
  });

  describe('Authenticated Route Handler: /api/bulk/batches', () => {
    it('returns 401 Unauthorized if session cookie is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/bulk/batches', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityType: 'employer',
          csvContent: 'company_name,phone\nAcme,9876543210',
        }),
      });

      const response = await handlePostBatch(req);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toMatch(/Authentication required/i);
    });

    it('forwards verified session identity to backend API without spoofable client input', async () => {
      const mockFetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('/auth/me')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                user: { id: 'usr_test_123', name: 'Authorized Officer', phone: '9876543210', role: 'admin' },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        if (url.includes('/bulk/batches')) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'batch_uuid_123',
                status: 'queued',
                source: 'Authorized Officer',
              }),
              { status: 201, headers: { 'Content-Type': 'application/json' } },
            ),
          );
        }
        return Promise.resolve(new Response(null, { status: 404 }));
      });

      vi.stubGlobal('fetch', mockFetch);

      const validToken = signSessionToken({
        id: '11111111-2222-3333-4444-555555555555',
        role: 'employer',
        status: 'active',
      });

      const req = new NextRequest('http://localhost:3000/api/bulk/batches', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          cookie: `${SESSION_COOKIE_NAME}=${validToken}`,
        },
        body: JSON.stringify({
          entityType: 'employer',
          csvContent: 'company_name,phone,ownership_type,company_size\nAcme,9876543210,Private Limited,1-10',
          source: 'Spoofed Untrusted Source', // Should be ignored in favor of verified session
        }),
      });

      const response = await handlePostBatch(req);
      expect(response.status).toBe(201);
      const json = await response.json();
      expect(json.id).toBe('batch_uuid_123');

      // Verify the backend API call payload had source derived from verified session
      const backendCall = mockFetch.mock.calls.find((call) => call[0].includes('/bulk/batches'));
      expect(backendCall).toBeDefined();
      const sentBody = JSON.parse(backendCall![1].body);
      expect(sentBody.source).toBe('Enterprise_11111111');
      expect(sentBody.source).not.toBe('Spoofed Untrusted Source');
    });
  });
});
