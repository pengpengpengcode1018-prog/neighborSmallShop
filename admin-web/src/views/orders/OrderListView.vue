<script setup lang="ts">
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import { getApiErrorMessage } from '../../api/http';
import {
  getOrder,
  listOrders,
  transitionOrder,
  updateOrderRemark,
  type AdminOrderAction,
  type AdminOrderCard,
  type AdminOrderDetail,
  type DeliveryType,
  type OrderStatus,
} from '../../api/orders';
import { listStores, type Store } from '../../api/stores';

const statusOptions: Array<{ value: OrderStatus; label: string }> = [
  { value: 'PENDING_PAYMENT', label: '待付款' },
  { value: 'PAID', label: '已支付待接单' },
  { value: 'ACCEPTED', label: '已接单' },
  { value: 'PREPARING', label: '制作中' },
  { value: 'WAITING_DELIVERY', label: '待配送' },
  { value: 'DELIVERING', label: '配送中' },
  { value: 'COMPLETED', label: '已完成' },
  { value: 'CANCELLED', label: '已取消' },
  { value: 'REFUND_PENDING', label: '退款中' },
  { value: 'REFUNDED', label: '已退款' },
];
const actionLabels: Record<AdminOrderAction, string> = {
  CLOSE: '关闭订单',
  ACCEPT: '接单',
  START_PREPARING: '开始制作',
  MARK_READY: '制作完成',
  START_DELIVERY: '开始配送',
  COMPLETE: '确认完成',
};

