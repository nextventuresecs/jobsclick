import React from 'react';
import type { JobCategory, ApplicationStatus } from '@indian-job-portal/validation';
import { Wrench, Code2, Truck, Sparkles, Briefcase, HeartPulse } from 'lucide-react';

export interface CategoryTheme {
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly bg: string;
  readonly text: string;
  readonly border: string;
  readonly borderLeftClass: string;
  readonly hoverBorderClass: string;
  readonly accentHex: string;
}

export const CATEGORY_CONFIGS: Record<JobCategory, CategoryTheme> = {
  technology: {
    label: 'Technology & Software',
    icon: <Code2 className="w-3.5 h-3.5" />,
    bg: 'bg-emerald-50',
    text: 'text-emerald-800',
    border: 'border-emerald-200',
    borderLeftClass: 'border-l-4 border-l-emerald-500',
    hoverBorderClass: 'hover:border-emerald-300',
    accentHex: '#10B981',
  },
  manufacturing: {
    label: 'Manufacturing & Trades',
    icon: <Wrench className="w-3.5 h-3.5" />,
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
    borderLeftClass: 'border-l-4 border-l-[#F97316]',
    hoverBorderClass: 'hover:border-orange-300',
    accentHex: '#F97316',
  },
  sales_operations: {
    label: 'Sales & Operations',
    icon: <Briefcase className="w-3.5 h-3.5" />,
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
    borderLeftClass: 'border-l-4 border-l-blue-500',
    hoverBorderClass: 'hover:border-blue-300',
    accentHex: '#3B82F6',
  },
  logistics_supply: {
    label: 'Logistics & Supply Chain',
    icon: <Truck className="w-3.5 h-3.5" />,
    bg: 'bg-teal-50',
    text: 'text-teal-800',
    border: 'border-teal-200',
    borderLeftClass: 'border-l-4 border-l-teal-500',
    hoverBorderClass: 'hover:border-teal-300',
    accentHex: '#14B8A6',
  },
  creative_services: {
    label: 'Creative & Design',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    bg: 'bg-purple-50',
    text: 'text-purple-800',
    border: 'border-purple-200',
    borderLeftClass: 'border-l-4 border-l-purple-500',
    hoverBorderClass: 'hover:border-purple-300',
    accentHex: '#8B5CF6',
  },
  healthcare_services: {
    label: 'Healthcare & Services',
    icon: <HeartPulse className="w-3.5 h-3.5" />,
    bg: 'bg-rose-50',
    text: 'text-rose-800',
    border: 'border-rose-200',
    borderLeftClass: 'border-l-4 border-l-rose-500',
    hoverBorderClass: 'hover:border-rose-300',
    accentHex: '#F43F5E',
  },
  // Legacy backward-compatibility fallbacks
  white: {
    label: 'White Collar',
    icon: <Briefcase className="w-3.5 h-3.5" />,
    bg: 'bg-blue-50',
    text: 'text-blue-800',
    border: 'border-blue-200',
    borderLeftClass: 'border-l-4 border-l-blue-500',
    hoverBorderClass: 'hover:border-blue-300',
    accentHex: '#3B82F6',
  },
  blue: {
    label: 'Blue Collar',
    icon: <Wrench className="w-3.5 h-3.5" />,
    bg: 'bg-orange-50',
    text: 'text-orange-800',
    border: 'border-orange-200',
    borderLeftClass: 'border-l-4 border-l-[#F97316]',
    hoverBorderClass: 'hover:border-orange-300',
    accentHex: '#F97316',
  },
  grey: {
    label: 'Grey Collar',
    icon: <Code2 className="w-3.5 h-3.5" />,
    bg: 'bg-slate-50',
    text: 'text-slate-800',
    border: 'border-slate-200',
    borderLeftClass: 'border-l-4 border-l-slate-500',
    hoverBorderClass: 'hover:border-slate-300',
    accentHex: '#64748B',
  },
  open: {
    label: 'Open Collar',
    icon: <Sparkles className="w-3.5 h-3.5" />,
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-200',
    borderLeftClass: 'border-l-4 border-l-amber-500',
    hoverBorderClass: 'hover:border-amber-300',
    accentHex: '#F59E0B',
  },
} as const;

export const DEFAULT_CATEGORY_THEME: CategoryTheme = CATEGORY_CONFIGS.manufacturing;

