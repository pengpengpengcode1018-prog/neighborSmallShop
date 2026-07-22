<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';
import { ref, watch } from 'vue';

import CartBar from '../../components/CartBar.vue';
import ProductCard from '../../components/ProductCard.vue';
import { useCartStore } from '../../stores/cart';
import { useProductStore } from '../../stores/product';
import { useStoreStore } from '../../stores/store';
import { useUserStore } from '../../stores/user';
import type { ProductSummary } from '../../types/domain';
import { ApiRequestError, resolveApiAssetUrl } from '../../utils/request';

const storeStore = useStoreStore();
const { detail, isDetailLoading, detailError } = storeToRefs(storeStore);
const productStore = useProductStore();
const { categories, products, selectedCategoryId, isLoading, loadError } =
  storeToRefs(productStore);
const storeId = ref('');
const communityId = ref<string | undefined>();
const showStoreInfo = ref(false);
const cartStore = useCartStore();
const { cart, isMutating } = storeToRefs(cartStore);
const userStore = useUserStore();
const { accessToken, profile } = storeToRefs(userStore);

watch(
  accessToken,
  (token) => {
    if (token) void cartStore.load(token);
  },
  { immediate: true },
);

onLoad((query) => {
  storeId.value = typeof query?.id === 'string' ? query.id : '';
  communityId.value = typeof query?.communityId === 'string' ? query.communityId : undefined;
  if (!storeId.value) return;
  void storeStore.loadDetail(storeId.value, communityId.value);
  void productStore.loadCatalog(storeId.value, communityId.value);
});

function retry(): void {
  if (storeId.value) void storeStore.loadDetail(storeId.value, communityId.value);
}

function callStore(): void {
  if (!detail.value?.phone) return;
  void uni.makePhoneCall({ phoneNumber: detail.value.phone });
}

function openStoreInfo(): void {
  showStoreInfo.value = true;
}

function closeStoreInfo(): void {
  showStoreInfo.value = false;
}

function retryCatalog(): void {
  if (storeId.value) {
    void productStore.loadCatalog(
      storeId.value,
      communityId.value,
      selectedCategoryId.value ?? undefined,
    );
  }
}

function selectCategory(categoryId?: string): void {
  if (!storeId.value || selectedCategoryId.value === (categoryId ?? null)) return;
  void productStore.loadCatalog(storeId.value, communityId.value, categoryId);
}

function openProduct(product: ProductSummary): void {
  const communityQuery = communityId.value
    ? `&communityId=${encodeURIComponent(communityId.value)}`
    : '';
  void uni.navigateTo({
    url: `/pages/product/index?id=${encodeURIComponent(product.id)}${communityQuery}`,
  });
}

function confirmCartReplacement(): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: '更换购物车店铺？',
      content: '购物车只能保留一家店铺的商品，继续会清空原有商品。',
      confirmText: '清空并添加',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    });
  });
}

async function cartToken(): Promise<string | null> {
  if (!accessToken.value) await userStore.loginWithWechat();
  if (!accessToken.value) {
    uni.showToast({ title: userStore.loginError ?? '请先登录', icon: 'none' });
    return null;
  }
  if (!profile.value?.currentCommunity) {
    void uni.navigateTo({ url: '/pages/community/index' });
    return null;
  }
  return accessToken.value;
}

async function addProduct(product: ProductSummary): Promise<void> {
  const token = await cartToken();
  if (!token) return;
  try {
    await cartStore.addProduct(token, product.id);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'CART_STORE_CONFLICT') {
      if (!(await confirmCartReplacement())) return;
      try {
        await cartStore.addProduct(token, product.id, 1, true);
      } catch {
        uni.showToast({ title: cartStore.mutationError ?? '添加失败', icon: 'none' });
        return;
      }
    } else {
      uni.showToast({ title: cartStore.mutationError ?? '添加失败', icon: 'none' });
      return;
    }
  }
  uni.showToast({ title: '已加入购物车', icon: 'success' });
}

function openCart(): void {
  void uni.navigateTo({ url: '/pages/cart/index' });
}
</script>

