import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from '../src/components/social-embed.jsx';

describe('Social Media Embed & Polish Pass - Issue #31 & #33', () => {
  it('sanitizes social media URLs to prevent malicious script injection', () => {
    expect(sanitizeUrl('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('https://www.youtube.com/embed/dQw4w9WgXcQ');
    expect(sanitizeUrl('https://www.instagram.com/p/C12345/')).toBe('https://www.instagram.com/p/C12345/');
    expect(sanitizeUrl('javascript:alert("xss")')).toBe('');
    expect(sanitizeUrl('https://malicious-site.com/phish')).toBe('');
  });
});
