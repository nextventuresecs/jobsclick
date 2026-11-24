import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { downloadSeekerPdfApi } from '../src/components/workspaces/seeker/seekerApi';

interface MockAnchor {
  click: () => void;
  remove: () => void;
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
      remove: vi.fn(),
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

  it('requests the authenticated web route and triggers the signed download link', async () => {
    const signedUrl = 'https://storage.example.test/resume.pdf';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ downloadUrl: signedUrl }));

    await downloadSeekerPdfApi('Priya Sharma');
    expect(fetchMock).toHaveBeenCalledWith('/api/profiles/seeker/me/pdf', { cache: 'no-store' });

    expect(document.createElement).toHaveBeenCalledWith('a');
    expect(mockAnchor.href).toBe(signedUrl);
    expect(mockAnchor.click).toHaveBeenCalled();
    expect(mockAnchor.remove).toHaveBeenCalled();
  });
});
