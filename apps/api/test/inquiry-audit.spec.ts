import { describe, expect, it, vi } from 'vitest';
import type { AuditLogRepository } from '../src/database/repositories/audit-log.repository.js';
import type { InquiryRepository } from '../src/database/repositories/inquiry.repository.js';
import type { ProfileRepository } from '../src/database/repositories/profile.repository.js';
import { InstitutionCmsService } from '../src/profiles/institution-cms.service.js';

describe('Institution inquiry audit', () => {
  it('does not return contact data or update leads after a failed audit write', async () => {
    const profile = { findInstitutionProfileByUserId: vi.fn().mockResolvedValue({ id: 'institution' }) };
    const inquiry = { id: 'inquiry', institution_id: 'institution', student_phone: 'synthetic-contact' };
    const repository = {
      findInquiriesByInstitutionId: vi.fn().mockResolvedValue([inquiry]),
      findInquiryById: vi.fn().mockResolvedValue(inquiry),
      updateInquiryStatus: vi.fn(),
    };
    const audit = { append: vi.fn().mockRejectedValue(new Error('audit unavailable')) };
    const service = new InstitutionCmsService(
      profile as unknown as ProfileRepository,
      repository as unknown as InquiryRepository,
      audit as unknown as AuditLogRepository,
    );
    const unavailable = { status: 503, response: { code: 'AUDIT_LOG_UNAVAILABLE' } };
    await expect(service.getInstitutionInquiries('staff')).rejects.toMatchObject(unavailable);
    await expect(service.updateInquiryStatus('staff', 'inquiry', 'contacted')).rejects.toMatchObject(unavailable);
    expect(repository.updateInquiryStatus).not.toHaveBeenCalled();
  });
});
