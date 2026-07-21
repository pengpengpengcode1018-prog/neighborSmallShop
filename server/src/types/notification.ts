export const notificationScenes = [
  'ORDER_PAID',
  'ORDER_ACCEPTED',
  'ORDER_DELIVERING',
  'ORDER_COMPLETED',
  'ORDER_CANCELLED',
  'REFUND_SUCCESS',
] as const;

export type NotificationSceneName = (typeof notificationScenes)[number];

export const notificationFields = [
  'orderNo',
  'storeName',
  'status',
  'occurredAt',
  'amount',
] as const;

export type NotificationField = (typeof notificationFields)[number];

export interface WechatSubscriptionTemplate {
  templateId: string;
  fields: Partial<Record<NotificationField, string>>;
}

export type WechatSubscriptionTemplates = Partial<
  Record<NotificationSceneName, WechatSubscriptionTemplate>
>;
