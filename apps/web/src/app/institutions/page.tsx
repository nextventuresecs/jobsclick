import React from 'react';
import Link from 'next/link';
import { Navbar } from '../../components/layout/Navbar';
import { Footer } from '../../components/layout/Footer';
import {
  SAMPLE_INSTITUTIONS,
  InstitutionProfileData,
} from '../../data/sampleWorkspaces';
import {
  Search,
  MapPin,
  GraduationCap,
  CheckCircle2,
  ArrowRight,
  RotateCcw,
  Award,
  Users,
  FileSpreadsheet,
} from 'lucide-react';

interface InstitutionsPageProps {
  readonly searchParams?: {
    readonly query?: string;
    readonly type?: string;
  };
}

export const metadata = {
  title: 'Affiliated Technical Institutions & ITIs Directory — JobsClick',
  description:
    'Directory of Government ITIs, State Polytechnics, and Vocational Training Centers partnered with JobsClick for industrial campus placements.',
};

const INSTITUTION_TYPES: readonly {
  readonly key: string;
  readonly label: string;
}[] = [
  { key: '', label: 'All Institutions' },
  { key: 'iti', label: 'Industrial Training Institutes (ITI)' },
  { key: 'polytechnic', label: 'Polytechnic Institutes' },
  { key: 'vocational_training', label: 'Vocational & Skill Centers' },
] as const;

