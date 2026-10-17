import { z } from 'zod';

export const courseSchema = z.object({
  id: z.string(),
  name: z.string().min(2, 'Course name is required'),
  code: z.string().optional().default(''),
  duration: z.string().min(1, 'Duration is required'),
  annualIntake: z.coerce.number().int().nonnegative().default(60),
  eligibility: z.string().min(2, 'Eligibility is required'),
  description: z.string().optional().default(''),
});

export const subjectSchema = z.object({
  id: z.string(),
  courseName: z.string().min(2, 'Course name is required'),
  name: z.string().min(2, 'Subject name is required'),
  code: z.string().optional().default(''),
  semester: z.string().min(1, 'Semester/Year is required'),
  credits: z.coerce.number().optional().default(4),
  description: z.string().optional().default(''),
});

export const feeItemSchema = z.object({
  id: z.string(),
  courseName: z.string().min(2, 'Course name is required'),
  tuitionFee: z.coerce.number().nonnegative().default(0),
  developmentFee: z.coerce.number().nonnegative().default(0),
  examFee: z.coerce.number().nonnegative().default(0),
  hostelFee: z.coerce.number().nonnegative().default(0),
  oneTimeAdmissionFee: z.coerce.number().nonnegative().default(0),
  totalAnnualFee: z.coerce.number().nonnegative().default(0),
  remarks: z.string().optional().default(''),
});

export const departmentSchema = z.object({
  id: z.string(),
  name: z.string().min(2, 'Department name is required'),
  hodName: z.string().min(2, 'HOD name is required'),
  contactEmail: z.string().email().optional().or(z.literal('')),
  contactPhone: z.string().optional().default(''),
  labsCount: z.coerce.number().int().nonnegative().default(1),
  description: z.string().optional().default(''),
});

export const facultySchema = z.object({
  id: z.string(),
  name: z.string().min(2, 'Faculty name is required'),
  designation: z.string().min(2, 'Designation is required'),
  department: z.string().min(2, 'Department is required'),
  qualification: z.string().min(2, 'Qualification is required'),
  experienceYears: z.coerce.number().nonnegative().default(0),
  bio: z.string().optional().default(''),
  photoUrl: z.string().url().optional().or(z.literal('')),
});

export const institutionCmsSchema = z.object({
  courses: z.array(courseSchema).default([]),
  subjects: z.array(subjectSchema).default([]),
  feeStructure: z.array(feeItemSchema).default([]),
  departments: z.array(departmentSchema).default([]),
  faculty: z.array(facultySchema).default([]),
  welcomeText: z.string().optional().default(''),
  updatedAt: z.string().optional(),
});

export const inquiryStatusSchema = z.enum(['new', 'contacted', 'admitted', 'closed']);

export const createInstitutionInquirySchema = z.object({
  institutionId: z.string().min(1, 'Institution ID is required'),
  studentName: z.string().min(2, 'Student name is required'),
  studentPhone: z
    .string()
    .regex(/^(?:\+91)?[6-9]\d{9}$/, 'Must be a valid 10-digit Indian phone number'),
  studentEmail: z.string().email('Invalid email address').optional().or(z.literal('')),
  courseOfInterest: z.string().min(2, 'Course of interest is required'),
  qualification: z.string().min(2, 'Qualification is required'),
  city: z.string().min(2, 'City is required'),
  state: z.string().optional().default('Madhya Pradesh'),
  message: z.string().optional().default(''),
  dpdpConsent: z.boolean().refine((val) => val === true, {
    message: 'Consent to be contacted is required under DPDP Act',
  }),
});

export const updateInquiryStatusSchema = z.object({
  status: inquiryStatusSchema,
  notes: z.string().optional(),
});

export interface InstitutionInquiryLead {
  id: string;
  institution_id: string;
  student_name: string;
  student_phone: string;
  student_email?: string | null;
  course_of_interest: string;
  qualification?: string | null;
  city?: string | null;
  state?: string | null;
  message?: string | null;
  status: InquiryStatus;
  source: string;
  created_at: string;
  updated_at: string;
}

export type CourseItem = z.infer<typeof courseSchema>;
export type SubjectItem = z.infer<typeof subjectSchema>;
export type FeeItem = z.infer<typeof feeItemSchema>;
export type DepartmentItem = z.infer<typeof departmentSchema>;
export type FacultyItem = z.infer<typeof facultySchema>;
export type InstitutionCmsInput = z.infer<typeof institutionCmsSchema>;
export type InquiryStatus = z.infer<typeof inquiryStatusSchema>;
export type CreateInstitutionInquiryInput = z.infer<typeof createInstitutionInquirySchema>;
export type UpdateInquiryStatusInput = z.infer<typeof updateInquiryStatusSchema>;