const loading = ref(false);
const loadError = ref('');
const rows = ref<AdminOrderCard[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const stores = ref<Store[]>([]);
const createdRange = ref<[string, string] | null>(null);
const filters = reactive<{
  orderNo: string;
  phone: string;
  storeId: string;
  communityName: string;
  status: OrderStatus | '';
  deliveryType: DeliveryType | '';
}>({
  orderNo: '',
  phone: '',
  storeId: '',
  communityName: '',
  status: '',
  deliveryType: '',
});

const drawerVisible = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detail = ref<AdminOrderDetail | null>(null);
const actionLoading = ref<AdminOrderAction | null>(null);
const remarkDraft = ref('');
const remarkSaving = ref(false);

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listOrders({
      page: page.value,
      pageSize,
      ...(filters.orderNo.trim() ? { orderNo: filters.orderNo.trim() } : {}),
      ...(filters.phone.trim() ? { phone: filters.phone.trim() } : {}),
      ...(filters.storeId ? { storeId: filters.storeId } : {}),
      ...(filters.communityName.trim() ? { communityName: filters.communityName.trim() } : {}),
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.deliveryType ? { deliveryType: filters.deliveryType } : {}),
      ...(createdRange.value
        ? { createdFrom: createdRange.value[0], createdTo: createdRange.value[1] }
        : {}),
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

async function initialize(): Promise<void> {
  try {
    stores.value = (await listStores({ page: 1, pageSize: 100 })).list;
  } catch {
    stores.value = [];
  }
  await load();
}

function search(): void {
  page.value = 1;
  void load();
}

function resetFilters(): void {
  Object.assign(filters, {
    orderNo: '',
    phone: '',
    storeId: '',
    communityName: '',
    status: '',
    deliveryType: '',
  });
  createdRange.value = null;
  search();
}

function changePage(nextPage: number): void {
  page.value = nextPage;
  void load();
}

async function openDetail(row: AdminOrderCard): Promise<void> {
  drawerVisible.value = true;
  detail.value = null;
  detailError.value = '';
  detailLoading.value = true;
  try {
    detail.value = await getOrder(row.id);
    remarkDraft.value = detail.value.adminRemark ?? '';
  } catch (error) {
    detailError.value = getApiErrorMessage(error);
  } finally {
    detailLoading.value = false;
  }
}

async function performAction(row: AdminOrderCard | AdminOrderDetail, action: AdminOrderAction) {
  const isDanger = action === 'CLOSE';
  try {
    await ElMessageBox.confirm(
      `确定对订单 ${row.orderNo} 执行“${actionLabels[action]}”吗？`,
      '订单状态确认',
      {
        type: isDanger ? 'warning' : 'info',
        confirmButtonText: actionLabels[action],
        cancelButtonText: '取消',
      },
    );
    actionLoading.value = action;
    const result = await transitionOrder(row.id, {
      action,
      expectedStatus: row.status,
      ...(isDanger ? { remark: '管理员主动关闭待付款订单' } : {}),
    });
    ElMessage.success(result.idempotentReplay ? '订单已处于目标状态' : '订单状态已更新');
    if (detail.value?.id === row.id) {
      detail.value = result.order;
      remarkDraft.value = result.order.adminRemark ?? '';
    }
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(getApiErrorMessage(error));
  } finally {
    actionLoading.value = null;
  }
}

async function saveRemark(): Promise<void> {
  if (!detail.value) return;
  remarkSaving.value = true;
  try {
    detail.value = await updateOrderRemark(detail.value.id, remarkDraft.value.trim() || null);
    remarkDraft.value = detail.value.adminRemark ?? '';
    ElMessage.success('后台备注已保存');
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    remarkSaving.value = false;
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

function tagType(status: OrderStatus): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (status === 'COMPLETED') return 'success';
  if (status === 'CANCELLED' || status === 'REFUNDED') return 'info';
  if (status === 'REFUND_PENDING') return 'danger';
  if (status === 'PENDING_PAYMENT') return 'warning';
  return 'primary';
}

function actionLabel(action: AdminOrderAction): string {
  return actionLabels[action];
}

onMounted(initialize);
</script>

<template>
  <div class="page order-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">交易履约</p>
        <h1>订单管理</h1>
        <p>查看订单快照并按状态机推进履约；支付状态不能由后台手工伪造。</p>
      </div>
    </div>

    <el-card shadow="never">
      <div class="order-filters">
        <el-input v-model="filters.orderNo" placeholder="订单编号" clearable />
        <el-input v-model="filters.phone" placeholder="收货手机号" clearable />
        <el-select v-model="filters.storeId" placeholder="全部店铺" clearable filterable>
          <el-option
            v-for="store in stores"
            :key="store.id"
            :label="store.name"
            :value="store.id"
          />
        </el-select>
        <el-input v-model="filters.communityName" placeholder="小区名称" clearable />
        <el-select v-model="filters.status" placeholder="全部状态" clearable>
          <el-option
            v-for="item in statusOptions"
            :key="item.value"
            :label="item.label"
            :value="item.value"
          />
        </el-select>
        <el-select v-model="filters.deliveryType" placeholder="配送方式" clearable>
          <el-option label="尽快送达" value="ASAP" />
          <el-option label="预约配送" value="SCHEDULED" />
        </el-select>
        <el-date-picker
          v-model="createdRange"
          type="daterange"
          value-format="YYYY-MM-DD"
          range-separator="至"
          start-placeholder="下单开始"
          end-placeholder="下单结束"
        />
        <div class="filter-actions">
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="resetFilters">重置</el-button>
        </div>
      </div>

      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon>
        <template #default><el-button text @click="load">重新加载</el-button></template>
      </el-alert>

      <el-table v-loading="loading" :data="rows" empty-text="暂无订单">
        <el-table-column label="订单" min-width="190">
          <template #default="scope">
            <strong>{{ scope.row.orderNo }}</strong>
            <small class="table-secondary">{{ formatDateTime(scope.row.createdAt) }}</small>
          </template>
        </el-table-column>
        <el-table-column label="用户" min-width="145">
          <template #default="scope">
            <span>{{ scope.row.user.nickname || '微信用户' }}</span>
            <small class="table-secondary">{{ scope.row.user.phone }}</small>
          </template>
        </el-table-column>
        <el-table-column label="店铺 / 小区" min-width="170">
          <template #default="scope">
            <span>{{ scope.row.store.name }}</span>
            <small class="table-secondary">{{ scope.row.communityName }}</small>
          </template>
        </el-table-column>
        <el-table-column label="金额" width="110" align="right">
          <template #default="scope">¥{{ scope.row.payableTotal }}</template>
        </el-table-column>
        <el-table-column label="配送" width="145">
          <template #default="scope">
            {{
              scope.row.deliveryType === 'ASAP'
                ? '尽快送达'
                : `${scope.row.deliveryDate} ${scope.row.deliveryTime}`
            }}
          </template>
        </el-table-column>
        <el-table-column label="状态" width="145">
          <template #default="scope">
            <el-tag :type="tagType(scope.row.status)">{{ scope.row.statusLabel }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" min-width="190" fixed="right" align="right">
          <template #default="scope">
            <el-button text type="primary" @click="openDetail(scope.row)">详情</el-button>
            <el-button
              v-for="action in scope.row.allowedActions"
              :key="action"
              text
              :type="action === 'CLOSE' ? 'danger' : 'primary'"
              :loading="actionLoading === action"
              @click="performAction(scope.row, action)"
            >
              {{ actionLabel(action) }}
            </el-button>
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
        @current-change="changePage"
      />
    </el-card>

    <el-drawer v-model="drawerVisible" title="订单详情" size="min(760px, 92vw)">
      <div v-loading="detailLoading" class="order-detail">
        <el-alert v-if="detailError" :title="detailError" type="error" :closable="false" />
        <template v-else-if="detail">
          <div class="detail-heading">
            <div>
              <h2>{{ detail.orderNo }}</h2>
              <p>{{ formatDateTime(detail.createdAt) }}</p>
            </div>
            <el-tag :type="tagType(detail.status)" size="large">{{ detail.statusLabel }}</el-tag>
          </div>

          <el-descriptions :column="2" border>
            <el-descriptions-item label="用户">{{
              detail.user.nickname || '微信用户'
            }}</el-descriptions-item>
            <el-descriptions-item label="联系电话">{{ detail.address.phone }}</el-descriptions-item>
            <el-descriptions-item label="店铺">{{ detail.store.name }}</el-descriptions-item>
            <el-descriptions-item label="店铺电话">{{
              detail.store.phone || '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="收货地址" :span="2">{{
              detail.address.fullAddress
            }}</el-descriptions-item>
            <el-descriptions-item label="配送方式">{{
              detail.delivery.type === 'ASAP' ? '尽快送达' : '预约配送'
            }}</el-descriptions-item>
            <el-descriptions-item label="配送时间">{{
              detail.delivery.date ? `${detail.delivery.date} ${detail.delivery.time}` : '-'
            }}</el-descriptions-item>
            <el-descriptions-item label="用户备注" :span="2">{{
              detail.remark || '无'
            }}</el-descriptions-item>
          </el-descriptions>

          <h3>商品与金额</h3>
          <el-table :data="detail.items" size="small">
            <el-table-column prop="name" label="商品" min-width="180" />
            <el-table-column prop="unitPrice" label="单价" width="90" align="right" />
            <el-table-column prop="quantity" label="数量" width="80" align="right" />
            <el-table-column prop="lineTotal" label="小计" width="100" align="right" />
          </el-table>
          <div class="amount-summary">
            商品 ¥{{ detail.summary.merchandiseTotal }} + 配送 ¥{{ detail.summary.deliveryFee }} =
            <strong>¥{{ detail.summary.payableTotal }}</strong>
          </div>

          <h3>后台备注</h3>
          <div class="remark-editor">
            <el-input
              v-model="remarkDraft"
              type="textarea"
              :rows="3"
              maxlength="500"
              show-word-limit
            />
            <el-button type="primary" :loading="remarkSaving" @click="saveRemark"
              >保存备注</el-button
            >
          </div>

          <h3>状态记录</h3>
          <el-timeline>
            <el-timeline-item
              v-for="log in detail.statusLogs"
              :key="log.id"
              :timestamp="formatDateTime(log.createdAt)"
              placement="top"
            >
              <strong>{{
                statusOptions.find((item) => item.value === log.toStatus)?.label
              }}</strong>
              <p>{{ log.description }} · {{ log.operatorName || log.operatorType }}</p>
            </el-timeline-item>
          </el-timeline>

          <div v-if="detail.allowedActions.length" class="detail-actions">
            <el-button
              v-for="action in detail.allowedActions"
              :key="action"
              :type="action === 'CLOSE' ? 'danger' : 'primary'"
              :loading="actionLoading === action"
              @click="performAction(detail, action)"
            >
              {{ actionLabel(action) }}
            </el-button>
          </div>
        </template>
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.order-page {
  max-width: 1500px;
}
.order-filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(150px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}
.filter-actions {
  display: flex;
  gap: 8px;
}
.table-secondary {
  display: block;
  margin-top: 5px;
  color: #839089;
  font-size: 12px;
}
.order-detail {
  min-height: 260px;
}
.detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}
.detail-heading h2 {
  margin: 0;
  font-size: 20px;
}
.detail-heading p {
  margin: 6px 0 0;
  color: #77857e;
}
.order-detail h3 {
  margin: 28px 0 14px;
  font-size: 16px;
}
.amount-summary {
  margin-top: 14px;
  text-align: right;
}
.amount-summary strong {
  margin-left: 8px;
  color: #d94f3d;
  font-size: 20px;
}
.remark-editor {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.detail-actions {
  position: sticky;
  bottom: 0;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 28px;
  padding: 16px 0;
  background: #ffffff;
}
.el-timeline p {
  margin: 6px 0 0;
  color: #697770;
}
@media (width <= 1000px) {
  .order-filters {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }
}
</style>
