/**
 * Candidate Contact Visibility Policy Implementation (Hard Invariant #1 & DPDP Act 2023)
 *
 * Rules:
 * - employer / ATS: NEVER see candidate/student phone or email (always redacted).
 * - institution / intermediary: sees its OWN students' phone and email in full, AUDITED.
 *                               cross-institution students are always redacted.
 *                               without auditConfirmed=true, results are redacted (fail-closed).
 * - admin: full phone and email, AUDITED.
 *          for exports: masked by default unless includeContacts=true and auditConfirmed=true.
 *          without auditConfirmed=true, unmasked results are redacted (fail-closed).
 * - msme_admin: NONE (aggregate metrics and business records only, always redacted).
 * - public: NONE (anonymous/unauthenticated viewers always redacted).
 * - job_seeker: sees OWN phone and email in full (own profile, no audit needed).
 */

import type { UserRole } from './auth.js';

export type ContactViewerRole =
  | UserRole
  | 'institution'
  | 'public';

export interface ViewerContext {
  readonly role: ContactViewerRole;
  readonly id: string; // Authenticated user ID (or anonymous session ID)
  /**
   * MUST be derived on the server from the authenticated user's profile.
   * Never accepted from client request query/body/headers.
   */
  readonly institutionId?: string | null;
  /**
   * Must be explicitly true for audited unmasking (institution, admin).
   * Without auditConfirmed=true, institution and admin unmasked results are redacted (fail-closed).
   */
  readonly auditConfirmed?: boolean;
  /**
   * Platform admin export flag: true = request unmasked contacts, false/undefined = masked by default.
   */
  readonly includeContacts?: boolean;
}

export interface CandidateContactRecord {
  readonly id: string; // Candidate profile ID or student ID
  readonly userId?: string | null; // Associated auth user ID
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly institutionId?: string | null; // Enrolled institution ID
  readonly [key: string]: unknown;
}

export type RedactedRecord<T extends CandidateContactRecord> = Omit<T, 'phone' | 'email'> & {
  readonly phone: string | null;
  readonly email: string | null;
  readonly contactVisible: boolean;
};

export interface BatchRedactionResult<T extends CandidateContactRecord> {
  readonly records: RedactedRecord<T>[];
  readonly totalCount: number;
  readonly unmaskedCount: number;
}

export function maskPhoneDefault(phone?: string | null): string | null {
  if (!phone) return null;
  return phone.replace(/(\d{2})\d{6}(\d{2})/, '$1******$2');
}

/**
 * Pure function enforcing single-candidate contact visibility rules.
 * No I/O.
 */
export function redactCandidateContact<T extends CandidateContactRecord>(
  viewer: ViewerContext,
  record: T,
): RedactedRecord<T> {
  // 1. Candidate viewing self (own profile does not require audit log)
  if (
    viewer.role === 'job_seeker' &&
    (viewer.id === record.id || (record.userId && viewer.id === record.userId))
  ) {
    return {
      ...record,
      phone: record.phone ?? null,
      email: record.email ?? null,
      contactVisible: true,
    };
  }

  // 2. Platform Admin
  if (viewer.role === 'admin') {
    // When includeContacts is true: requires auditConfirmed
    if (viewer.includeContacts) {
      if (viewer.auditConfirmed) {
        return {
          ...record,
          phone: record.phone ?? null,
          email: record.email ?? null,
          contactVisible: true,
        };
      }
      // Fail closed if audit was not confirmed
      return {
        ...record,
        phone: null,
        email: null,
        contactVisible: false,
      };
    }

    // Default admin view: if auditConfirmed is true and includeContacts is undefined/not explicitly false
    if (viewer.auditConfirmed && viewer.includeContacts === undefined) {
      return {
        ...record,
        phone: record.phone ?? null,
        email: record.email ?? null,
        contactVisible: true,
      };
    }

    // Default masked export or view when includeContacts is false or audit not confirmed
    return {
      ...record,
      phone: maskPhoneDefault(record.phone),
      email: null,
      contactVisible: false,
    };
  }

  // 3. Institution (or Intermediary representing an institution) viewing its OWN students
  if (
    (viewer.role === 'institution' || viewer.role === 'intermediary') &&
    viewer.institutionId &&
    record.institutionId &&
    viewer.institutionId === record.institutionId
  ) {
    if (viewer.auditConfirmed) {
      return {
        ...record,
        phone: record.phone ?? null,
        email: record.email ?? null,
        contactVisible: true,
      };
    }
    // Fail closed if audit write failed or was omitted
    return {
      ...record,
      phone: null,
      email: null,
      contactVisible: false,
    };
  }

  // 4. Fail-closed default for all others:
  // - Cross-institution students
  // - Employer / ATS (never)
  // - MSME Department (never)
  // - Public / Anonymous (never)
  // - Other job_seekers (never)
  return {
    ...record,
    phone: null,
    email: null,
    contactVisible: false,
  };
}

/**
 * Pure function batch candidate contact redaction.
 * No I/O.
 */
export function redactCandidateContactsBatch<T extends CandidateContactRecord>(
  viewer: ViewerContext,
  records: readonly T[],
): BatchRedactionResult<T> {
  const redacted = records.map((record) => redactCandidateContact(viewer, record));
  const unmaskedCount = redacted.filter((r) => r.contactVisible).length;

  return {
    records: redacted,
    totalCount: records.length,
    unmaskedCount,
  };
}
