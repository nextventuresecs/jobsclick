export interface ScopedRecord {
  id: string;
  user_id: string;
  is_public?: boolean;
}

export function canUserAccessRecord(requestorUserId: string, record: ScopedRecord): boolean {
  if (record.is_public === true) {
    return true;
  }
  return requestorUserId === record.user_id;
}

export interface ScopedApplicationRecord {
  id: string;
  applicant_id: string;
  job_employer_id: string;
}

export function canUserAccessApplication(
  requestorUserId: string,
  application: ScopedApplicationRecord
): boolean {
  return requestorUserId === application.applicant_id || requestorUserId === application.job_employer_id;
}

export interface ScopedInstitutionRecord {
  id: string;
  user_id: string;
  created_by?: string | null;
}

export function canUserManageInstitutionSponsorship(
  requestorUserId: string,
  requestorRole: string,
  institution: ScopedInstitutionRecord,
): boolean {
  if (requestorRole === 'admin' || requestorRole === 'msme_admin') {
    return true;
  }
  if (institution.user_id === requestorUserId) {
    return true;
  }
  if (requestorRole === 'intermediary' && institution.created_by === requestorUserId) {
    return true;
  }
  return false;
}

export function isAuditLogImmutable(operation: 'INSERT' | 'UPDATE' | 'DELETE'): boolean {
  return operation === 'INSERT';
}
