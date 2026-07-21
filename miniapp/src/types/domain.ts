export interface CommunitySummary {
  id: string;
  name: string;
  city: string;
  district: string;
  detailedAddress: string;
}

export type StoreStatus = 'OPEN' | 'PAUSED';

export interface DeliverySlotSummary {
  id: string;
  deliveryTime: string;
  cutoffTime: string;
}

export interface StoreSummary {
  id: string;
  name: string;
  logoUrl: string | null;
  coverUrl: string | null;
  description: string | null;
  announcement: string | null;
  phone: string;
  address: string;
  businessStartTime: string;
  businessEndTime: string;
  minimumOrderAmount: string;
  deliveryFee: string;
  estimatedDeliveryMinutes: number;
  asapDeliveryEnabled: boolean;
  scheduledDeliveryEnabled: boolean;
  deliverySlots: DeliverySlotSummary[];
  status: StoreStatus;
  isDeliverable: boolean;
  canOrder: boolean;
  deliveryCommunities: CommunitySummary[];
}

export interface StoreListResult {
  list: StoreSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type ProductStatus = 'ON_SALE' | 'SOLD_OUT';

export interface ProductCategorySummary {
  id: string;
  name: string;
}

export interface ProductSummary {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  mainImageUrl: string | null;
  description: string | null;
  price: string;
  originalPrice: string | null;
  stock: number;
  salesVolume: number;
  purchaseLimit: number | null;
  isHot: boolean;
  status: ProductStatus;
  canPurchase: boolean;
}

export interface ProductDetail extends ProductSummary {
  galleryImageUrls: string[];
  detail: string | null;
  afterSaleNotes: string | null;
}

export interface ProductListResult {
  categories: ProductCategorySummary[];
  list: ProductSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export type CartItemUnavailableReason =
  'PRODUCT_OFF_SHELF' | 'PRODUCT_STOCK_NOT_ENOUGH' | 'PRODUCT_PURCHASE_LIMIT_EXCEEDED';

export interface CartItem {
  id: string;
  productId: string;
  name: string;
  imageUrl: string | null;
  unitPrice: string;
  quantity: number;
  lineTotal: string;
  stock: number;
  purchaseLimit: number | null;
  available: boolean;
  unavailableReason: CartItemUnavailableReason | null;
}

export interface CartStoreSummary {
  id: string;
  name: string;
  status: 'OPEN' | 'PAUSED' | 'DISABLED';
  isDeliverable: boolean;
  canOrder: boolean;
}

export interface CartSummary {
  itemCount: number;
  merchandiseTotal: string;
  deliveryFee: string;
  payableTotal: string;
  minimumOrderAmount: string;
  amountToMinimum: string;
  meetsMinimumOrder: boolean;
  canCheckout: boolean;
  blockedReason:
    | 'CART_EMPTY'
    | 'COMMUNITY_REQUIRED'
    | 'STORE_UNAVAILABLE'
    | 'ITEM_UNAVAILABLE'
    | 'MINIMUM_ORDER_NOT_REACHED'
    | null;
}

export interface CartView {
  cartId: string | null;
  store: CartStoreSummary | null;
  items: CartItem[];
  summary: CartSummary;
}

export type AddressLabel = 'HOME' | 'COMPANY' | 'SCHOOL' | 'OTHER';

export interface AddressInput {
  recipientName: string;
  phone: string;
  communityId: string;
  building: string;
  unit: string | null;
  room: string;
  detail: string | null;
  label: AddressLabel;
}

export interface AddressView {
  id: string;
  recipientName: string;
  phone: string;
  community: CommunitySummary;
  building: string;
  unit: string | null;
  room: string;
  detail: string | null;
  label: AddressLabel;
  isDefault: boolean;
  available: boolean;
  unavailableReason: 'COMMUNITY_UNAVAILABLE' | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddressListResult {
  list: AddressView[];
}

export type DeliveryType = 'ASAP' | 'SCHEDULED';
export type OrderStatus =
  | 'PENDING_PAYMENT'
  | 'PAID'
  | 'ACCEPTED'
  | 'PREPARING'
  | 'WAITING_DELIVERY'
  | 'DELIVERING'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'REFUND_PENDING'
  | 'REFUNDED';

export type RefundStatus =
  'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type RefundReason =
  | 'NO_LONGER_NEEDED'
  | 'WRONG_PRODUCT'
  | 'WRONG_ADDRESS'
  | 'UNSUITABLE_DELIVERY_TIME'
  | 'DUPLICATE_ORDER'
  | 'WAIT_TOO_LONG'
  | 'OTHER';

export type SubscriptionDecision = 'accept' | 'reject' | 'ban' | 'filter';

export type NotificationScene =
  | 'ORDER_PAID'
  | 'ORDER_ACCEPTED'
  | 'ORDER_DELIVERING'
  | 'ORDER_COMPLETED'
  | 'ORDER_CANCELLED'
  | 'REFUND_SUCCESS';

export interface SubscriptionTemplateOption {
  templateId: string;
  scenes: NotificationScene[];
  label: string;
}

export interface SubscriptionGroup {
  key: 'ORDER_PROGRESS' | 'REFUND_RESULT';
  title: string;
  templates: SubscriptionTemplateOption[];
}

export interface SubscriptionConsent {
  templateId: string;
  decision: Uppercase<SubscriptionDecision>;
  reportedAvailableCount: number;
  lastReportedAt: string;
}

export interface SubscriptionSettings {
  authorizationMode: 'ONE_TIME';
  maxTemplatesPerRequest: 5;
  groups: SubscriptionGroup[];
  consents: SubscriptionConsent[];
}

export interface SubscriptionReportResult {
  idempotentReplay: boolean;
  consents: SubscriptionConsent[];
}

export interface ResidentRefundDetail {
  id: string;
  refundNo: string;
  order: {
    id: string;
    orderNo: string;
    storeName: string;
    status: OrderStatus;
  };
  amount: string;
  currency: 'CNY';
  reason: RefundReason;
  reasonLabel: string;
  userNote: string | null;
  reviewNote: string | null;
  status: RefundStatus;
  statusLabel: string;
  failureMessage: string | null;
  refreshPending: boolean;
  createdAt: string;
  reviewedAt: string | null;
  completedAt: string | null;
}

export interface ApplyRefundResult {
  idempotentReplay: boolean;
  refund: ResidentRefundDetail;
}

export interface OrderSelection {
  addressId: string;
  deliveryType: DeliveryType;
  deliveryDate: string | null;
  deliverySlotId: string | null;
  remark: string | null;
}

export interface OrderPreview {
  previewVersion: string;
  store: { id: string; name: string };
  address: {
    id: string;
    recipientName: string;
    phone: string;
    communityName: string;
    building: string;
    unit: string | null;
    room: string;
    detail: string | null;
    fullAddress: string;
  };
  items: Array<{
    productId: string;
    name: string;
    imageUrl: string | null;
    unitPrice: string;
    quantity: number;
    lineTotal: string;
  }>;
  delivery: {
    type: DeliveryType;
    date: string | null;
    time: string | null;
    estimatedDeliveryMinutes: number;
  };
  remark: string | null;
  summary: {
    merchandiseTotal: string;
    deliveryFee: string;
    payableTotal: string;
    minimumOrderAmount: string;
  };
}

export interface CreatedOrder {
  id: string;
  orderNo: string;
  status: 'PENDING_PAYMENT';
  store: { id: string; name: string };
  address: Omit<OrderPreview['address'], 'id'>;
  items: OrderPreview['items'];
  delivery: Omit<OrderPreview['delivery'], 'estimatedDeliveryMinutes'>;
  remark: string | null;
  summary: Omit<OrderPreview['summary'], 'minimumOrderAmount'>;
  expiresAt: string;
  createdAt: string;
}

export interface CreateOrderResult {
  idempotentReplay: boolean;
  order: CreatedOrder;
}

export interface ResidentOrderCard {
  id: string;
  orderNo: string;
  store: { id: string; name: string; logoUrl: string | null };
  productSummary: {
    items: Array<{
      productId: string;
      name: string;
      imageUrl: string | null;
      quantity: number;
    }>;
    totalQuantity: number;
    distinctCount: number;
  };
  payableAmount: string;
  status: OrderStatus;
  statusLabel: string;
  createdAt: string;
  expiresAt: string;
  isExpired: boolean;
  allowedActions: Array<'PAY' | 'CANCEL' | 'REFUND'>;
}

export interface ResidentOrderDetail extends ResidentOrderCard {
  store: ResidentOrderCard['store'] & { phone: string | null };
  address: Omit<OrderPreview['address'], 'id'>;
  items: OrderPreview['items'];
  delivery: Omit<OrderPreview['delivery'], 'estimatedDeliveryMinutes'>;
  remark: string | null;
  summary: Omit<OrderPreview['summary'], 'minimumOrderAmount'>;
  cancellationReason: string | null;
  timestamps: {
    createdAt: string;
    paidAt: string | null;
    acceptedAt: string | null;
    preparingAt: string | null;
    waitingDeliveryAt: string | null;
    deliveringAt: string | null;
    completedAt: string | null;
    cancelledAt: string | null;
    refundedAt: string | null;
  };
  timeline: Array<{
    status: OrderStatus;
    title: string;
    description: string;
    time: string;
  }>;
  refund: {
    id: string;
    status: RefundStatus;
    amount: string;
    reason: RefundReason;
    createdAt: string;
  } | null;
}

export interface ResidentOrderListResult {
  list: ResidentOrderCard[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface WechatPaymentParameters {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

export interface InitializeWechatPaymentResult {
  paymentId: string;
  orderId: string;
  amount: string;
  parameters: WechatPaymentParameters;
  idempotentReplay: boolean;
}

export interface WechatPaymentStatusResult {
  orderId: string;
  orderStatus: OrderStatus;
  paymentStatus: 'UNPAID' | 'PENDING' | 'PAID' | 'FAILED';
  paidAt: string | null;
  expiresAt: string;
  transactionId: string | null;
  tradeState: string | null;
}

export interface CancelOrderResult {
  idempotentReplay: boolean;
  order: ResidentOrderDetail;
}

export interface UserProfile {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  phoneBound: boolean;
  currentCommunity: CommunitySummary | null;
}

export interface WechatLoginResult {
  token: string;
  expiresIn: number;
  user: UserProfile;
}
