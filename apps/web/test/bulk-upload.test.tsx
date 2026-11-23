import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, expect, it, vi } from 'vitest';
import messages from '../messages/en.json';
import EmployerBulkOnboardPage from '../src/app/company/bulk-onboard/page';
import { uploadBulkRoster } from '../src/lib/bulk-upload';

vi.mock('../src/components/layout/Navbar', () => ({ Navbar: () => null }));
vi.mock('../src/components/layout/Footer', () => ({ Footer: () => null }));

afterEach(() => vi.unstubAllGlobals());

it('opens employer onboarding with an empty roster and a disabled queue button', () => {
  const html = renderToStaticMarkup(
    <NextIntlClientProvider locale="en" timeZone="UTC" messages={{ BulkOnboard: messages.BulkOnboard }}>
      <EmployerBulkOnboardPage />
    </NextIntlClientProvider>,
  );
  expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
  expect(html).not.toContain('Shree Ganesh Textiles');
  expect(html).not.toContain('value="District Industries Centre');
  expect(html.match(/<button[^>]*type="submit"[^>]*>/)?.[0]).toContain('disabled');
});

it('submits the selected Excel file through the authenticated multipart route', async () => {
  const file = new File(['synthetic workbook bytes'], 'roster.xlsx');
  const send = vi.fn().mockResolvedValue(Response.json({ id: 'batch-1', source: 'District Office', totalRows: 1 }));
  vi.stubGlobal('fetch', send);
  await expect(uploadBulkRoster(' District Office ', 'employer', file)).resolves.toMatchObject({ id: 'batch-1' });
  const [url, request] = send.mock.calls[0]!;
  expect(url).toBe('/api/bulk/batches/file');
  expect(request.body.get('source')).toBe('District Office');
  expect(request.body.get('entityType')).toBe('employer');
  expect(request.body.get('file')).toBe(file);
});
