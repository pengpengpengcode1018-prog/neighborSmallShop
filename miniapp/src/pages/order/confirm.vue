<script setup lang="ts">
import { onLoad, onShow, onUnload } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';
import { computed, ref } from 'vue';

import { useAddressStore } from '../../stores/address';
import { useCartStore } from '../../stores/cart';
import { useOrderStore } from '../../stores/order';
import { useStoreStore } from '../../stores/store';
import { useUserStore } from '../../stores/user';
import type { DeliveryType, OrderSelection } from '../../types/domain';

const addressStore = useAddressStore();
const cartStore = useCartStore();
const orderStore = useOrderStore();
const storeStore = useStoreStore();
const userStore = useUserStore();
const {
  preview,
  createdOrder,
  isPreviewLoading,
  isSubmitting,
  previewError,
  submitError,
  amountChangeNotice,
  requiresLatestConfirmation,
  isPaying,
  paymentError,
  paymentOutcome,
} = storeToRefs(orderStore);

const addressId = ref('');
const deliveryType = ref<DeliveryType>('ASAP');
const deliveryDate = ref<string | null>(null);
const deliverySlotId = ref<string | null>(null);
const remark = ref('');
const initialized = ref(false);
const isCreatedOrderExpired = ref(false);
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

const selectedAddress = computed(() =>
  addressStore.addresses.find((address) => address.id === addressId.value),
);
const deliverySlots = computed(() => storeStore.detail?.deliverySlots ?? []);
const dateOptions = computed(() => {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${today}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const value = date.toISOString().slice(0, 10);
    return { value, label: index === 0 ? `今天 ${value.slice(5)}` : value };
  });
});
const selectedDateIndex = computed(() =>
  Math.max(
    0,
    dateOptions.value.findIndex((item) => item.value === deliveryDate.value),
  ),
);
const selectedSlotIndex = computed(() =>
  Math.max(
    0,
    deliverySlots.value.findIndex((item) => item.id === deliverySlotId.value),
  ),
);

onLoad((query) => {
  addressId.value = typeof query?.addressId === 'string' ? query.addressId : '';
  orderStore.reset();
});

onShow(() => {
  if (!initialized.value) void initialize();
});

onUnload(() => {
  if (expiryTimer) clearTimeout(expiryTimer);
});

function scheduleCreatedOrderExpiry(expiresAt: string): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  const remaining = new Date(expiresAt).getTime() - Date.now();
  isCreatedOrderExpired.value = remaining <= 0;
  if (remaining > 0) {
    expiryTimer = setTimeout(() => {
      isCreatedOrderExpired.value = true;
      expiryTimer = null;
    }, remaining);
  }
}

function currentSelection(): OrderSelection {
  return {
    addressId: addressId.value,
    deliveryType: deliveryType.value,
    deliveryDate: deliveryType.value === 'SCHEDULED' ? deliveryDate.value : null,
    deliverySlotId: deliveryType.value === 'SCHEDULED' ? deliverySlotId.value : null,
    remark: remark.value.trim() || null,
  };
}

async function initialize(): Promise<void> {
  initialized.value = true;
  await userStore.restoreSession();
  if (!userStore.accessToken) {
    void uni.redirectTo({ url: '/pages/home/index' });
    return;
  }
  await Promise.all([
    addressStore.load(userStore.accessToken),
    cartStore.load(userStore.accessToken),
  ]);
  if (!selectedAddress.value) return;
  const confirmed = await orderStore.loadPreview(userStore.accessToken, currentSelection());
  if (confirmed) {
    await storeStore.loadDetail(confirmed.store.id, selectedAddress.value.community.id);
  }
}

async function refreshPreview(): Promise<void> {
  if (!userStore.accessToken || !addressId.value) return;
  await orderStore.loadPreview(userStore.accessToken, currentSelection());
}

async function chooseDelivery(type: DeliveryType): Promise<void> {
  if (isPreviewLoading.value || isSubmitting.value || type === deliveryType.value) return;
  if (type === 'SCHEDULED') {
    if (deliverySlots.value.length === 0) {
      uni.showToast({ title: '店铺暂无可选预约时段', icon: 'none' });
      return;
    }
    deliveryDate.value = dateOptions.value[0]?.value ?? null;
    deliverySlotId.value = deliverySlots.value[0]?.id ?? null;
  } else {
    deliveryDate.value = null;
    deliverySlotId.value = null;
  }
  deliveryType.value = type;
  await refreshPreview();
}

