import { http } from './http';
import type { ApiSuccess } from '../types/api';

export type DeliverySlotStatus = 'ENABLED' | 'DISABLED';

export interface DeliveryModes {
  asapEnabled: boolean;
  scheduledEnabled: boolean;
}

export interface DeliverySlot {
  id: string;
  storeId: string;
  deliveryTime: string;
  cutoffTime: string;
  maxOrders: number;
  status: DeliverySlotStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface DeliverySlotInput {
  deliveryTime: string;
  cutoffTime: string;
  maxOrders: number;
  status: DeliverySlotStatus;
  sortOrder: number;
}

export interface DeliveryConfig {
  storeId: string;
  modes: DeliveryModes;
  slots: DeliverySlot[];
}

export async function getDeliveryConfig(storeId: string): Promise<DeliveryConfig> {
  const response = await http.get<ApiSuccess<DeliveryConfig>>(
    `/admin/stores/${storeId}/delivery-config`,
  );
  return response.data.data;
}

export async function updateDeliveryModes(
  storeId: string,
  input: DeliveryModes,
): Promise<Pick<DeliveryConfig, 'storeId' | 'modes'>> {
  const response = await http.put<ApiSuccess<Pick<DeliveryConfig, 'storeId' | 'modes'>>>(
    `/admin/stores/${storeId}/delivery-modes`,
    input,
  );
  return response.data.data;
}

export async function createDeliverySlot(
  storeId: string,
  input: DeliverySlotInput,
): Promise<DeliverySlot> {
  const response = await http.post<ApiSuccess<DeliverySlot>>(
    `/admin/stores/${storeId}/delivery-slots`,
    input,
  );
  return response.data.data;
}

export async function updateDeliverySlot(
  storeId: string,
  slotId: string,
  input: DeliverySlotInput,
): Promise<DeliverySlot> {
  const response = await http.put<ApiSuccess<DeliverySlot>>(
    `/admin/stores/${storeId}/delivery-slots/${slotId}`,
    input,
  );
  return response.data.data;
}

export async function updateDeliverySlotStatus(
  storeId: string,
  slotId: string,
  status: DeliverySlotStatus,
): Promise<DeliverySlot> {
  const response = await http.patch<ApiSuccess<DeliverySlot>>(
    `/admin/stores/${storeId}/delivery-slots/${slotId}/status`,
    { status },
  );
  return response.data.data;
}
