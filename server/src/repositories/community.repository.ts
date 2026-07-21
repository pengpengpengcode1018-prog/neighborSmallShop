import { prisma } from '../config/database.js';
import type { EnableStatus, Prisma } from '../generated/prisma/client.js';
import { auditRepository, type AuditActor } from './audit.repository.js';

export interface CommunityWriteInput {
  name: string;
  city: string;
  district: string;
  detailedAddress: string;
  status: EnableStatus;
  sortOrder: number;
}

function communityAuditJson(input: CommunityWriteInput): Prisma.InputJsonObject {
  return {
    name: input.name,
    city: input.city,
    district: input.district,
    status: input.status,
    sortOrder: input.sortOrder,
  };
}

export type { AuditActor } from './audit.repository.js';

export const communityRepository = {
  listAvailable() {
    return prisma.community.findMany({
      where: { status: 'ENABLED', deletedAt: null },
      orderBy: [{ sortOrder: 'desc' }, { name: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        city: true,
        district: true,
        detailedAddress: true,
      },
    });
  },

  findAvailableById(id: string) {
    return prisma.community.findFirst({
      where: { id, status: 'ENABLED', deletedAt: null },
      select: { id: true },
    });
  },

  async list(page: number, pageSize: number, keyword?: string, status?: EnableStatus) {
    const where: Prisma.CommunityWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(keyword
        ? {
            OR: [
              { name: { contains: keyword } },
              { city: { contains: keyword } },
              { district: { contains: keyword } },
            ],
          }
        : {}),
    };
    const [list, total] = await prisma.$transaction([
      prisma.community.findMany({
        where,
        orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.community.count({ where }),
    ]);
    return { list, total };
  },

  findActiveRecord(id: string) {
    return prisma.community.findFirst({ where: { id, deletedAt: null } });
  },

  create(input: CommunityWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.community.create({ data: input });
      await auditRepository.create(tx, {
        actor,
        module: 'community',
        action: 'create',
        businessDataId: created.id,
        description: `创建配送小区：${created.name}`,
        afterData: communityAuditJson(input),
      });
      return created;
    });
  },

  update(id: string, input: CommunityWriteInput, actor: AuditActor, before: CommunityWriteInput) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.community.update({ where: { id }, data: input });
      await auditRepository.create(tx, {
        actor,
        module: 'community',
        action: 'update',
        businessDataId: id,
        description: `编辑配送小区：${updated.name}`,
        beforeData: communityAuditJson(before),
        afterData: communityAuditJson(input),
      });
      return updated;
    });
  },

  updateStatus(id: string, status: EnableStatus, actor: AuditActor, beforeStatus: EnableStatus) {
    return prisma.$transaction(async (tx) => {
      const updated = await tx.community.update({ where: { id }, data: { status } });
      await auditRepository.create(tx, {
        actor,
        module: 'community',
        action: 'status',
        businessDataId: id,
        description: `${status === 'ENABLED' ? '启用' : '停用'}配送小区：${updated.name}`,
        beforeData: { status: beforeStatus },
        afterData: { status },
      });
      return updated;
    });
  },

  softDelete(id: string, actor: AuditActor, name: string) {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.community.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'DISABLED' },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'community',
        action: 'delete',
        businessDataId: id,
        description: `删除配送小区：${name}`,
        afterData: { deleted: true },
      });
      return deleted;
    });
  },
};
