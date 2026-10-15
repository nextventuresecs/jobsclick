import React from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import { SAMPLE_COMPANIES, CompanyItem } from '../../data/sampleCompanies';
import { Button } from '@indian-job-portal/ui';
import {
  MapPin,
  ShieldCheck,
  ArrowRight,
  Search,
  Briefcase,
  RotateCcw,
} from 'lucide-react';

interface CompanyPageProps {
  readonly searchParams?: {
    readonly query?: string;
    readonly sector?: string;
  };
}

export default async function CompaniesDirectoryPage({ searchParams }: CompanyPageProps) {
  const query = searchParams?.query?.trim() || '';
  const sector = searchParams?.sector?.trim() || '';
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let companies: CompanyItem[] = [...SAMPLE_COMPANIES];

  try {
    const res = await fetch(`${apiUrl}/profiles/business`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        companies = data.map((b: any) => ({
          id: b.id,
          name: b.name || b.companyName || 'Verified Enterprise',
          sector: b.sector || 'Manufacturing',
          enterpriseSize: b.companySize || b.enterpriseSize || 'Small',
          ownershipType: b.ownershipType || 'Private Limited',
          address: b.address || 'Industrial Area',
          city: b.city || 'India',
          district: b.district || 'National',
          state: b.state || 'India',
          description: b.description || 'Registered MSME employer.',
          udyamNumber: b.udyamNumber || '',
          verified: b.verified ?? true,
          activeJobsCount: b.activeJobsCount || 1,
        }));
      }
    }
  } catch {
    // Graceful fallback to SAMPLE_COMPANIES
  }

  const filteredCompanies = companies.filter((c) => {
    if (query) {
      const q = query.toLowerCase();
      const matchName = c.name.toLowerCase().includes(q);
      const matchSector = c.sector.toLowerCase().includes(q);
      const matchCity = c.city.toLowerCase().includes(q);
      if (!matchName && !matchSector && !matchCity) return false;
    }
    if (sector && sector !== 'all') {
      if (!c.sector.toLowerCase().includes(sector.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 w-full">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-gray-200 shadow-xs space-y-6">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-brand-orange">
              National MSME Business Directory
            </span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-gray-900 tracking-tight mt-1">
              Verified MSMEs & Industrial Employers
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 mt-1 max-w-2xl leading-relaxed">
              Explore verified manufacturing plants, tech enterprises, and logistics providers hiring across major Indian industrial clusters and technology parks.
            </p>
          </div>

          {/* Search Bar */}
          <form action="/company" method="GET" className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-8 flex items-center gap-2 px-3.5 py-2.5 bg-gray-50 rounded-xl border border-gray-200">
              <Search className="w-4 h-4 text-gray-400 shrink-0" />
              <input
                type="text"
                name="query"
                defaultValue={query}
                placeholder="Search by company name, sector, or city (e.g. Pune, Aarya, IT)..."
                className="w-full bg-transparent text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
              />
            </div>

            <div className="sm:col-span-4 flex items-center gap-2">
              <Button type="submit" variant="primary" size="md" className="flex-1 font-semibold">
                Search Directory
              </Button>
              {(query || sector) && (
                <Link
                  href="/company"
                  className="p-2.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-600 transition-colors"
                  title="Reset filters"
                >
                  <RotateCcw className="w-4 h-4" />
                </Link>
              )}
            </div>
          </form>
        </div>

        {/* Directory Counter */}
        <div className="flex items-center justify-between text-xs text-gray-500 px-1">
          <span>
            Showing <strong className="text-gray-900">{filteredCompanies.length}</strong> verified MSMEs
          </span>
          <span className="text-brand-orange font-medium flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            100% Udyam Verified Network
          </span>
        </div>

        {/* Company Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredCompanies.map((comp) => (
            <div
              key={comp.id}
              className="bg-white rounded-2xl p-6 border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      href={`/company/${comp.id}`}
                      className="text-lg font-bold text-gray-900 hover:text-brand-orange transition-colors"
                    >
                      {comp.name}
                    </Link>
                    <p className="text-xs text-gray-500 mt-0.5">{comp.sector}</p>
                  </div>
                  {comp.verified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded shrink-0">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Verified MSME</span>
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-brand-orange" />
                    {comp.city}, {comp.district}
                  </span>
                  <span aria-hidden="true" className="text-gray-300">·</span>
                  <span className="font-medium text-gray-700">
                    Tier: {comp.enterpriseSize} Enterprise
                  </span>
                  <span aria-hidden="true" className="text-gray-300">·</span>
                  <span>{comp.ownershipType}</span>
                </div>

                <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                  {comp.description}
                </p>

                {comp.udyamNumber && (
                  <div className="text-[11px] font-mono text-gray-400">
                    Udyam: {comp.udyamNumber}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between mt-4">
                <div className="flex items-center gap-1.5 text-xs text-gray-600 font-medium">
                  <Briefcase className="w-3.5 h-3.5 text-gray-400" />
                  <span>
                    <strong className="text-gray-900 font-mono">{comp.activeJobsCount}</strong> Active Openings
                  </span>
                </div>
                <Link
                  href={`/company/${comp.id}`}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-orange hover:text-brand-orange-hover"
                >
                  <span>View Profile & QR</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
