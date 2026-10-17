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
import { PublicInstitutionTabs } from '../../../components/workspaces/institution/PublicInstitutionTabs';
import type { InstitutionCmsInput } from '@indian-job-portal/validation';
import {
  ArrowLeft,
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

const DEFAULT_CMS_DATA: InstitutionCmsInput = {
  courses: [
    {
      id: 'c-1',
      name: 'Electrician (NCVT / DGT Approved)',
      code: 'ELE-101',
      duration: '2 Years',
      annualIntake: 60,
      eligibility: '10th Standard Pass (Science & Math)',
      description: 'Industrial motor control, power distribution, and solar panel setups.',
    },
    {
      id: 'c-2',
      name: 'Fitter & CNC Machining',
      code: 'FIT-102',
      duration: '2 Years',
      annualIntake: 40,
      eligibility: '10th Standard Pass',
      description: 'Precision engineering, lathe turning, and CNC G-code programming.',
    },
    {
      id: 'c-3',
      name: 'Computer Operator & Programming Assistant (COPA)',
      code: 'COP-103',
      duration: '1 Year',
      annualIntake: 50,
      eligibility: '10th Standard Pass',
      description: 'Office automation, database management, and Python scripting.',
    },
  ],
  subjects: [
    {
      id: 's-1',
      courseName: 'Electrician (NCVT / DGT Approved)',
      name: 'Trade Theory: AC/DC Circuits & Transformers',
      code: 'TH-01',
      semester: 'Semester 1',
      credits: 4,
      description: 'Fundamentals of magnetism, power factor, and safety earthing.',
    },
    {
      id: 's-2',
      courseName: 'Electrician (NCVT / DGT Approved)',
      name: 'Trade Practical: Electrical Installations',
      code: 'PR-01',
      semester: 'Semester 1',
      credits: 6,
      description: 'Jointing, conduit wiring, transformer connections, and testing.',
    },
    {
      id: 's-3',
      courseName: 'Fitter & CNC Machining',
      name: 'Workshop Calculation & Science',
      code: 'WCS-01',
      semester: 'Semester 1',
      credits: 3,
      description: 'Applied physics, heat treatment, tolerances, and cutting speeds.',
    },
  ],
  feeStructure: [
    {
      id: 'f-1',
      courseName: 'Electrician (NCVT / DGT Approved)',
      tuitionFee: 15000,
      developmentFee: 2000,
      examFee: 1000,
      hostelFee: 8000,
      oneTimeAdmissionFee: 1000,
      totalAnnualFee: 27000,
      remarks: 'Payable per semester. State scholarships applicable.',
    },
    {
      id: 'f-2',
      courseName: 'Fitter & CNC Machining',
      tuitionFee: 14000,
      developmentFee: 2000,
      examFee: 1000,
      hostelFee: 8000,
      oneTimeAdmissionFee: 1000,
      totalAnnualFee: 26000,
      remarks: 'Includes protective safety boots and tooling kit.',
    },
    {
      id: 'f-3',
      courseName: 'Computer Operator & Programming Assistant (COPA)',
      tuitionFee: 12000,
      developmentFee: 1500,
      examFee: 1000,
      hostelFee: 8000,
      oneTimeAdmissionFee: 500,
      totalAnnualFee: 23000,
      remarks: 'Includes high-speed internet lab access and software certification.',
    },
  ],
  departments: [
    {
      id: 'd-1',
      name: 'Electrical Engineering & Maintenance Wing',
      hodName: 'Er. Rajesh Kumar',
      contactEmail: 'electrical@campus.edu.in',
      contactPhone: '+919876543210',
      labsCount: 4,
      description: 'Heavy machinery and transformer maintenance labs with 3-phase grid power.',
    },
    {
      id: 'd-2',
      name: 'Mechanical & Fabrication Department',
      hodName: 'Dr. Surendra Sharma',
      contactEmail: 'mechanical@campus.edu.in',
      contactPhone: '+919876543211',
      labsCount: 3,
      description: 'Precision workshop with 12 industrial lathes and CNC milling units.',
    },
  ],
  faculty: [
    {
      id: 'fac-1',
      name: 'Er. Rajesh Kumar',
      designation: 'Head of Department & Master Instructor',
      department: 'Electrical Engineering & Maintenance Wing',
      qualification: 'B.Tech Electrical, CITS Certified',
      experienceYears: 12,
      bio: 'Over 12 years of industry experience training technicians for central power grids.',
    },
    {
      id: 'fac-2',
      name: 'Dr. Surendra Sharma',
      designation: 'Dean of Technical Academics',
      department: 'Mechanical & Fabrication Department',
      qualification: 'M.Tech, Ph.D. in Manufacturing Systems',
      experienceYears: 16,
      bio: 'Published author in precision tooling and advisor to heavy engineering units.',
    },
  ],
  welcomeText: 'Dedicated to building skilled technical talent for India manufacturing.',
};

export default async function PublicInstitutionPage({ params }: InstitutionPageProps) {
  const institutionId = params.id;
  const apiUrl = process.env['API_URL'] || 'http://localhost:3001';

  let institution: InstitutionProfileData =
    SAMPLE_INSTITUTIONS.find((i) => i.id === institutionId) || {
      ...INITIAL_INSTITUTION_PROFILE,
      id: institutionId,
    };

  let cmsData: InstitutionCmsInput = DEFAULT_CMS_DATA;

  try {
    const [profileRes, cmsRes] = await Promise.all([
      fetch(`${apiUrl}/profiles/institution/${institutionId}`, {
        next: { revalidate: 60 },
      }),
      fetch(`${apiUrl}/profiles/institution/${institutionId}/cms`, {
        next: { revalidate: 60 },
      }),
    ]);

    if (profileRes.ok) {
      const data = await profileRes.json();
      if (data && data.institutionName) {
        institution = {
          ...institution,
          institutionName: data.institutionName,
          affiliation: data.affiliation || institution.affiliation,
          affiliationCode: data.affiliationCode || institution.affiliationCode,
          city: data.city || institution.city,
          district: data.district || institution.district,
          state: data.state || institution.state,
          address: data.address || institution.address,
          pincode: data.pincode || institution.pincode,
          tradesOffered:
            data.tradesOffered && data.tradesOffered.length > 0
              ? data.tradesOffered
              : institution.tradesOffered,
          annualCapacity: data.annualCapacity || institution.annualCapacity,
          contactPerson: data.contactPerson || institution.contactPerson,
          contactDesignation: data.contactDesignation || institution.contactDesignation,
          contactEmail: data.contactEmail || institution.contactEmail,
          contactPhone: data.contactPhone || institution.contactPhone,
          website: data.website || institution.website,
          about: data.about || institution.about,
        };
      }
    }

    if (cmsRes.ok) {
      const cmsJson = await cmsRes.json();
      if (cmsJson && cmsJson.courses && cmsJson.courses.length > 0) {
        cmsData = cmsJson;
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

            {/* MANDATED STANDARD TABS: Courses, Subjects, Fee Structure, Inquiry Form, Departments, Faculty (INT-02, INT-03) */}
            <div className="pt-2">
              <PublicInstitutionTabs institution={institution} cmsData={cmsData} />
            </div>

            {/* Campus & Placement Cell Contact */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-gray-100">
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200 space-y-3 text-xs">
                <h4 className="font-bold text-gray-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-brand-orange" />
                  <span>Campus Physical Address</span>
                </h4>
                <p className="text-gray-700 leading-relaxed">
                  {institution.address}, {institution.city}, {institution.district},{' '}
                  {institution.state} - {institution.pincode}
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
