import { Prisma } from '../generated/prisma/client.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  communityRepository,
  type AuditActor,
  type CommunityWriteInput,
} from '../repositories/community.repository.js';

function notFound(): HttpError {
  return new HttpError(404, ERROR_CODES.NOT_FOUND, '配送小区不存在');
}

async function translateConflict<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, ERROR_CODES.CONFLICT, '同一城市和区域下已存在同名小区');
    }
    throw error;
  }
}

export const communityService = {
  async list(page: number, pageSize: number, keyword?: string, status?: 'ENABLED' | 'DISABLED') {
    const result = await communityRepository.list(page, pageSize, keyword, status);
    return {
      ...result,
      page,
      pageSize,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },

  create(input: CommunityWriteInput, actor: AuditActor) {
    return translateConflict(() => communityRepository.create(input, actor));
  },

  async update(id: string, input: CommunityWriteInput, actor: AuditActor) {
    const existing = await communityRepository.findActiveRecord(id);
    if (!existing) throw notFound();
    const before: CommunityWriteInput = {
      name: existing.name,
      city: existing.city,
      district: existing.district,
      detailedAddress: existing.detailedAddress,
      status: existing.status,
      sortOrder: existing.sortOrder,
    };
    return translateConflict(() => communityRepository.update(id, input, actor, before));
  },

  async updateStatus(id: string, status: 'ENABLED' | 'DISABLED', actor: AuditActor) {
    const existing = await communityRepository.findActiveRecord(id);
    if (!existing) throw notFound();
    return communityRepository.updateStatus(id, status, actor, existing.status);
  },

  async remove(id: string, actor: AuditActor) {
    const existing = await communityRepository.findActiveRecord(id);
    if (!existing) throw notFound();
    return communityRepository.softDelete(id, actor, existing.name);
  },
};
