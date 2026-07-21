<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';

import {
  createDeliverySlot,
  getDeliveryConfig,
  updateDeliveryModes,
  updateDeliverySlot,
  updateDeliverySlotStatus,
  type DeliveryModes,
  type DeliverySlot,
  type DeliverySlotInput,
  type DeliverySlotStatus,
} from '../../api/delivery';
import { getApiErrorMessage } from '../../api/http';
import { listStores, type Store } from '../../api/stores';

const stores = ref<Store[]>([]);
const selectedStoreId = ref('');
const slots = ref<DeliverySlot[]>([]);
const loading = ref(false);
const loadError = ref('');
const modesSaving = ref(false);
const modes = reactive<DeliveryModes>({ asapEnabled: true, scheduledEnabled: true });
const modesValid = computed(() => modes.asapEnabled || modes.scheduledEnabled);

const dialogVisible = ref(false);
const slotSaving = ref(false);
const editingSlotId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const emptySlot = (): DeliverySlotInput => ({
  deliveryTime: '08:00',
  cutoffTime: '07:30',
  maxOrders: 20,
  status: 'ENABLED',
  sortOrder: 0,
});
const form = reactive<DeliverySlotInput>(emptySlot());
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const rules: FormRules<DeliverySlotInput> = {
  deliveryTime: [
    { required: true, message: '请选择送达时间' },
    { pattern: timePattern, message: '送达时间格式应为 HH:mm' },
  ],
  cutoffTime: [
    { required: true, message: '请选择停止下单时间' },
    { pattern: timePattern, message: '停止下单时间格式应为 HH:mm' },
    {
      validator: (_rule, value, callback) => {
        if (typeof value === 'string' && value >= form.deliveryTime) {
          callback(new Error('停止下单时间必须早于送达时间'));
          return;
        }
        callback();
      },
      trigger: 'change',
    },
  ],
  maxOrders: [{ required: true, message: '请输入最大订单数' }],
};

