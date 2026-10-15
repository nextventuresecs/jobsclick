import type { IndustryCategory, EmploymentType, ExperienceLevel } from '@indian-job-portal/validation';

export interface JobItem {
  readonly id: string;
  readonly title: string;
  readonly companyName: string;
  readonly companyId: string;
  readonly location: string;
  readonly district: string;
  readonly state: string;
  readonly category: IndustryCategory;
  readonly employmentType: EmploymentType;
  readonly salaryMin: number;
  readonly salaryMax: number;
  readonly openings: number;
  readonly experienceLevel: ExperienceLevel;
  readonly skills: readonly string[];
  readonly description: string;
  readonly requirements: readonly string[];
  readonly postedDate: string;
  readonly expiryDate: string;
  readonly isUrgent?: boolean;
  readonly status?: 'active' | 'draft' | 'expired' | 'closed';
  readonly applicantCount?: number;
}

export const SAMPLE_JOBS: readonly JobItem[] = [
  {
    id: 'job-101',
    title: 'CNC Machine Operator & Programmer',
    companyName: 'Aarya Precision Engineering Pvt Ltd',
    companyId: 'comp-01',
    location: 'Bhosari Industrial Estate, Pune',
    district: 'Pune',
    state: 'Maharashtra',
    category: 'manufacturing',
    employmentType: 'Full-time',
    salaryMin: 22000,
    salaryMax: 32000,
    openings: 6,
    experienceLevel: '1-2 Years',
    skills: ['CNC Milling', 'VMC Operating', 'Blueprint Reading', 'Fanuc Controls'],
    description:
      'We are expanding our precision automotive transmission machining line. Responsible for setting up and running CNC milling/turning machines, loading raw forgings, dimensional quality inspections, and tool offsets.',
    requirements: [
      'ITI (Machinist / Turner / Tool & Die) or Diploma in Mechanical Engineering',
      'Min 1 year operating CNC/VMC machines with Fanuc/Siemens controller',
      'Knowledge of vernier calipers, micrometers, and bore gauges',
      'Willingness to work in rotating 8-hour factory shifts',
    ],
    postedDate: '2026-10-12',
    expiryDate: '2026-11-20',
    isUrgent: true,
  },
  {
    id: 'job-102',
    title: 'Junior React & Full Stack Developer',
    companyName: 'Zenith Cloudworks Technologies',
    companyId: 'comp-02',
    location: 'HSR Layout, Bengaluru',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    category: 'technology',
    employmentType: 'Full-time',
    salaryMin: 35000,
    salaryMax: 55000,
    openings: 4,
    experienceLevel: 'Fresher',
    skills: ['React.js', 'TypeScript', 'Tailwind CSS', 'Node.js', 'REST APIs', 'Git'],
    description:
      'Join our agile product team developing supply chain and enterprise portals for growing Indian businesses. Build responsive UI components with Next.js and TypeScript, integrate backend services, and participate in code reviews.',
    requirements: [
      'B.Tech / B.E. (CS / IT / ECE) or MCA from recognized university',
      'Proficiency in React, modern TypeScript, and responsive Tailwind CSS',
      'Understanding of component architecture and asynchronous REST data fetching',
      'Good communication and problem-solving attitude',
    ],
    postedDate: '2026-10-10',
    expiryDate: '2026-11-15',
    isUrgent: true,
  },
  {
    id: 'job-103',
    title: 'B2B Sales & Industrial Account Specialist',
    companyName: 'Apex Industrial Supply Corp',
    companyId: 'comp-03',
    location: 'Okhla Industrial Area, New Delhi',
    district: 'South Delhi',
    state: 'Delhi',
    category: 'sales_operations',
    employmentType: 'Full-time',
    salaryMin: 28000,
    salaryMax: 45000,
    openings: 3,
    experienceLevel: '1-2 Years',
    skills: ['B2B Sales', 'Client Acquisition', 'CRM Management', 'Field Sales'],
    description:
      'Drive regional distributor acquisition and direct sales of industrial fasteners, safety equipment, and precision tooling to manufacturing clusters across North India.',
    requirements: [
      'Graduation in Commerce, Management, or Engineering',
      '1+ years of proven outdoor or inside B2B sales experience',
      'Strong negotiation, presentation, and relationship building skills',
      'Valid driving license and ability to travel regionally',
    ],
    postedDate: '2026-10-11',
    expiryDate: '2026-11-18',
  },
  {
    id: 'job-104',
    title: 'Warehouse Operations & Dispatch Supervisor',
    companyName: 'GatiShakti Logistics Network',
    companyId: 'comp-04',
    location: 'Bhiwandi Logistics Hub, Thane',
    district: 'Thane',
    state: 'Maharashtra',
    category: 'logistics_supply',
    employmentType: 'Shift-based',
    salaryMin: 24000,
    salaryMax: 36000,
    openings: 5,
    experienceLevel: '1-2 Years',
    skills: ['Warehouse Ops', 'Inventory Management', 'Barcode Scanning', 'Dispatch'],
    description:
      'Oversee inbound unloading, pallet barcode scanning, inventory audits, and team shift allocations across our multi-client fulfillment warehouse.',
    requirements: [
      'Graduate in any stream or Diploma in Logistics & Supply Chain',
      'Familiarity with WMS software and handheld barcode scanners',
      'Experience leading a team of 10-15 warehouse associates',
    ],
    postedDate: '2026-10-09',
    expiryDate: '2026-11-22',
  },
  {
    id: 'job-105',
    title: 'UI/UX Visual Product Designer',
    companyName: 'Vistara Digital Studios',
    companyId: 'comp-05',
    location: 'Koregaon Park, Pune',
    district: 'Pune',
    state: 'Maharashtra',
    category: 'creative_services',
    employmentType: 'Full-time',
    salaryMin: 30000,
    salaryMax: 50000,
    openings: 2,
    experienceLevel: '1-2 Years',
    skills: ['Figma', 'Design Systems', 'Mobile App UI', 'Wireframing', 'Prototyping'],
    description:
      'Create high-fidelity design systems, mobile app wireframes, and responsive web layouts for Indian e-commerce and fintech applications.',
    requirements: [
      'Degree / Diploma in Graphic Design, Interaction Design, or related field',
      'Strong Figma portfolio demonstrating user-centric workflows',
      'Understanding of typography, color theory, and responsive grids',
    ],
    postedDate: '2026-10-08',
    expiryDate: '2026-11-25',
  },
  {
    id: 'job-106',
    title: 'Biomedical & Diagnostic Lab Technician',
    companyName: 'Sanjeevani Diagnostic & Healthcare',
    companyId: 'comp-06',
    location: 'MIDC Andheri East, Mumbai',
    district: 'Mumbai Suburban',
    state: 'Maharashtra',
    category: 'healthcare_services',
    employmentType: 'Full-time',
    salaryMin: 22000,
    salaryMax: 34000,
    openings: 4,
    experienceLevel: 'Fresher',
    skills: ['Biochemistry', 'Hematology Analyzers', 'Sample Collection', 'Quality Protocols'],
    description:
      'Responsible for routine blood biochemistry tests, operating automated hematology analyzers, sample preservation, and report verification following NABL quality guidelines.',
    requirements: [
      'DMLT or B.Sc in Medical Laboratory Technology',
      'Knowledge of pathology lab safety and sterile protocols',
      'Attention to detail and basic medical computer software skills',
    ],
    postedDate: '2026-10-07',
    expiryDate: '2026-11-28',
  },
] as const;
