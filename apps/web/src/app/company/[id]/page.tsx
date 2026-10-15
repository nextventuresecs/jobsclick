import React from 'react';
import Link from 'next/link';
import { Navbar } from '../../../components/layout/Navbar';
import { Footer } from '../../../components/layout/Footer';
import { SAMPLE_COMPANIES, CompanyItem } from '../../../data/sampleCompanies';
import { SAMPLE_JOBS } from '../../../data/sampleJobs';
import {
  CategoryBadge,
  getCategoryCardBorderClass,
  Button,
} from '@indian-job-portal/ui';
import type { JobCategory } from '@indian-job-portal/validation';
import {
  ArrowLeft,
  MapPin,
  ShieldCheck,
  QrCode,
  Briefcase,
  IndianRupee,
  Clock,
} from 'lucide-react';

interface CompanyPageProps {
  readonly params: {
    readonly id: string;
  };
}

export default async function PublicCompanyPage({ params }: CompanyPageProps) {
  const companyId = params.id;
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let company: CompanyItem = SAMPLE_COMPANIES.find((c) => c.id === companyId) || {
    ...SAMPLE_COMPANIES[0]!,
    id: companyId,
  };

  try {
    const res = await fetch(`${apiUrl}/profiles/business/${companyId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.companyName) {
        company = {
          id: companyId,
          name: data.companyName,
          sector: data.sector || 'Manufacturing',
          enterpriseSize: (data.companySize as any) || 'Small',
          ownershipType: (data.ownershipType as any) || 'Private Limited',
          address: data.address || 'Industrial Zone',
          city: data.city || 'India',
          district: data.district || 'National',
          state: data.state || 'India',
          description: data.description || 'Verified Indian Enterprise.',
          udyamNumber: data.udyamNumber || '',
          verified: data.verified ?? true,
          activeJobsCount: data.activeJobsCount || 1,
        };
      }
    }
  } catch {
    // Graceful fallback to sample data
  }

  // Active jobs for this enterprise
  const activeJobs = SAMPLE_JOBS.filter(
    (j) => j.companyId === company.id || j.companyName.toLowerCase().includes(company.name.toLowerCase().slice(0, 5))
  );

  // JSON-LD structured data for Google indexing (Hard Invariant #9 / EMP-02)
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: company.name,
    address: {
      '@type': 'PostalAddress',
      streetAddress: company.address,
      addressLocality: company.city,
      addressRegion: company.district,
      addressCountry: 'IN',
    },
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans">
      <Navbar />

      {/* Structured SEO Data for Google */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <main className="flex-1 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 w-full">
        {/* Back Link */}
        <Link
          href="/company"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-brand-orange transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Companies Directory</span>
        </Link>

        {/* Hero Card */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="h-40 sm:h-48 bg-gradient-to-r from-slate-900 via-gray-800 to-orange-950 p-6 sm:p-8 flex flex-col justify-end text-white relative">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30 mb-2">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Verified MSME Enterprise</span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {company.name}
                </h1>
                <p className="text-xs text-gray-300 mt-1">{company.sector}</p>
              </div>

              <a
                href="#qr-section"
                className="px-4 py-2 bg-white text-gray-900 font-bold text-xs rounded-xl shadow-md hover:bg-gray-100 flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <QrCode className="w-4 h-4 text-brand-orange" />
                <span>View Profile QR</span>
              </a>
            </div>
          </div>

          {/* Info Grid */}
          <div className="p-6 sm:p-8 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-gray-100 text-xs">
              <div>
                <span className="text-gray-400 block font-medium">Enterprise Size</span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                  {company.enterpriseSize} Enterprise
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Ownership</span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                  {company.ownershipType}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Industrial Hub</span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                  {company.city}, {company.district}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Udyam Registration</span>
                <span className="text-sm font-bold font-mono text-gray-900 mt-0.5 block truncate">
                  {company.udyamNumber || 'Verified In-Process'}
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2">
                About the Enterprise
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed">
                {company.description}
              </p>
            </div>

            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-900 mb-2">
                Registered Facility Address
              </h3>
              <p className="text-sm text-gray-600 flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-brand-orange shrink-0" />
                <span>{company.address}, {company.city}, {company.district}, {company.state}</span>
              </p>
            </div>

            {/* EMP-03 Dynamic Company QR Code Section */}
            <div id="qr-section" className="pt-6 border-t border-gray-100 bg-gray-50 rounded-2xl p-6 border border-gray-200">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                <div className="space-y-2 text-center sm:text-left">
                  <div className="inline-flex items-center gap-1 text-xs font-bold text-brand-orange">
                    <QrCode className="w-4 h-4" />
                    <span>EMP-03 Instant Verification QR</span>
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">
                    Storefront & Factory Gate Digital QR Code
                  </h3>
                  <p className="text-xs text-gray-600 max-w-md">
                    Print or display this QR code at your industrial facility or recruitment booth. Job seekers scan with any smartphone camera to view open vacancies and apply instantly.
                  </p>
                </div>

                <div className="flex flex-col items-center gap-2 shrink-0 bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${apiUrl}/profiles/business/${company.id}/qr`}
                    alt={`QR Code for ${company.name}`}
                    className="w-36 h-36 border border-gray-200 rounded p-1 bg-white"
                  />
                  <span className="text-[10px] text-gray-400 font-mono">Scan to Apply</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Active Job Openings from this Company */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-brand-orange" />
              <span>Active Job Vacancies ({activeJobs.length})</span>
            </h2>
            <Link href="/jobs" className="text-xs font-semibold text-brand-orange hover:underline">
              View all portal jobs
            </Link>
          </div>

          {activeJobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {activeJobs.map((job) => {
                const borderClass = getCategoryCardBorderClass(job.category as JobCategory);
                return (
                  <div
                    key={job.id}
                    className={`bg-white rounded-2xl p-6 border border-gray-200 ${borderClass} hover:shadow-xs transition-all flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-base font-bold text-gray-900 hover:text-brand-orange transition-colors"
                        >
                          {job.title}
                        </Link>
                        <CategoryBadge category={job.category as JobCategory} size="sm" />
                      </div>

                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 mb-3">
                        <span className="flex items-center gap-1 font-semibold text-gray-900">
                          <IndianRupee className="w-3 h-3 text-emerald-600" />
                          ₹{job.salaryMin.toLocaleString('en-IN')} - ₹{job.salaryMax.toLocaleString('en-IN')}/mo
                        </span>
                        <span>·</span>
                        <span>{job.employmentType}</span>
                      </div>

                      <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed mb-4">
                        {job.description}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{job.postedDate}</span>
                      </span>
                      <Link href={`/jobs/${job.id}`}>
                        <Button variant="primary" size="sm" className="font-semibold">
                          View & Apply
                        </Button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-white rounded-2xl p-8 text-center border border-gray-200">
              <p className="text-xs text-gray-500">Currently no active vacancies listed for this company.</p>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
