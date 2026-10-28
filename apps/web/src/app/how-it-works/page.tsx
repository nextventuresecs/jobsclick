import React from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import {
  Smartphone,
  ShieldCheck,
  CheckCircle2,
  Briefcase,
  Building2,
  GraduationCap,
  FileSpreadsheet,
  QrCode,
  Lock,
  ArrowRight,
  Users,
  EyeOff,
  Coins,
  Sparkles,
} from 'lucide-react';

export const metadata = {
  title: 'How It Works — JobsClick | Indian Job Portal for MSMEs & Skilled Workforce',
  description:
    'Learn how JobsClick connects Indian job seekers, verified MSMEs, and technical training institutions (ITIs & Polytechnics) through transparent, privacy-first hiring.',
};

export default function HowItWorksPage() {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'How JobsClick Works - Candidate, Employer, and Institution Workflows',
    description:
      'Step-by-step guide for blue and grey collar job seekers, MSME employers, and vocational colleges to connect directly without middlemen.',
    url: 'https://jobsclick.live/how-it-works',
    publisher: {
      '@type': 'Organization',
      name: 'JobsClick India',
      url: 'https://jobsclick.live',
    },
    mainEntity: [
      {
        '@type': 'HowTo',
        name: 'How Job Seekers Find Verified MSME Employment',
        step: [
          {
            '@type': 'HowToStep',
            name: 'Instant OTP Sign-in',
            text: 'Sign in instantly with your mobile number and OTP. No passwords or complicated forms.',
          },
          {
            '@type': 'HowToStep',
            name: 'Build Verified Trade Profile',
            text: 'Add your ITI or Polytechnic trades, certificates, and job preferences. Aadhaar verification stores only last 4 digits.',
          },
          {
            '@type': 'HowToStep',
            name: '1-Click Direct Application',
            text: 'Apply directly to verified MSME job postings with transparent salaries.',
          },
          {
            '@type': 'HowToStep',
            name: 'Protected Privacy & In-Platform Chat',
            text: 'Employers never see your phone or email. Communicate and receive interview requests securely in-platform.',
          },
        ],
      },
      {
        '@type': 'HowTo',
        name: 'How MSME Employers Hire Certified Technical Talent',
        step: [
          {
            '@type': 'HowToStep',
            name: 'Udyam Enterprise Verification',
            text: 'Register with your Udyam or GSTIN number to earn a verified employer badge.',
          },
          {
            '@type': 'HowToStep',
            name: 'Post Transparent Job Openings',
            text: 'Specify trades, monthly wage, shift timings, and factory location.',
          },
          {
            '@type': 'HowToStep',
            name: 'Review Applicants with Masked ATS',
            text: 'Assess skills, certifications, and experience with candidate contact details masked.',
          },
          {
            '@type': 'HowToStep',
            name: 'In-Platform Interviews & Walk-in QR Posters',
            text: 'Schedule interviews in-app and print factory gate QR code posters for local walk-in candidates.',
          },
        ],
      },
      {
        '@type': 'HowTo',
        name: 'How Technical Institutions & ITIs Manage Campus Placements',
        step: [
          {
            '@type': 'HowToStep',
            name: 'Placement Directorate Verification',
            text: 'Register with DGT, NCVT, AICTE, or State Directorate affiliation codes.',
          },
          {
            '@type': 'HowToStep',
            name: 'Bulk Batch Onboarding (CSV)',
            text: 'Upload student rosters via CSV in minutes. Students enter the invited state.',
          },
          {
            '@type': 'HowToStep',
            name: 'Controlled Invites with SMS Cost Preview',
            text: 'Preview SMS costs and dispatch batch invitations without unsolicited spam.',
          },
          {
            '@type': 'HowToStep',
            name: 'Placement Tracking & Industry Linkage',
            text: 'Monitor employment metrics, connect students to verified MSMEs, and fulfill placement reports.',
          },
        ],
      },
    ],
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans">
      <Navbar />

      {/* Structured SEO Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Banner */}
      <section className="bg-gradient-to-b from-white via-orange-50/20 to-[#F3F4F6] border-b border-gray-200 pt-12 pb-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-orange-100 text-brand-orange border border-orange-200">
            <Sparkles className="w-3.5 h-3.5" />
            <span>National Employment & Skill Verification Ecosystem</span>
          </div>

          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-gray-900 tracking-tight max-w-4xl mx-auto">
            How JobsClick Bridges India’s{' '}
            <span className="text-brand-orange">Skilled Workforce</span> &amp; MSMEs
          </h1>

          <p className="text-base sm:text-lg text-gray-600 max-w-2xl mx-auto leading-relaxed">
            A transparent, privacy-protected platform connecting certified ITI, Polytechnic, and
            vocational talent directly with verified industrial enterprises — without recruitment brokers.
          </p>

          {/* Quick Jump Buttons */}
          <div className="flex flex-wrap items-center justify-center gap-3 pt-4">
            <a
              href="#candidates"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:text-brand-orange hover:border-brand-orange transition-all shadow-sm"
            >
              <Users className="w-4 h-4 text-brand-orange" />
              <span>For Job Seekers</span>
            </a>
            <a
              href="#employers"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:text-brand-orange hover:border-brand-orange transition-all shadow-sm"
            >
              <Building2 className="w-4 h-4 text-brand-orange" />
              <span>For MSME Employers</span>
            </a>
            <a
              href="#institutions"
              className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-lg border border-gray-300 text-sm font-semibold text-gray-700 hover:text-brand-orange hover:border-brand-orange transition-all shadow-sm"
            >
              <GraduationCap className="w-4 h-4 text-brand-orange" />
              <span>For Colleges &amp; ITIs</span>
            </a>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-20 w-full">
        {/* Section 1: Candidates */}
        <section id="candidates" className="scroll-mt-24 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-orange">
                <Users className="w-4 h-4" />
                <span>Job Seeker &amp; Graduate Journey</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                Your Direct Route to Verified Employment
              </h2>
            </div>
            <p className="text-sm text-gray-600 max-w-md">
              No recruitment commissions. 100% free for candidates. Your personal phone and email are never exposed to recruiters.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                1
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Instant Mobile OTP</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Sign in with your 10-digit mobile number and receive a fast SMS OTP. No password memorization, optimized for low-bandwidth 4G phones.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Turnstile bot-protected</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                2
              </div>
              <div className="flex items-center gap-2 mb-2">
                <ShieldCheck className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Verified Trade Profile</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Add your technical trade (Electrician, Fitter, CNC, Welder, COPA), certifications, and experience. Optional Aadhaar verification records only the last 4 digits.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hard Invariant #8: No full Aadhaar stored</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                3
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">1-Click Direct Apply</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Browse verified openings by sector, trade, salary, and district. Apply with a single click. Your profile is instantly submitted to the employer&apos;s pipeline.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Transparent salary &amp; shift info</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                4
              </div>
              <div className="flex items-center gap-2 mb-2">
                <EyeOff className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Guaranteed Privacy</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Recruiters never see your phone number or email. You receive interview invitations and updates securely inside your dashboard. Or scan QR codes at factory gates for walk-in drives.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hard Invariant #1: Masked contact</span>
              </div>
            </div>
          </div>

          {/* Privacy Callout Banner */}
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-emerald-900">
                  Hard Invariant #1: Zero Contact Leakage Guarantee
                </h4>
                <p className="text-xs text-emerald-700 mt-0.5">
                  Employers and third parties never see your raw contact info. You will never receive unsolicited marketing spam or cold calls from recruiters.
                </p>
              </div>
            </div>
            <Link
              href="/jobs"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors shadow-sm"
            >
              <span>Explore Verified Jobs</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>

        {/* Section 2: Employers */}
        <section id="employers" className="scroll-mt-24 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-orange">
                <Building2 className="w-4 h-4" />
                <span>MSME &amp; Industrial Employer Journey</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                Hire Certified Tradespeople Directly
              </h2>
            </div>
            <p className="text-sm text-gray-600 max-w-md">
              Fill production shifts faster with certified ITI and polytechnic candidates from nearby districts. No recruitment agency commission fees.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                1
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Udyam Registration</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Sign in and verify your MSME credentials using your Udyam registration number, GSTIN, or PAN. Get an official verified enterprise badge.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Verified business trust score</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                2
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Post Trade Openings</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Publish openings specifying required ITI trades, experience, monthly wages, overtime terms, and plant location. Vacancies appear immediately in search.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>JobPosting Schema.org indexed</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                3
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Masked ATS Pipeline</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Review applicant qualifications, vocational certificates, and trade experience in your workspace ATS. Contact details remain masked to protect applicant privacy.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5 text-emerald-600" />
                <span>Masked phone: +91 ••••• ••120</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                4
              </div>
              <div className="flex items-center gap-2 mb-2">
                <QrCode className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">QR Posters &amp; In-App Chat</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Send interview invitations and status changes directly in the portal. Generate and print QR code posters for factory gates to capture local walk-in candidates.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-brand-orange" />
                <span>Factory gate walk-in poster generator</span>
              </div>
            </div>
          </div>

          {/* Employer Callout Banner */}
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <Building2 className="w-6 h-6 text-brand-orange shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-gray-900">
                  Ready to post a vacancy for your manufacturing or service unit?
                </h4>
                <p className="text-xs text-gray-600 mt-0.5">
                  Publish openings in under 2 minutes. Reach candidates certified by NCVT and State Technical Boards across your district.
                </p>
              </div>
            </div>
            <Link
              href="/workspace"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange hover:bg-orange-600 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors shadow-sm"
            >
              <span>Access Employer Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>

        {/* Section 3: Institutions */}
        <section id="institutions" className="scroll-mt-24 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-gray-200 pb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-orange">
                <GraduationCap className="w-4 h-4" />
                <span>Institution &amp; Placement Cell Journey</span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mt-1">
                Bridge Your Graduating Batches with Local Industry
              </h2>
            </div>
            <p className="text-sm text-gray-600 max-w-md">
              For Government ITIs, Polytechnics, and Vocational Training Centers. Streamline campus drives, bulk onboard students, and track placement metrics.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 1 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                1
              </div>
              <div className="flex items-center gap-2 mb-2">
                <GraduationCap className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Directorate Onboarding</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Register with your DGT, NCVT, AICTE, or State Directorate affiliation codes. Set up your official Training &amp; Placement Cell (TPO) profile.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Affiliation code verification</span>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                2
              </div>
              <div className="flex items-center gap-2 mb-2">
                <FileSpreadsheet className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Bulk Batch Import (CSV)</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Upload student rosters with names, mobile numbers, trades, and roll numbers via CSV (BULK-01). Candidates are safely registered in <code className="text-xs bg-gray-100 px-1 py-0.5 rounded font-mono">invited</code> status.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>Hard Invariant #2: No SMS on import</span>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                3
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Coins className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">SMS Cost Preview</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Dispatch invite SMS in controlled batches with a full cost preview beforehand. Students click their unique invite link to claim their pre-filled profile and trade badges.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-emerald-700 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Zero unsolicited spam</span>
              </div>
            </div>

            {/* Step 4 */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow relative flex flex-col">
              <div className="w-10 h-10 rounded-lg bg-orange-50 text-brand-orange flex items-center justify-center font-bold text-lg mb-4 border border-orange-100">
                4
              </div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-gray-700" />
                <h3 className="font-bold text-gray-900 text-base">Placement Tracking</h3>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed flex-1">
                Track how many students from each trade have secured apprenticeships or full-time roles with verified MSMEs. Generate official directorate compliance summaries.
              </p>
              <div className="mt-4 pt-4 border-t border-gray-100 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Trade-wise employment analytics</span>
              </div>
            </div>
          </div>

          {/* Institution Callout Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <GraduationCap className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-bold text-blue-900">
                  Explore the National Directory of Affiliated Colleges &amp; ITIs
                </h4>
                <p className="text-xs text-blue-700 mt-0.5">
                  Browse affiliated vocational centers, check annual capacity, and discover trades offered across industrial districts.
                </p>
              </div>
            </div>
            <Link
              href="/institutions"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shrink-0 transition-colors shadow-sm"
            >
              <span>View Institution Directory</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </section>

        {/* Section 4: Architectural Invariants & Trust Grid */}
        <section className="bg-white rounded-2xl border border-gray-200 p-8 shadow-sm space-y-6">
          <div className="text-center max-w-2xl mx-auto space-y-2">
            <h2 className="text-2xl font-bold text-gray-900">
              Built on Uncompromising Privacy &amp; Trust Invariants
            </h2>
            <p className="text-sm text-gray-600">
              JobsClick enforces strict architectural invariants to ensure safety, dignity, and regulatory compliance under India&apos;s Digital Personal Data Protection (DPDP) Act.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-4">
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                #1
              </div>
              <h3 className="font-bold text-gray-900 text-sm">Zero Contact Exposure</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Recruiters never see candidate phone numbers or emails. All communications are mediated securely within the platform.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                #2
              </div>
              <h3 className="font-bold text-gray-900 text-sm">Invited State on Import</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Bulk student imports never trigger instant SMS blasts. Invitations are dispatched in batches with transparent cost previews.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-800 flex items-center justify-center font-bold text-xs">
                #8
              </div>
              <h3 className="font-bold text-gray-900 text-sm">Minimal Identity Storage</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Full 12-digit Aadhaar numbers are never stored or logged. Only the last 4 digits and verification flags are retained with consent.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-gray-50 border border-gray-200 space-y-2">
              <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-800 flex items-center justify-center font-bold text-xs">
                #8a
              </div>
              <h3 className="font-bold text-gray-900 text-sm">Full Hindi &amp; English Parity</h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Complete bilingual support at launch, with Devanagari fonts embedded in generated PDFs and mobile-first 4G optimization.
              </p>
            </div>
          </div>
        </section>

        {/* Section 5: Bottom Navigation CTA */}
        <section className="bg-gradient-to-r from-orange-600 to-amber-600 rounded-2xl p-8 sm:p-10 text-white shadow-lg flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              Ready to Join India’s Verified Job Network?
            </h2>
            <p className="text-orange-100 text-sm sm:text-base max-w-xl">
              Whether you are looking for certified tradespeople, searching for your next job, or placing a graduating batch — JobsClick gets you there directly.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
            <Link
              href="/jobs"
              className="px-5 py-2.5 bg-white text-brand-orange hover:bg-orange-50 font-bold text-sm rounded-lg shadow-md transition-all"
            >
              Browse Jobs
            </Link>
            <Link
              href="/workspace"
              className="px-5 py-2.5 bg-black/20 hover:bg-black/30 text-white border border-white/30 font-semibold text-sm rounded-lg transition-all"
            >
              Open Workspace
            </Link>
            <Link
              href="/institutions"
              className="px-5 py-2.5 bg-black/20 hover:bg-black/30 text-white border border-white/30 font-semibold text-sm rounded-lg transition-all"
            >
              Institutions Directory
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