async function changeDate(event: { detail: { value: string | number } }): Promise<void> {
  deliveryDate.value = dateOptions.value[Number(event.detail.value)]?.value ?? null;
  await refreshPreview();
}

async function changeSlot(event: { detail: { value: string | number } }): Promise<void> {
  deliverySlotId.value = deliverySlots.value[Number(event.detail.value)]?.id ?? null;
  await refreshPreview();
}

async function refreshRemark(): Promise<void> {
  if (remark.value.trim() !== (orderStore.selection?.remark ?? '')) await refreshPreview();
}

async function submit(): Promise<void> {
  if (!userStore.accessToken || isSubmitting.value) return;
  if (requiresLatestConfirmation.value) {
    uni.showToast({ title: '请先确认更新后的订单信息', icon: 'none' });
    return;
  }
  if (JSON.stringify(currentSelection()) !== JSON.stringify(orderStore.selection)) {
    await refreshPreview();
    uni.showToast({ title: '订单信息已更新，请确认后再提交', icon: 'none' });
    return;
  }
  const result = await orderStore.submit(userStore.accessToken);
  if (result) {
    cartStore.reset();
    scheduleCreatedOrderExpiry(result.order.expiresAt);
  }
}

function chooseAddress(): void {
  void uni.navigateTo({ url: '/pages/address/index?from=cart' });
}

function goHome(): void {
  orderStore.reset();
  void uni.reLaunch({ url: '/pages/home/index' });
}

function viewCreatedOrder(): void {
  if (!createdOrder.value) return;
  void uni.redirectTo({
    url: `/pages/order/detail?id=${encodeURIComponent(createdOrder.value.id)}`,
  });
}

async function payCreatedOrder(): Promise<void> {
  if (!userStore.accessToken || !createdOrder.value) return;
  if (isCreatedOrderExpired.value) {
    uni.showToast({ title: '支付时间已结束，正在确认关单', icon: 'none' });
    viewCreatedOrder();
    return;
  }
  const succeeded = await orderStore.pay(userStore.accessToken, createdOrder.value.id);
  if (succeeded) {
    uni.showToast({ title: '支付已确认', icon: 'success' });
    viewCreatedOrder();
    return;
  }
  uni.showToast({
    title:
      paymentOutcome.value === 'CANCELLED'
        ? '已取消支付'
        : (paymentError.value ?? '支付结果暂未确认'),
    icon: 'none',
  });
}
</script>

