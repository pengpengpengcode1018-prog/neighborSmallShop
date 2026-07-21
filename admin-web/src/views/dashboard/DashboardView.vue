<script setup lang="ts">
import { BarChart, LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { init, use, type ECharts } from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';

import { getOperationsDashboard, type OperationsDashboard } from '../../api/operations';
import { getApiErrorMessage } from '../../api/http';

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

const loading = ref(false);
const loadError = ref('');
const dashboard = ref<OperationsDashboard | null>(null);
const trendDays = ref<7 | 30>(7);
const chartElement = ref<HTMLDivElement | null>(null);
let chart: ECharts | null = null;

function renderChart(): void {
  if (!chartElement.value || !dashboard.value) return;
  chart ??= init(chartElement.value);
  chart.setOption({
    color: ['#278661', '#e59a3a', '#5d73b8'],
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, data: ['净成交额', '退款金额', '成功支付笔数'] },
    grid: { left: 48, right: 54, top: 24, bottom: 50 },
    xAxis: {
      type: 'category',
      data: dashboard.value.trend.map((item) => item.date.slice(5)),
      axisTick: { alignWithLabel: true },
    },
    yAxis: [
      { type: 'value', name: '金额（元）', minInterval: 1 },
      { type: 'value', name: '支付笔数', minInterval: 1 },
    ],
    series: [
      {
        name: '净成交额',
        type: 'bar',
        barMaxWidth: 30,
        data: dashboard.value.trend.map((item) => Number(item.netAmount)),
      },
      {
        name: '退款金额',
        type: 'bar',
        barMaxWidth: 30,
        data: dashboard.value.trend.map((item) => Number(item.refundAmount)),
      },
      {
        name: '成功支付笔数',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: dashboard.value.trend.map((item) => item.successfulPayments),
      },
    ],
  });
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    dashboard.value = await getOperationsDashboard(trendDays.value);
    await nextTick();
    renderChart();
  } catch (error) {
    dashboard.value = null;
    loadError.value = getApiErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function changeRange(value: 7 | 30): void {
  trendDays.value = value;
  void load();
}

function formatGeneratedAt(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(value));
}

function resizeChart(): void {
  chart?.resize();
}

onMounted(() => {
  void load();
  window.addEventListener('resize', resizeChart);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart);
  chart?.dispose();
});
</script>

