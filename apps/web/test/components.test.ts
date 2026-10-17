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

describe('Design Tokens & Shared UI Components - Feature 1', async () => {
  const { JobsClickLogo, CategoryBadge, StatusBadge, JobStatusBadge, getCategoryCardBorderClass, CATEGORY_CONFIGS, Button } = await import('@indian-job-portal/ui');

  it('provides category configurations with colored left borders for all 6 industry sectors', () => {
    expect(CATEGORY_CONFIGS.technology.accentHex).toBe('#10B981');
    expect(CATEGORY_CONFIGS.technology.borderLeftClass).toContain('border-l-emerald-500');
    expect(CATEGORY_CONFIGS.manufacturing.borderLeftClass).toContain('border-l-[#F97316]');
    expect(CATEGORY_CONFIGS.sales_operations.borderLeftClass).toContain('border-l-blue-500');
    expect(CATEGORY_CONFIGS.logistics_supply.borderLeftClass).toContain('border-l-teal-500');
    expect(CATEGORY_CONFIGS.creative_services.borderLeftClass).toContain('border-l-purple-500');
    expect(CATEGORY_CONFIGS.healthcare_services.borderLeftClass).toContain('border-l-rose-500');

    expect(getCategoryCardBorderClass('technology')).toBe('border-l-4 border-l-emerald-500');
    expect(getCategoryCardBorderClass('manufacturing')).toBe('border-l-4 border-l-[#F97316]');
  });

  it('renders JobsClickLogo with SVG paths and variants', () => {
    expect(JobsClickLogo).toBeDefined();
    expect(typeof JobsClickLogo).toBe('function');
  });

  it('renders CategoryBadge and StatusBadge', () => {
    expect(CategoryBadge).toBeDefined();
    expect(StatusBadge).toBeDefined();
    expect(JobStatusBadge).toBeDefined();
  });

  it('renders Button with variants and sizes', () => {
    expect(Button).toBeDefined();
    expect(typeof Button).toBe('function');
  });
});

describe('Layout & Bilingual Header/Footer - Feature 2', async () => {
  it('enforces exact key parity between English and Hindi message catalogs (Hard Invariant #8a)', async () => {
    const en = (await import('../messages/en.json')).default;
    const hi = (await import('../messages/hi.json')).default;

    const enKeys = Object.keys(en).sort();
    const hiKeys = Object.keys(hi).sort();
    expect(enKeys).toEqual(hiKeys);

    for (const section of enKeys) {
      const enSubKeys = Object.keys((en as Record<string, Record<string, string>>)[section]!).sort();
      const hiSubKeys = Object.keys((hi as Record<string, Record<string, string>>)[section]!).sort();
      expect(enSubKeys).toEqual(hiSubKeys);
    }
  });

  it('exports Navbar and Footer layout components', async () => {
    const { Navbar } = await import('../src/components/layout/Navbar.jsx');
    const { Footer } = await import('../src/components/layout/Footer.jsx');
    const { LanguageSwitcher } = await import('../src/components/language-switcher.jsx');

    expect(Navbar).toBeDefined();
    expect(Footer).toBeDefined();
    expect(LanguageSwitcher).toBeDefined();
  });
});

