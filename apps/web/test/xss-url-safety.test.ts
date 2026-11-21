import { describe, it, expect } from 'vitest';
import { safeJsonLd } from '../src/lib/safe-json-ld';
import { safeHttpUrl } from '../src/lib/safe-url';
import { sanitizeUrl } from '../src/components/social-embed';
import {
  httpUrlSchema,
  optionalHttpUrlSchema,
  institutionProfileSchema,
  businessProfileSchema,
} from '@indian-job-portal/validation';

describe('PR 1: Web XSS + URL Safety (P0)', () => {
  describe('safeJsonLd()', () => {
    it('escapes < as \\u003c so that </script> in user content renders inert', () => {
      const maliciousPayload = {
        '@context': 'https://schema.org',
        '@type': 'JobPosting',
        title: 'CNC Machinist',
        description: '</script><script>alert("XSS")</script>',
      };

      const serialized = safeJsonLd(maliciousPayload);

      // Must not contain any literal '<' character
      expect(serialized).not.toContain('<');
      expect(serialized).toContain('\\u003c/script>');
      expect(serialized).toContain('\\u003cscript>alert(\\"XSS\\")\\u003c/script>');

      // Must still parse back to the original JavaScript object
      const parsed = JSON.parse(serialized);
      expect(parsed.description).toBe('</script><script>alert("XSS")</script>');
    });
  });

  describe('safeHttpUrl()', () => {
    it('rejects javascript: schemes and renders null (no href)', () => {
      expect(safeHttpUrl('javascript:alert(1)')).toBeNull();
      expect(safeHttpUrl('JAVASCRIPT:alert(document.cookie)')).toBeNull();
      expect(safeHttpUrl('javascript:void(0)')).toBeNull();
    });

    it('rejects javascript polyglot URLs (e.g. javascript://www.youtube.com/%0aalert(1))', () => {
      expect(safeHttpUrl('javascript://www.youtube.com/%0aalert(1)')).toBeNull();
      expect(safeHttpUrl('javascript://instagram.com/%0aalert(1)')).toBeNull();
    });

    it('rejects data:, vbscript:, and file: schemes', () => {
      expect(safeHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
      expect(safeHttpUrl('vbscript:msgbox("xss")')).toBeNull();
      expect(safeHttpUrl('file:///etc/passwd')).toBeNull();
    });

    it('rejects null, undefined, and empty string', () => {
      expect(safeHttpUrl(null)).toBeNull();
      expect(safeHttpUrl(undefined)).toBeNull();
      expect(safeHttpUrl('')).toBeNull();
      expect(safeHttpUrl('   ')).toBeNull();
    });

    it('accepts valid http and https URLs', () => {
      expect(safeHttpUrl('https://example.com/brochures/iti-2026.pdf')).toBe('https://example.com/brochures/iti-2026.pdf');
      expect(safeHttpUrl('http://example.com/page')).toBe('http://example.com/page');
      expect(safeHttpUrl('https://pcpolytechnic.edu.in')).toBe('https://pcpolytechnic.edu.in/');
    });

    it('safely normalizes plain domain/website inputs to https', () => {
      expect(safeHttpUrl('www.aaryaprecision.in')).toBe('https://www.aaryaprecision.in/');
      expect(safeHttpUrl('iti.mp.gov.in/indore')).toBe('https://iti.mp.gov.in/indore');
    });
  });

  describe('SocialEmbed URL Sanitization and Rewriting', () => {
    it('strictly rejects javascript://www.youtube.com/%0aalert(1)', () => {
      expect(sanitizeUrl('javascript://www.youtube.com/%0aalert(1)')).toBe('');
      expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    });

    it('rewrites youtube.com/watch?v=... to https://www.youtube.com/embed/...', () => {
      expect(sanitizeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
      );
    });

    it('rewrites youtu.be/... to https://www.youtube.com/embed/...', () => {
      expect(sanitizeUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
      );
    });

    it('rewrites youtube.com/shorts/... to https://www.youtube.com/embed/...', () => {
      expect(sanitizeUrl('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
      );
    });

    it('preserves existing valid https://www.youtube.com/embed/... URLs', () => {
      expect(sanitizeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe(
        'https://www.youtube.com/embed/dQw4w9WgXcQ',
      );
    });

    it('allows valid Instagram and Facebook embed URLs', () => {
      expect(sanitizeUrl('https://www.instagram.com/p/C12345/')).toBe(
        'https://www.instagram.com/p/C12345/',
      );
      expect(sanitizeUrl('https://www.facebook.com/watch/?v=12345')).toBe(
        'https://www.facebook.com/watch/?v=12345',
      );
    });

    it('rejects untrusted third-party hosts', () => {
      expect(sanitizeUrl('https://malicious-site.com/phish')).toBe('');
      expect(sanitizeUrl('https://attacker-controlled.com/watch?v=dQw4w9WgXcQ')).toBe('');
    });
  });

  describe('Zod Schema URL Validation (API & Shared Validation)', () => {
    it('httpUrlSchema rejects javascript: and polyglot URLs', () => {
      expect(httpUrlSchema.safeParse('javascript:alert(1)').success).toBe(false);
      expect(httpUrlSchema.safeParse('javascript://www.youtube.com/%0aalert(1)').success).toBe(false);
      expect(httpUrlSchema.safeParse('data:text/html,<script>alert(1)</script>').success).toBe(false);
    });

    it('httpUrlSchema accepts valid http/https URLs', () => {
      expect(httpUrlSchema.safeParse('https://example.com/brochure.pdf').success).toBe(true);
      expect(httpUrlSchema.safeParse('http://example.com').success).toBe(true);
      expect(optionalHttpUrlSchema.safeParse('').success).toBe(true);
      expect(optionalHttpUrlSchema.safeParse(undefined).success).toBe(true);
      expect(optionalHttpUrlSchema.safeParse('javascript:void(0)').success).toBe(false);
    });

    it('institutionProfileSchema rejects dangerous website and placementBrochureUrl', () => {
      const baseInstitution = {
        institutionName: 'Govt ITI',
        affiliation: 'NCVT',
        contactPerson: 'Principal Sharma',
        address: 'Sector 5, Industrial Area',
      };

      const result1 = institutionProfileSchema.safeParse({
        ...baseInstitution,
        website: 'javascript:alert(1)',
      });
      expect(result1.success).toBe(false);

      const result2 = institutionProfileSchema.safeParse({
        ...baseInstitution,
        placementBrochureUrl: 'javascript://www.youtube.com/%0aalert(1)',
      });
      expect(result2.success).toBe(false);
    });

    it('businessProfileSchema rejects dangerous website', () => {
      const baseBusiness = {
        companyName: 'Aarya Precision Pvt Ltd',
        ownershipType: 'Private Limited',
        sector: 'Manufacturing',
        address: 'Plot 42, MIDC',
        city: 'Pune',
        district: 'Pune',
      };

      const result = businessProfileSchema.safeParse({
        ...baseBusiness,
        website: 'javascript:alert(1)',
      });
      expect(result.success).toBe(false);
    });
  });
});
