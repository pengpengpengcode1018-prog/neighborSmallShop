<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import { listCommunities, type Community } from '../../api/communities';
import { getApiErrorMessage, resolveApiAssetUrl } from '../../api/http';
import { uploadImage } from '../../api/media';
import {
  createStore,
  deleteStore,
  listStores,
  updateStore,
  updateStoreStatus,
  type Store,
  type StoreInput,
  type StoreStatus,
} from '../../api/stores';

const rows = ref<Store[]>([]);
const communities = ref<Community[]>([]);
const loading = ref(false);
const loadError = ref('');
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const keyword = ref('');
const statusFilter = ref<StoreStatus | ''>('');
const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const imageUploading = ref<'logoUrl' | 'coverUrl' | null>(null);

const emptyForm = (): StoreInput => ({
  name: '',
  logoUrl: null,
  coverUrl: null,
  phone: '',
  address: '',
  description: '',
  announcement: '',
  businessStartTime: '08:00',
  businessEndTime: '22:00',
  minimumOrderAmount: '0.00',
  defaultDeliveryFee: '0.00',
  estimatedDeliveryMinutes: 45,
  status: 'OPEN',
  sortOrder: 0,
  communityIds: [],
});
const form = reactive<StoreInput>(emptyForm());
const moneyPattern = /^\d{1,8}\.\d{2}$/;
const rules: FormRules<StoreInput> = {
  name: [{ required: true, message: '请输入店铺名称', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入联系电话', trigger: 'blur' }],
  address: [{ required: true, message: '请输入店铺地址', trigger: 'blur' }],
  minimumOrderAmount: [
    { pattern: moneyPattern, message: '请输入两位小数金额，如 20.00', trigger: 'blur' },
  ],
  defaultDeliveryFee: [
    { pattern: moneyPattern, message: '请输入两位小数金额，如 3.50', trigger: 'blur' },
  ],
  communityIds: [{ type: 'array', required: true, min: 1, message: '至少选择一个配送小区' }],
};

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listStores({
      page: page.value,
      pageSize,
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
    });
    rows.value = result.list;
    total.value = result.total;
  } catch (error) {
    loadError.value = getApiErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function loadCommunities(): Promise<void> {
  const result = await listCommunities({ page: 1, pageSize: 100, status: 'ENABLED' });
  communities.value = result.list;
}

async function openCreate(): Promise<void> {
  editingId.value = null;
  Object.assign(form, emptyForm());
  try {
    await loadCommunities();
    dialogVisible.value = true;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
}

async function openEdit(row: Store): Promise<void> {
  editingId.value = row.id;
  try {
    await loadCommunities();
    Object.assign(form, {
      name: row.name,
      logoUrl: row.logoUrl,
      coverUrl: row.coverUrl,
      phone: row.phone,
      address: row.address,
      description: row.description ?? '',
      announcement: row.announcement ?? '',
      businessStartTime: row.businessStartTime,
      businessEndTime: row.businessEndTime,
      minimumOrderAmount: row.minimumOrderAmount,
      defaultDeliveryFee: row.defaultDeliveryFee,
      estimatedDeliveryMinutes: row.estimatedDeliveryMinutes,
      status: row.status,
      sortOrder: row.sortOrder,
      communityIds: row.communities.map((item) => item.communityId),
    });
    dialogVisible.value = true;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
}

async function uploadStoreImage(field: 'logoUrl' | 'coverUrl', event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  imageUploading.value = field;
  try {
    const uploaded = await uploadImage(file);
    if (uploaded.compressed) ElMessage.info('图片超过 512KB，已自动压缩后上传');
    form[field] = uploaded.url;
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : getApiErrorMessage(error));
  } finally {
    imageUploading.value = null;
  }
}

function removeStoreImage(field: 'logoUrl' | 'coverUrl'): void {
  form[field] = null;
}

function imageSource(value: string | null | undefined): string {
  return resolveApiAssetUrl(value);
}

async function save(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    if (editingId.value) await updateStore(editingId.value, { ...form });
    else await createStore({ ...form });
    ElMessage.success(editingId.value ? '店铺已更新' : '店铺已创建');
    dialogVisible.value = false;
    page.value = 1;
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: Store): Promise<void> {
  const next: StoreStatus = row.status === 'OPEN' ? 'PAUSED' : 'OPEN';
  try {
    await updateStoreStatus(row.id, next);
    ElMessage.success(next === 'OPEN' ? '店铺已营业' : '店铺已暂停');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
}

async function remove(row: Store): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除店铺“${row.name}”吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
    await deleteStore(row.id);
    ElMessage.success('店铺已删除');
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(getApiErrorMessage(error));
  }
}

function search(): void {
  page.value = 1;
  void load();
}

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">基础数据</p>
        <h1>店铺管理</h1>
        <p>维护店铺营业信息、配送费用和可服务小区。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建店铺</el-button>
    </div>
    <el-card shadow="never">
      <div class="table-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索店铺名称"
          clearable
          class="search-input"
          @keyup.enter="search"
        />
        <el-select v-model="statusFilter" placeholder="全部状态" clearable class="status-select">
          <el-option label="营业" value="OPEN" /><el-option label="暂停" value="PAUSED" /><el-option
            label="停用"
            value="DISABLED"
          />
        </el-select>
        <el-button @click="search">查询</el-button>
      </div>
      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon />
      <el-table v-loading="loading" :data="rows" empty-text="暂无店铺">
        <el-table-column prop="name" label="店铺名称" min-width="150" />
        <el-table-column label="配送范围" min-width="180">
          <template #default="scope">{{
            scope.row.communities
              .map((item: Store['communities'][number]) => item.community.name)
              .join('、')
          }}</template>
        </el-table-column>
        <el-table-column label="起送/配送费" width="140">
          <template #default="scope"
            >¥{{ scope.row.minimumOrderAmount }} / ¥{{ scope.row.defaultDeliveryFee }}</template
          >
        </el-table-column>
        <el-table-column label="营业时间" width="130">
          <template #default="scope"
            >{{ scope.row.businessStartTime }}–{{ scope.row.businessEndTime }}</template
          >
        </el-table-column>
        <el-table-column label="状态" width="80">
          <template #default="scope"
            ><el-tag :type="scope.row.status === 'OPEN' ? 'success' : 'info'">{{
              scope.row.status === 'OPEN' ? '营业' : scope.row.status === 'PAUSED' ? '暂停' : '停用'
            }}</el-tag></template
          >
        </el-table-column>
        <el-table-column label="操作" width="230" fixed="right">
          <template #default="scope">
            <el-button text type="primary" @click="openEdit(scope.row)">编辑</el-button>
            <el-button text @click="toggleStatus(scope.row)">{{
              scope.row.status === 'OPEN' ? '暂停' : '营业'
            }}</el-button>
            <el-button text type="danger" @click="remove(scope.row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-if="total > pageSize"
        class="table-pagination"
        background
        layout="prev, pager, next, total"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @current-change="
          (value: number) => {
            page = value;
            load();
          }
        "
      />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑店铺' : '新建店铺'" width="720px">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-row :gutter="16"
          ><el-col :span="12"
            ><el-form-item label="店铺名称" prop="name"
              ><el-input v-model="form.name" /></el-form-item></el-col
          ><el-col :span="12"
            ><el-form-item label="联系电话" prop="phone"
              ><el-input v-model="form.phone" /></el-form-item></el-col
        ></el-row>
        <el-form-item label="店铺地址" prop="address"
          ><el-input v-model="form.address"
        /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="店铺 Logo">
              <div class="image-editor">
                <el-image
                  v-if="form.logoUrl"
                  class="store-image-preview store-image-preview--logo"
                  :src="imageSource(form.logoUrl)"
                  fit="cover"
                  :preview-src-list="[imageSource(form.logoUrl)]"
                />
                <span v-else class="image-editor__empty">未上传</span>
                <input
                  class="image-editor__input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  :disabled="imageUploading !== null"
                  @change="uploadStoreImage('logoUrl', $event)"
                />
                <el-button
                  v-if="form.logoUrl"
                  text
                  type="danger"
                  @click="removeStoreImage('logoUrl')"
                  >移除</el-button
                >
              </div>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="店铺封面">
              <div class="image-editor">
                <el-image
                  v-if="form.coverUrl"
                  class="store-image-preview store-image-preview--cover"
                  :src="imageSource(form.coverUrl)"
                  fit="cover"
                  :preview-src-list="[imageSource(form.coverUrl)]"
                />
                <span v-else class="image-editor__empty">未上传</span>
                <input
                  class="image-editor__input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  :disabled="imageUploading !== null"
                  @change="uploadStoreImage('coverUrl', $event)"
                />
                <el-button
                  v-if="form.coverUrl"
                  text
                  type="danger"
                  @click="removeStoreImage('coverUrl')"
                  >移除</el-button
                >
              </div>
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="配送小区" prop="communityIds"
          ><el-select
            v-model="form.communityIds"
            multiple
            class="full-width"
            placeholder="请选择启用的小区"
            ><el-option
              v-for="item in communities"
              :key="item.id"
              :label="`${item.name}（${item.city} · ${item.district}）`"
              :value="item.id" /></el-select
        ></el-form-item>
        <el-row :gutter="16"
          ><el-col :span="12"
            ><el-form-item label="起送金额" prop="minimumOrderAmount"
              ><el-input v-model="form.minimumOrderAmount" /></el-form-item></el-col
          ><el-col :span="12"
            ><el-form-item label="配送费" prop="defaultDeliveryFee"
              ><el-input v-model="form.defaultDeliveryFee" /></el-form-item></el-col
        ></el-row>
        <el-row :gutter="16"
          ><el-col :span="8"
            ><el-form-item label="营业开始"
              ><el-time-select
                v-model="form.businessStartTime"
                start="00:00"
                step="00:30"
                end="23:30" /></el-form-item></el-col
          ><el-col :span="8"
            ><el-form-item label="营业结束"
              ><el-time-select
                v-model="form.businessEndTime"
                start="00:00"
                step="00:30"
                end="23:30" /></el-form-item></el-col
          ><el-col :span="8"
            ><el-form-item label="预计送达（分钟）"
              ><el-input-number
                v-model="form.estimatedDeliveryMinutes"
                :min="1"
                :max="1440" /></el-form-item></el-col
        ></el-row>
        <el-row :gutter="16"
          ><el-col :span="12"
            ><el-form-item label="状态"
              ><el-select v-model="form.status" class="full-width"
                ><el-option label="营业" value="OPEN" /><el-option
                  label="暂停"
                  value="PAUSED" /><el-option
                  label="停用"
                  value="DISABLED" /></el-select></el-form-item></el-col
          ><el-col :span="12"
            ><el-form-item label="排序值"
              ><el-input-number
                v-model="form.sortOrder"
                :min="0"
                :max="9999"
                class="full-width" /></el-form-item></el-col
        ></el-row>
        <el-form-item label="店铺简介"
          ><el-input v-model="form.description" type="textarea" :rows="2"
        /></el-form-item>
        <el-form-item label="店铺公告"
          ><el-input v-model="form.announcement" type="textarea" :rows="2"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="dialogVisible = false">取消</el-button
        ><el-button
          type="primary"
          :loading="saving"
          :disabled="imageUploading !== null"
          @click="save"
          >保存</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>

<style scoped>
.image-editor {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 64px;
}

.image-editor__empty {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.image-editor__input {
  max-width: 190px;
  font-size: 12px;
}

.store-image-preview {
  flex: 0 0 auto;
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
}

.store-image-preview--logo {
  width: 64px;
  height: 64px;
}

.store-image-preview--cover {
  width: 120px;
  height: 64px;
}
</style>