async function loadConfig(): Promise<void> {
  if (!selectedStoreId.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const config = await getDeliveryConfig(selectedStoreId.value);
    Object.assign(modes, config.modes);
    slots.value = config.slots;
  } catch (error) {
    loadError.value = getApiErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

async function initialize(): Promise<void> {
  loading.value = true;
  try {
    const result = await listStores({ page: 1, pageSize: 100 });
    stores.value = result.list;
    selectedStoreId.value = result.list[0]?.id ?? '';
    if (selectedStoreId.value) await loadConfig();
  } catch (error) {
    loadError.value = getApiErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function changeStore(): void {
  slots.value = [];
  void loadConfig();
}

async function saveModes(): Promise<void> {
  if (!modesValid.value) {
    ElMessage.warning('至少保留一种配送方式');
    return;
  }
  modesSaving.value = true;
  try {
    const result = await updateDeliveryModes(selectedStoreId.value, { ...modes });
    Object.assign(modes, result.modes);
    ElMessage.success('配送方式已保存');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    modesSaving.value = false;
  }
}

function openSlot(item?: DeliverySlot): void {
  editingSlotId.value = item?.id ?? null;
  Object.assign(
    form,
    item
      ? {
          deliveryTime: item.deliveryTime,
          cutoffTime: item.cutoffTime,
          maxOrders: item.maxOrders,
          status: item.status,
          sortOrder: item.sortOrder,
        }
      : emptySlot(),
  );
  dialogVisible.value = true;
}

async function saveSlot(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  slotSaving.value = true;
  try {
    if (editingSlotId.value) {
      await updateDeliverySlot(selectedStoreId.value, editingSlotId.value, { ...form });
    } else {
      await createDeliverySlot(selectedStoreId.value, { ...form });
    }
    ElMessage.success(editingSlotId.value ? '配送时段已更新' : '配送时段已创建');
    dialogVisible.value = false;
    await loadConfig();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    slotSaving.value = false;
  }
}

async function toggleStatus(item: DeliverySlot): Promise<void> {
  const next: DeliverySlotStatus = item.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
  try {
    await updateDeliverySlotStatus(selectedStoreId.value, item.id, next);
    ElMessage.success(next === 'ENABLED' ? '配送时段已启用' : '配送时段已停用');
    await loadConfig();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
}

onMounted(initialize);
</script>

<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">履约配置</p>
        <h1>配送时间与容量</h1>
        <p>配置店铺支持的配送方式，以及每日预约送达时刻和订单上限。</p>
      </div>
      <el-select
        v-model="selectedStoreId"
        placeholder="选择店铺"
        class="store-picker"
        @change="changeStore"
      >
        <el-option v-for="item in stores" :key="item.id" :label="item.name" :value="item.id" />
      </el-select>
    </div>

    <el-empty v-if="!loading && !selectedStoreId" description="请先创建店铺" />
    <template v-else-if="selectedStoreId">
      <el-alert
        v-if="loadError"
        :title="loadError"
        type="error"
        :closable="false"
        show-icon
        class="delivery-alert"
      >
        <template #default
          ><el-button text type="primary" @click="loadConfig">重试</el-button></template
        >
      </el-alert>

      <el-card v-loading="loading" shadow="never" class="catalog-section">
        <div class="section-heading">
          <div>
            <h2>配送方式</h2>
            <p class="section-description">至少启用一种方式；关闭预约配送不会删除已配置时段。</p>
          </div>
          <el-button
            type="primary"
            :loading="modesSaving"
            :disabled="!modesValid"
            @click="saveModes"
            >保存方式</el-button
          >
        </div>
        <div class="mode-options">
          <div class="mode-option">
            <div><strong>尽快送达</strong><span>接单后尽快准备并配送</span></div>
            <el-switch v-model="modes.asapEnabled" aria-label="启用尽快送达" />
          </div>
          <div class="mode-option">
            <div><strong>预约配送</strong><span>用户从启用的每日送达时刻中选择</span></div>
            <el-switch v-model="modes.scheduledEnabled" aria-label="启用预约配送" />
          </div>
        </div>
        <el-alert
          v-if="!modesValid"
          title="至少保留一种配送方式"
          type="warning"
          :closable="false"
          show-icon
        />
      </el-card>

      <el-card shadow="never" class="catalog-section">
        <div class="section-heading">
          <div>
            <h2>每日预约时段</h2>
            <p class="section-description">
              停止下单时间须早于同日送达时间，容量按每个送达时刻计算。
            </p>
          </div>
          <el-button type="primary" @click="openSlot()">新建时段</el-button>
        </div>
        <el-table v-loading="loading" :data="slots" empty-text="暂无预约配送时段">
          <el-table-column prop="deliveryTime" label="送达时间" width="130" />
          <el-table-column prop="cutoffTime" label="停止下单" width="130" />
          <el-table-column prop="maxOrders" label="最大订单数" width="130" />
          <el-table-column prop="sortOrder" label="排序" width="90" />
          <el-table-column label="状态" width="100">
            <template #default="scope">
              <el-tag :type="scope.row.status === 'ENABLED' ? 'success' : 'info'">{{
                scope.row.status === 'ENABLED' ? '启用' : '停用'
              }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" min-width="160" align="right">
            <template #default="scope">
              <el-button text type="primary" @click="openSlot(scope.row)">编辑</el-button>
              <el-button text @click="toggleStatus(scope.row)">{{
                scope.row.status === 'ENABLED' ? '停用' : '启用'
              }}</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>

    <el-dialog
      v-model="dialogVisible"
      :key="editingSlotId ?? 'new'"
      :title="editingSlotId ? '编辑配送时段' : '新建配送时段'"
      width="560px"
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="送达时间" prop="deliveryTime">
              <el-time-picker
                v-model="form.deliveryTime"
                format="HH:mm"
                value-format="HH:mm"
                placeholder="选择送达时间"
                class="full-width"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="停止下单时间" prop="cutoffTime">
              <el-time-picker
                v-model="form.cutoffTime"
                format="HH:mm"
                value-format="HH:mm"
                placeholder="选择停止下单时间"
                class="full-width"
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="最大订单数" prop="maxOrders">
              <el-input-number v-model="form.maxOrders" :min="1" :max="65535" class="full-width" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序值" prop="sortOrder">
              <el-input-number v-model="form.sortOrder" :min="0" :max="9999" class="full-width" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="状态" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio value="ENABLED">启用</el-radio>
            <el-radio value="DISABLED">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="slotSaving" @click="saveSlot">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.section-description {
  margin: 4px 0 0;
  color: #64716b;
  font-size: 14px;
}

.mode-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.mode-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 18px;
  border: 1px solid #e1e9e4;
  border-radius: 10px;
  background: #f8fbf9;
}

.mode-option strong,
.mode-option span {
  display: block;
}

.mode-option span {
  margin-top: 6px;
  color: #64716b;
  font-size: 13px;
}

.delivery-alert {
  margin-bottom: 20px;
}

@media (width <= 720px) {
  .mode-options {
    grid-template-columns: 1fr;
  }
}
</style>
