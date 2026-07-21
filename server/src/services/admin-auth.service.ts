import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { adminAuthRepository } from '../repositories/admin-auth.repository.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const TIMING_SAFE_PASSWORD_HASH = '$2b$12$l0MKLPsRP2vh3ZX1CTaUruMpUIC7lI1VTSLHpEp5WHAB2PP9a0Jh2';

export interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
}

interface AdminTokenPayload extends jwt.JwtPayload {
  sub: string;
  kind: 'ADMIN';
  username: string;
  role: 'PLATFORM_ADMIN';
}

function credentialsError(): HttpError {
  return new HttpError(401, ERROR_CODES.INVALID_CREDENTIALS, '用户名或密码错误');
}

export const adminAuthService = {
  async login(username: string, password: string, context: LoginContext) {
    const admin = await adminAuthRepository.findByUsername(username);
    const now = new Date();
    const passwordMatches = await bcrypt.compare(
      password,
      admin?.passwordHash ?? TIMING_SAFE_PASSWORD_HASH,
    );
    const unavailable =
      !admin || admin.status !== 'ACTIVE' || (admin.lockedUntil && admin.lockedUntil > now);

    if (unavailable) {
      await adminAuthRepository.recordLogin({
        username,
        result: admin?.lockedUntil && admin.lockedUntil > now ? 'LOCKED' : 'FAILED',
        failureReason: admin?.status === 'DISABLED' ? 'account_disabled' : 'invalid_credentials',
        ...(admin ? { adminId: admin.id } : {}),
        ...context,
      });
      throw credentialsError();
    }

    if (!passwordMatches) {
      const attempts = admin.failedLoginAttempts + 1;
      const lockedUntil =
        attempts >= MAX_FAILED_ATTEMPTS ? new Date(now.getTime() + LOCK_DURATION_MS) : undefined;
      await adminAuthRepository.recordFailure(admin.id, attempts, lockedUntil);
      await adminAuthRepository.recordLogin({
        adminId: admin.id,
        username,
        result: lockedUntil ? 'LOCKED' : 'FAILED',
        failureReason: lockedUntil ? 'too_many_attempts' : 'invalid_credentials',
        ...context,
      });
      throw credentialsError();
    }

    const updatedAdmin = await adminAuthRepository.recordSuccess(admin.id, context.ipAddress);
    await adminAuthRepository.recordLogin({
      adminId: admin.id,
      username,
      result: 'SUCCESS',
      ...context,
    });

    const token = jwt.sign(
      { kind: 'ADMIN', username: admin.username, role: 'PLATFORM_ADMIN' },
      env.JWT_SECRET,
      {
        subject: admin.id,
        expiresIn: env.JWT_EXPIRES_IN_SECONDS,
      },
    );

    return {
      token,
      expiresIn: env.JWT_EXPIRES_IN_SECONDS,
      admin: {
        id: updatedAdmin.id,
        username: updatedAdmin.username,
        displayName: updatedAdmin.displayName,
        role: 'PLATFORM_ADMIN' as const,
      },
    };
  },

  async authenticate(token: string) {
    let payload: AdminTokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as AdminTokenPayload;
    } catch {
      throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '登录状态无效或已过期');
    }

    if (!payload.sub || payload.kind !== 'ADMIN' || payload.role !== 'PLATFORM_ADMIN') {
      throw new HttpError(403, ERROR_CODES.FORBIDDEN, '无权访问该资源');
    }

    const admin = await adminAuthRepository.findActiveById(payload.sub);
    if (!admin) {
      throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '登录状态无效或已过期');
    }

    return {
      id: admin.id,
      username: admin.username,
      displayName: admin.displayName,
      role: 'PLATFORM_ADMIN' as const,
    };
  },
};
