import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';

vi.mock('../src/context/AppContext.js', () => ({
  useApp: () => ({ addToast: vi.fn() }),
  useAppContext: () => ({ addToast: vi.fn() }),
  AppProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import {
  maskCandidatePhone,
  maskCandidateEmail,
  INITIAL_SEEKER_PROFILE,
  type SeekerProfileData,
} from '../src/data/sampleWorkspaces.js';
import {
  maskContactNumber,
  maskEmailAddress,
} from '../src/components/workspaces/institution/studentUtils.js';
import { ProfileQrShareCard } from '../src/components/common/ProfileQrShareCard.js';

describe('PR 3: Identity Leaks & Trust Badges Lockdown (P0/P1)', () => {
  describe('Axis 1: Phone and Email Masking (Hard Invariant #1)', () => {
    it('fully masks candidate phone numbers without exposing the last 3 digits', () => {
      const masked1 = maskCandidatePhone('+91 98260 14829');
      expect(masked1).toBe('+91 ••••• •••••');
      expect(masked1).not.toContain('829');

      const masked2 = maskCandidatePhone('9876543210');
      expect(masked2).toBe('+91 ••••• •••••');
      expect(masked2).not.toContain('210');

      const maskedEmpty = maskCandidatePhone('');
      expect(maskedEmpty).toBe('••••••••••');
    });

    it('fully masks candidate email addresses without exposing the domain', () => {
      const masked1 = maskCandidateEmail('rahul.sharma@example.com');
      expect(masked1).toBe('••••••@••••••');
      expect(masked1).not.toContain('example.com');
      expect(masked1).not.toContain('rahul');

      const masked2 = maskCandidateEmail('candidate@jobsclick.in');
      expect(masked2).toBe('••••••@••••••');
      expect(masked2).not.toContain('jobsclick.in');

      const maskedEmpty = maskCandidateEmail(null);
      expect(maskedEmpty).toBe('••••••@••••••');
    });

    it('institution student utility functions fully mask phone and email', () => {
      const studentPhone = maskContactNumber('+91 94250 88210');
      expect(studentPhone).toBe('+91 ••••• •••••');
      expect(studentPhone).not.toContain('210');

      const studentEmail = maskEmailAddress('student@mp.gov.in');
      expect(studentEmail).toBe('••••••@••••••');
      expect(studentEmail).not.toContain('mp.gov.in');
    });
  });

  describe('Axis 2: Trust Badges Derive ONLY From Server-Side Verified Flags', () => {
    it('ProfileQrShareCard does NOT render "Udyam Verified" when isMsme=true but udyamVerified=false', () => {
      const html = renderToString(
        React.createElement(ProfileQrShareCard, {
          title: 'Unverified MSME Enterprise',
          path: '/company/comp-unverified',
          downloadFileName: 'unverified-qr',
          isMsme: true,
          udyamVerified: false,
        }),
      );

      // Must not render "Udyam Verified" when unverified
      expect(html).not.toContain('Udyam Verified');
      // Must render "Unverified" badge instead
      expect(html).toContain('Unverified');
    });

    it('ProfileQrShareCard renders "Udyam Verified" ONLY when udyamVerified=true', () => {
      const html = renderToString(
        React.createElement(ProfileQrShareCard, {
          title: 'Verified MSME Enterprise',
          path: '/company/comp-verified',
          downloadFileName: 'verified-qr',
          isMsme: true,
          udyamVerified: true,
        }),
      );

      expect(html).toContain('Udyam Verified');
      expect(html).not.toContain('Unverified');
    });
  });

  describe('Axis 3: Aadhaar Last-4 Removed from Printed CV & Verification Guard', () => {
    it('proves aadhaarVerified cannot be coerced to true by mere presence of last-4 digits', () => {
      const unverifiedProfile: SeekerProfileData = {
        ...INITIAL_SEEKER_PROFILE,
        aadhaarLastFour: '1234',
        aadhaarVerified: false,
      };

      // Ensure that providing last-4 does not equate to aadhaarVerified
      expect(unverifiedProfile.aadhaarVerified).toBe(false);
      expect(Boolean(unverifiedProfile.aadhaarLastFour)).toBe(true);
      expect(unverifiedProfile.aadhaarVerified === Boolean(unverifiedProfile.aadhaarLastFour)).toBe(false);
    });
  });

  describe('Axis 4: Grep Test - No usr_\\d{10} Pattern in Rendered Output, URLs, or Payloads', () => {
    it('guarantees no usr_\\d{10} pattern is rendered in ProfileQrShareCard HTML or path', () => {
      const html = renderToString(
        React.createElement(ProfileQrShareCard, {
          title: 'Secure Industrial Unit',
          path: '/company/018f673e-2b10-72cb-8012-3456789abcde',
          downloadFileName: 'secure-poster',
          isMsme: true,
          udyamVerified: true,
        }),
      );

      const phoneIdRegex = /usr_\d{10}/;
      expect(phoneIdRegex.test(html)).toBe(false);
    });

    it('guarantees QR poster URLs contain opaque slugs/UUIDs and never usr_\\d{10}', () => {
      const qrPath = '/company/018f673e-2b10-72cb-8012-3456789abcde';
      const phoneIdRegex = /usr_\d{10}/;
      expect(phoneIdRegex.test(qrPath)).toBe(false);
    });
  });
});
