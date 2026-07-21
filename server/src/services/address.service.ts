import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  addressRepository,
  type AddressRecord,
  type AddressWriteInput,
} from '../repositories/address.repository.js';

function addressNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.ADDRESS_NOT_FOUND, '收货地址不存在');
}

function communityNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.COMMUNITY_NOT_FOUND, '配送小区不存在或已停用');
}

function serialize(address: AddressRecord) {
  const available = address.community.status === 'ENABLED' && address.community.deletedAt === null;
  return {
    id: address.id,
    recipientName: address.recipientName,
    phone: address.phone,
    community: {
      id: address.community.id,
      name: address.community.name,
      city: address.community.city,
      district: address.community.district,
      detailedAddress: address.community.detailedAddress,
    },
    building: address.building,
    unit: address.unit,
    room: address.room,
    detail: address.detail,
    label: address.label,
    isDefault: address.isDefault,
    available,
    unavailableReason: available ? null : 'COMMUNITY_UNAVAILABLE',
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}

async function list(userId: string) {
  return { list: (await addressRepository.list(userId)).map(serialize) };
}

async function requireAvailableCommunity(communityId: string): Promise<void> {
  if (!(await addressRepository.findAvailableCommunity(communityId))) throw communityNotFound();
}

export const addressService = {
  list,

  async create(userId: string, input: AddressWriteInput, isDefault: boolean) {
    await requireAvailableCommunity(input.communityId);
    await addressRepository.create(userId, input, isDefault);
    return list(userId);
  },

  async update(userId: string, addressId: string, input: AddressWriteInput) {
    if (!(await addressRepository.findOwned(userId, addressId))) throw addressNotFound();
    await requireAvailableCommunity(input.communityId);
    if (!(await addressRepository.update(userId, addressId, input))) throw addressNotFound();
    return list(userId);
  },

  async setDefault(userId: string, addressId: string) {
    const address = await addressRepository.findOwned(userId, addressId);
    if (!address) throw addressNotFound();
    await requireAvailableCommunity(address.communityId);
    if (!(await addressRepository.setDefault(userId, addressId))) throw addressNotFound();
    return list(userId);
  },

  async remove(userId: string, addressId: string) {
    if (!(await addressRepository.softDelete(userId, addressId))) throw addressNotFound();
    return list(userId);
  },
};
