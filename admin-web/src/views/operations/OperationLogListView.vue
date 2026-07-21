<script setup lang="ts">
import { reactive, ref } from 'vue';

import { getApiErrorMessage } from '../../api/http';
import {
  getOperationLog,
  listOperationLogs,
  type OperationLogDetail,
  type OperationLogSummary,
} from '../../api/operations';

const moduleOptions = [
  { value: 'community', label: '配送小区' },
  { value: 'store', label: '店铺' },
  { value: 'category', label: '商品分类' },
  { value: 'product', label: '商品' },
  { value: 'delivery', label: '配送配置' },
  { value: 'order', label: '订单' },
  { value: 'refund', label: '退款' },
];
const filters = reactive({
  module: '',
  action: '',
  operatorName: '',
  businessDataId: '',
  requestId: '',
});
const dateRange = ref<[string, string] | []>([]);
const loading = ref(false);
const loadError = ref('');
const rows = ref<OperationLogSummary[]>([]);
const page = ref(1);
const pageSize = 20;
const total = ref(0);
const drawerOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detail = ref<OperationLogDetail | null>(null);

function moduleLabel(value: string): string {
  return moduleOptions.find((item) => item.value === value)?.label ?? value;
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function prettyJson(value: unknown): string {
  if (value === null || value === undefined) return '无';
  return JSON.stringify(value, null, 2);
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listOperationLogs({
      page: page.value,
      pageSize,
      ...(filters.module ? { module: filters.module } : {}),
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.operatorName ? { operatorName: filters.operatorName } : {}),
      ...(filters.businessDataId ? { businessDataId: filters.businessDataId } : {}),
      ...(filters.requestId ? { requestId: filters.requestId } : {}),
      ...(dateRange.value[0] ? { createdFrom: dateRange.value[0] } : {}),
      ...(dateRange.value[1] ? { createdTo: dateRange.value[1] } : {}),
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

function reset(): void {
  filters.module = '';
  filters.action = '';
  filters.operatorName = '';
  filters.businessDataId = '';
  filters.requestId = '';
  dateRange.value = [];
  search();
}

function changePage(nextPage: number): void {
  page.value = nextPage;
  void load();
}

async function openDetail(row: OperationLogSummary): Promise<void> {
  drawerOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  detail.value = null;
  try {
    detail.value = await getOperationLog(row.id);
  } catch (error) {
    detailError.value = getApiErrorMessage(error);
  } finally {
    detailLoading.value = false;
  }
}

void load();
</script>

<template>
  <div class="page operation-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">审计追踪</p>
        <h1>操作日志</h1>
        <p>记录后台关键写操作。日志只展示去敏变更摘要，且不提供修改或删除入口。</p>
      </div>
      <el-tag type="info" effect="plain">只读 · 不可删除</el-tag>
    </div>

    <el-card shadow="never">
      <div class="log-filters">
        <el-select v-model="filters.module" placeholder="全部模块" clearable>
          <el-option
            v-for="item in moduleOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-input v-model="filters.action" placeholder="操作类型，如 update" clearable />
        <el-input v-model="filters.operatorName" placeholder="操作人" clearable />
        <el-input v-model="filters.businessDataId" placeholder="业务数据 ID" clearable />
        <el-input v-model="filters.requestId" placeholder="Request ID" clearable />
        <el-date-picker
          v-model="dateRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
        />
        <div class="filter-actions">
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </div>
      </div>

      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon>
        <template #default><el-button text @click="load">重新加载</el-button></template>
      </el-alert>

      <el-table v-loading="loading" :data="rows" empty-text="暂无符合条件的操作日志">
        <el-table-column label="时间" width="178">
          <template #default="scope">{{ formatDateTime(scope.row.createdAt) }}</template>
        </el-table-column>
        <el-table-column prop="operatorName" label="操作人" width="130" />
        <el-table-column label="模块" width="110">
          <template #default="scope">
            <el-tag effect="plain">{{ moduleLabel(scope.row.module) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="action" label="操作类型" width="150" />
        <el-table-column
          prop="description"
          label="操作说明"
          min-width="230"
          show-overflow-tooltip
        />
        <el-table-column
          prop="businessDataId"
          label="业务数据 ID"
          min-width="180"
          show-overflow-tooltip
        />
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="scope">
            <el-button type="primary" text @click="openDetail(scope.row)">详情</el-button>
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

    <el-drawer v-model="drawerOpen" title="操作日志详情" size="min(720px, 94vw)">
      <div v-loading="detailLoading" class="log-detail">
        <el-alert
          v-if="detailError"
          :title="detailError"
          type="error"
          :closable="false"
          show-icon
        />
        <template v-if="detail">
          <el-descriptions :column="1" border>
            <el-descriptions-item label="操作时间">{{
              formatDateTime(detail.createdAt)
            }}</el-descriptions-item>
            <el-descriptions-item label="操作人">{{ detail.operatorName }}</el-descriptions-item>
            <el-descriptions-item label="模块 / 类型">
              {{ moduleLabel(detail.module) }} / {{ detail.action }}
            </el-descriptions-item>
            <el-descriptions-item label="业务数据 ID">{{
              detail.businessDataId || '无'
            }}</el-descriptions-item>
            <el-descriptions-item label="操作说明">{{ detail.description }}</el-descriptions-item>
            <el-descriptions-item label="Request ID">{{
              detail.requestId || '无'
            }}</el-descriptions-item>
            <el-descriptions-item label="请求上下文">
              {{ detail.requestIp || '未知 IP' }} · {{ detail.requestPath || '未知路径' }}
            </el-descriptions-item>
          </el-descriptions>

          <div class="diff-grid">
            <section>
              <h3>修改前摘要</h3>
              <pre>{{ prettyJson(detail.beforeData) }}</pre>
            </section>
            <section>
              <h3>修改后摘要</h3>
              <pre>{{ prettyJson(detail.afterData) }}</pre>
            </section>
          </div>
          <el-alert
            title="敏感字段不会写入操作摘要"
            description="完整手机号、地址、Token、密钥、备注和自由文本详情均由服务端白名单过滤。"
            type="info"
            :closable="false"
            show-icon
          />
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.log-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(180px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.log-filters :deep(.el-date-editor) {
  width: 100%;
}
.filter-actions {
  display: flex;
  gap: 8px;
}
.log-detail {
  min-height: 180px;
}
.diff-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
  margin: 24px 0;
}
.diff-grid h3 {
  margin: 0 0 10px;
  font-size: 15px;
}
.diff-grid pre {
  min-height: 150px;
  margin: 0;
  overflow: auto;
  padding: 14px;
  border: 1px solid #e6ece8;
  border-radius: 8px;
  background: #f7f9f8;
  color: #35413c;
  font:
    13px/1.6 ui-monospace,
    SFMono-Regular,
    Menlo,
    monospace;
  white-space: pre-wrap;
  word-break: break-word;
}
@media (width <= 900px) {
  .log-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (width <= 620px) {
  .log-filters,
  .diff-grid {
    grid-template-columns: 1fr;
  }
}
</style>
