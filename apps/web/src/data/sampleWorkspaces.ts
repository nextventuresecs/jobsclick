import type { JobCategory, ApplicationStatus } from '@indian-job-portal/validation';

export interface SeekerProfileData {
  readonly id: string;
  readonly name: string;
  readonly phone: string; // Stored securely; masked for employers
  readonly email: string; // Stored securely; masked for employers
  readonly avatar?: string;
  readonly seekerType: 'student' | 'individual';
  readonly gender: 'Male' | 'Female' | 'Other';
  readonly dob: string;
  readonly address?: string;
  readonly city: string;
  readonly district: string;
  readonly state: string;
  readonly pincode: string;
  readonly qualification: string;
  readonly institution: string;
  readonly graduationYear: string;
  readonly experienceYears: number;
  readonly currentRole?: string;
  readonly skills: readonly string[];
  readonly languages: readonly string[];
  readonly preferredCategories: readonly JobCategory[];
  readonly preferredLocations: readonly string[];
  readonly willingToRelocate: boolean;
  readonly completionPercentage: number;
  readonly bio: string;
  readonly apaarId?: string;
  readonly aadhaarLastFour?: string;
  readonly aadhaarVerified?: boolean;
  readonly dpdpConsentGiven: boolean;
  readonly isOnboardingComplete: boolean;
  readonly enrolledViaInstitution?: string;
}

export interface ApplicationData {
  readonly id: string;
  readonly jobId: string;
  readonly jobTitle: string;
  readonly companyName: string;
  readonly companyId: string;
  readonly candidateId: string;
  readonly candidateName: string;
  readonly candidateEducation: string;
  readonly candidateExperience: string;
  readonly candidateSkills: readonly string[];
  readonly appliedDate: string;
  readonly status: ApplicationStatus;
  readonly notes?: string;
  readonly interviewDate?: string;
}

export interface StudentRecordData {
  readonly id: string;
  readonly institutionId: string;
  readonly studentName: string;
  readonly rollNumber: string;
  readonly phone: string;
  readonly stream: string;
  readonly passingYear: string;
  readonly profileCompleted: boolean;
  readonly placementStatus: 'Available' | 'Placed' | 'In Process';
  readonly invitedAt?: string;
  readonly state?: 'invited' | 'active';
}

export interface InstitutionProfileData {
  readonly id: string;
  readonly institutionName: string;
  readonly institutionType: 'iti' | 'polytechnic' | 'engineering' | 'vocational_training' | 'degree_college' | 'other';
  readonly affiliation: string;
  readonly affiliationCode: string;
  readonly establishmentYear: number;
  readonly principalName: string;
  readonly contactPerson: string;
  readonly contactDesignation: string;
  readonly contactEmail: string;
  readonly contactPhone: string;
  readonly website: string;
  readonly address: string;
  readonly city: string;
  readonly district: string;
  readonly state: string;
  readonly pincode: string;
  readonly tradesOffered: readonly string[];
  readonly annualCapacity: number;
  readonly placementBrochureUrl?: string;
  readonly about: string;
  readonly isVerified: boolean;
  readonly isOnboardingComplete: boolean;
}

export const INITIAL_INSTITUTION_PROFILE: InstitutionProfileData = {
  id: 'inst-01',
  institutionName: 'Government Industrial Training Institute (ITI) & Polytechnic',
  institutionType: 'iti',
  affiliation: 'DGT / NCVT (National Council for Vocational Training)',
  affiliationCode: 'ITI-MP-08012',
  establishmentYear: 1984,
  principalName: 'Dr. Suresh Chandra Malviya',
  contactPerson: 'Er. Rajesh K. Sharma',
  contactDesignation: 'Head of Training & Placement Cell (TPO)',
  contactEmail: 'tpo.iti.indore@mp.gov.in',
  contactPhone: '+91 94250 88210',
  website: 'https://iti.mp.gov.in/indore',
  address: 'Sanwer Road Industrial Area, Sector D',
  city: 'Indore',
  district: 'Indore',
  state: 'Madhya Pradesh',
  pincode: '452015',
  tradesOffered: [
    'CNC Machinist',
    'Fitter & Turner',
    'Electrician & Wireman',
    'Industrial Automation',
    'Tool & Die Maker',
    'Welder (TIG/MIG)',
    'Computer Operator & Programming (COPA)',
  ],
  annualCapacity: 480,
  placementBrochureUrl: 'https://example.com/brochures/iti-placement-2026.pdf',
  about: 'Premier state technical institute dedicated to blue and grey collar vocational excellence, hands-on shop-floor training, and industry-partnered apprenticeships across manufacturing clusters.',
  isVerified: true,
  isOnboardingComplete: true,
};

