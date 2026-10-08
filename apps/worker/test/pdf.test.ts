import { describe, it, expect } from 'vitest';
import { PdfGeneratorService } from '../src/pdf/pdf-generator.js';

describe('PdfGeneratorService - Issue #12 (JS-03)', () => {
  it('generates PDF in under 500ms and utilizes cache on subsequent calls', async () => {
    const service = new PdfGeneratorService();
    const data = {
      seekerId: 'seeker_test_100',
      fullName: 'Rahul Verma',
      seekerType: 'student',
      city: 'Indore',
      skills: ['Tally', 'Accounting', 'Hindi Typing'],
      updatedAt: Date.now() - 1000,
    };

    // First call generates fresh PDF
    const result1 = await service.generateSeekerPdf(data);
    expect(result1.fromCache).toBe(false);
    expect(result1.buffer.length).toBeGreaterThan(0);
    expect(result1.generationTimeMs).toBeLessThan(500);

    // Second call serves from cache
    const result2 = await service.generateSeekerPdf(data);
    expect(result2.fromCache).toBe(true);
    expect(result2.generationTimeMs).toBeLessThan(50);
  });
});
