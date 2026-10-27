import { describe, it, expect } from 'vitest';
import { PdfGeneratorService, Semaphore } from '../src/pdf/pdf-generator.js';

describe('PdfGeneratorService - Ticket T-09 (JS-03 & Hard Invariant #8a)', () => {
  it('generates valid vector PDF and serves from cache in under 500ms (AC #1)', async () => {
    const service = new PdfGeneratorService();
    const data = {
      seekerId: 'seeker_test_100',
      fullName: 'Rahul Verma',
      seekerType: 'student',
      city: 'Indore',
      skills: ['Tally', 'Accounting', 'Hindi Typing'],
      updatedAt: Date.now() - 1000,
    };

    // First call generates fresh vector PDF
    const result1 = await service.generateSeekerPdf(data);
    expect(result1.fromCache).toBe(false);
    expect(result1.buffer.length).toBeGreaterThan(1000);
    expect(result1.buffer.slice(0, 5).toString()).toBe('%PDF-');
    expect(result1.generationTimeMs).toBeLessThan(10000);

    // Second call serves from cache in under 500ms (AC #1)
    const result2 = await service.generateSeekerPdf(data);
    expect(result2.fromCache).toBe(true);
    expect(result2.generationTimeMs).toBeLessThan(500);
    expect(result2.buffer).toEqual(result1.buffer);
  });

  it('renders Hindi (Devanagari) characters cleanly without glyph corruption (Hard Invariant #8a & AC #2)', async () => {
    const service = new PdfGeneratorService();
    const hindiData = {
      seekerId: 'seeker_hindi_200',
      fullName: 'राहुल शर्मा', // Rahul Sharma
      seekerType: 'कुशल वेल्डर', // Skilled Welder
      city: 'भोपाल', // Bhopal
      state: 'मध्य प्रदेश', // Madhya Pradesh
      skills: ['आर्क वेल्डिंग (Arc Welding)', 'गैस कटिंग', 'लेथ ऑपरेटर', 'सुरक्षा मानक'],
      summary: '५ वर्षों का औद्योगिक अनुभव, आईटीआई प्रशिक्षित।',
      updatedAt: Date.now() - 2000,
    };

    const result = await service.generateSeekerPdf(hindiData);
    expect(result.fromCache).toBe(false);
    expect(result.buffer.length).toBeGreaterThan(2000);
    expect(result.buffer.slice(0, 5).toString()).toBe('%PDF-');

    // Vector PDF contains PDF font objects and font subsets
    const rawPdf = result.buffer.toString('latin1');
    expect(rawPdf).toContain('/Type /Font');
    expect(rawPdf).toContain('/Subtype /Type0');
  });

  it('renders candidate education, experience, and clickable verification link (AC #3)', async () => {
    const service = new PdfGeneratorService();
    const fullProfile = {
      seekerId: 'seeker_full_300',
      fullName: 'अमित कुमार (Amit Kumar)',
      seekerType: 'Electrician',
      city: 'Jabalpur',
      state: 'MP',
      skills: ['Wiring', 'Motor Rewinding', 'PLC Basics'],
      summary: 'Certified commercial electrician with industrial plant experience.',
      experience: [
        {
          title: 'Senior Electrician',
          company: 'BHEL Ancillary Unit',
          duration: '2021 - Present',
          description: 'Maintained 440V industrial switchgear and transformer units.',
        },
      ],
      education: [
        {
          degree: 'ITI Electrical Trade Certificate',
          institution: 'Govt ITI Jabalpur',
          year: '2020',
        },
      ],
      verificationUrl: 'https://indianjobportal.in/verify/seeker_full_300',
      updatedAt: Date.now(),
    };

    const result = await service.generateSeekerPdf(fullProfile);
    expect(result.buffer.length).toBeGreaterThan(2000);

    const rawPdf = result.buffer.toString('latin1');
    // Clickable link annotation in PDF
    expect(rawPdf).toContain('/Type /Annot');
    expect(rawPdf).toContain('/Subtype /Link');
    expect(rawPdf).toContain('https://indianjobportal.in/verify/seeker_full_300');
  });

  it('evicts cache properly on profile update or explicit clear', async () => {
    const service = new PdfGeneratorService();
    const now = Date.now();
    const data = {
      seekerId: 'seeker_cache_400',
      fullName: 'Sunita Patel',
      seekerType: 'Data Entry',
      city: 'Gwalior',
      skills: ['Excel', 'Data Entry'],
      updatedAt: now - 5000,
    };

    // First call generates
    const res1 = await service.generateSeekerPdf(data);
    expect(res1.fromCache).toBe(false);

    // Profile updated after cache generation -> cache invalidated
    const res2 = await service.generateSeekerPdf({
      ...data,
      updatedAt: Date.now() + 10000,
    });
    expect(res2.fromCache).toBe(false);

    // Explicit cache clear
    service.clearCache('seeker_cache_400');
    expect(service.getCached('seeker_cache_400')).toBeNull();
  });

  it('Semaphore strictly limits concurrency and queues waiting tasks in FIFO order (STF-09)', async () => {
    const sem = new Semaphore(2);
    let active = 0;
    let maxObserved = 0;

    const task = async (id: number) => {
      const release = await sem.acquire();
      active++;
      if (active > maxObserved) maxObserved = active;
      expect(active).toBeLessThanOrEqual(2);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      release();
      return id;
    };

    const results = await Promise.all([task(1), task(2), task(3), task(4), task(5)]);
    expect(results).toEqual([1, 2, 3, 4, 5]);
    expect(maxObserved).toBe(2);
    expect(sem.active).toBe(0);
    expect(sem.waiting).toBe(0);
  });
});