export const SAMPLE_INSTITUTIONS: readonly InstitutionProfileData[] = [
  INITIAL_INSTITUTION_PROFILE,
  {
    id: 'inst-02',
    institutionName: 'Pimpri Chinchwad Government Polytechnic & Technical Institute',
    institutionType: 'polytechnic',
    affiliation: 'MSBTE / AICTE Approved',
    affiliationCode: 'POLY-MH-40192',
    establishmentYear: 1991,
    principalName: 'Prof. Anant R. Joshi',
    contactPerson: 'Prof. Sunita S. Deshmukh',
    contactDesignation: 'Head of Industry Liaison & Placement',
    contactEmail: 'placements@pcpolytechnic.edu.in',
    contactPhone: '+91 98220 54120',
    website: 'https://pcpolytechnic.edu.in',
    address: 'Sector 26, Pradhikaran, Nigdi',
    city: 'Pune',
    district: 'Pune',
    state: 'Maharashtra',
    pincode: '411044',
    tradesOffered: [
      'Mechanical Engineering (Manufacturing)',
      'Automobile Engineering',
      'Electrical & Electronics',
      'Mechatronics & Robotics',
      'Computer Technology',
    ],
    annualCapacity: 600,
    placementBrochureUrl: 'https://example.com/brochures/pc-placement-2026.pdf',
    about: 'Autonomous state technical polytechnic recognized for close ties with the Pune auto and engineering cluster, state-of-the-art labs, and high campus recruitment records.',
    isVerified: true,
    isOnboardingComplete: true,
  },
  {
    id: 'inst-03',
    institutionName: 'Government Industrial Training Institute (Women) Guindy',
    institutionType: 'iti',
    affiliation: 'DGT / NCVT (Directorate General of Training)',
    affiliationCode: 'ITI-TN-33041',
    establishmentYear: 1978,
    principalName: 'Dr. Meenakshi Sundaram',
    contactPerson: 'Smt. Kavitha Raman',
    contactDesignation: 'Training and Placement Officer',
    contactEmail: 'placements.guindy@tn.gov.in',
    contactPhone: '+91 94440 18230',
    website: 'https://iti.tn.gov.in/guindy',
    address: 'Alandur Road, Industrial Estate, Guindy',
    city: 'Chennai',
    district: 'Chennai',
    state: 'Tamil Nadu',
    pincode: '600032',
    tradesOffered: [
      'Electronic Mechanic',
      'Computer Operator & Programming (COPA)',
      'Instrument Mechanic',
      'Draughtsman (Civil & Mechanical)',
      'Solar Technician',
    ],
    annualCapacity: 420,
    placementBrochureUrl: 'https://example.com/brochures/guindy-placement-2026.pdf',
    about: 'Dedicated government technical training institute empowering women in core electronics, industrial automation, and emerging clean technology sectors.',
    isVerified: true,
    isOnboardingComplete: true,
  },
  {
    id: 'inst-04',
    institutionName: 'Haryana State Institute of Technology & Polytechnic',
    institutionType: 'polytechnic',
    affiliation: 'HSBTE / AICTE Accredited',
    affiliationCode: 'POLY-HR-12055',
    establishmentYear: 2004,
    principalName: 'Dr. Virender K. Hooda',
    contactPerson: 'Er. Naveen Rawat',
    contactDesignation: 'Director of Corporate Relations & Placements',
    contactEmail: 'tpo.manesar@haryana.gov.in',
    contactPhone: '+91 98120 77341',
    website: 'https://polytechnicmanesar.ac.in',
    address: 'Sector 7, IMT Manesar Industrial Township',
    city: 'Gurugram',
    district: 'Gurugram',
    state: 'Haryana',
    pincode: '122050',
    tradesOffered: [
      'Automotive Systems & EV Technology',
      'Industrial Tool & Die Engineering',
      'Electrical Engineering & Switchgear',
      'Production Technology',
      'Computer Engineering',
    ],
    annualCapacity: 550,
    placementBrochureUrl: 'https://example.com/brochures/manesar-placement-2026.pdf',
    about: 'Directly linked with the IMT Manesar automotive and electronics manufacturing hub, providing industry-embedded diploma apprenticeships.',
    isVerified: true,
    isOnboardingComplete: true,
  },
  {
    id: 'inst-05',
    institutionName: 'Vadodara Regional Vocational & Skills Training Center',
    institutionType: 'vocational_training',
    affiliation: 'Gujarat Skill Development Mission (GSDM) / NCVET',
    affiliationCode: 'VOC-GJ-24018',
    establishmentYear: 2012,
    principalName: 'Er. Bhavesh B. Patel',
    contactPerson: 'Shri Hardik Mehta',
    contactDesignation: 'Placement & Industry Coordinator',
    contactEmail: 'placements@vadodara-skills.gov.in',
    contactPhone: '+91 98790 33140',
    website: 'https://skills.gujarat.gov.in/vadodara',
    address: 'Makarpura GIDC Industrial Area',
    city: 'Vadodara',
    district: 'Vadodara',
    state: 'Gujarat',
    pincode: '390010',
    tradesOffered: [
      'CNC Machinist & Turning',
      'Industrial Welder (6G / TIG / MIG)',
      'Chemical Plant Operator',
      'PLC & SCADA Maintenance',
      'Warehouse Operations Lead',
    ],
    annualCapacity: 380,
    placementBrochureUrl: 'https://example.com/brochures/vadodara-skills-2026.pdf',
    about: 'Specialized skill center partnered with Vadodara engineering and chemical MSMEs for targeted 6-month to 2-year NSQF Level 4-6 vocational certifications.',
    isVerified: true,
    isOnboardingComplete: true,
  },
  {
    id: 'inst-06',
    institutionName: 'Peenya Technical Training & Vocational Institute',
    institutionType: 'iti',
    affiliation: 'DGT / Karnataka DTE Approved',
    affiliationCode: 'ITI-KA-29004',
    establishmentYear: 1988,
    principalName: 'Prof. Ramesh K. Narayana',
    contactPerson: 'Shri Girish K. Gowda',
    contactDesignation: 'Training & Apprenticeship Cell Lead',
    contactEmail: 'placements.peenya@karnataka.gov.in',
    contactPhone: '+91 99001 44820',
    website: 'https://peenyatraining.karnataka.gov.in',
    address: '4th Phase, Peenya Industrial Area',
    city: 'Bengaluru',
    district: 'Bengaluru Urban',
    state: 'Karnataka',
    pincode: '560058',
    tradesOffered: [
      'Fitter & Assembly Technician',
      'Machinist & Wire-Cut EDM',
      'Precision Grinding',
      'Industrial Electrician',
      'Mechatronics Technician',
    ],
    annualCapacity: 500,
    placementBrochureUrl: 'https://example.com/brochures/peenya-placement-2026.pdf',
    about: 'Situated at South Asia’s largest industrial cluster in Peenya, preparing certified technical operators and shop-floor tradespeople for manufacturing MSMEs.',
    isVerified: true,
    isOnboardingComplete: true,
  },
];

