import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { communityRepository } from '../repositories/community.repository.js';
import {
  residentStoreRepository,
  type ResidentStoreRecord,
} from '../repositories/resident-store.repository.js';

function communityNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.COMMUNITY_NOT_FOUND, '配送小区不存在或已停用');
}

function storeNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.STORE_NOT_FOUND, '店铺不存在或已停用');
}

function storeNotDeliverable(): HttpError {
  return new HttpError(409, ERROR_CODES.STORE_NOT_DELIVERABLE, '该店铺暂不配送至当前小区');
}

async function validateCommunity(communityId?: string): Promise<void> {
  if (communityId && !(await communityRepository.findAvailableById(communityId))) {
    throw communityNotFound();
  }
}

function serialize(store: ResidentStoreRecord, communityId?: string) {
  const selectedRelation = communityId
    ? store.communities.find((relation) => relation.communityId === communityId)
    : undefined;
  const isDeliverable = Boolean(communityId && selectedRelation);
  const minimumOrderAmount =
    selectedRelation?.minimumOrderAmountOverride ?? store.minimumOrderAmount;
  const deliveryFee = selectedRelation?.deliveryFeeOverride ?? store.defaultDeliveryFee;
  const estimatedDeliveryMinutes =
    selectedRelation?.estimatedDeliveryMinutesOverride ?? store.estimatedDeliveryMinutes;

  return {
    id: store.id,
    name: store.name,
    logoUrl: store.logoUrl,
    coverUrl: store.coverUrl,
    description: store.description,
    announcement: store.announcement,
    phone: store.phone,
    address: store.address,
    businessStartTime: store.businessStartTime,
    businessEndTime: store.businessEndTime,
    minimumOrderAmount: minimumOrderAmount.toFixed(2),
    deliveryFee: deliveryFee.toFixed(2),
    estimatedDeliveryMinutes,
    asapDeliveryEnabled: store.asapDeliveryEnabled,
    scheduledDeliveryEnabled: store.scheduledDeliveryEnabled,
    deliverySlots: store.deliverySlots,
    status: store.status,
    isDeliverable,
    canOrder: isDeliverable && store.status === 'OPEN',
    deliveryCommunities: store.communities.map(({ community }) => ({
      id: community.id,
      name: community.name,
      city: community.city,
      district: community.district,
      detailedAddress: community.detailedAddress,
    })),
  };
}

export const residentStoreService = {
  async list(page: number, pageSize: number, keyword?: string, communityId?: string) {
    await validateCommunity(communityId);
    const result = await residentStoreRepository.list(page, pageSize, keyword, communityId);
    return {
      list: result.list.map((store) => serialize(store, communityId)),
      page,
      pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / pageSize),
    };
  },

  async detail(id: string, communityId?: string) {
    await validateCommunity(communityId);
    const store = await residentStoreRepository.findBrowsable(id);
    if (!store) throw storeNotFound();
    if (
      communityId &&
      !store.communities.some((relation) => relation.communityId === communityId)
    ) {
      throw storeNotDeliverable();
    }
    return serialize(store, communityId);
  },
};
