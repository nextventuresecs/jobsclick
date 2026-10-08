export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          phone: string;
          email: string | null;
          role: 'employer' | 'intermediary' | 'job_seeker' | 'admin' | 'msme_admin';
          status: 'invited' | 'active' | 'disabled';
          created_at: string;
          updated_at: string;
        };
      };
      // MVP and P2/P3 table types placeholder for type generation
    };
  };
}