<template>
  <div class="page dashboard-page" v-loading="loading">
    <div class="page-heading">
      <div>
        <p class="eyebrow">经营概览</p>
        <h1>数据看板</h1>
        <p v-if="dashboard">
          {{ dashboard.businessDate }}（上海业务日） · 更新于
          {{ formatGeneratedAt(dashboard.generatedAt) }}
        </p>
        <p v-else>从服务端交易记录汇总订单、支付、退款与履约状态。</p>
      </div>
      <el-segmented
        :model-value="trendDays"
        :options="[
          { label: '近 7 天', value: 7 },
          { label: '近 30 天', value: 30 },
        ]"
        @change="changeRange"
      />
    </div>

    <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon>
      <template #default><el-button text @click="load">重新加载</el-button></template>
    </el-alert>

    <template v-if="dashboard">
      <section class="metric-grid">
        <el-card class="metric-card metric-primary" shadow="never">
          <span>今日净成交额</span>
          <strong>¥{{ dashboard.overview.todayNetAmount }}</strong>
          <small
            >支付 ¥{{ dashboard.overview.todayGrossAmount }} · 退款 ¥{{
              dashboard.overview.todayRefundAmount
            }}</small
          >
        </el-card>
        <el-card class="metric-card" shadow="never">
          <span>今日有效支付订单</span>
          <strong>{{ dashboard.overview.todayEffectivePaidOrders }}</strong>
          <small>成功支付 {{ dashboard.overview.todaySuccessfulPayments }} 笔</small>
        </el-card>
        <el-card class="metric-card" shadow="never">
          <span>今日订单</span>
          <strong>{{ dashboard.overview.todayOrders }}</strong>
          <small>含未支付与已取消</small>
        </el-card>
        <el-card class="metric-card metric-warning" shadow="never">
          <span>待接单</span>
          <strong>{{ dashboard.overview.pendingAcceptanceOrders }}</strong>
          <small>制作中 {{ dashboard.overview.preparingOrders }}</small>
        </el-card>
        <el-card class="metric-card" shadow="never">
          <span>配送中</span>
          <strong>{{ dashboard.overview.deliveringOrders }}</strong>
          <small>当前订单状态</small>
        </el-card>
        <el-card class="metric-card metric-danger" shadow="never">
          <span>退款处理中</span>
          <strong>{{ dashboard.overview.refundInProgressOrders }}</strong>
          <small>今日退款成功 {{ dashboard.overview.todaySuccessfulRefunds }} 笔</small>
        </el-card>
      </section>

      <section class="base-metrics">
        <div>
          <strong>{{ dashboard.overview.openStores }}</strong
          ><span>营业店铺 / {{ dashboard.overview.totalStores }}</span>
        </div>
        <div>
          <strong>{{ dashboard.overview.totalUsers }}</strong
          ><span>用户总数 · 今日 +{{ dashboard.overview.todayNewUsers }}</span>
        </div>
        <div>
          <strong>{{ dashboard.overview.onSaleProducts }}</strong
          ><span>在售商品 / {{ dashboard.overview.totalProducts }}</span>
        </div>
      </section>

      <el-card class="chart-card" shadow="never">
        <div class="section-heading">
          <div>
            <h2>成交与退款趋势</h2>
            <p>金额按实际支付、退款成功时间归入对应业务日。</p>
          </div>
        </div>
        <div ref="chartElement" class="trend-chart" aria-label="成交与退款趋势图"></div>
      </el-card>

      <el-row :gutter="20" class="dashboard-lower">
        <el-col :lg="16" :xs="24">
          <el-card shadow="never">
            <div class="section-heading"><h2>今日店铺表现</h2></div>
            <el-table :data="dashboard.stores" empty-text="今日暂无支付或退款记录">
              <el-table-column prop="storeName" label="店铺" min-width="180" />
              <el-table-column prop="effectivePaidOrders" label="有效支付单" width="110" />
              <el-table-column label="支付金额" width="120">
                <template #default="scope">¥{{ scope.row.grossAmount }}</template>
              </el-table-column>
              <el-table-column label="退款金额" width="120">
                <template #default="scope">¥{{ scope.row.refundAmount }}</template>
              </el-table-column>
              <el-table-column label="净成交额" width="120">
                <template #default="scope"
                  ><strong>¥{{ scope.row.netAmount }}</strong></template
                >
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>
        <el-col :lg="8" :xs="24">
          <el-card class="definitions-card" shadow="never">
            <div class="section-heading"><h2>指标口径</h2></div>
            <dl>
              <dt>有效支付订单</dt>
              <dd>{{ dashboard.definitions.effectivePaidOrders }}</dd>
              <dt>净成交额</dt>
              <dd>{{ dashboard.definitions.transactionAmount }}</dd>
              <dt>今日订单</dt>
              <dd>{{ dashboard.definitions.todayOrders }}</dd>
            </dl>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.metric-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
  min-height: 142px;
  gap: 8px;
}
.metric-card span,
.metric-card small,
.section-heading p,
.base-metrics span {
  color: #64716b;
}
.metric-card strong {
  color: #24302b;
  font-size: 32px;
  line-height: 1.2;
}
.metric-primary {
  background: linear-gradient(135deg, #eff9f4, #fff);
  border-color: #bde3d2;
}
.metric-primary strong {
  color: #176b4d;
}
.metric-warning strong {
  color: #b96d12;
}
.metric-danger strong {
  color: #bf4a4a;
}
.base-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 1px;
  margin: 20px 0;
  overflow: hidden;
  border: 1px solid #e6ece8;
  border-radius: 8px;
  background: #e6ece8;
}
.base-metrics div {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 18px 20px;
  background: #fff;
}
.base-metrics strong {
  color: #176b4d;
  font-size: 24px;
}
.chart-card {
  margin-bottom: 20px;
}
.section-heading p {
  margin: 6px 0 0;
  font-size: 13px;
}
.trend-chart {
  width: 100%;
  height: 340px;
}
.dashboard-lower > .el-col {
  margin-bottom: 20px;
}
.definitions-card dl {
  margin: 0;
}
.definitions-card dt {
  margin-top: 16px;
  font-weight: 700;
}
.definitions-card dt:first-child {
  margin-top: 0;
}
.definitions-card dd {
  margin: 6px 0 0;
  color: #64716b;
  font-size: 13px;
  line-height: 1.65;
}
@media (width <= 900px) {
  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .base-metrics {
    grid-template-columns: 1fr;
  }
}
@media (width <= 620px) {
  .metric-grid {
    grid-template-columns: 1fr;
  }
  .page-heading {
    flex-direction: column;
  }
}
</style>
