<script setup lang="ts">
import { onLoad } from '@dcloudio/uni-app';
import { storeToRefs } from 'pinia';
import { computed, reactive, ref } from 'vue';

import { useAddressStore } from '../../stores/address';
import { useCommunityStore } from '../../stores/community';
import { useUserStore } from '../../stores/user';
import type { AddressInput, AddressLabel } from '../../types/domain';
import { prefillPhoneForNewAddress } from '../../utils/address-phone';

const labels: Array<{ value: AddressLabel; name: string }> = [
  { value: 'HOME', name: '家' },
  { value: 'COMPANY', name: '公司' },
  { value: 'SCHOOL', name: '学校' },
  { value: 'OTHER', name: '其他' },
];

const addressStore = useAddressStore();
const { addresses, isMutating, mutationError } = storeToRefs(addressStore);
const communityStore = useCommunityStore();
const {
  communities,
  currentCommunity,
  loadError: communityLoadError,
} = storeToRefs(communityStore);
const userStore = useUserStore();
const addressId = ref('');
const isInitializing = ref(true);
const formError = ref<string | null>(null);
const form = reactive({
  recipientName: '',
  phone: '',
  communityId: '',
  building: '',
  unit: '',
  room: '',
  detail: '',
  label: 'HOME' as AddressLabel,
  isDefault: false,
});

const communityName = computed(
  () => communities.value.find((community) => community.id === form.communityId)?.name ?? '',
);
const labelName = computed(() => labels.find((label) => label.value === form.label)?.name ?? '家');

onLoad((query) => {
  addressId.value = typeof query?.id === 'string' ? query.id : '';
  uni.setNavigationBarTitle({ title: addressId.value ? '编辑收货地址' : '新增收货地址' });
  void initialize();
});

async function initialize(): Promise<void> {
  isInitializing.value = true;
  await userStore.restoreSession();
  if (!userStore.accessToken) {
    void uni.redirectTo({ url: '/pages/home/index' });
    return;
  }
  await Promise.all([communityStore.loadCommunities(), addressStore.load(userStore.accessToken)]);
  if (addressId.value) {
    const address = addresses.value.find((item) => item.id === addressId.value);
    if (!address) {
      formError.value = '收货地址已不存在，请返回重试';
      isInitializing.value = false;
      return;
    }
    form.recipientName = address.recipientName;
    form.phone = address.phone;
    form.communityId = address.available ? address.community.id : '';
    form.building = address.building;
    form.unit = address.unit ?? '';
    form.room = address.room;
    form.detail = address.detail ?? '';
    form.label = address.label;
    form.isDefault = address.isDefault;
  } else if (currentCommunity.value) {
    form.communityId = currentCommunity.value.id;
  }
  if (!addressId.value) {
    form.phone = prefillPhoneForNewAddress(form.phone, addressId.value, userStore.profile);
  }
  isInitializing.value = false;
}

interface PhoneNumberEvent {
  detail: { code?: string; errMsg?: string };
}

async function authorizePhone(event: PhoneNumberEvent): Promise<void> {
  const success = await userStore.bindWechatPhone(event.detail.code);
  if (success) {
    form.phone = prefillPhoneForNewAddress(form.phone, addressId.value, userStore.profile);
  }
  uni.showToast({
    title: success ? '手机号已自动填入' : (userStore.phoneError ?? '授权未完成'),
    icon: success ? 'success' : 'none',
  });
}

function selectCommunity(event: { detail: { value: string | number } }): void {
  const selected = communities.value[Number(event.detail.value)];
  if (selected) form.communityId = selected.id;
}

function selectLabel(event: { detail: { value: string | number } }): void {
  const selected = labels[Number(event.detail.value)];
  if (selected) form.label = selected.value;
}

function changeDefault(event: Event): void {
  form.isDefault = (event as Event & { detail: { value: boolean } }).detail.value;
}

function validate(): string | null {
  if (!userStore.profile?.phoneBound) return '请先授权微信手机号后再保存地址';
  if (!form.recipientName.trim()) return '请填写收货人姓名';
  if (!/^1[3-9]\d{9}$/.test(form.phone.trim())) return '请填写正确的 11 位手机号';
  if (!form.communityId) return '请选择配送小区';
  if (!form.building.trim()) return '请填写楼栋';
  if (!form.room.trim()) return '请填写门牌号';
  return null;
}

