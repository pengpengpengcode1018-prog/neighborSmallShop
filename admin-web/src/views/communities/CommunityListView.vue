<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import {
  createCommunity,
  deleteCommunity,
  listCommunities,
  updateCommunity,
  updateCommunityStatus,
  type Community,
  type CommunityInput,
  type CommunityStatus,
} from '../../api/communities';
import { getApiErrorMessage } from '../../api/http';

const loading = ref(false);
const loadError = ref('');
const rows = ref<Community[]>([]);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const keyword = ref('');
const status = ref<CommunityStatus | ''>('');
const dialogVisible = ref(false);
const saving = ref(false);
const editingId = ref<string | null>(null);
const formRef = ref<FormInstance>();
const form = reactive<CommunityInput>({
  name: '',
  city: '',
  district: '',
  detailedAddress: '',
  status: 'ENABLED',
  sortOrder: 0,
});
const rules: FormRules<CommunityInput> = {
  name: [{ required: true, message: '请输入小区名称', trigger: 'blur' }],
  city: [{ required: true, message: '请输入城市', trigger: 'blur' }],
  district: [{ required: true, message: '请输入区县', trigger: 'blur' }],
  detailedAddress: [{ required: true, message: '请输入详细地址', trigger: 'blur' }],
};

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = '';
  try {
    const result = await listCommunities({
      page: page.value,
      pageSize,
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
      ...(status.value ? { status: status.value } : {}),
    });
    rows.value = result.list;
    total.value = result.total;
  } catch (error) {
    loadError.value = getApiErrorMessage(error);
  } finally {
    loading.value = false;
  }
}

function resetForm(): void {
  Object.assign(form, {
    name: '',
    city: '',
    district: '',
    detailedAddress: '',
    status: 'ENABLED',
    sortOrder: 0,
  });
  formRef.value?.clearValidate();
}

function openCreate(): void {
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row: Community): void {
  editingId.value = row.id;
  Object.assign(form, {
    name: row.name,
    city: row.city,
    district: row.district,
    detailedAddress: row.detailedAddress,
    status: row.status,
    sortOrder: row.sortOrder,
  });
  dialogVisible.value = true;
}

async function save(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  saving.value = true;
  try {
    if (editingId.value) await updateCommunity(editingId.value, { ...form });
    else await createCommunity({ ...form });
    ElMessage.success(editingId.value ? '小区已更新' : '小区已创建');
    dialogVisible.value = false;
    page.value = 1;
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function toggleStatus(row: Community): Promise<void> {
  const nextStatus: CommunityStatus = row.status === 'ENABLED' ? 'DISABLED' : 'ENABLED';
  try {
    await updateCommunityStatus(row.id, nextStatus);
    ElMessage.success(nextStatus === 'ENABLED' ? '小区已启用' : '小区已停用');
    await load();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
}

async function remove(row: Community): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除“小区 ${row.name}”吗？删除后列表中不再显示。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '确认删除',
      cancelButtonText: '取消',
    });
    await deleteCommunity(row.id);
    ElMessage.success('小区已删除');
    if (rows.value.length === 1 && page.value > 1) page.value -= 1;
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(getApiErrorMessage(error));
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

onMounted(load);
</script>

<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">基础数据</p>
        <h1>配送小区</h1>
        <p>维护平台当前可服务的小区，停用或删除后居民端不可选择。</p>
      </div>
      <el-button type="primary" @click="openCreate">新建小区</el-button>
    </div>

    <el-card shadow="never">
      <div class="table-toolbar">
        <el-input
          v-model="keyword"
          placeholder="搜索小区、城市或区县"
          clearable
          class="search-input"
          @keyup.enter="search"
        />
        <el-select v-model="status" placeholder="全部状态" clearable class="status-select">
          <el-option label="启用" value="ENABLED" />
          <el-option label="停用" value="DISABLED" />
        </el-select>
        <el-button @click="search">查询</el-button>
      </div>

      <el-alert v-if="loadError" :title="loadError" type="error" show-icon :closable="false">
        <template #default><el-button text @click="load">重新加载</el-button></template>
      </el-alert>

      <el-table v-loading="loading" :data="rows" empty-text="暂无配送小区">
        <el-table-column prop="name" label="小区名称" min-width="150" />
        <el-table-column label="所在区域" min-width="180">
          <template #default="scope">{{ scope.row.city }} · {{ scope.row.district }}</template>
        </el-table-column>
        <el-table-column prop="detailedAddress" label="详细地址" min-width="220" />
        <el-table-column prop="sortOrder" label="排序" width="80" />
        <el-table-column label="状态" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === 'ENABLED' ? 'success' : 'info'">
              {{ scope.row.status === 'ENABLED' ? '启用' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="scope">
            <el-button text type="primary" @click="openEdit(scope.row)">编辑</el-button>
            <el-button text @click="toggleStatus(scope.row)">
              {{ scope.row.status === 'ENABLED' ? '停用' : '启用' }}
            </el-button>
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
        @current-change="changePage"
      />
    </el-card>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑小区' : '新建小区'" width="560px">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
        <el-form-item label="小区名称" prop="name"><el-input v-model="form.name" /></el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="城市" prop="city"><el-input v-model="form.city" /></el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="区县" prop="district"
              ><el-input v-model="form.district"
            /></el-form-item>
          </el-col>
        </el-row>
        <el-form-item label="详细地址" prop="detailedAddress">
          <el-input v-model="form.detailedAddress" />
        </el-form-item>
        <el-row :gutter="16">
          <el-col :span="12">
            <el-form-item label="状态">
              <el-select v-model="form.status" class="full-width">
                <el-option label="启用" value="ENABLED" />
                <el-option label="停用" value="DISABLED" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="排序值">
              <el-input-number v-model="form.sortOrder" :min="0" :max="9999" class="full-width" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>
