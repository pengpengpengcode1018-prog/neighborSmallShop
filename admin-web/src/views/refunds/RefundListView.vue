<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import { getApiErrorMessage } from '../../api/http';
import {
  approveRefund,
  getRefund,
  listRefunds,
  rejectRefund,
  type AdminRefund,
  type RefundStatus,
} from '../../api/refunds';

const statusOptions: Array<{ value: RefundStatus; label: string }> = [
  { value: 'PENDING_REVIEW', label: '待审核' },
  { value: 'APPROVED', label: '审核通过，提交中' },
  { value: 'PROCESSING', label: '退款处理中' },
  { value: 'SUCCESS', label: '退款成功' },
  { value: 'REJECTED', label: '审核已拒绝' },
  { value: 'FAILED', label: '退款失败' },
];

const loading = ref(false);
const loadError = ref('');
const rows = ref<AdminRefund[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const filters = reactive<{ orderNo: string; status: RefundStatus | '' }>({
  orderNo: '',
  status: '',
});
const actionLoading = ref<string | null>(null);
const drawerVisible = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detail = ref<AdminRefund | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listRefunds({
      page: page.value,
      pageSize,
      ...(filters.orderNo.trim() ? { orderNo: filters.orderNo.trim() } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    });
    rows.value = result.list;
    total.value = result.total;
  } catch (error) {
    rows.value = [];
    total.value = 0;
    loadError.value = getApiErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function search(): void {
  page.value = 1;
  void load();
}

function resetFilters(): void {
  filters.orderNo = '';
  filters.status = '';
  search();
}

function changePage(nextPage: number): void {
  page.value = nextPage;
  void load();
}

async function openDetail(row: AdminRefund): Promise<void> {
  drawerVisible.value = true;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try {
    detail.value = await getRefund(row.id);
  } catch (error) {
    detailError.value = getApiErrorMessage(error);
  } finally {
    detailLoading.value = false;
  }
}

async function approve(row: AdminRefund): Promise<void> {
  try {
    const prompt = await ElMessageBox.prompt(
      `整单退款 ¥${row.amount}。通过后将使用退款编号 ${row.refundNo} 向微信发起退款。`,
      '确认审核通过',
      {
        confirmButtonText: '通过并提交微信',
        cancelButtonText: '取消',
        inputPlaceholder: '审核说明（选填）',
        type: 'warning',
      },
    );
    actionLoading.value = row.id;
    const result = await approveRefund(row.id, prompt.value.trim() || null);
    detail.value = detail.value?.id === row.id ? result.refund : detail.value;
    ElMessage.success(
      result.refund.status === 'SUCCESS'
        ? '微信退款已成功'
        : result.idempotentReplay
          ? '已复用原退款单并刷新状态'
          : '审核已通过，微信退款处理中',
    );
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(getApiErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

async function reject(row: AdminRefund): Promise<void> {
  try {
    const prompt = await ElMessageBox.prompt(
      '驳回后订单会恢复为“已支付待接单”，请填写明确原因供居民查看。',
      '驳回退款申请',
      {
        confirmButtonText: '确认驳回',
        cancelButtonText: '取消',
        inputPlaceholder: '驳回原因（至少 2 个字）',
        inputValidator: (value) => value.trim().length >= 2 || '请填写至少 2 个字的驳回原因',
        type: 'warning',
      },
    );
    actionLoading.value = row.id;
    const result = await rejectRefund(row.id, prompt.value.trim());
    detail.value = detail.value?.id === row.id ? result.refund : detail.value;
    ElMessage.success(
      result.idempotentReplay ? '退款申请已驳回' : '退款申请已驳回，订单已恢复待接单',
    );
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(getApiErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function tagType(status: RefundStatus): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (status === 'SUCCESS') return 'success';
  if (status === 'PENDING_REVIEW') return 'warning';
  if (status === 'REJECTED' || status === 'FAILED') return 'danger';
  if (status === 'PROCESSING') return 'primary';
  return 'info';
}

onMounted(load);
</script>

<template>
  <div class="page refund-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">售后资金</p>
        <h1>退款审核</h1>
        <p>审核居民的整单退款申请；最终成功状态以微信退款查询或可信通知为准。</p>
      </div>
    </div>

    <el-card shadow="never">
      <div class="refund-toolbar">
        <el-input
          v-model="filters.orderNo"
          class="order-search"
          placeholder="搜索订单编号"
          clearable
          @keyup.enter="search"
        />
        <el-select
          v-model="filters.status"
          class="refund-status"
          placeholder="全部退款状态"
          clearable
        >
          <el-option
            v-for="item in statusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon>
        <template #default><el-button text @click="load">重新加载</el-button></template>
      </el-alert>

      <el-table v-loading="loading" :data="rows" empty-text="暂无退款申请" @row-click="openDetail">
        <el-table-column label="退款 / 订单" min-width="210">
          <template #default="scope">
            <strong>{{ scope.row.refundNo }}</strong>
            <small class="table-secondary">订单 {{ scope.row.order.orderNo }}</small>
          </template>
        </el-table-column>
        <el-table-column label="居民 / 店铺" min-width="160">
          <template #default="scope">
            <span>{{ scope.row.order.recipientName }} · {{ scope.row.order.phone }}</span>
            <small class="table-secondary">{{ scope.row.order.storeName }}</small>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="scope"
            ><strong>¥{{ scope.row.amount }}</strong></template
          >
        </el-table-column>
        <el-table-column label="原因" min-width="145">
          <template #default="scope">
            <span>{{ scope.row.reasonLabel }}</span>
            <small v-if="scope.row.userNote" class="table-secondary">{{
              scope.row.userNote
            }}</small>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="160">
          <template #default="scope">
            <el-tag :type="tagType(scope.row.status)">{{ scope.row.statusLabel }}</el-tag>
            <small v-if="scope.row.refreshPending" class="table-secondary">微信状态待刷新</small>
          </template>
        </el-table-column>
        <el-table-column label="申请时间" width="170">
          <template #default="scope">{{ formatDateTime(scope.row.createdAt) }}</template>
        </el-table-column>
        <el-table-column label="审核" width="195" fixed="right">
          <template #default="scope">
            <div v-if="scope.row.allowedActions.length" class="row-actions" @click.stop>
              <el-button
                size="small"
                type="primary"
                :loading="actionLoading === scope.row.id"
                @click="approve(scope.row)"
                >通过</el-button
              >
              <el-button
                size="small"
                type="danger"
                plain
                :disabled="actionLoading === scope.row.id"
                @click="reject(scope.row)"
                >驳回</el-button
              >
            </div>
            <span v-else class="table-secondary">已处理</span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="table-pagination"
        background
        layout="prev, pager, next, total"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @current-change="changePage"
      />
    </el-card>

    <el-drawer v-model="drawerVisible" title="退款详情" size="520px">
      <div v-loading="detailLoading">
        <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
        <template v-else-if="detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="退款编号">{{ detail.refundNo }}</el-descriptions-item>
            <el-descriptions-item label="订单编号">{{ detail.order.orderNo }}</el-descriptions-item>
            <el-descriptions-item label="居民"
              >{{ detail.order.recipientName }} · {{ detail.order.phone }}</el-descriptions-item
            >
            <el-descriptions-item label="退款金额">¥{{ detail.amount }}</el-descriptions-item>
            <el-descriptions-item label="退款原因">{{ detail.reasonLabel }}</el-descriptions-item>
            <el-descriptions-item label="居民说明">{{
              detail.userNote || '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="退款状态">
              <el-tag :type="tagType(detail.status)">{{ detail.statusLabel }}</el-tag>
            </el-descriptions-item>
            <el-descriptions-item label="审核说明">{{
              detail.reviewNote || '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="审核人">{{
              detail.reviewedBy?.displayName || '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="微信退款单">{{
              detail.providerRefundId || '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="申请时间">{{
              formatDateTime(detail.createdAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="完成时间">{{
              formatDateTime(detail.completedAt)
            }}</el-descriptions-item>
          </el-descriptions>
          <el-alert
            v-if="detail.failureMessage"
            class="detail-alert"
            :title="detail.failureMessage"
            type="warning"
            :closable="false"
          />
          <div v-if="detail.allowedActions.length" class="drawer-actions">
            <el-button
              type="primary"
              :loading="actionLoading === detail.id"
              @click="approve(detail)"
              >审核通过</el-button
            >
            <el-button
              type="danger"
              plain
              :disabled="actionLoading === detail.id"
              @click="reject(detail)"
              >驳回申请</el-button
            >
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.refund-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.order-search {
  width: 260px;
}
.refund-status {
  width: 190px;
}
.table-secondary {
  display: block;
  margin-top: 5px;
  color: #7a8781;
  font-size: 12px;
}
.row-actions,
.drawer-actions {
  display: flex;
  gap: 8px;
}
.drawer-actions {
  margin-top: 24px;
}
.detail-alert {
  margin-top: 18px;
}
@media (width <= 720px) {
  .refund-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .order-search,
  .refund-status {
    width: 100%;
  }
}
</style>
