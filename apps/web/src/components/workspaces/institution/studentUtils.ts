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