<template>
  <view class="detail-page">
    <view v-if="isDetailLoading" class="detail-state">
      <van-loading type="spinner" color="#1f8f63">正在加载店铺</van-loading>
    </view>
    <view v-else-if="!storeId" class="detail-state">
      <van-empty description="店铺链接无效" />
    </view>
    <view v-else-if="detailError" class="detail-state">
      <van-empty :description="detailError" />
      <van-button size="small" type="primary" @click="retry">重新加载</van-button>
    </view>
    <template v-else-if="detail">
      <image
        v-if="detail.coverUrl"
        class="store-cover"
        mode="aspectFill"
        :src="resolveApiAssetUrl(detail.coverUrl)"
      />
      <view v-else class="store-cover store-cover--fallback">
        <text>{{ detail.name.slice(0, 1) }}</text>
      </view>

      <view class="store-overview">
        <view class="store-overview__heading">
          <text class="store-overview__name">{{ detail.name }}</text>
          <view class="store-overview__actions">
            <van-tag :type="detail.status === 'OPEN' ? 'success' : 'warning'">
              {{ detail.status === 'OPEN' ? '营业中' : '暂停接单' }}
            </van-tag>
            <van-button class="store-info-trigger" size="small" plain @click="openStoreInfo">
              店铺信息
            </van-button>
          </view>
        </view>
        <text v-if="detail.announcement" class="store-overview__announcement">
          {{ detail.announcement }}
        </text>
        <view class="store-facts">
          <view>
            <text class="store-facts__value">¥{{ detail.minimumOrderAmount }}</text>
            <text class="store-facts__label">起送</text>
          </view>
          <view>
            <text class="store-facts__value">¥{{ detail.deliveryFee }}</text>
            <text class="store-facts__label">配送费</text>
          </view>
          <view>
            <text class="store-facts__value">{{ detail.estimatedDeliveryMinutes }} 分钟</text>
            <text class="store-facts__label">预计送达</text>
          </view>
        </view>
        <van-notice-bar
          v-if="!detail.isDeliverable"
          left-icon="info-o"
          text="选择配送小区后，才能确认该店是否可配送。"
        />
        <van-notice-bar
          v-else-if="!detail.canOrder"
          left-icon="info-o"
          text="店铺当前暂停接单，仍可浏览基础信息。"
        />
      </view>

      <view class="catalog-card">
        <text class="catalog-card__title">店内商品</text>
        <view v-if="isLoading" class="catalog-state">
          <van-loading type="spinner" color="#1f8f63">正在加载商品</van-loading>
        </view>
        <view v-else-if="loadError" class="catalog-state">
          <van-empty :description="loadError" />
          <van-button size="small" type="primary" @click="retryCatalog">重新加载</van-button>
        </view>
        <view v-else-if="categories.length === 0" class="catalog-state">
          <van-empty description="店铺暂未上架商品" />
        </view>
        <view v-else class="catalog-layout">
          <scroll-view class="category-list" scroll-y>
            <view
              class="category-item"
              :class="{ 'category-item--active': selectedCategoryId === null }"
              @click="selectCategory()"
            >
              全部
            </view>
            <view
              v-for="category in categories"
              :key="category.id"
              class="category-item"
              :class="{ 'category-item--active': selectedCategoryId === category.id }"
              @click="selectCategory(category.id)"
            >
              {{ category.name }}
            </view>
          </scroll-view>
          <scroll-view class="product-list" scroll-y>
            <van-empty v-if="products.length === 0" description="该分类暂无商品" />
            <template v-else>
              <ProductCard
                v-for="product in products"
                :key="product.id"
                :product="product"
                @select="openProduct"
                @add="addProduct"
              />
            </template>
          </scroll-view>
        </view>
      </view>

      <van-popup
        :show="showStoreInfo"
        position="bottom"
        round
        closeable
        safe-area-inset-bottom
        @close="closeStoreInfo"
      >
        <view class="store-info-popup">
          <view class="store-info-popup__header">
            <text class="store-info-popup__title">店铺信息</text>
            <text class="store-info-popup__subtitle">{{ detail.name }}</text>
          </view>
          <text v-if="detail.description" class="store-info-popup__description">
            {{ detail.description }}
          </text>
          <view class="store-info-popup__rows">
            <view class="store-info-popup__row">
              <text class="store-info-popup__label">营业时间</text>
              <text>{{ detail.businessStartTime }}–{{ detail.businessEndTime }}</text>
            </view>
            <view class="store-info-popup__row">
              <text class="store-info-popup__label">店铺地址</text>
              <text class="store-info-popup__value">{{ detail.address }}</text>
            </view>
          </view>
          <van-button plain block @click="callStore">联系店铺 {{ detail.phone }}</van-button>
        </view>
      </van-popup>
    </template>
    <CartBar
      v-if="cart.summary.itemCount > 0"
      :cart="cart"
      :busy="isMutating"
      @open="openCart"
      @action="openCart"
    />
  </view>
