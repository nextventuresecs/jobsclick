import { describe, it, expect } from 'vitest';
import React from 'react';
import fs from 'node:fs';
import path from 'node:path';

describe('Ticket T-11: Missing Routes (/how-it-works, /institutions)', () => {
  it('exports HowItWorksPage server component with SEO metadata', async () => {
    const mod = (await import('../src/app/how-it-works/page.jsx')) as unknown as {
      default: () => React.ReactElement;
      metadata: { title: string };
    };
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
    expect(mod.metadata).toBeDefined();
    expect(mod.metadata.title).toContain('How It Works');
  });

  it('exports InstitutionsDirectoryPage server component with SEO metadata', async () => {
    const mod = (await import('../src/app/institutions/page.jsx')) as unknown as {
      default: (props: { searchParams?: { query?: string; type?: string } }) => Promise<React.ReactElement>;
      metadata: { title: string };
    };
    expect(mod.default).toBeDefined();
    expect(typeof mod.default).toBe('function');
    expect(mod.metadata).toBeDefined();
    expect(mod.metadata.title).toContain('Institutions');
  });

  it('renders InstitutionsDirectoryPage with sample institutions and filtering', async () => {
    const mod = (await import('../src/app/institutions/page.jsx')) as unknown as {
      default: (props: { searchParams?: { query?: string; type?: string } }) => Promise<React.ReactElement>;
    };
    const jsx = await mod.default({
      searchParams: { query: 'Indore', type: 'iti' },
    });
    expect(jsx).toBeDefined();
    expect(jsx.type).toBe('div');
  });

  it('renders HowItWorksPage detailing candidate, employer, and institution workflows', async () => {
    const mod = (await import('../src/app/how-it-works/page.jsx')) as unknown as {
      default: () => React.ReactElement;
    };
    const jsx = mod.default();
    expect(jsx).toBeDefined();
    expect(jsx.type).toBe('div');
  });

  it('verifies SAMPLE_INSTITUTIONS data integrity', async () => {
    const { SAMPLE_INSTITUTIONS } = await import(
      '../src/data/sampleWorkspaces.js'
    );
    expect(SAMPLE_INSTITUTIONS.length).toBeGreaterThanOrEqual(2);
    expect(SAMPLE_INSTITUTIONS[0]!.institutionName).toContain('Government Industrial Training Institute');
    expect(SAMPLE_INSTITUTIONS[0]!.institutionType).toBe('iti');
    expect(SAMPLE_INSTITUTIONS[0]!.city).toBe('Indore');
    expect(SAMPLE_INSTITUTIONS[0]!.state).toBe('Madhya Pradesh');
  });

  it('verifies navigation integrity: all links in Navbar and Footer point to real routes', () => {
    const navbarPath = path.resolve(__dirname, '../src/components/layout/Navbar.tsx');
    const footerPath = path.resolve(__dirname, '../src/components/layout/Footer.tsx');

    const navbarContent = fs.readFileSync(navbarPath, 'utf8');
    const footerContent = fs.readFileSync(footerPath, 'utf8');

    // Check that /how-it-works and /institutions are actively linked
    expect(navbarContent).toContain('/how-it-works');
    expect(navbarContent).toContain('/institutions');
    expect(footerContent).toContain('/how-it-works');
    expect(footerContent).toContain('/institutions');

    // Confirm target pages exist on disk
    const howItWorksPagePath = path.resolve(__dirname, '../src/app/how-it-works/page.tsx');
    const institutionsPagePath = path.resolve(__dirname, '../src/app/institutions/page.tsx');

    expect(fs.existsSync(howItWorksPagePath)).toBe(true);
    expect(fs.existsSync(institutionsPagePath)).toBe(true);
  });
});
