import { Prisma } from '../generated/prisma/client.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import type { AuditActor } from '../repositories/audit.repository.js';
import {
  deliveryRepository,
  type DeliveryModesInput,
  type DeliverySlotWriteInput,
} from '../repositories/delivery.repository.js';

function storeNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.NOT_FOUND, '店铺不存在');
}

function slotNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.NOT_FOUND, '配送时段不存在');
}

function validateSlot(input: DeliverySlotWriteInput): void {
  if (input.cutoffTime >= input.deliveryTime) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '停止下单时间必须早于送达时间');
  }
}

async function translateConflict<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new HttpError(409, ERROR_CODES.CONFLICT, '同一店铺不能重复配置相同送达时间');
    }
    throw error;
  }
}

export const deliveryService = {
  async getConfig(storeId: string) {
    const config = await deliveryRepository.getConfig(storeId);
    if (!config) throw storeNotFound();
    return {
      storeId: config.id,
      modes: {
        asapEnabled: config.asapDeliveryEnabled,
        scheduledEnabled: config.scheduledDeliveryEnabled,
      },
      slots: config.deliverySlots,
    };
  },

  async updateModes(storeId: string, input: DeliveryModesInput, actor: AuditActor) {
    if (!input.asapEnabled && !input.scheduledEnabled) {
      throw new HttpError(409, ERROR_CODES.CONFLICT, '至少保留一种配送方式');
    }
    if (!(await deliveryRepository.getConfig(storeId))) throw storeNotFound();
    const updated = await deliveryRepository.updateModes(storeId, input, actor);
    return {
      storeId: updated.id,
      modes: {
        asapEnabled: updated.asapDeliveryEnabled,
        scheduledEnabled: updated.scheduledDeliveryEnabled,
      },
    };
  },

  async createSlot(storeId: string, input: DeliverySlotWriteInput, actor: AuditActor) {
    validateSlot(input);
    if (!(await deliveryRepository.getConfig(storeId))) throw storeNotFound();
    return translateConflict(() => deliveryRepository.createSlot(storeId, input, actor));
  },

  async updateSlot(
    storeId: string,
    slotId: string,
    input: DeliverySlotWriteInput,
    actor: AuditActor,
  ) {
    validateSlot(input);
    if (!(await deliveryRepository.findSlot(storeId, slotId))) throw slotNotFound();
    return translateConflict(() => deliveryRepository.updateSlot(slotId, input, actor));
  },

  async updateSlotStatus(
    storeId: string,
    slotId: string,
    status: 'ENABLED' | 'DISABLED',
    actor: AuditActor,
  ) {
    if (!(await deliveryRepository.findSlot(storeId, slotId))) throw slotNotFound();
    return deliveryRepository.updateSlotStatus(slotId, status, actor);
  },
};
