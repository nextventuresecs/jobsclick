import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../src/middleware.js';

describe('AUTH-07 / AUTH-05 locale routing boundaries', () => {
  it.each(['/hi//api/auth/otp/send', '/en//other.invalid/jobs', '//other.invalid/jobs'])('rejects ambiguous leading slashes at %s without aliasing or redirecting', path => {
    const response = middleware(new NextRequest('https://jobsclick.live' + path));
    expect(response.status).toBe(400);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('Link')).toBeNull();
  });

  it('rewrites Hindi pages with their query and a server-selected locale, stripping spoofed identity', () => {
    const response = middleware(new NextRequest('https://jobsclick.live/hi/jobs?city=Pune', {
      headers: { 'x-user-id': 'synthetic-spoof', 'x-user-role': 'admin', 'x-user-status': 'active', 'x-next-locale': 'en', 'x-locale': 'en' },
    }));
    expect(response.headers.get('x-middleware-rewrite')).toBe('https://jobsclick.live/jobs?city=Pune');
    expect(response.headers.get('x-middleware-request-x-next-locale')).toBe('hi');
    for (const header of ['x-user-id', 'x-user-role', 'x-user-status', 'x-locale']) {
      expect(response.headers.get('x-middleware-request-' + header)).toBeNull();
    }
    expect(response.headers.get('Link')).not.toContain('?city=');
  });

  it.each(['/hi/workspace', '/en/workspace', '/hi/company/bulk-onboard', '/en/company/bulk-onboard'])('keeps unauthenticated %s behind the existing session gate', path => {
    const response = middleware(new NextRequest('https://jobsclick.live' + path));
    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://jobsclick.live/?authRequired=1');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it.each(['/hi/api/auth/otp/send', '/en/api/backend/jobs/example/apply'])('never creates a localized API alias at %s', path => {
    const response = middleware(new NextRequest('https://jobsclick.live' + path, { method: 'POST' }));
    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
  });

  it('matches whole locale segments and overrides a spoofed locale on ordinary English pages', () => {
    const response = middleware(new NextRequest('https://jobsclick.live/history', { headers: { 'x-next-locale': 'hi', 'x-locale': 'hi' } }));
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(response.headers.get('x-middleware-request-x-next-locale')).toBe('en');
    expect(response.headers.get('x-middleware-request-x-locale')).toBeNull();
  });

  it('canonicalizes English prefixes without losing a search query', () => {
    const response = middleware(new NextRequest('https://jobsclick.live/en/jobs?city=Pune'));
    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe('https://jobsclick.live/jobs?city=Pune');
  });
});