<template>
  <view class="order-page">
    <view v-if="createdOrder" class="success-card">
      <view class="success-card__mark">✓</view>
      <text class="success-card__title">订单已创建</text>
      <text class="success-card__number">订单号 {{ createdOrder.orderNo }}</text>
      <text class="success-card__status">
        {{ isCreatedOrderExpired ? '支付已超时，正在关闭' : '待支付' }} · ¥{{
          createdOrder.summary.payableTotal
        }}
      </text>
      <van-notice-bar
        left-icon="info-o"
        text="支付完成后将由服务端回调或主动查询确认，请勿仅以微信客户端提示为准。"
      />
      <text v-if="paymentError" class="payment-error">{{ paymentError }}</text>
      <van-button
        block
        type="primary"
        :loading="isPaying"
        :disabled="isCreatedOrderExpired"
        loading-text="支付确认中…"
        @click="payCreatedOrder"
      >
        {{
          isCreatedOrderExpired
            ? '支付已超时，请查看订单'
            : `立即支付 ¥${createdOrder.summary.payableTotal}`
        }}
      </van-button>
      <van-button block plain :disabled="isPaying" @click="viewCreatedOrder">
        查看订单详情
      </van-button>
      <van-button block plain :disabled="isPaying" @click="goHome">返回首页</van-button>
    </view>

    <view v-else-if="isPreviewLoading && !preview" class="order-state">
      <van-loading type="spinner" color="#1f8f63">正在核对订单</van-loading>
    </view>
    <view v-else-if="!selectedAddress" class="order-state">
      <van-empty description="收货地址不存在或已失效" />
      <van-button size="small" type="primary" @click="chooseAddress">重新选择地址</van-button>
    </view>
    <view v-else-if="previewError && !preview" class="order-state">
      <van-empty :description="previewError" />
      <van-button size="small" type="primary" @click="refreshPreview">重新核对</van-button>
    </view>
    <template v-else-if="preview">
      <view class="section-card address-card" @click="chooseAddress">
        <view class="section-heading">
          <text>收货地址</text><text class="section-link">更换 ›</text>
        </view>
        <text class="address-card__person">
          {{ preview.address.recipientName }} · {{ preview.address.phone }}
        </text>
        <text class="address-card__line">{{ preview.address.fullAddress }}</text>
      </view>

      <view class="section-card">
        <text class="section-title">配送方式</text>
        <view class="delivery-tabs">
          <view
            class="delivery-tab"
            :class="{ 'delivery-tab--active': deliveryType === 'ASAP' }"
            @click="chooseDelivery('ASAP')"
          >
            尽快送达
          </view>
          <view
            class="delivery-tab"
            :class="{ 'delivery-tab--active': deliveryType === 'SCHEDULED' }"
            @click="chooseDelivery('SCHEDULED')"
          >
            预约送达
          </view>
        </view>
        <text v-if="deliveryType === 'ASAP'" class="delivery-hint">
          预计 {{ preview.delivery.estimatedDeliveryMinutes }} 分钟送达
        </text>
        <view v-else class="picker-list">
          <picker
            mode="selector"
            :range="dateOptions"
            range-key="label"
            :value="selectedDateIndex"
            @change="changeDate"
          >
            <view class="picker-row">
              <text>配送日期</text><text>{{ deliveryDate }} ›</text>
            </view>
          </picker>
          <picker
            mode="selector"
            :range="deliverySlots"
            range-key="deliveryTime"
            :value="selectedSlotIndex"
            @change="changeSlot"
          >
            <view class="picker-row">
              <text>送达时段</text><text>{{ preview.delivery.time }} ›</text>
            </view>
          </picker>
        </view>
      </view>

      <view class="section-card">
        <view class="section-heading">
          <text>{{ preview.store.name }}</text
          ><text>{{ preview.items.length }} 种商品</text>
        </view>
        <view v-for="item in preview.items" :key="item.productId" class="order-item">
          <image
            v-if="item.imageUrl"
            class="order-item__image"
            mode="aspectFill"
            :src="item.imageUrl"
          />
          <view v-else class="order-item__image order-item__fallback">{{
            item.name.slice(0, 1)
          }}</view>
          <view class="order-item__content">
            <text class="order-item__name">{{ item.name }}</text>
            <text class="order-item__meta">¥{{ item.unitPrice }} × {{ item.quantity }}</text>
          </view>
          <text class="order-item__total">¥{{ item.lineTotal }}</text>
        </view>
      </view>

      <view class="section-card">
        <text class="section-title">订单备注</text>
        <textarea
          v-model="remark"
          class="remark-input"
          maxlength="200"
          placeholder="选填，最多 200 字"
          @blur="refreshRemark"
        />
        <text class="remark-count">{{ remark.length }}/200</text>
      </view>

      <view class="section-card price-list">
        <view
          ><text>商品小计</text><text>¥{{ preview.summary.merchandiseTotal }}</text></view
        >
        <view
          ><text>配送费</text><text>¥{{ preview.summary.deliveryFee }}</text></view
        >
        <view class="price-list__total"
          ><text>应付金额</text><text>¥{{ preview.summary.payableTotal }}</text></view
        >
      </view>

      <van-notice-bar v-if="amountChangeNotice" left-icon="warning-o" :text="amountChangeNotice" />
      <view v-if="requiresLatestConfirmation" class="latest-confirm">
        <van-button block type="primary" plain @click="orderStore.confirmLatest">
          我已确认最新信息
        </van-button>
      </view>
      <text v-if="submitError" class="submit-error">{{ submitError }}</text>

      <view class="submit-bar">
        <view>
          <text class="submit-bar__label">应付</text>
          <text class="submit-bar__amount">¥{{ preview.summary.payableTotal }}</text>
        </view>
        <button
          class="submit-bar__button"
          :disabled="isSubmitting || isPreviewLoading || requiresLatestConfirmation"
          @click="submit"
        >
          {{
            isSubmitting ? '提交中…' : submitError?.includes('安全重试') ? '安全重试' : '提交订单'
          }}
        </button>
      </view>
    </template>
  </view>
</template>

<style scoped lang="scss">
.order-page {
  min-height: 100vh;
  padding: 28rpx 28rpx 190rpx;
}

.order-state,
.success-card {
  display: flex;
  min-height: 68vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 24rpx;
}

.success-card {
  padding: 42rpx;
  background: #ffffff;
  border-radius: 28rpx;
  text-align: center;
}

.success-card__mark {
  display: flex;
  width: 108rpx;
  height: 108rpx;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 58rpx;
  background: #1f8f63;
  border-radius: 50%;
}