export interface AuditLogEntryData {
  readonly id: string;
  readonly timestamp: string;
  readonly actor: string;
  readonly role: string;
  readonly action: string;
  readonly details: string;
  readonly status: 'success' | 'warning' | 'error';
}

// Hard Invariant #1: Never show full phone or email to employers or unauthorized viewers
export function maskCandidatePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '••••••••••';
  return `+91 ••••• ••${digits.slice(-3)}`;
}

export function maskCandidateEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '••••••@•••••.•••';
  const name = parts[0] ?? '';
  const domain = parts[1] ?? '';
  const maskedName = name.length > 2 ? `${name.slice(0, 2)}••••` : '••••';
  return `${maskedName}@${domain}`;
}

export const INITIAL_SEEKER_PROFILE: SeekerProfileData = {
  id: 'cand-01',
  name: 'Rahul Sharma',
  phone: '+91 98260 14829',
  email: 'rahul.sharma@example.com',
  avatar: '/images/jobseeker_avatar_rahul_1792057154543.jpg',
  seekerType: 'student',
  gender: 'Male',
  dob: '2001-08-14',
  address: 'Plot 42, MIDC Bhosari Industrial Area',
  city: 'Pune',
  district: 'Pune',
  state: 'Maharashtra',
  pincode: '411026',
  qualification: 'ITI Machinist & Diploma Mechanical (Pursuing)',
  institution: 'Government Industrial Training Institute (ITI)',
  graduationYear: '2024',
  experienceYears: 1.5,
  currentRole: 'Junior CNC Machinist',
  skills: [
    'CNC Milling',
    'VMC Operating',
    'Blueprint Reading',
    'Vernier & Micrometer Inspection',
    '5S Workplace Safety',
  ],
  languages: ['Hindi (Native)', 'English (Working)', 'Marathi (Conversational)'],
  preferredCategories: ['manufacturing', 'logistics_supply'],
  preferredLocations: ['Pune', 'Bengaluru', 'Delhi NCR', 'Ahmedabad'],
  willingToRelocate: true,
  completionPercentage: 90,
  bio: 'Skilled precision machinist with hands-on industrial training in CNC setup, component gauging, and lean production. Seeking machine operator or maintenance role with growth opportunities in premier MSME manufacturing hubs.',
  apaarId: '2024-EDU-99214',
  aadhaarLastFour: '4829',
  aadhaarVerified: true,
  dpdpConsentGiven: true,
  isOnboardingComplete: true,
  enrolledViaInstitution: 'Government Industrial Training Institute (ITI)',
};