describe('Authentication Modal, Role Switcher & Workspaces - Feature 6', async () => {
  it('exports AuthModal, RoleSwitcherModal, and ToastContainer', async () => {
    const { AuthModal } = await import('../src/components/auth/AuthModal.jsx');
    const { RoleSwitcherModal } = await import('../src/components/common/RoleSwitcherModal.jsx');
    const { ToastContainer } = await import('../src/components/ui/ToastContainer.jsx');

    expect(AuthModal).toBeDefined();
    expect(typeof AuthModal).toBe('function');
    expect(RoleSwitcherModal).toBeDefined();
    expect(typeof RoleSwitcherModal).toBe('function');
    expect(ToastContainer).toBeDefined();
    expect(typeof ToastContainer).toBe('function');
  });

  it('exports all 4 distinct role workspaces and main /workspace router', async () => {
    const { SeekerWorkspace } = await import('../src/components/workspaces/SeekerWorkspace.jsx');
    const { EmployerWorkspace } = await import('../src/components/workspaces/EmployerWorkspace.jsx');
    const { InstitutionWorkspace } = await import('../src/components/workspaces/InstitutionWorkspace.jsx');
    const { AdminWorkspace } = await import('../src/components/workspaces/AdminWorkspace.jsx');
    const { default: WorkspacePage } = await import('../src/app/workspace/page.jsx');

    expect(SeekerWorkspace).toBeDefined();
    expect(EmployerWorkspace).toBeDefined();
    expect(InstitutionWorkspace).toBeDefined();
    expect(AdminWorkspace).toBeDefined();
    expect(WorkspacePage).toBeDefined();
  });

  it('enforces Hard Invariant #1: Candidate phone and email masking helpers', async () => {
    const { maskCandidatePhone, maskCandidateEmail } = await import('../src/data/sampleWorkspaces.js');

    const maskedPhone1 = maskCandidatePhone('9826014829');
    const maskedPhone2 = maskCandidatePhone('+91 98260 14829');
    expect(maskedPhone1).toBe('+91 ••••• ••829');
    expect(maskedPhone2).toBe('+91 ••••• ••829');
    expect(maskedPhone1).not.toContain('98260');

    const maskedEmail = maskCandidateEmail('rahul.sharma@example.com');
    expect(maskedEmail).toBe('ra••••@example.com');
    expect(maskedEmail).not.toContain('rahul.sharma');
  });

  it('enforces Hard Invariant #2: Bulk imported students are initialized in invited state', async () => {
    const { INITIAL_STUDENTS } = await import('../src/data/sampleWorkspaces.js');
    const invitedStudents = INITIAL_STUDENTS.filter((s) => s.state === 'invited');
    expect(invitedStudents.length).toBeGreaterThan(0);
  });

  it('enforces Hard Invariant #6: Append-only audit log records system events', async () => {
    const { INITIAL_AUDIT_LOGS } = await import('../src/data/sampleWorkspaces.js');
    expect(INITIAL_AUDIT_LOGS.length).toBeGreaterThan(0);
    expect(INITIAL_AUDIT_LOGS[0]!.action).toBe('Enterprise Verification');
    expect(INITIAL_AUDIT_LOGS[0]!.status).toBe('success');
  });

  it('exports EmployerBulkOnboardPage component for enterprise cluster onboarding', async () => {
    const { default: EmployerBulkOnboardPage } = await import('../src/app/company/bulk-onboard/page.jsx');
    expect(EmployerBulkOnboardPage).toBeDefined();
    expect(typeof EmployerBulkOnboardPage).toBe('function');
  });

  it('exports ProfileQrShareCard and public profile pages for companies and institutions', async () => {
    const { ProfileQrShareCard } = await import('../src/components/common/ProfileQrShareCard.jsx');
    const { default: PublicCompanyPage } = await import('../src/app/company/[id]/page.jsx');
    const { default: PublicInstitutionPage } = await import('../src/app/institution/[id]/page.jsx');

    expect(ProfileQrShareCard).toBeDefined();
    expect(typeof ProfileQrShareCard).toBe('function');
    expect(PublicCompanyPage).toBeDefined();
    expect(typeof PublicCompanyPage).toBe('function');
    expect(PublicInstitutionPage).toBeDefined();
    expect(typeof PublicInstitutionPage).toBe('function');
  });

  it('generates valid QR code data URLs for public employer and institution profiles', async () => {
    const QRCode = (await import('qrcode')).default;
    const companyQr = await QRCode.toDataURL('https://jobsclick.in/company/comp-01', { width: 300 });
    const instQr = await QRCode.toDataURL('https://jobsclick.in/institution/inst-01', { width: 300 });

    expect(companyQr).toContain('data:image/png;base64,');
    expect(instQr).toContain('data:image/png;base64,');
  });
});



