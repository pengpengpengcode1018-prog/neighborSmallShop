import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  adminUserRepository,
  type AdminUserFilters,
} from '../repositories/admin-user.repository.js';

interface SafeAdminUser {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  status: 'ACTIVE' | 'DISABLED';
  lastLoginAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  currentCommunity: { id: string; name: string } | null;
}

function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 7) return '***';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function serialize(user: SafeAdminUser) {
  return {
    id: user.id,
    displayName: user.nickname?.trim() || '微信用户',
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    maskedPhone: maskPhone(user.phone),
    phoneBound: user.phone !== null,
    currentCommunity: user.currentCommunity,
    status: user.status,
    registeredAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    updatedAt: user.updatedAt.toISOString(),
  };
}

export const adminUserService = {
  async list(filters: AdminUserFilters, page: number, pageSize: number) {
    const result = await adminUserRepository.list(filters, page, pageSize);
    return {
      list: result.list.map(serialize),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },

  async detail(id: string) {
    const user = await adminUserRepository.findById(id);
    if (!user) throw new HttpError(404, ERROR_CODES.NOT_FOUND, '居民用户不存在');
    return serialize(user);
  },
};