async function submit(): Promise<void> {
  formError.value = validate();
  if (formError.value || !userStore.accessToken || isMutating.value) return;
  const input: AddressInput = {
    recipientName: form.recipientName.trim(),
    phone: form.phone.trim(),
    communityId: form.communityId,
    building: form.building.trim(),
    unit: form.unit.trim() || null,
    room: form.room.trim(),
    detail: form.detail.trim() || null,
    label: form.label,
  };
  try {
    if (addressId.value) {
      await addressStore.update(userStore.accessToken, addressId.value, input);
    } else {
      await addressStore.create(userStore.accessToken, { ...input, isDefault: form.isDefault });
    }
    uni.showToast({ title: '地址已保存', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 350);
  } catch {
    formError.value = mutationError.value ?? '保存失败，请重试';
  }
}
</script>

<template>
  <view class="edit-page">
    <view v-if="isInitializing" class="edit-state">
      <van-loading type="spinner" color="#1f8f63">正在准备地址表单</van-loading>
    </view>
    <view v-else class="address-form">
      <view class="form-field">
        <text class="form-field__label">收货人</text>
        <input v-model="form.recipientName" maxlength="64" placeholder="请输入收货人姓名" />
      </view>
      <view v-if="!userStore.profile?.phoneBound" class="phone-authorization">
        <text>微信手机号仅用于账号绑定和本次地址预填，你仍可修改联系号码。</text>
        <button
          class="phone-authorization__button"
          open-type="getPhoneNumber"
          :loading="userStore.isBindingPhone"
          @getphonenumber="authorizePhone"
        >
          授权并自动填入
        </button>
      </view>
      <view class="form-field">
        <text class="form-field__label">联系手机号</text>
        <input v-model="form.phone" type="number" maxlength="11" placeholder="请输入 11 位手机号" />
      </view>
      <picker
        mode="selector"
        :range="communities"
        range-key="name"
        :disabled="communities.length === 0"
        @change="selectCommunity"
      >
        <view class="form-field form-field--picker">
          <text class="form-field__label">配送小区</text>
          <text :class="communityName ? 'form-field__value' : 'form-field__placeholder'">
            {{ communityName || '请选择平台配送小区' }}
          </text>
        </view>
      </picker>
      <text v-if="communityLoadError" class="form-hint form-hint--error">
        {{ communityLoadError }}
      </text>
      <view class="form-field">
        <text class="form-field__label">楼栋</text>
        <input v-model="form.building" maxlength="80" placeholder="例如：1号楼" />
      </view>
      <view class="form-field">
        <text class="form-field__label">单元（选填）</text>
        <input v-model="form.unit" maxlength="80" placeholder="例如：2单元" />
      </view>
      <view class="form-field">
        <text class="form-field__label">门牌号</text>
        <input v-model="form.room" maxlength="80" placeholder="例如：301室" />
      </view>
      <view class="form-field">
        <text class="form-field__label">补充地址（选填）</text>
        <input v-model="form.detail" maxlength="255" placeholder="例如：东门进入" />
      </view>
      <picker mode="selector" :range="labels" range-key="name" @change="selectLabel">
        <view class="form-field form-field--picker">
          <text class="form-field__label">地址标签</text>
          <text class="form-field__value">{{ labelName }}</text>
        </view>
      </picker>
      <view v-if="!addressId" class="default-field">
        <view>
          <text class="default-field__title">设为默认地址</text>
          <text class="default-field__hint">首个地址会自动成为默认地址</text>
        </view>
        <switch color="#1f8f63" :checked="form.isDefault" @change="changeDefault" />
      </view>

      <text v-if="formError" class="form-error">{{ formError }}</text>
      <van-button type="primary" block :loading="isMutating" @click="submit"> 保存地址 </van-button>
    </view>
  </view>
</template>

<style scoped lang="scss">
.edit-page {
  min-height: 100vh;
  padding: 28rpx;
}

.edit-state {
  display: flex;
  min-height: 70vh;
  align-items: center;
  justify-content: center;
}

.address-form {
  overflow: hidden;
  padding: 0 28rpx 34rpx;
  background: #ffffff;
  border: 1rpx solid #e4ece8;
  border-radius: 24rpx;
}

.form-field,
.default-field {
  display: flex;
  min-height: 112rpx;
  align-items: center;
  border-bottom: 1rpx solid #edf2ef;
}

.form-field__label {
  width: 220rpx;
  flex: 0 0 220rpx;
  color: #34483f;
  font-size: 26rpx;
}

.form-field input,
.form-field__value,
.form-field__placeholder {
  min-width: 0;
  flex: 1;
  font-size: 26rpx;
  text-align: right;
}

.form-field__placeholder {
  color: #9aa59f;
}

.form-field--picker {
  justify-content: space-between;
}

.default-field {
  justify-content: space-between;
  margin-bottom: 30rpx;
}

.default-field__title,
.default-field__hint {
  display: block;
}

.default-field__title {
  font-size: 27rpx;
  font-weight: 600;
}

.default-field__hint,
.form-hint {
  margin-top: 6rpx;
  color: #7a8882;
  font-size: 22rpx;
}

.form-hint {
  display: block;
  padding: 12rpx 0;
}

.form-hint--error,
.form-error {
  color: #c33b31;
}

.phone-authorization {
  padding: 20rpx 0 24rpx;
  color: #6b7a73;
  font-size: 23rpx;
  line-height: 1.6;
}

.phone-authorization__button {
  margin-top: 16rpx;
  padding: 18rpx 24rpx;
  border: 1rpx solid #07c160;
  border-radius: 10rpx;
  background: #ffffff;
  color: #07c160;
  font-size: 25rpx;
  line-height: 1.4;
}

.phone-authorization__button::after {
  border: 0;
}

.form-error {
  display: block;
  margin: 0 0 22rpx;
  font-size: 23rpx;
  text-align: center;
}
</style>
