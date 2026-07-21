import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AdminUserFilters {
  keyword?: string;
  status?: 'ACTIVE' | 'DISABLED';
  phoneBound?: boolean;
  communityId?: string;
}

const publicUserSelect = {
  id: true,
  nickname: true,
  avatarUrl: true,
  phone: true,
  status: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  currentCommunity: {
    select: { id: true, name: true },
  },
} satisfies Prisma.UserSelect;

function whereFor(filters: AdminUserFilters): Prisma.UserWhereInput {
  return {
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.communityId ? { currentCommunityId: filters.communityId } : {}),
    ...(filters.phoneBound === true ? { phone: { not: null } } : {}),
    ...(filters.phoneBound === false ? { phone: null } : {}),
    ...(filters.keyword
      ? {
          OR: [{ id: filters.keyword }, { nickname: { contains: filters.keyword } }],
        }
      : {}),
  };
}

export const adminUserRepository = {
  async list(filters: AdminUserFilters, page: number, pageSize: number) {
    const where = whereFor(filters);
    const [list, total] = await prisma.$transaction([
      prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.user.count({ where }),
    ]);
    return { list, total };
  },

  findById(id: string) {
    return prisma.user.findUnique({ where: { id }, select: publicUserSelect });
  },
};
