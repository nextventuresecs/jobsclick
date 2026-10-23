import type { StudentRecordData } from '../../../data/sampleWorkspaces';

export function createQuickStudent(
  institutionId: string,
  name: string,
  roll: string,
  phone: string,
  stream: string,
  passingYear: string
): StudentRecordData {
  return {
    id: `stu-direct-${Date.now()}`,
    institutionId,
    studentName: name.trim(),
    rollNumber: roll.trim(),
    phone: `+91 ${phone}`,
    stream,
    passingYear,
    profileCompleted: false,
    placementStatus: 'Available',
    state: 'invited',
    invitedAt: new Date().toISOString().split('T')[0],
  };
}

export interface StudentMultiSelectFilters {
  readonly trades?: readonly string[];
  readonly passingYears?: readonly string[];
  readonly grades?: readonly string[];
  readonly skills?: readonly string[];
  readonly readinessStatus?: 'all' | 'profile_completed' | 'pending_otp' | 'available' | 'placed' | 'in_process';
  readonly search?: string;
}

export function maskContactNumber(phone?: string | null): string {
  if (!phone || !phone.trim()) {
    return '••••••••••';
  }
  const clean = phone.trim();
  if (clean.startsWith('+91')) {
    return '+91 ••••• •••••';
  }
  return '••••• •••••';
}

export function maskEmailAddress(email?: string | null): string {
  if (!email || !email.trim()) {
    return '•••••@••••.•••';
  }
  return '•••••@••••.•••';
}

export function filterStudentsMultiSelect(
  students: readonly StudentRecordData[],
  filters: StudentMultiSelectFilters,
): StudentRecordData[] {
  const {
    trades = [],
    passingYears = [],
    grades = [],
    skills = [],
    readinessStatus = 'all',
    search = '',
  } = filters;

  return students.filter((st) => {
    // 1. Text Search across name, roll number, stream, trade
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = st.studentName.toLowerCase().includes(q);
      const matchRoll = st.rollNumber.toLowerCase().includes(q);
      const matchStream = st.stream.toLowerCase().includes(q);
      const matchTrade = st.trade ? st.trade.toLowerCase().includes(q) : false;
      if (!matchName && !matchRoll && !matchStream && !matchTrade) {
        return false;
      }
    }

    // 2. Multi-Select Trades
    if (trades.length > 0) {
      const studentTrade = st.trade || st.stream;
      const matchesTrade = trades.some(
        (t) =>
          studentTrade.toLowerCase().includes(t.toLowerCase()) ||
          t.toLowerCase().includes(studentTrade.toLowerCase()),
      );
      if (!matchesTrade) {
        return false;
      }
    }

    // 3. Multi-Select Passing Years
    if (passingYears.length > 0) {
      if (!passingYears.includes(st.passingYear)) {
        return false;
      }
    }

    // 4. Multi-Select Grades
    if (grades.length > 0) {
      if (!st.grade || !grades.includes(st.grade)) {
        return false;
      }
    }

    // 5. Multi-Select Skills (candidate must possess at least one of selected skills)
    if (skills.length > 0) {
      if (!st.skills || st.skills.length === 0) {
        return false;
      }
      const hasSkill = skills.some((s) =>
        st.skills?.some((stSkill) => stSkill.toLowerCase().includes(s.toLowerCase())),
      );
      if (!hasSkill) {
        return false;
      }
    }

    // 6. Readiness & Placement Status
    if (readinessStatus === 'profile_completed' && !st.profileCompleted) {
      return false;
    }
    if (readinessStatus === 'pending_otp' && st.state !== 'invited') {
      return false;
    }
    if (readinessStatus === 'available' && st.placementStatus !== 'Available') {
      return false;
    }
    if (readinessStatus === 'placed' && st.placementStatus !== 'Placed') {
      return false;
    }
    if (readinessStatus === 'in_process' && st.placementStatus !== 'In Process') {
      return false;
    }

    return true;
  });
}

export function filterStudentsList(
  students: readonly StudentRecordData[],
  search: string,
  streamFilter: string,
  statusFilter: string
): StudentRecordData[] {
  return students.filter((st) => {
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchName = st.studentName.toLowerCase().includes(q);
      const matchRoll = st.rollNumber.toLowerCase().includes(q);
      if (!matchName && !matchRoll) return false;
    }
    if (streamFilter !== 'all' && !st.stream.toLowerCase().includes(streamFilter.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'all' && st.placementStatus !== statusFilter) {
      return false;
    }
    return true;
  });
}