.success-card__title {
  font-size: 40rpx;
  font-weight: 700;
}
.success-card__number {
  color: #66756d;
  font-size: 24rpx;
}
.success-card__status {
  color: #d94f3d;
  font-size: 32rpx;
  font-weight: 700;
}
.payment-error {
  color: #c33b31;
  font-size: 23rpx;
  line-height: 1.5;
}

.section-card {
  margin-bottom: 22rpx;
  padding: 28rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.section-heading,
.delivery-tabs,
.picker-row,
.order-item,
.price-list > view,
.submit-bar {
  display: flex;
  align-items: center;
}

.section-heading,
.picker-row,
.price-list > view {
  justify-content: space-between;
}

.section-heading,
.section-title {
  font-size: 28rpx;
  font-weight: 700;
}
.section-link {
  color: #1f8f63;
  font-weight: 400;
}
.address-card__person {
  display: block;
  margin-top: 22rpx;
  font-size: 29rpx;
  font-weight: 700;
}
.address-card__line {
  display: block;
  margin-top: 12rpx;
  color: #627168;
  font-size: 25rpx;
  line-height: 1.6;
}

.delivery-tabs {
  gap: 18rpx;
  margin-top: 22rpx;
}
.delivery-tab {
  flex: 1;
  padding: 20rpx;
  color: #627168;
  background: #f4f8f6;
  border: 2rpx solid transparent;
  border-radius: 16rpx;
  text-align: center;
}
.delivery-tab--active {
  color: #1f8f63;
  background: #e8f6f0;
  border-color: #1f8f63;
}
.delivery-hint {
  display: block;
  margin-top: 18rpx;
  color: #74827b;
  font-size: 23rpx;
}
.picker-list {
  margin-top: 18rpx;
}
.picker-row {
  padding: 20rpx 0;
  border-top: 1rpx solid #edf2ef;
  font-size: 25rpx;
}

.order-item {
  gap: 18rpx;
  padding: 24rpx 0;
  border-bottom: 1rpx solid #edf2ef;
}
.order-item:last-child {
  border-bottom: 0;
}
.order-item__image {
  display: flex;
  width: 96rpx;
  height: 96rpx;
  align-items: center;
  justify-content: center;
  border-radius: 14rpx;
}
.order-item__fallback {
  color: #1f8f63;
  background: #e8f6f0;
  font-size: 32rpx;
  font-weight: 700;
}
.order-item__content {
  min-width: 0;
  flex: 1;
}
.order-item__name,
.order-item__meta {
  display: block;
}
.order-item__name {
  overflow: hidden;
  font-size: 27rpx;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.order-item__meta {
  margin-top: 12rpx;
  color: #74827b;
  font-size: 22rpx;
}
.order-item__total {
  font-size: 26rpx;
  font-weight: 700;
}

.remark-input {
  width: 100%;
  height: 150rpx;
  margin-top: 20rpx;
  padding: 20rpx;
  font-size: 25rpx;
  background: #f4f8f6;
  border-radius: 16rpx;
}
.remark-count {
  display: block;
  margin-top: 8rpx;
  color: #829087;
  font-size: 21rpx;
  text-align: right;
}
.price-list > view {
  padding: 10rpx 0;
  color: #627168;
  font-size: 25rpx;
}
.price-list > .price-list__total {
  color: #21302a;
  font-size: 30rpx;
  font-weight: 700;
}
.latest-confirm {
  margin: 20rpx 0;
}
.submit-error {
  display: block;
  margin: 18rpx 0;
  color: #c33b31;
  font-size: 23rpx;
  text-align: center;
}

.submit-bar {
  position: fixed;
  z-index: 10;
  right: 0;
  bottom: 0;
  left: 0;
  justify-content: space-between;
  padding: 22rpx 28rpx calc(22rpx + env(safe-area-inset-bottom));
  background: #ffffff;
  box-shadow: 0 -10rpx 30rpx rgb(31 64 50 / 8%);
}
.submit-bar__label {
  color: #64736b;
  font-size: 23rpx;
}
.submit-bar__amount {
  margin-left: 10rpx;
  color: #d94f3d;
  font-size: 38rpx;
  font-weight: 750;
}
.submit-bar__button {
  min-width: 250rpx;
  margin: 0;
  padding: 0 38rpx;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 700;
  line-height: 84rpx;
  background: #1f8f63;
  border: 0;
  border-radius: 44rpx;
}
.submit-bar__button::after {
  border: 0;
}
.submit-bar__button[disabled] {
  opacity: 0.5;
}
</style>
