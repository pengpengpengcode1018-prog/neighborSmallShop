<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';
import { computed, ref, watch } from 'vue';

import CartBar from '../../components/CartBar.vue';
import { useCartStore } from '../../stores/cart';
import { useProductStore } from '../../stores/product';
import { useUserStore } from '../../stores/user';
import { ApiRequestError } from '../../utils/request';

const productStore = useProductStore();
const { detail, isDetailLoading, detailError } = storeToRefs(productStore);
const productId = ref('');
const communityId = ref<string | undefined>();
const cartStore = useCartStore();
const { cart, isMutating } = storeToRefs(cartStore);
const userStore = useUserStore();
const { accessToken, profile } = storeToRefs(userStore);
const images = computed(() => {
  if (!detail.value) return [];
  if (detail.value.galleryImageUrls.length > 0) return detail.value.galleryImageUrls;
  return detail.value.mainImageUrl ? [detail.value.mainImageUrl] : [];
});

watch(
  accessToken,
  (token) => {
    if (token) void cartStore.load(token);
  },
  { immediate: true },
);

onLoad((query) => {
  productId.value = typeof query?.id === 'string' ? query.id : '';
  communityId.value = typeof query?.communityId === 'string' ? query.communityId : undefined;
  if (productId.value) void productStore.loadDetail(productId.value, communityId.value);
});

function retry(): void {
  if (productId.value) void productStore.loadDetail(productId.value, communityId.value);
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

async function addToCart(): Promise<void> {
  if (!detail.value) return;
  if (!accessToken.value) await userStore.loginWithWechat();
  if (!accessToken.value) {
    uni.showToast({ title: userStore.loginError ?? '请先登录', icon: 'none' });
    return;
  }
  if (!profile.value?.currentCommunity) {
    void uni.navigateTo({ url: '/pages/community/index' });
    return;
  }
  const token = accessToken.value;
  try {
    await cartStore.addProduct(token, detail.value.id);
  } catch (error) {
    if (error instanceof ApiRequestError && error.code === 'CART_STORE_CONFLICT') {
      if (!(await confirmCartReplacement())) return;
      try {
        await cartStore.addProduct(token, detail.value.id, 1, true);
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
  <view class="product-page">
    <view v-if="isDetailLoading" class="product-state">
      <van-loading type="spinner" color="#1f8f63">正在加载商品</van-loading>
    </view>
    <view v-else-if="!productId" class="product-state">
      <van-empty description="商品链接无效" />
    </view>
    <view v-else-if="detailError" class="product-state">
      <van-empty :description="detailError" />
      <van-button size="small" type="primary" @click="retry">重新加载</van-button>
    </view>
    <template v-else-if="detail">
      <swiper v-if="images.length > 0" class="product-gallery" indicator-dots circular>
        <swiper-item v-for="imageUrl in images" :key="imageUrl">
          <image class="product-gallery__image" mode="aspectFill" :src="imageUrl" />
        </swiper-item>
      </swiper>
      <view v-else class="product-gallery product-gallery--fallback">
        <text>{{ detail.name.slice(0, 1) }}</text>
      </view>

      <view class="product-summary">
        <view class="product-summary__heading">
          <text class="product-summary__name">{{ detail.name }}</text>
          <van-tag v-if="detail.isHot" type="danger">热销</van-tag>
        </view>
        <text v-if="detail.description" class="product-summary__description">
          {{ detail.description }}
        </text>
        <view class="price-line">
          <text class="price-line__current">¥{{ detail.price }}</text>
          <text v-if="detail.originalPrice" class="price-line__original">
            ¥{{ detail.originalPrice }}
          </text>
        </view>
        <view class="product-meta">
          <text>已售 {{ detail.salesVolume }}</text>
          <text>库存 {{ detail.stock }}</text>
          <text v-if="detail.purchaseLimit">每人限购 {{ detail.purchaseLimit }}</text>
        </view>
        <van-notice-bar
          v-if="detail.status === 'SOLD_OUT'"
          left-icon="info-o"
          text="该商品已售罄，暂时不能购买。"
        />
        <van-button
          v-if="detail.canPurchase"
          type="primary"
          block
          :loading="isMutating"
          @click="addToCart"
        >
          加入购物车
        </van-button>
        <van-notice-bar
          v-else-if="!detail.canPurchase"
          left-icon="info-o"
          text="当前配送或营业条件下暂不可购买，可继续浏览商品信息。"
        />
      </view>

      <view v-if="detail.detail" class="detail-card">
        <text class="detail-card__title">商品详情</text>
        <text class="detail-card__content">{{ detail.detail }}</text>
      </view>
      <view v-if="detail.afterSaleNotes" class="detail-card">
        <text class="detail-card__title">售后说明</text>
        <text class="detail-card__content">{{ detail.afterSaleNotes }}</text>
      </view>
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
.product-page {
  min-height: 100vh;
  padding-bottom: 180rpx;
}

.product-state {
  display: flex;
  min-height: 70vh;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.product-gallery {
  display: flex;
  width: 100%;
  height: 640rpx;
  align-items: center;
  justify-content: center;
}

.product-gallery__image {
  width: 100%;
  height: 100%;
}

.product-gallery--fallback {
  color: #1f8f63;
  font-size: 112rpx;
  font-weight: 700;
  background: linear-gradient(145deg, #dff3e9, #f4faf7);
}

.product-summary,
.detail-card {
  margin: 24rpx 28rpx 0;
  padding: 32rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.product-summary__heading,
.price-line,
.product-meta {
  display: flex;
  align-items: center;
}

.product-summary__heading {
  justify-content: space-between;
  gap: 20rpx;
}

.product-summary__name {
  font-size: 40rpx;
  font-weight: 700;
}

.product-summary__description,
.detail-card__title,
.detail-card__content {
  display: block;
}

.product-summary__description,
.detail-card__content {
  color: #5f7068;
  font-size: 26rpx;
  line-height: 1.7;
}

.product-summary__description {
  margin-top: 14rpx;
}

.price-line {
  gap: 16rpx;
  margin-top: 28rpx;
}

.price-line__current {
  color: #d94f3d;
  font-size: 42rpx;
  font-weight: 700;
}

.price-line__original {
  color: #9aa59f;
  font-size: 24rpx;
  text-decoration: line-through;
}

.product-meta {
  flex-wrap: wrap;
  gap: 20rpx;
  margin: 18rpx 0 28rpx;
  color: #718078;
  font-size: 23rpx;
}

.detail-card__title {
  margin-bottom: 20rpx;
  font-size: 32rpx;
  font-weight: 650;
}
</style>
