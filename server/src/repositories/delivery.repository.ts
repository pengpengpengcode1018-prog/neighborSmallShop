import { prisma } from '../config/database.js';
import type { EnableStatus } from '../generated/prisma/client.js';
import { auditRepository, type AuditActor } from './audit.repository.js';

export interface DeliveryModesInput {
  asapEnabled: boolean;
  scheduledEnabled: boolean;
}

export interface DeliverySlotWriteInput {
  deliveryTime: string;
  cutoffTime: string;
  maxOrders: number;
  status: EnableStatus;
  sortOrder: number;
}

function slotAudit(input: DeliverySlotWriteInput) {
  return {
    deliveryTime: input.deliveryTime,
    cutoffTime: input.cutoffTime,
    maxOrders: input.maxOrders,
    status: input.status,
    sortOrder: input.sortOrder,
  };
}

export const deliveryRepository = {
  getConfig(storeId: string) {
    return prisma.store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: {
        id: true,
        asapDeliveryEnabled: true,
        scheduledDeliveryEnabled: true,
        deliverySlots: {
          orderBy: [{ sortOrder: 'desc' }, { deliveryTime: 'asc' }],
        },
      },
    });
  },

  updateModes(storeId: string, input: DeliveryModesInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.store.findUniqueOrThrow({
        where: { id: storeId },
        select: { asapDeliveryEnabled: true, scheduledDeliveryEnabled: true },
      });
      const updated = await tx.store.update({
        where: { id: storeId },
        data: {
          asapDeliveryEnabled: input.asapEnabled,
          scheduledDeliveryEnabled: input.scheduledEnabled,
        },
        select: {
          id: true,
          asapDeliveryEnabled: true,
          scheduledDeliveryEnabled: true,
        },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'delivery',
        action: 'modes',
        businessDataId: storeId,
        description: '更新店铺配送方式',
        beforeData: {
          asapEnabled: before.asapDeliveryEnabled,
          scheduledEnabled: before.scheduledDeliveryEnabled,
        },
        afterData: {
          asapEnabled: input.asapEnabled,
          scheduledEnabled: input.scheduledEnabled,
        },
      });
      return updated;
    });
  },

  findSlot(storeId: string, slotId: string) {
    return prisma.deliverySlot.findFirst({ where: { id: slotId, storeId } });
  },

  createSlot(storeId: string, input: DeliverySlotWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.deliverySlot.create({ data: { storeId, ...input } });
      await auditRepository.create(tx, {
        actor,
        module: 'delivery',
        action: 'create',
        businessDataId: created.id,
        description: `创建配送时段：${created.deliveryTime}`,
        afterData: {
          storeId,
          ...slotAudit(input),
        },
      });
      return created;
    });
  },

  updateSlot(slotId: string, input: DeliverySlotWriteInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.deliverySlot.findUniqueOrThrow({ where: { id: slotId } });
      const updated = await tx.deliverySlot.update({ where: { id: slotId }, data: input });
      await auditRepository.create(tx, {
        actor,
        module: 'delivery',
        action: 'update',
        businessDataId: slotId,
        description: `编辑配送时段：${updated.deliveryTime}`,
        beforeData: slotAudit(before),
        afterData: slotAudit(input),
      });
      return updated;
    });
  },

  updateSlotStatus(slotId: string, status: EnableStatus, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      const before = await tx.deliverySlot.findUniqueOrThrow({
        where: { id: slotId },
        select: { status: true },
      });
      const updated = await tx.deliverySlot.update({ where: { id: slotId }, data: { status } });
      await auditRepository.create(tx, {
        actor,
        module: 'delivery',
        action: 'status',
        businessDataId: slotId,
        description: `${status === 'ENABLED' ? '启用' : '停用'}配送时段：${updated.deliveryTime}`,
        beforeData: { status: before.status },
        afterData: { status },
      });
      return updated;
    });
  },
};