export const getCategoryCardBorderClass = (category: JobCategory): string => {
  const theme = CATEGORY_CONFIGS[category] ?? DEFAULT_CATEGORY_THEME;
  return theme.borderLeftClass;
};

export interface CategoryBadgeProps {
  readonly category: JobCategory;
  readonly showIcon?: boolean;
  readonly className?: string;
  readonly size?: 'sm' | 'md';
}

export const CategoryBadge: React.FC<CategoryBadgeProps> = ({
  category,
  showIcon = true,
  className = '',
  size = 'sm',
}) => {
  const current = CATEGORY_CONFIGS[category] ?? DEFAULT_CATEGORY_THEME;
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-medium rounded border ${current.bg} ${current.text} ${current.border} ${padding} ${className}`}
    >
      {showIcon && current.icon}
      <span>{current.label}</span>
    </span>
  );
};

export interface StatusTheme {
  readonly label: string;
  readonly bg: string;
  readonly text: string;
  readonly dot: string;
}

export const DEFAULT_STATUS_THEME: StatusTheme = {
  label: 'Application Received',
  bg: 'bg-blue-50 border-blue-200',
  text: 'text-blue-800',
  dot: 'bg-blue-500',
} as const;

export interface StatusBadgeProps {
  readonly status: ApplicationStatus;
  readonly className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, className = '' }) => {
  const configs: Record<ApplicationStatus, StatusTheme> = {
    applied: {
      label: 'Application Received',
      bg: 'bg-blue-50 border-blue-200',
      text: 'text-blue-800',
      dot: 'bg-blue-500',
    },
    under_review: {
      label: 'Under Review',
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      dot: 'bg-amber-500',
    },
    shortlisted: {
      label: 'Shortlisted',
      bg: 'bg-indigo-50 border-indigo-200',
      text: 'text-indigo-800',
      dot: 'bg-indigo-500',
    },
    interview_scheduled: {
      label: 'Interview Scheduled',
      bg: 'bg-purple-50 border-purple-200',
      text: 'text-purple-800',
      dot: 'bg-purple-500',
    },
    selected: {
      label: 'Selected / Offer Sent',
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-800',
      dot: 'bg-emerald-500',
    },
    rejected: {
      label: 'Not Selected',
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      dot: 'bg-red-500',
    },
    hired: {
      label: 'Hired & Placed',
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-800',
      dot: 'bg-emerald-600',
    },
  };

  const current: StatusTheme = configs[status] ?? DEFAULT_STATUS_THEME;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${current.bg} ${current.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      <span>{current.label}</span>
    </span>
  );
};

export type JobListingStatus = 'active' | 'draft' | 'expired' | 'closed';

export interface JobStatusTheme {
  readonly label: string;
  readonly bg: string;
  readonly text: string;
  readonly dot: string;
}

export const DEFAULT_JOB_STATUS_THEME: JobStatusTheme = {
  label: 'Active & Verified',
  bg: 'bg-emerald-50 border-emerald-200',
  text: 'text-emerald-800',
  dot: 'bg-emerald-500',
} as const;

export interface JobStatusBadgeProps {
  readonly status: JobListingStatus;
  readonly className?: string;
}

export const JobStatusBadge: React.FC<JobStatusBadgeProps> = ({ status, className = '' }) => {
  const configs: Record<JobListingStatus, JobStatusTheme> = {
    active: {
      label: 'Active & Verified',
      bg: 'bg-emerald-50 border-emerald-200',
      text: 'text-emerald-800',
      dot: 'bg-emerald-500',
    },
    draft: {
      label: 'Draft',
      bg: 'bg-gray-50 border-gray-200',
      text: 'text-gray-700',
      dot: 'bg-gray-400',
    },
    expired: {
      label: 'Expired',
      bg: 'bg-amber-50 border-amber-200',
      text: 'text-amber-800',
      dot: 'bg-amber-500',
    },
    closed: {
      label: 'Closed',
      bg: 'bg-red-50 border-red-200',
      text: 'text-red-700',
      dot: 'bg-red-500',
    },
  };

  const current: JobStatusTheme = configs[status] ?? DEFAULT_JOB_STATUS_THEME;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${current.bg} ${current.text} ${className}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${current.dot}`} />
      <span>{current.label}</span>
    </span>
  );
};
