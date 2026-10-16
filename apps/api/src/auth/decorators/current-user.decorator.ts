import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface AuthUser {
  id: string;
  role: 'employer' | 'intermediary' | 'job_seeker' | 'admin' | 'msme_admin';
  phone?: string;
  email?: string | null;
}

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user: AuthUser | undefined = request.user;

    if (!user) {
      return null;
    }

    return data ? user[data] : user;
  },
);
