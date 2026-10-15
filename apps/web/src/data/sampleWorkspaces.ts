import type { JobCategory, ApplicationStatus } from '@indian-job-portal/validation';

export interface SeekerProfileData {
  readonly id: string;
  readonly name: string;
  readonly phone: string; // Stored securely; masked for employers
  readonly email: string; // Stored securely; masked for employers
  readonly avatar?: string;
  readonly gender: 'Male' | 'Female' | 'Other';
  readonly dob: string;
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
  gender: 'Male',
  dob: '2001-08-14',
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
  languages: ['Hindi (Native)', 'English (Working)'],
  preferredCategories: ['manufacturing', 'logistics_supply'],
  preferredLocations: ['Pune', 'Bengaluru', 'Delhi NCR', 'Ahmedabad'],
  willingToRelocate: true,
  completionPercentage: 90,
  bio: 'Skilled precision machinist with hands-on industrial training in CNC setup, component gauging, and lean production. Seeking machine operator or maintenance role with growth opportunities in premier MSME manufacturing hubs.',
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
