import { prisma } from '../config/database.js';
import { Prisma, type AddressLabel } from '../generated/prisma/client.js';

const addressInclude = { community: true } satisfies Prisma.AddressInclude;

export type AddressRecord = Prisma.AddressGetPayload<{ include: typeof addressInclude }>;

export interface AddressWriteInput {
  recipientName: string;
  phone: string;
  communityId: string;
  building: string;
  unit: string | null;
  room: string;
  detail: string | null;
  label: AddressLabel;
}

async function lockUser(transaction: Prisma.TransactionClient, userId: string): Promise<void> {
  await transaction.$queryRaw(Prisma.sql`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`);
}

export const addressRepository = {
  list(userId: string): Promise<AddressRecord[]> {
    return prisma.address.findMany({
      where: { userId, deletedAt: null },
      include: addressInclude,
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { id: 'asc' }],
    });
  },

  findOwned(userId: string, addressId: string) {
    return prisma.address.findFirst({
      where: { id: addressId, userId, deletedAt: null },
      select: { id: true, communityId: true },
    });
  },

  findAvailableCommunity(communityId: string) {
    return prisma.community.findFirst({
      where: { id: communityId, status: 'ENABLED', deletedAt: null },
      select: { id: true },
    });
  },

  create(userId: string, input: AddressWriteInput, requestedDefault: boolean) {
    return prisma.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      const addressCount = await transaction.address.count({
        where: { userId, deletedAt: null },
      });
      const makeDefault = requestedDefault || addressCount === 0;
      if (makeDefault) {
        await transaction.address.updateMany({
          where: { userId, deletedAt: null, isDefault: true },
          data: { isDefault: false, defaultKey: null },
        });
      }
      return transaction.address.create({
        data: {
          userId,
          ...input,
          isDefault: makeDefault,
          defaultKey: makeDefault ? userId : null,
        },
      });
    });
  },

  async update(userId: string, addressId: string, input: AddressWriteInput): Promise<boolean> {
    const result = await prisma.address.updateMany({
      where: { id: addressId, userId, deletedAt: null },
      data: input,
    });
    return result.count === 1;
  },

  setDefault(userId: string, addressId: string): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      const target = await transaction.address.findFirst({
        where: { id: addressId, userId, deletedAt: null },
        select: { id: true },
      });
      if (!target) return false;
      await transaction.address.updateMany({
        where: { userId, deletedAt: null, isDefault: true },
        data: { isDefault: false, defaultKey: null },
      });
      await transaction.address.update({
        where: { id: target.id },
        data: { isDefault: true, defaultKey: userId },
      });
      return true;
    });
  },

  softDelete(userId: string, addressId: string): Promise<boolean> {
    return prisma.$transaction(async (transaction) => {
      await lockUser(transaction, userId);
      const target = await transaction.address.findFirst({
        where: { id: addressId, userId, deletedAt: null },
        select: { id: true, isDefault: true },
      });
      if (!target) return false;
      await transaction.address.update({
        where: { id: target.id },
        data: { deletedAt: new Date(), isDefault: false, defaultKey: null },
      });
      if (target.isDefault) {
        const replacement = await transaction.address.findFirst({
          where: { userId, deletedAt: null },
          orderBy: [{ lastUsedAt: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
          select: { id: true },
        });
        if (replacement) {
          await transaction.address.update({
            where: { id: replacement.id },
            data: { isDefault: true, defaultKey: userId },
          });
        }
      }
      return true;
    });
  },
};
