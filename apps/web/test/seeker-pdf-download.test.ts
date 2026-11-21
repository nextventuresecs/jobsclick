import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadSeekerPdfApi } from '../src/components/workspaces/seeker/seekerApi';

interface MockAnchor {
  click: () => void;
  href: string;
  download: string;
  parentNode: unknown;
}

interface MockBody {
  appendChild: (node: MockAnchor) => MockAnchor;
  removeChild: (node: MockAnchor) => MockAnchor;
}

describe('Seeker PDF Client Download Handler', () => {
  const originalDocument = globalThis.document;
  let mockAnchor: MockAnchor;

  beforeEach(() => {
    mockAnchor = {
      click: vi.fn(),
      href: '',
      download: '',
      parentNode: null,
    };

    const mockBody: MockBody = {
      appendChild: vi.fn((node: MockAnchor) => {
        node.parentNode = mockBody;
        return node;
      }),
      removeChild: vi.fn((node: MockAnchor) => {
        node.parentNode = null;
        return node;
      }),
    };

    (globalThis as unknown as { document: unknown }).document = {
      createElement: vi.fn(() => mockAnchor),
      body: mockBody,
    };
  });

  afterEach(() => {
    globalThis.document = originalDocument;
    vi.restoreAllMocks();
  });

  it('requests /profiles/seeker/me/pdf and triggers browser download link', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: {
        get: (h: string) => (h === 'content-type' ? 'application/json' : null),
      },
      json: async () => ({ downloadUrl: 'https://cdn.jobsclick.live/resume.pdf' }),
    } as unknown as Response);

    const success = await downloadSeekerPdfApi('http://localhost:3001', 'Bearer mock-token', 'usr-123', 'Priya Sharma');
    expect(success).toBe(true);
    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:3001/profiles/seeker/me/pdf',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer mock-token' }),
      })
    );

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockAnchor.click).toHaveBeenCalled();
  });
});
