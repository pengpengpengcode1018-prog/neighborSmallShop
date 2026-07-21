<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  getAlertSummary,
  listAlerts,
  markAlertRead,
  type AdminAlert,
  type AdminAlertStatus,
  type AdminAlertSummary,
  type AdminAlertType,
} from '../../api/alerts';
import { getApiErrorMessage } from '../../api/http';

const router = useRouter();
const typeOptions: Array<{ value: AdminAlertType; label: string }> = [
  { value: 'NEW_PAID_ORDER', label: '新订单' },
  { value: 'UNACCEPTED_ORDER', label: '超时未接单' },
  { value: 'REFUND_REQUEST', label: '退款申请' },
  { value: 'LOW_STOCK', label: '库存不足' },
];
const statusOptions: Array<{ value: AdminAlertStatus; label: string }> = [
  { value: 'UNREAD', label: '未读' },
  { value: 'READ', label: '已读' },
  { value: 'RESOLVED', label: '已解决' },
];
const loading = ref(false);
const loadError = ref('');
const rows = ref<AdminAlert[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const summary = ref<AdminAlertSummary | null>(null);
const actionLoading = ref<string | null>(null);
const filters = reactive<{ type: AdminAlertType | ''; status: AdminAlertStatus | '' }>({
  type: '',
  status: 'UNREAD',
});

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const [result, nextSummary] = await Promise.all([
      listAlerts({
        page: page.value,
        pageSize,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      }),
      getAlertSummary(),
    ]);
    rows.value = result.list;
    total.value = result.total;
    summary.value = nextSummary;
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

function changePage(nextPage: number): void {
  page.value = nextPage;
  void load();
}

async function read(alert: AdminAlert): Promise<void> {
  if (alert.status !== 'UNREAD') return;
  actionLoading.value = alert.id;
  try {
    await markAlertRead(alert.id);
    ElMessage.success('已标记为已读');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

function openResource(alert: AdminAlert): void {
  const routes: Record<AdminAlert['resourceType'], string> = {
    order: '/orders',
    refund: '/refunds',
    product: '/products',
  };
  void router.push(routes[alert.resourceType]);
}

function formatDateTime(value: string): string {
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

function tagType(alert: AdminAlert): 'danger' | 'warning' | 'success' | 'info' {
  if (alert.status === 'RESOLVED') return 'success';
  if (alert.severity === 'URGENT') return 'danger';
  if (alert.severity === 'WARNING') return 'warning';
  return 'info';
}

onMounted(load);
</script>

<template>
  <div class="page alert-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">运营提醒</p>
        <h1>提醒中心</h1>
        <p>提醒来自订单、退款和库存真实状态；已解决提醒不会改变业务状态。</p>
      </div>
    </div>

    <div class="alert-summary-grid">
      <el-card shadow="never"
        ><strong>{{ summary?.unread ?? 0 }}</strong
        ><span>全部未读</span></el-card
      >
      <el-card shadow="never"
        ><strong>{{ summary?.byType.NEW_PAID_ORDER ?? 0 }}</strong
        ><span>新订单</span></el-card
      >
      <el-card shadow="never"
        ><strong>{{ summary?.byType.UNACCEPTED_ORDER ?? 0 }}</strong
        ><span>超时未接单</span></el-card
      >
      <el-card shadow="never"
        ><strong>{{ summary?.byType.LOW_STOCK ?? 0 }}</strong
        ><span>库存不足</span></el-card
      >
    </div>

    <el-card shadow="never">
      <div class="alert-toolbar">
        <el-select v-model="filters.type" placeholder="全部提醒类型" clearable>
          <el-option
            v-for="item in typeOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select v-model="filters.status" placeholder="全部状态" clearable>
          <el-option
            v-for="item in statusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-button type="primary" @click="search">查询</el-button>
      </div>

      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon>
        <template #default><el-button text @click="load">重新加载</el-button></template>
      </el-alert>

      <el-table v-loading="loading" :data="rows" empty-text="暂无提醒">
        <el-table-column label="提醒" min-width="260">
          <template #default="scope">
            <strong>{{ scope.row.title }}</strong>
            <small class="table-secondary">{{ scope.row.message }}</small>
          </template>
        </el-table-column>
        <el-table-column label="类型" width="130">
          <template #default="scope">
            {{ typeOptions.find((item) => item.value === scope.row.type)?.label }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="110">
          <template #default="scope">
            <el-tag :type="tagType(scope.row)">
              {{ statusOptions.find((item) => item.value === scope.row.status)?.label }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="发生时间" width="175">
          <template #default="scope">{{ formatDateTime(scope.row.occurredAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="210" fixed="right">
          <template #default="scope">
            <el-button
              v-if="scope.row.status === 'UNREAD'"
              size="small"
              :loading="actionLoading === scope.row.id"
              @click="read(scope.row)"
              >标为已读</el-button
            >
            <el-button size="small" type="primary" text @click="openResource(scope.row)"
              >查看业务</el-button
            >
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        v-if="total > pageSize"
        class="table-pagination"
        layout="prev, pager, next, total"
        :current-page="page"
        :page-size="pageSize"
        :total="total"
        @current-change="changePage"
      />
    </el-card>
  </div>
</template>

<style scoped>
.alert-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 20px;
}
.alert-summary-grid :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.alert-summary-grid strong {
  color: #176b4d;
  font-size: 30px;
}
.alert-summary-grid span {
  color: #64716b;
  font-size: 13px;
}
.alert-toolbar {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
}
.alert-toolbar .el-select {
  width: 180px;
}
@media (width <= 820px) {
  .alert-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .alert-toolbar {
    align-items: stretch;
    flex-direction: column;
  }
  .alert-toolbar .el-select {
    width: 100%;
  }
}
</style>
