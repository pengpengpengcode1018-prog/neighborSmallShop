import { prisma } from '../config/database.js';
import type { Prisma, StoreStatus } from '../generated/prisma/client.js';
import { auditRepository, type AuditActor } from './audit.repository.js';

export class InvalidCommunityReferenceError extends Error {}

export interface StoreWriteInput {
  name: string;
  phone: string;
  address: string;
  description?: string | undefined;
  announcement?: string | undefined;
  businessStartTime: string;
  businessEndTime: string;
  minimumOrderAmount: string;
  defaultDeliveryFee: string;
  estimatedDeliveryMinutes: number;
  status: StoreStatus;
  sortOrder: number;
  communityIds: string[];
}

function storeData(input: StoreWriteInput) {
  return {
    name: input.name,
    phone: input.phone,
    address: input.address,
    description: input.description ?? null,
    announcement: input.announcement ?? null,
    businessStartTime: input.businessStartTime,
    businessEndTime: input.businessEndTime,
    minimumOrderAmount: input.minimumOrderAmount,
    defaultDeliveryFee: input.defaultDeliveryFee,
    estimatedDeliveryMinutes: input.estimatedDeliveryMinutes,
    status: input.status,
    sortOrder: input.sortOrder,
  };
}

function auditSummary(input: StoreWriteInput) {
  return {
    name: input.name,
    status: input.status,
    sortOrder: input.sortOrder,
    communityIds: input.communityIds,
  };
}

async function validateCommunities(tx: Prisma.TransactionClient, communityIds: string[]) {
  const count = await tx.community.count({
    where: { id: { in: communityIds }, status: 'ENABLED', deletedAt: null },
  });
  if (count !== communityIds.length) throw new InvalidCommunityReferenceError();
}

export const storeRepository = {
  async list(page: number, pageSize: number, keyword?: string, status?: StoreStatus) {
    const where: Prisma.StoreWhereInput = {
      deletedAt: null,
      ...(status ? { status } : {}),
      ...(keyword ? { name: { contains: keyword } } : {}),
    };
    const [list, total] = await prisma.$transaction([
      prisma.store.findMany({
        where,
        include: { communities: { include: { community: true } } },
        orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.store.count({ where }),
    ]);
    return { list, total };
  },

  find(id: string) {
    return prisma.store.findFirst({
      where: { id, deletedAt: null },
      include: { communities: { include: { community: true } } },
    });
  },

  create(input: StoreWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      await validateCommunities(tx, input.communityIds);
      const created = await tx.store.create({
        data: {
          ...storeData(input),
          communities: { create: input.communityIds.map((communityId) => ({ communityId })) },
        },
        include: { communities: { include: { community: true } } },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'store',
        action: 'create',
        businessDataId: created.id,
        description: `创建店铺：${created.name}`,
        afterData: auditSummary(input),
      });
      return created;
    });
  },

  update(id: string, input: StoreWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      await validateCommunities(tx, input.communityIds);
      const before = await tx.store.findUniqueOrThrow({
        where: { id },
        include: { communities: { select: { communityId: true } } },
      });
      await tx.storeCommunity.deleteMany({ where: { storeId: id } });
      const updated = await tx.store.update({
        where: { id },
        data: {
          ...storeData(input),
          communities: { create: input.communityIds.map((communityId) => ({ communityId })) },
        },
        include: { communities: { include: { community: true } } },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'store',
        action: 'update',
        businessDataId: id,
        description: `编辑店铺：${updated.name}`,
        beforeData: {
          name: before.name,
          status: before.status,
          sortOrder: before.sortOrder,
          communityIds: before.communities.map((item) => item.communityId),
        },
        afterData: auditSummary(input),
      });
      return updated;
    });
  },

  updateStatus(id: string, status: StoreStatus, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.store.findUniqueOrThrow({ where: { id }, select: { status: true } });
      const updated = await tx.store.update({ where: { id }, data: { status } });
      await auditRepository.create(tx, {
        actor,
        module: 'store',
        action: 'status',
        businessDataId: id,
        description: `更新店铺状态：${updated.name}`,
        beforeData: { status: before.status },
        afterData: { status },
      });
      return updated;
    });
  },

  softDelete(id: string, actor: AuditActor, name: string) {
    return prisma.$transaction(async (tx) => {
      const deleted = await tx.store.update({
        where: { id },
        data: { deletedAt: new Date(), status: 'DISABLED' },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'store',
        action: 'delete',
        businessDataId: id,
        description: `删除店铺：${name}`,
        afterData: { deleted: true, status: 'DISABLED' },
      });
      return deleted;
    });
  },
};
