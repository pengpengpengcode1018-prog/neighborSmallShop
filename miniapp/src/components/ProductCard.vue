<script setup lang="ts">
import type { ProductSummary } from '../types/domain';
import { resolveApiAssetUrl } from '../utils/request';

defineProps<{ product: ProductSummary }>();
const emit = defineEmits<{
  select: [product: ProductSummary];
  add: [product: ProductSummary];
}>();
</script>

<template>
  <view class="product-card" @click="emit('select', product)">
    <image
      v-if="product.mainImageUrl"
      class="product-card__image"
      mode="aspectFill"
      :src="resolveApiAssetUrl(product.mainImageUrl)"
    />
    <view v-else class="product-card__image product-card__image--fallback">
      <text>{{ product.name.slice(0, 1) }}</text>
    </view>
    <view class="product-card__content">
      <view class="product-card__heading">
        <text class="product-card__name">{{ product.name }}</text>
        <van-tag v-if="product.isHot" type="danger">热销</van-tag>
      </view>
      <text v-if="product.description" class="product-card__description">
        {{ product.description }}
      </text>
      <text class="product-card__sales"
        >已售 {{ product.salesVolume }} · 库存 {{ product.stock }}</text
      >
      <view class="product-card__footer">
        <view class="product-card__price-shell">
          <text class="product-card__price">¥{{ product.price }}</text>
          <text v-if="product.originalPrice" class="product-card__original">
            ¥{{ product.originalPrice }}
          </text>
        </view>
        <van-tag v-if="product.status === 'SOLD_OUT'" type="default">已售罄</van-tag>
        <button
          v-else-if="product.canPurchase"
          class="product-card__add"
          aria-label="加入购物车"
          @click.stop="emit('add', product)"
        >
          +
        </button>
        <text v-else class="product-card__action">暂不可购买</text>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.product-card {
  display: flex;
  gap: 20rpx;
  padding: 24rpx;
  background: #ffffff;
  border-bottom: 1rpx solid #edf2ef;
}

.product-card__image {
  display: flex;
  width: 148rpx;
  height: 148rpx;
  flex: 0 0 148rpx;
  align-items: center;
  justify-content: center;
  border-radius: 18rpx;
}

.product-card__image--fallback {
  color: #1f8f63;
  font-size: 42rpx;
  font-weight: 700;
  background: #e7f5ef;
}

.product-card__content {
  min-width: 0;
  flex: 1;
}

.product-card__heading,
.product-card__footer,
.product-card__price-shell {
  display: flex;
  align-items: center;
}

.product-card__heading,
.product-card__footer {
  justify-content: space-between;
  gap: 12rpx;
}

.product-card__name {
  overflow: hidden;
  font-size: 29rpx;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-card__description,
.product-card__sales {
  display: block;
  overflow: hidden;
  color: #718078;
  font-size: 22rpx;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-card__description {
  margin-top: 10rpx;
}

.product-card__sales {
  margin-top: 12rpx;
}

.product-card__footer {
  margin-top: 15rpx;
}

.product-card__price-shell {
  gap: 10rpx;
}

.product-card__price {
  color: #d94f3d;
  font-size: 29rpx;
  font-weight: 700;
}

.product-card__original {
  color: #9aa59f;
  font-size: 20rpx;
  text-decoration: line-through;
}

.product-card__action {
  color: #1f8f63;
  font-size: 23rpx;
  font-weight: 600;
}

.product-card__add {
  display: flex;
  width: 64rpx;
  height: 64rpx;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0 0 4rpx;
  color: #ffffff;
  font-size: 42rpx;
  font-weight: 400;
  line-height: 1;
  background: #1f8f63;
  border: 0;
  border-radius: 50%;
}

.product-card__add::after {
  border: 0;
}
</style>
