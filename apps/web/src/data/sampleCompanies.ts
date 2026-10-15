export interface CompanyItem {
  readonly id: string;
  readonly name: string;
  readonly sector: string;
  readonly enterpriseSize: 'Micro' | 'Small' | 'Medium' | 'Large';
  readonly ownershipType: 'Private Limited' | 'Partnership' | 'Proprietorship' | 'LLP';
  readonly address: string;
  readonly city: string;
  readonly district: string;
  readonly state: string;
  readonly description: string;
  readonly udyamNumber: string;
  readonly verified: boolean;
  readonly activeJobsCount: number;
}

export const SAMPLE_COMPANIES: readonly CompanyItem[] = [
  {
    id: 'comp-01',
    name: 'Aarya Precision Engineering Pvt Ltd',
    sector: 'Automotive & Precision Machining',
    enterpriseSize: 'Small',
    ownershipType: 'Private Limited',
    address: 'Plot 44, Sector 7, Bhosari Industrial Estate',
    city: 'Pune',
    district: 'Pune',
    state: 'Maharashtra',
    description:
      'Premier precision manufacturing plant specializing in automotive transmission parts, CNC turning, and high-tolerance aerospace sub-assemblies. Supplying tier-1 OEMs across India.',
    udyamNumber: 'UDYAM-MH-26-0019482',
    verified: true,
    activeJobsCount: 6,
  },
  {
    id: 'comp-02',
    name: 'Zenith Cloudworks Technologies',
    sector: 'Information Technology & Software',
    enterpriseSize: 'Medium',
    ownershipType: 'Private Limited',
    address: '2nd Floor, Cyber Nest, HSR Layout, Sector 4',
    city: 'Bengaluru',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    description:
      'Cloud solutions and custom enterprise software partner developing multi-tenant platforms, B2B SaaS integrations, and high-velocity workflow systems for Indian businesses.',
    udyamNumber: 'UDYAM-KR-03-0098231',
    verified: true,
    activeJobsCount: 4,
  },
  {
    id: 'comp-03',
    name: 'Apex Industrial Supply Corp',
    sector: 'Industrial Equipment & B2B Supply',
    enterpriseSize: 'Small',
    ownershipType: 'Partnership',
    address: 'C-18, Phase 2, Okhla Industrial Area',
    city: 'New Delhi',
    district: 'South Delhi',
    state: 'Delhi',
    description:
      'Major regional distributor of specialized industrial tooling, machine fasteners, pneumatic systems, and workplace safety equipment serving heavy engineering industries.',
    udyamNumber: 'UDYAM-DL-08-0044190',
    verified: true,
    activeJobsCount: 3,
  },
  {
    id: 'comp-04',
    name: 'GatiShakti Logistics Network',
    sector: 'Logistics, Warehousing & Fleet',
    enterpriseSize: 'Medium',
    ownershipType: 'LLP',
    address: 'Warehouse Complex 12, Patalganga-Bhiwandi Corridor',
    city: 'Thane',
    district: 'Thane',
    state: 'Maharashtra',
    description:
      'Fast-growing supply chain and fulfillment logistics provider operating automated warehousing, palletized cargo dispatch, and tech-enabled middle-mile transport.',
    udyamNumber: 'UDYAM-MH-33-0078129',
    verified: true,
    activeJobsCount: 5,
  },
] as const;
