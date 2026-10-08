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

export function isAuditLogImmutable(operation: 'INSERT' | 'UPDATE' | 'DELETE'): boolean {
  return operation === 'INSERT';
}