export const INITIAL_APPLICATIONS: readonly ApplicationData[] = [
  {
    id: 'app-501',
    jobId: 'job-101',
    jobTitle: 'CNC Machine Operator & Programmer',
    companyName: 'Aarya Precision Engineering Pvt Ltd',
    companyId: 'comp-01',
    candidateId: 'cand-01',
    candidateName: 'Rahul Sharma',
    candidateEducation: 'ITI Machinist (Govt ITI, 2024)',
    candidateExperience: '1.5 Years at Auto Ancillary Cluster',
    candidateSkills: ['CNC Milling', 'VMC Operating', 'Blueprint Reading'],
    appliedDate: '2026-10-13',
    status: 'under_review',
    notes: 'Practical trade test scheduled next Tuesday.',
  },
  {
    id: 'app-502',
    jobId: 'job-102',
    jobTitle: 'Junior React & Full Stack Developer',
    companyName: 'Zenith Cloudworks Technologies',
    companyId: 'comp-02',
    candidateId: 'cand-02',
    candidateName: 'Priya Verma',
    candidateEducation: 'B.Tech Computer Science (2025)',
    candidateExperience: 'Fresher / 6-Month Full Stack Project Internship',
    candidateSkills: ['React.js', 'TypeScript', 'Tailwind CSS', 'REST APIs'],
    appliedDate: '2026-10-14',
    status: 'shortlisted',
    interviewDate: '2026-10-18 at 11:30 AM',
    notes: 'Technical portfolio reviewed positively by engineering lead.',
  },
  {
    id: 'app-503',
    jobId: 'job-103',
    jobTitle: 'B2B Industrial Hardware Sales Officer',
    companyName: 'Apex Industrial Supply Corp',
    companyId: 'comp-03',
    candidateId: 'cand-01',
    candidateName: 'Rahul Sharma',
    candidateEducation: 'ITI Machinist & Wireman Permit',
    candidateExperience: '1.5 Years Industrial Maintenance',
    candidateSkills: ['Inverter Wiring', 'Solar PV', 'Preventive Maintenance'],
    appliedDate: '2026-10-12',
    status: 'applied',
  },
];

