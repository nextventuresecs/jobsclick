import React from 'react';
import Link from 'next/link';
import { Navbar } from '../../../components/layout/Navbar';
import { Footer } from '../../../components/layout/Footer';
import {
  SAMPLE_INSTITUTIONS,
  INITIAL_INSTITUTION_PROFILE,
  InstitutionProfileData,
} from '../../../data/sampleWorkspaces';
import { ProfileQrShareCard } from '../../../components/common/ProfileQrShareCard';
import {
  ArrowLeft,
  GraduationCap,
  Award,
  MapPin,
  CheckCircle2,
  Briefcase,
  Mail,
  Phone,
  Globe,
  QrCode,
} from 'lucide-react';

interface InstitutionPageProps {
  readonly params: {
    readonly id: string;
  };
}

export default async function PublicInstitutionPage({ params }: InstitutionPageProps) {
  const institutionId = params.id;
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let institution: InstitutionProfileData =
    SAMPLE_INSTITUTIONS.find((i) => i.id === institutionId) || {
      ...INITIAL_INSTITUTION_PROFILE,
      id: institutionId,
    };

  try {
    const res = await fetch(`${apiUrl}/profiles/institution/${institutionId}`, {
      next: { revalidate: 60 },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.institutionName) {
        institution = {
          ...institution,
          institutionName: data.institutionName,
          affiliation: data.affiliation || institution.affiliation,
          affiliationCode: data.affiliationCode || institution.affiliationCode,
          city: data.city || institution.city,
          district: data.district || institution.district,
          state: data.state || institution.state,
        };
      }
    }
  } catch {
    // Graceful fallback to sample data
  }

  // Schema.org JSON-LD for Google indexing
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'EducationalOrganization',
    name: institution.institutionName,
    identifier: institution.affiliationCode,
    foundingDate: institution.establishmentYear?.toString(),
    address: {
      '@type': 'PostalAddress',
      streetAddress: institution.address,
      addressLocality: institution.city,
      addressRegion: institution.district,
      postalCode: institution.pincode,
      addressCountry: 'IN',
    },
    url: institution.website,
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
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-brand-orange transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to National Portal Home</span>
        </Link>

        {/* Hero Card */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-xs">
          <div className="h-44 sm:h-52 bg-gradient-to-r from-slate-900 via-indigo-950 to-orange-950 p-6 sm:p-8 flex flex-col justify-end text-white relative">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs font-semibold border border-blue-500/30">
                    <Award className="w-3.5 h-3.5" />
                    <span>State Accredited Technical Institute</span>
                  </span>
                  {institution.isVerified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-xs font-semibold border border-emerald-500/30">
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                      <span>Verified Onboarding</span>
                    </span>
                  )}
                </div>
                <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  {institution.institutionName}
                </h1>
                <p className="text-xs text-gray-300 flex flex-wrap items-center gap-2">
                  <span>{institution.affiliation}</span>
                  <span>•</span>
                  <span className="font-mono text-orange-300">{institution.affiliationCode}</span>
                  <span>•</span>
                  <span>Est. {institution.establishmentYear}</span>
                </p>
              </div>

              <a
                href="#qr-section"
                className="px-4 py-2 bg-white text-gray-900 font-bold text-xs rounded-xl shadow-md hover:bg-gray-100 flex items-center gap-1.5 shrink-0 self-start sm:self-auto cursor-pointer"
              >
                <QrCode className="w-4 h-4 text-brand-orange" />
                <span>View Campus QR</span>
              </a>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="p-6 sm:p-8 space-y-8">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-gray-100 text-xs">
              <div>
                <span className="text-gray-400 block font-medium">Institution Type</span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block uppercase">
                  {institution.institutionType}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Affiliation Code</span>
                <span className="text-sm font-bold font-mono text-gray-900 mt-0.5 block truncate">
                  {institution.affiliationCode}
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Annual Intake</span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                  {institution.annualCapacity} Students/Yr
                </span>
              </div>
              <div>
                <span className="text-gray-400 block font-medium">Campus District</span>
                <span className="text-sm font-bold text-gray-900 mt-0.5 block">
                  {institution.city}, {institution.state}
                </span>
              </div>
            </div>

            {/* About Institution */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange mb-2">
                About the Institution & Technical Focus
              </h3>
              <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-100">
                {institution.about}
              </p>
            </div>

            {/* Trades & Vocational Streams */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-brand-orange mb-3">
                Trades & Vocational Disciplines Offered ({institution.tradesOffered.length})
              </h3>
              <div className="flex flex-wrap gap-2">
                {institution.tradesOffered.map((trade, idx) => (
                  <span
                    key={idx}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-orange-50 text-orange-900 text-xs font-semibold border border-orange-200"
                  >
                    <GraduationCap className="w-3.5 h-3.5 text-brand-orange" />
                    <span>{trade}</span>
                  </span>
                ))}
              </div>
            </div>

            {/* Campus & Placement Cell Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-3 text-xs">
                <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-brand-orange" />
                  <span>Campus Physical Address</span>
                </h4>
                <p className="text-gray-700 leading-relaxed">
                  {institution.address}, {institution.city}, {institution.district}, {institution.state} - {institution.pincode}
                </p>
                {institution.website && (
                  <div className="pt-2 border-t border-gray-200 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-gray-400" />
                    <a
                      href={institution.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-brand-orange font-medium hover:underline truncate"
                    >
                      {institution.website}
                    </a>
                  </div>
                )}
              </div>

              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-3 text-xs">
                <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                  <span>Training & Placement Cell (TPO)</span>
                </h4>
                <div>
                  <p className="font-bold text-gray-900">{institution.contactPerson}</p>
                  <p className="text-gray-500 text-[11px]">{institution.contactDesignation}</p>
                </div>
                <div className="space-y-1.5 pt-1 text-[11px] text-gray-600">
                  <p className="flex items-center gap-1.5">
                    <Mail className="w-3 h-3 text-gray-400" />
                    <span>{institution.contactEmail}</span>
                  </p>
                  <p className="flex items-center gap-1.5">
                    <Phone className="w-3 h-3 text-gray-400" />
                    <span className="font-mono">{institution.contactPhone}</span>
                  </p>
                </div>
              </div>
            </div>

            {/* Direct QR & Shareable Card */}
            <div id="qr-section" className="pt-2">
              <ProfileQrShareCard
                title={institution.institutionName}
                subtitle={`${institution.affiliation} • Established ${institution.establishmentYear}`}
                path={`/institution/${institution.id}`}
                badgeText="Campus Placement & Verification QR"
                description="Print or display this official QR code at campus recruitment fairs, entrance boards, or placement brochures. Employers scan to verify credentials and recruit batches directly."
                downloadFileName={`${institution.institutionName}-campus-qr`}
                isInstitution={true}
                udyamOrAffiliation={institution.affiliationCode}
                locationText={`${institution.city}, ${institution.state}`}
              />
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}
