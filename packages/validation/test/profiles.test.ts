import { describe, it, expect } from 'vitest';
import { jobSeekerProfileSchema, businessProfileSchema, institutionProfileSchema } from '../src/profiles.js';

describe('Profile Validation Schemas - Issues #9, #10, #11', () => {
  it('validates Job Seeker profile and enforces DPDP consent for Aadhaar last 4', () => {
    // Fails without consent when Aadhaar last 4 provided
    expect(() =>
      jobSeekerProfileSchema.parse({
        fullName: 'Ramesh Kumar',
        seekerType: 'student',
        aadhaarLastFour: '4321',
        dpdpConsentGiven: false,
        city: 'Indore',
      }),
    ).toThrow();

    // Succeeds with consent
    const valid = jobSeekerProfileSchema.parse({
      fullName: 'Ramesh Kumar',
      seekerType: 'student',
      aadhaarLastFour: '4321',
      dpdpConsentGiven: true,
      skills: ['Tally', 'Hindi typing'],
      city: 'Indore',
    });

    expect(valid.fullName).toBe('Ramesh Kumar');
    expect(valid.aadhaarLastFour).toBe('4321');
  });

  it('validates Business Profile schema', () => {
    const valid = businessProfileSchema.parse({
      companyName: 'MP Textiles MSME',
      ownershipType: 'Proprietorship',
      companySize: 'Micro',
      sector: 'Manufacturing',
      address: '12 Industrial Area',
      city: 'Ujjain',
      district: 'Ujjain',
    });

    expect(valid.companyName).toBe('MP Textiles MSME');
    expect(valid.companySize).toBe('Micro');
  });

  it('validates Institution Profile schema', () => {
    const valid = institutionProfileSchema.parse({
      institutionName: 'Vikram University',
      affiliation: 'State Govt',
      address: 'University Road',
      contactPerson: 'Placement Cell Officer',
    });

    expect(valid.institutionName).toBe('Vikram University');
  });
});