export const INITIAL_STUDENTS: readonly StudentRecordData[] = [
  {
    id: 'stu-01',
    institutionId: 'inst-01',
    studentName: 'Amitesh Chouhan',
    rollNumber: '0801ME221045',
    phone: '+91 94251 88301',
    stream: 'Mechanical Engineering (Diploma)',
    passingYear: '2026',
    profileCompleted: true,
    placementStatus: 'Available',
    invitedAt: '2026-10-01',
    state: 'invited',
  },
  {
    id: 'stu-02',
    institutionId: 'inst-01',
    studentName: 'Pooja Vishwakarma',
    rollNumber: '0801EC221089',
    phone: '+91 97530 22194',
    stream: 'Electronics & Instrumentation',
    passingYear: '2026',
    profileCompleted: true,
    placementStatus: 'Placed',
    invitedAt: '2026-10-01',
    state: 'active',
  },
  {
    id: 'stu-03',
    institutionId: 'inst-01',
    studentName: 'Deepak Malviya',
    rollNumber: '0801CS221012',
    phone: '+91 91114 38290',
    stream: 'Computer Application (BCA)',
    passingYear: '2026',
    profileCompleted: false,
    placementStatus: 'Available',
    invitedAt: '2026-10-04',
    state: 'invited',
  },
  {
    id: 'stu-04',
    institutionId: 'inst-01',
    studentName: 'Suman Patidar',
    rollNumber: '0801EE221067',
    phone: '+91 98932 77412',
    stream: 'Electrical Engineering (ITI)',
    passingYear: '2025',
    profileCompleted: true,
    placementStatus: 'Available',
    invitedAt: '2026-09-28',
    state: 'active',
  },
  {
    id: 'stu-05',
    institutionId: 'inst-01',
    studentName: 'Gaurav Rathore',
    rollNumber: '0801CE221034',
    phone: '+91 93019 45678',
    stream: 'Civil & Surveying (Diploma)',
    passingYear: '2026',
    profileCompleted: false,
    placementStatus: 'Available',
    state: 'invited',
  },
];

export const INITIAL_AUDIT_LOGS: readonly AuditLogEntryData[] = [
  {
    id: 'aud-901',
    timestamp: '2026-10-15 08:30:14',
    actor: 'MSME Center Regional Officer',
    role: 'msme_dept',
    action: 'Enterprise Verification',
    details: 'Verified Udyam Certificate for Aarya Precision Engineering Pvt Ltd (UDYAM-MH-26-0019482)',
    status: 'success',
  },
  {
    id: 'aud-902',
    timestamp: '2026-10-14 16:45:22',
    actor: 'Premier ITI Placement Cell',
    role: 'institution',
    action: 'Bulk Student Onboarding',
    details: 'Imported batch of 120 vocational students from CSV (BULK-01) in invited state with zero SMS',
    status: 'success',
  },
  {
    id: 'aud-903',
    timestamp: '2026-10-14 11:20:05',
    actor: 'Aarya Precision Engineering',
    role: 'employer',
    action: 'Job Posting Published',
    details: 'Posted vacancy: CNC Machine Operator & Programmer (2 Openings) in Pune MIDC cluster',
    status: 'success',
  },
  {
    id: 'aud-904',
    timestamp: '2026-10-13 14:10:50',
    actor: 'Rahul Sharma',
    role: 'jobseeker',
    action: 'Application Submitted',
    details: 'Applied for CNC Machine Operator & Programmer at Aarya Precision Engineering (PII Protected)',
    status: 'success',
  },
  {
    id: 'aud-905',
    timestamp: '2026-10-12 09:15:33',
    actor: 'Platform Ops Admin',
    role: 'platform_admin',
    action: 'Audit Log Archival Check',
    details: 'Verified append-only log integrity for 48,290 system transaction events',
    status: 'success',
  },
];
