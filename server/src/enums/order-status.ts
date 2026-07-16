export const ORDER_TRANSITIONS = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['accepted', 'refund_pending'],
  accepted: ['preparing', 'refund_pending'],
  preparing: ['waiting_delivery'],
  waiting_delivery: ['delivering'],
  delivering: ['completed'],
  refund_pending: ['refunded'],
  completed: [],
  cancelled: [],
  refunded: [],
} as const;

export type OrderStatus = keyof typeof ORDER_TRANSITIONS;
