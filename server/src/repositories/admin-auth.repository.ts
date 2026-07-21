import { prisma } from '../config/database.js';
import type { AdminLoginResult } from '../generated/prisma/enums.js';

export interface LoginAuditInput {
  adminId?: string;
  username: string;
  result: AdminLoginResult;
  failureReason?: string;
  ipAddress?: string;
  userAgent?: string;
}

export const adminAuthRepository = {
  findByUsername(username: string) {
    return prisma.admin.findUnique({ where: { username } });
  },

  findActiveById(id: string) {
    return prisma.admin.findFirst({ where: { id, status: 'ACTIVE' } });
  },

  recordLogin(input: LoginAuditInput) {
    return prisma.adminLoginLog.create({
      data: {
        username: input.username,
        result: input.result,
        ...(input.adminId ? { adminId: input.adminId } : {}),
        ...(input.failureReason ? { failureReason: input.failureReason } : {}),
        ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
        ...(input.userAgent ? { userAgent: input.userAgent } : {}),
      },
    });
  },

  recordFailure(adminId: string, failedLoginAttempts: number, lockedUntil?: Date) {
    return prisma.admin.update({
      where: { id: adminId },
      data: { failedLoginAttempts, lockedUntil: lockedUntil ?? null },
    });
  },

  recordSuccess(adminId: string, ipAddress?: string) {
    return prisma.admin.update({
      where: { id: adminId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
        lastLoginIp: ipAddress ?? null,
      },
    });
  },
};
