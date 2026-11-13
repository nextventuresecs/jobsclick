import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateBusinessProfileApi, postNewJobApi, updateAppStatusApi } from '../src/components/workspaces/employer/employerApi';
import { saveSeekerProfile } from '../src/components/workspaces/seeker/seekerApi';
import { updateInstitutionCms, updateInquiryStatus } from '../src/components/workspaces/institution/institutionApi';
import type { CompanyItem } from '../src/data/sampleCompanies';

describe('PR 2: No Fake Success (P1)', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = originalFetch;
  });

  describe('Employer API: Fail Loudly & Comprehensive Payloads', () => {
    const fullCompany: CompanyItem = {
      id: 'comp_123',
      name: 'Aarya Precision Pvt Ltd',
      sector: 'Manufacturing',
      enterpriseSize: 'Small',
      ownershipType: 'Private Limited',
      address: 'Plot 42, MIDC',
      city: 'Pune',
      district: 'Pune',
      state: 'Maharashtra',
      description: 'Precision machining solutions',
      udyamNumber: 'UDYAM-MH-01-0012345',
      verified: true,
      activeJobsCount: 2,
      phone: '9876543210',
      email: 'contact@aaryaprecision.in',
      website: 'https://aaryaprecision.in',
      founderOrDirector: 'Rajesh Sharma',
      designation: 'Managing Director',
      yearOfRegistration: '2015',
      commencementYear: '2016',
      directorPhotoUrl: 'https://aaryaprecision.in/director.jpg',
      knowMyBusiness: 'CNC turning and milling components',
      productsBrief: 'Automotive brass valves, precision gears',
      servicesBrief: 'Custom component machining',
      isMsme: true,
      isDpiitStartup: false,
      socialMedia: {
        instagram: 'https://instagram.com/aaryaprecision',
        facebook: 'https://facebook.com/aaryaprecision',
        youtube: 'https://youtube.com/@aaryaprecision',
      },
    };

    it('updateBusinessProfileApi sends ALL 24 fields and throws on API 500 error', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      global.fetch = vi.fn().mockImplementation(async (_url, opts) => {
        capturedBody = JSON.parse(opts.body as string);
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ message: 'Database transaction failed' }),
        };
      });

      // Must throw an error on failure, not silently swallow in empty catch
      await expect(
        updateBusinessProfileApi('http://localhost:3001', 'Bearer valid_token', 'comp_123', fullCompany)
      ).rejects.toThrow();

      // Verify comprehensive payload fields were sent
      expect(capturedBody).not.toBeNull();
      expect(capturedBody!['companyName']).toBe('Aarya Precision Pvt Ltd');
      expect(capturedBody!['founderOrDirector']).toBe('Rajesh Sharma');
      expect(capturedBody!['phone']).toBe('9876543210');
      expect(capturedBody!['email']).toBe('contact@aaryaprecision.in');
      expect(capturedBody!['website']).toBe('https://aaryaprecision.in');
      expect(capturedBody!['udyamNumber']).toBe('UDYAM-MH-01-0012345');
      expect(capturedBody!['isMsme']).toBe(true);
      expect(capturedBody!['productsBrief']).toBe('Automotive brass valves, precision gears');
      expect(capturedBody!['servicesBrief']).toBe('Custom component machining');
      expect(capturedBody!['socialMedia']).toEqual({
        instagram: 'https://instagram.com/aaryaprecision',
        facebook: 'https://facebook.com/aaryaprecision',
        youtube: 'https://youtube.com/@aaryaprecision',
      });
    });

    it('postNewJobApi throws on API error instead of returning null or generating fake id', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Cannot save job' }),
      }));

      await expect(
        postNewJobApi('http://localhost:3001', 'Bearer token', 'usr_emp_1', { title: 'Welder' })
      ).rejects.toThrow();
    });

    it('updateAppStatusApi throws on API error instead of silently swallowing', async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'Invalid stage transition' }),
      }));

      await expect(
        updateAppStatusApi('http://localhost:3001', 'Bearer token', 'usr_emp_1', 'app_1', 'shortlisted')
      ).rejects.toThrow();
    });
  });

  describe('Seeker API: Fail Loudly on Network/API Errors', () => {
    it('saveSeekerProfile throws or returns failure on network error without fake success', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));

      await expect(
        saveSeekerProfile('http://localhost:3001', 'Bearer token', 'usr_seek_1', { fullName: 'Amit Kumar' })
      ).rejects.toThrow();
    });

    it('saveSeekerProfile throws on HTTP 500 without pretending success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Profile write failed' }),
      });

      await expect(
        saveSeekerProfile('http://localhost:3001', 'Bearer token', 'usr_seek_1', { fullName: 'Amit Kumar' })
      ).rejects.toThrow();
    });
  });

  describe('Razorpay Configuration: No Dummy Key Fallbacks', () => {
    it('RechargeModal configuration fails closed if NEXT_PUBLIC_RAZORPAY_KEY_ID is missing', async () => {
      const originalKey = process.env['NEXT_PUBLIC_RAZORPAY_KEY_ID'];
      delete process.env['NEXT_PUBLIC_RAZORPAY_KEY_ID'];

      try {
        const { getRazorpayKeyId } = await import('../src/components/wallet/RechargeModal.js');
        expect(() => getRazorpayKeyId()).toThrow(/NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured/);
      } finally {
        if (originalKey) {
          process.env['NEXT_PUBLIC_RAZORPAY_KEY_ID'] = originalKey;
        }
      }
    });

    it('RechargeModal rejects dummy key rzp_test_dummy_key_id', async () => {
      const { getRazorpayKeyId } = await import('../src/components/wallet/RechargeModal.js');
      expect(() => getRazorpayKeyId('rzp_test_dummy_key_id')).toThrow(/NEXT_PUBLIC_RAZORPAY_KEY_ID is not configured/);
    });
  });

  describe('Institution CMS & Inquiries API: Fail Loudly', () => {
    it('updateInstitutionCms throws on non-2xx status code', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ message: 'Unauthorized staff role' }),
      });

      await expect(
        updateInstitutionCms('http://localhost:3001', 'fake_token', {
          courses: [],
          subjects: [],
          feeStructure: [],
          departments: [],
          faculty: [],
          welcomeText: 'Welcome to accredited campus',
        })
      ).rejects.toThrow(/Failed to update institution CMS content/);
    });

    it('updateInquiryStatus throws on non-2xx status code', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ message: 'Database error' }),
      });

      await expect(
        updateInquiryStatus('http://localhost:3001', 'fake_token', 'inq_123', 'contacted')
      ).rejects.toThrow(/Failed to update inquiry status/);
    });
  });
});
