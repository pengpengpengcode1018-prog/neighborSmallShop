<script setup lang="ts">
import { onMounted, ref } from 'vue';

import { getApiErrorMessage, resolveApiAssetUrl } from '../../api/http';
import {
  getResidentUser,
  listResidentUsers,
  type ResidentUserStatus,
  type ResidentUserSummary,
} from '../../api/users';

const loading = ref(false);
const loadError = ref('');
const rows = ref<ResidentUserSummary[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 20;
const keyword = ref('');
const status = ref<ResidentUserStatus | ''>('');
const phoneBound = ref<boolean | ''>('');
const drawerOpen = ref(false);
const detailLoading = ref(false);
const detailError = ref('');
const detail = ref<ResidentUserSummary | null>(null);

function formatDateTime(value: string | null): string {
  if (!value) return '暂无';
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

function avatarSource(value: string | null): string {
  return resolveApiAssetUrl(value);
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listResidentUsers({
      page: page.value,
      pageSize,
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
      ...(status.value ? { status: status.value } : {}),
      ...(phoneBound.value === '' ? {} : { phoneBound: phoneBound.value }),
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
  keyword.value = '';
  status.value = '';
  phoneBound.value = '';
  search();
}

function changePage(nextPage: number): void {
  page.value = nextPage;
  void load();
}

async function openDetail(row: ResidentUserSummary): Promise<void> {
  drawerOpen.value = true;
  detailLoading.value = true;
  detailError.value = '';
  detail.value = null;
  try {
    detail.value = await getResidentUser(row.id);
  } catch (error) {
    detailError.value = getApiErrorMessage(error);
  } finally {
    detailLoading.value = false;
  }
}

onMounted(load);
</script>

<template>
  <div class="page user-page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">居民身份</p>
        <h1>居民用户</h1>
        <p>微信身份首次登录即进入列表；昵称头像由居民主动提供，手机号只展示脱敏结果。</p>
      </div>
      <el-tag type="info" effect="plain">只读 · 隐私脱敏</el-tag>
    </div>

    <el-card shadow="never">
      <div class="user-filters">
        <el-input
          v-model="keyword"
          placeholder="搜索昵称或完整用户 ID"
          clearable
          @keyup.enter="search"
        />
        <el-select v-model="phoneBound" placeholder="全部绑定状态" clearable>
          <el-option label="已绑定手机号" :value="true" />
          <el-option label="未绑定手机号" :value="false" />
        </el-select>
        <el-select v-model="status" placeholder="全部账号状态" clearable>
          <el-option label="正常" value="ACTIVE" />
          <el-option label="停用" value="DISABLED" />
        </el-select>
        <div class="filter-actions">
          <el-button type="primary" @click="search">查询</el-button>
          <el-button @click="reset">重置</el-button>
        </div>
      </div>

      <el-alert v-if="loadError" :title="loadError" type="error" :closable="false" show-icon>
        <template #default><el-button text @click="load">重新加载</el-button></template>
      </el-alert>

      <el-table v-loading="loading" :data="rows" empty-text="暂无符合条件的居民用户">
        <el-table-column label="居民" min-width="180">
          <template #default="scope">
            <div class="resident-cell">
              <el-avatar :size="40" :src="avatarSource(scope.row.avatarUrl)">
                {{ scope.row.displayName.slice(0, 1) }}
              </el-avatar>
              <span>{{ scope.row.displayName }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="用户 ID" min-width="210" show-overflow-tooltip />
        <el-table-column label="手机号" width="145">
          <template #default="scope">{{ scope.row.maskedPhone || '未绑定' }}</template>
        </el-table-column>
        <el-table-column label="绑定状态" width="110">
          <template #default="scope">
            <el-tag :type="scope.row.phoneBound ? 'success' : 'info'">
              {{ scope.row.phoneBound ? '已绑定' : '未绑定' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="当前小区" min-width="150">
          <template #default="scope">{{ scope.row.currentCommunity?.name || '未选择' }}</template>
        </el-table-column>
        <el-table-column label="账号状态" width="100">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'ACTIVE' ? 'success' : 'danger'">
              {{ scope.row.status === 'ACTIVE' ? '正常' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="注册时间" width="170">
          <template #default="scope">{{ formatDateTime(scope.row.registeredAt) }}</template>
        </el-table-column>
        <el-table-column label="最近登录" width="170">
          <template #default="scope">{{ formatDateTime(scope.row.lastLoginAt) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="90" fixed="right">
          <template #default="scope">
            <el-button type="primary" text @click="openDetail(scope.row)">详情</el-button>
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

    <el-drawer v-model="drawerOpen" title="居民用户详情" size="min(620px, 94vw)">
      <div v-loading="detailLoading" class="user-detail">
        <el-alert
          v-if="detailError"
          :title="detailError"
          type="error"
          :closable="false"
          show-icon
        />
        <template v-if="detail">
          <div class="detail-profile">
            <el-avatar :size="72" :src="avatarSource(detail.avatarUrl)">
              {{ detail.displayName.slice(0, 1) }}
            </el-avatar>
            <div>
              <strong>{{ detail.displayName }}</strong>
              <span>{{ detail.nickname ? '居民主动完善的公开资料' : '尚未完善昵称头像' }}</span>
            </div>
          </div>
          <el-descriptions :column="1" border>
            <el-descriptions-item label="显示名称">{{ detail.displayName }}</el-descriptions-item>
            <el-descriptions-item label="用户 ID">{{ detail.id }}</el-descriptions-item>
            <el-descriptions-item label="手机号">
              {{ detail.maskedPhone || '未绑定' }}
            </el-descriptions-item>
            <el-descriptions-item label="手机号状态">
              {{ detail.phoneBound ? '已绑定' : '未绑定' }}
            </el-descriptions-item>
            <el-descriptions-item label="当前小区">
              {{ detail.currentCommunity?.name || '未选择' }}
            </el-descriptions-item>
            <el-descriptions-item label="账号状态">
              {{ detail.status === 'ACTIVE' ? '正常' : '停用' }}
            </el-descriptions-item>
            <el-descriptions-item label="注册时间">
              {{ formatDateTime(detail.registeredAt) }}
            </el-descriptions-item>
            <el-descriptions-item label="最近登录">
              {{ formatDateTime(detail.lastLoginAt) }}
            </el-descriptions-item>
          </el-descriptions>
          <el-alert
            class="privacy-note"
            title="隐私字段已由服务端裁剪"
            description="本页不返回微信 OpenID、UnionID、完整手机号、收货地址或任何微信凭证。"
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
.user-filters {
  display: grid;
  grid-template-columns: minmax(260px, 2fr) repeat(2, minmax(170px, 1fr)) auto;
  gap: 12px;
  margin-bottom: 20px;
}
.filter-actions {
  display: flex;
  gap: 8px;
}
.user-detail {
  min-height: 180px;
}
.resident-cell,
.detail-profile {
  display: flex;
  align-items: center;
  gap: 12px;
}
.detail-profile {
  margin-bottom: 20px;
}
.detail-profile > div {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.detail-profile span {
  color: #77837d;
  font-size: 13px;
}
.privacy-note {
  margin-top: 20px;
}
@media (width <= 900px) {
  .user-filters {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (width <= 620px) {
  .user-filters {
    grid-template-columns: 1fr;
  }
}
</style>
