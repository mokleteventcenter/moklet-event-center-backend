import { Role } from 'generated/prisma/client';

export interface JwtPayload {
  sub: string; // Account.id
  email: string;
  role: Role;
  studentId: string | null;
}