</template>

<style scoped lang="scss">
.detail-page {
  min-height: 100vh;
  padding-bottom: 180rpx;
}

.detail-state {
  display: flex;
  min-height: 70vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.store-cover {
  display: flex;
  width: 100%;
  height: 360rpx;
  align-items: center;
  justify-content: center;
}

.store-cover--fallback {
  color: #1f8f63;
  font-size: 92rpx;
  font-weight: 700;
  background: linear-gradient(145deg, #dff3e9, #f4faf7);
}

.store-overview,
.catalog-card {
  margin: 24rpx 28rpx 0;
  padding: 32rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.store-overview__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.store-overview__name {
  min-width: 0;
  flex: 1;
  font-size: 40rpx;
  font-weight: 700;
}

.store-overview__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12rpx;
}

.store-info-trigger {
  margin: 0;
}

.store-overview__announcement,
.store-facts__value,
.store-facts__label {
  display: block;
}

.store-overview__announcement,
.store-info-popup__description {
  color: #5f7068;
  font-size: 26rpx;
  line-height: 1.65;
}

.store-overview__announcement {
  margin-top: 16rpx;
}

.store-facts {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16rpx;
  margin: 28rpx 0;
}

.store-facts__value {
  color: #1f8f63;
  font-size: 27rpx;
  font-weight: 650;
}

.store-facts__label {
  margin-top: 6rpx;
  color: #7a8882;
  font-size: 22rpx;
}

.catalog-card {
  margin: 24rpx 28rpx 0;
  padding: 28rpx 0 0;
  overflow: hidden;
}

.catalog-card__title {
  display: block;
  padding: 0 28rpx 24rpx;
  font-size: 32rpx;
  font-weight: 650;
}

.catalog-state {
  display: flex;
  min-height: 360rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24rpx;
}

.catalog-layout {
  display: flex;
  height: 720rpx;
  border-top: 1rpx solid #edf2ef;
}

.category-list {
  width: 176rpx;
  height: 100%;
  flex: 0 0 176rpx;
  background: #f3f7f5;
}

.category-item {
  position: relative;
  padding: 30rpx 16rpx;
  color: #627168;
  font-size: 25rpx;
  text-align: center;
}

.category-item--active {
  color: #1f8f63;
  font-weight: 650;
  background: #ffffff;
}

.category-item--active::before {
  position: absolute;
  top: 24rpx;
  bottom: 24rpx;
  left: 0;
  width: 6rpx;
  background: #1f8f63;
  border-radius: 0 6rpx 6rpx 0;
  content: '';
}

.product-list {
  min-width: 0;
  height: 100%;
  flex: 1;
}

.store-info-popup {
  box-sizing: border-box;
  width: 100%;
  padding: 44rpx 32rpx calc(32rpx + env(safe-area-inset-bottom));
}

.store-info-popup__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 20rpx;
  padding-right: 64rpx;
}

.store-info-popup__title {
  font-size: 36rpx;
  font-weight: 700;
}

.store-info-popup__subtitle {
  overflow: hidden;
  color: #7a8882;
  font-size: 24rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.store-info-popup__description {
  display: block;
  margin-top: 24rpx;
  padding: 20rpx;
  background: #f3f8f5;
  border-radius: 16rpx;
}

.store-info-popup__rows {
  margin: 24rpx 0 28rpx;
  border-top: 1rpx solid #edf2ef;
}

.store-info-popup__row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24rpx;
  padding: 22rpx 0;
  font-size: 26rpx;
  line-height: 1.5;
  border-bottom: 1rpx solid #edf2ef;
}

.store-info-popup__label {
  flex: 0 0 150rpx;
  color: #7a8882;
}

.store-info-popup__value {
  min-width: 0;
  flex: 1;
  text-align: right;
  word-break: break-all;
}
</style>
