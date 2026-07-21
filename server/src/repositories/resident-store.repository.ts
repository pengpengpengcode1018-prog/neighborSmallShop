import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';

const residentStoreInclude = {
  communities: {
    where: {
      status: 'ACTIVE',
      community: { status: 'ENABLED', deletedAt: null },
    },
    select: {
      communityId: true,
      minimumOrderAmountOverride: true,
      deliveryFeeOverride: true,
      estimatedDeliveryMinutesOverride: true,
      community: {
        select: {
          id: true,
          name: true,
          city: true,
          district: true,
          detailedAddress: true,
          sortOrder: true,
        },
      },
    },
    orderBy: [{ community: { sortOrder: 'desc' } }, { createdAt: 'asc' }],
  },
  deliverySlots: {
    where: { status: 'ENABLED' },
    select: { id: true, deliveryTime: true, cutoffTime: true },
    orderBy: [{ sortOrder: 'desc' }, { deliveryTime: 'asc' }],
  },
} satisfies Prisma.StoreInclude;

export type ResidentStoreRecord = Prisma.StoreGetPayload<{
  include: typeof residentStoreInclude;
}>;

function visibleWhere(keyword?: string, communityId?: string): Prisma.StoreWhereInput {
  return {
    deletedAt: null,
    status: { in: ['OPEN', 'PAUSED'] },
    ...(keyword ? { name: { contains: keyword } } : {}),
    ...(communityId
      ? {
          communities: {
            some: {
              communityId,
              status: 'ACTIVE',
              community: { status: 'ENABLED', deletedAt: null },
            },
          },
        }
      : {}),
  };
}

export const residentStoreRepository = {
  async list(
    page: number,
    pageSize: number,
    keyword?: string,
    communityId?: string,
  ): Promise<{ list: ResidentStoreRecord[]; total: number }> {
    const where = visibleWhere(keyword, communityId);
    const [list, total] = await prisma.$transaction([
      prisma.store.findMany({
        where,
        include: residentStoreInclude,
        orderBy: [{ sortOrder: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.store.count({ where }),
    ]);
    return { list, total };
  },

  findBrowsable(id: string): Promise<ResidentStoreRecord | null> {
    return prisma.store.findFirst({
      where: { ...visibleWhere(undefined, undefined), id },
      include: residentStoreInclude,
    });
  },
};