export default async function InstitutionsDirectoryPage({
  searchParams,
}: InstitutionsPageProps) {
  const query = searchParams?.query?.trim() || '';
  const typeFilter = searchParams?.type?.trim() || '';
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let institutions: InstitutionProfileData[] = [...SAMPLE_INSTITUTIONS];

  try {
    const res = await fetch(`${apiUrl}/profiles/institution`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        // Merge API data with sample fallbacks if needed
        institutions = data as InstitutionProfileData[];
      }
    }
  } catch {
    // Graceful fallback to SAMPLE_INSTITUTIONS
  }

  const filteredInstitutions = institutions.filter((inst) => {
    if (typeFilter && inst.institutionType !== typeFilter) {
      return false;
    }
    if (query) {
      const q = query.toLowerCase();
      const matchName = inst.institutionName.toLowerCase().includes(q);
      const matchCity = inst.city.toLowerCase().includes(q);
      const matchDistrict = inst.district.toLowerCase().includes(q);
      const matchState = inst.state.toLowerCase().includes(q);
      const matchAffiliation = inst.affiliation.toLowerCase().includes(q);
      const matchTrades = inst.tradesOffered.some((t) =>
        t.toLowerCase().includes(q)
      );
      return (
        matchName ||
        matchCity ||
        matchDistrict ||
        matchState ||
        matchAffiliation ||
        matchTrades
      );
    }
    return true;
  });

  const totalCapacity = institutions.reduce(
    (sum, inst) => sum + (inst.annualCapacity || 0),
    0
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'National Directory of Affiliated Technical Institutions and ITIs',
    description:
      'Verified vocational colleges, Government ITIs, and Polytechnics affiliated with JobsClick for industrial placements.',
    numberOfItems: filteredInstitutions.length,
    itemListElement: filteredInstitutions.map((inst, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      item: {
        '@type': 'EducationalOrganization',
        name: inst.institutionName,
        identifier: inst.affiliationCode,
        address: {
          '@type': 'PostalAddress',
          streetAddress: inst.address,
          addressLocality: inst.city,
          addressRegion: inst.district,
          addressCountry: 'IN',
        },
        url: `https://jobsclick.live/institution/${inst.id}`,
      },
    })),
  };

  const getTypeBadgeStyle = (type: string) => {
    switch (type) {
      case 'iti':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'polytechnic':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'vocational_training':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const formatTypeLabel = (type: string) => {
    switch (type) {
      case 'iti':
        return 'Government ITI';
      case 'polytechnic':
        return 'State Polytechnic';
      case 'vocational_training':
        return 'Vocational Center';
      default:
        return 'Technical Institute';
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F4F6] text-[#1F2937] flex flex-col font-sans">
      <Navbar />

      {/* Structured SEO Schema */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Hero Header */}
      <section className="bg-gradient-to-b from-white to-[#F3F4F6] border-b border-gray-200 pt-10 pb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Placement Directorate &amp; College Network</span>
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-gray-900 tracking-tight">
                Affiliated Technical Institutions &amp; ITIs
              </h1>
              <p className="text-sm sm:text-base text-gray-600 max-w-2xl">
                Connecting Government ITIs, State Polytechnics, and Vocational Training Centers directly with verified Indian MSME employers.
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <Link
                href="/workspace"
                className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-orange hover:bg-orange-600 text-white text-xs sm:text-sm font-semibold rounded-lg shadow-sm transition-colors"
              >
                <Users className="w-4 h-4" />
                <span>Placement Officer Login</span>
              </Link>
            </div>
          </div>

          {/* Key Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="text-2xl font-bold text-gray-900">{institutions.length}+</div>
              <div className="text-xs text-gray-500 font-medium">Affiliated Campuses</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="text-2xl font-bold text-brand-orange">{totalCapacity.toLocaleString('en-IN')}+</div>
              <div className="text-xs text-gray-500 font-medium">Annual Technical Seats</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="text-2xl font-bold text-emerald-600">100%</div>
              <div className="text-xs text-gray-500 font-medium">DGT / State Accredited</div>
            </div>
            <div className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm">
              <div className="text-2xl font-bold text-blue-600">Direct</div>
              <div className="text-xs text-gray-500 font-medium">MSME Campus Linkages</div>
            </div>
          </div>

          {/* Search & Filter Controls */}
          <form
            action="/institutions"
            method="GET"
            className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-4"
          >
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <div className="sm:col-span-8 relative">
                <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="query"
                  defaultValue={query}
                  placeholder="Search by institute name, trade (CNC, Electrician, Fitter), city, or district..."
                  className="w-full pl-10 pr-4 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange focus:bg-white transition-all text-gray-900"
                />
              </div>

              <div className="sm:col-span-4 flex items-center gap-2">
                <select
                  name="type"
                  defaultValue={typeFilter}
                  className="w-full py-2.5 px-3 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-orange focus:bg-white transition-all text-gray-700"
                >
                  {INSTITUTION_TYPES.map((t) => (
                    <option key={t.key} value={t.key}>
                      {t.label}
                    </option>
                  ))}
                </select>

                <button
                  type="submit"
                  className="px-5 py-2.5 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-lg shrink-0 transition-colors shadow-sm"
                >
                  Filter
                </button>
              </div>
            </div>

            {/* Quick Type Filter Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
              <span className="text-xs font-semibold text-gray-500 mr-1">Quick Select:</span>
              {INSTITUTION_TYPES.map((t) => {
                const isActive = typeFilter === t.key;
                return (
                  <Link
                    key={t.key}
                    href={`/institutions?type=${t.key}${query ? `&query=${encodeURIComponent(query)}` : ''}`}
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                      isActive
                        ? 'bg-brand-orange text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {t.label}
                  </Link>
                );
              })}
              {(query || typeFilter) && (
                <Link
                  href="/institutions"
                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs text-red-600 hover:text-red-700 font-medium ml-auto"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Filters</span>
                </Link>
              )}
            </div>
          </form>
        </div>
      </section>

      {/* Main List Section */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 w-full">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-gray-600">
            Showing <strong className="text-gray-900">{filteredInstitutions.length}</strong>{' '}
            affiliated {filteredInstitutions.length === 1 ? 'institution' : 'institutions'}
            {query && (
              <span>
                {' '}matching &quot;<span className="text-brand-orange">{query}</span>&quot;
              </span>
            )}
          </p>
        </div>

        {filteredInstitutions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center space-y-4">
            <GraduationCap className="w-12 h-12 text-gray-400 mx-auto" />
            <h3 className="text-lg font-bold text-gray-900">No institutions match your search</h3>
            <p className="text-sm text-gray-500 max-w-md mx-auto">
              We couldn&apos;t find any colleges matching your criteria. Try adjusting the search keywords or resetting filters.
            </p>
            <Link
              href="/institutions"
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand-orange text-white text-xs font-semibold rounded-lg hover:bg-orange-600 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Show All Institutions</span>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredInstitutions.map((inst) => (
              <div
                key={inst.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
              >
                <div className="p-6 space-y-4">
                  {/* Card Header & Badges */}
                  <div className="flex items-start justify-between gap-3">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold border ${getTypeBadgeStyle(
                        inst.institutionType
                      )}`}
                    >
                      {formatTypeLabel(inst.institutionType)}
                    </span>

                    {inst.isVerified && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Verified</span>
                      </span>
                    )}
                  </div>

                  {/* Institution Title */}
                  <div>
                    <h3 className="text-lg font-bold text-gray-900 group-hover:text-brand-orange transition-colors leading-snug">
                      <Link href={`/institution/${inst.id}`}>
                        {inst.institutionName}
                      </Link>
                    </h3>
                    <div className="text-xs text-gray-500 font-mono mt-1">
                      Code: {inst.affiliationCode} • Est. {inst.establishmentYear}
                    </div>
                  </div>

                  {/* Affiliation Details */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-600">
                    <Award className="w-3.5 h-3.5 text-brand-orange shrink-0" />
                    <span className="truncate">{inst.affiliation}</span>
                  </div>

                  {/* Location & Capacity */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-100 text-xs text-gray-600">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">
                        {inst.city}, {inst.state}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 truncate">
                      <GraduationCap className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span>{inst.annualCapacity} seats/yr</span>
                    </div>
                  </div>

                  {/* Trades Offered Chips */}
                  <div className="space-y-1.5 pt-2 border-t border-gray-100">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      Trades &amp; Specializations
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {inst.tradesOffered.slice(0, 3).map((trade) => (
                        <span
                          key={trade}
                          className="px-2 py-0.5 rounded bg-gray-50 text-gray-700 border border-gray-200 text-xs truncate max-w-[200px]"
                        >
                          {trade}
                        </span>
                      ))}
                      {inst.tradesOffered.length > 3 && (
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-xs font-medium">
                          +{inst.tradesOffered.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="bg-gray-50 px-6 py-3 border-t border-gray-100 flex items-center justify-between">
                  <div className="text-xs text-gray-500">
                    TPO: <span className="font-medium text-gray-700">{inst.contactPerson}</span>
                  </div>
                  <Link
                    href={`/institution/${inst.id}`}
                    className="inline-flex items-center gap-1 text-xs font-bold text-brand-orange hover:text-orange-700 transition-colors"
                  >
                    <span>View Profile</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* TPO / Placement Cell Action Callout */}
        <div className="bg-gradient-to-r from-blue-900 to-indigo-900 rounded-2xl p-8 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-6 mt-12">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-800 text-blue-200 border border-blue-700">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Bulk Student Onboarding (BULK-01)</span>
            </div>
            <h2 className="text-xl sm:text-2xl font-bold">
              Are you a Training &amp; Placement Officer (TPO)?
            </h2>
            <p className="text-blue-200 text-xs sm:text-sm max-w-xl leading-relaxed">
              Upload your graduating batch via CSV in minutes. Student profiles are safely registered in invited status without unsolicited SMS spam. Review SMS cost previews and connect your students directly to hiring MSMEs.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
            <Link
              href="/workspace"
              className="px-5 py-2.5 bg-brand-orange hover:bg-orange-600 text-white font-bold text-xs sm:text-sm rounded-lg shadow-md transition-all"
            >
              Access TPO Dashboard
            </Link>
            <Link
              href="/how-it-works#institutions"
              className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white border border-white/20 font-semibold text-xs sm:text-sm rounded-lg transition-all"
            >
              Learn Onboarding Steps
            </Link>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
