<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import {
  createCategory,
  createProduct,
  deleteCategory,
  deleteProduct,
  listCategories,
  listProducts,
  updateCategory,
  updateProduct,
  type CategoryInput,
  type Product,
  type ProductCategory,
  type ProductInput,
  type ProductStatus,
} from '../../api/catalog';
import { getApiErrorMessage } from '../../api/http';
import { listStores, type Store } from '../../api/stores';

const stores = ref<Store[]>([]);
const selectedStoreId = ref('');
const categories = ref<ProductCategory[]>([]);
const products = ref<Product[]>([]);
const loading = ref(false);
const total = ref(0);
const page = ref(1);
const pageSize = 10;
const keyword = ref('');
const categoryFilter = ref('');
const statusFilter = ref<ProductStatus | ''>('');

const categoryDialog = ref(false);
const categorySaving = ref(false);
const editingCategoryId = ref<string | null>(null);
const categoryFormRef = ref<FormInstance>();
const categoryForm = reactive<CategoryInput>({
  storeId: '',
  name: '',
  status: 'ENABLED',
  sortOrder: 0,
});

const productDialog = ref(false);
const productSaving = ref(false);
const editingProductId = ref<string | null>(null);
const productFormRef = ref<FormInstance>();
const emptyProduct = (): ProductInput => ({
  storeId: selectedStoreId.value,
  categoryId: categories.value[0]?.id ?? '',
  name: '',
  description: '',
  detail: '',
  price: '0.00',
  originalPrice: undefined,
  stock: 0,
  purchaseLimit: undefined,
  stockWarningThreshold: 10,
  isHot: false,
  status: 'OFF_SHELF',
  sortOrder: 0,
});
const productForm = reactive<ProductInput>(emptyProduct());
const moneyPattern = /^\d{1,8}\.\d{2}$/;
const categoryRules: FormRules<CategoryInput> = {
  name: [{ required: true, message: '请输入分类名称', trigger: 'blur' }],
};
const productRules: FormRules<ProductInput> = {
  categoryId: [{ required: true, message: '请选择商品分类' }],
  name: [{ required: true, message: '请输入商品名称', trigger: 'blur' }],
  price: [{ pattern: moneyPattern, message: '请输入两位小数价格，如 2.50', trigger: 'blur' }],
};

async function loadProducts(): Promise<void> {
  if (!selectedStoreId.value) return;
  loading.value = true;
  try {
    const result = await listProducts({
      storeId: selectedStoreId.value,
      page: page.value,
      pageSize,
      ...(keyword.value.trim() ? { keyword: keyword.value.trim() } : {}),
      ...(categoryFilter.value ? { categoryId: categoryFilter.value } : {}),
      ...(statusFilter.value ? { status: statusFilter.value } : {}),
    });
    products.value = result.list;
    total.value = result.total;
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    loading.value = false;
  }
}

async function loadCatalog(): Promise<void> {
  if (!selectedStoreId.value) return;
  categories.value = await listCategories(selectedStoreId.value);
  await loadProducts();
}

async function initialize(): Promise<void> {
  try {
    const result = await listStores({ page: 1, pageSize: 100 });
    stores.value = result.list;
    selectedStoreId.value = result.list[0]?.id ?? '';
    await loadCatalog();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  }
}

function changeStore(): void {
  page.value = 1;
  categoryFilter.value = '';
  void loadCatalog();
}

function openCategory(item?: ProductCategory): void {
  editingCategoryId.value = item?.id ?? null;
  Object.assign(categoryForm, {
    storeId: selectedStoreId.value,
    name: item?.name ?? '',
    status: item?.status ?? 'ENABLED',
    sortOrder: item?.sortOrder ?? 0,
  });
  categoryDialog.value = true;
}

async function saveCategory(): Promise<void> {
  if (!(await categoryFormRef.value?.validate().catch(() => false))) return;
  categorySaving.value = true;
  try {
    if (editingCategoryId.value) await updateCategory(editingCategoryId.value, { ...categoryForm });
    else await createCategory({ ...categoryForm });
    ElMessage.success(editingCategoryId.value ? '分类已更新' : '分类已创建');
    categoryDialog.value = false;
    await loadCatalog();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    categorySaving.value = false;
  }
}

async function removeCategory(item: ProductCategory): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除分类“${item.name}”吗？`, '删除确认', { type: 'warning' });
    await deleteCategory(item.id);
    ElMessage.success('分类已删除');
    await loadCatalog();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(getApiErrorMessage(error));
  }
}

function openProduct(item?: Product): void {
  editingProductId.value = item?.id ?? null;
  Object.assign(
    productForm,
    item
      ? {
          storeId: item.storeId,
          categoryId: item.categoryId,
          name: item.name,
          description: item.description ?? '',
          detail: item.detail ?? '',
          price: item.price,
          originalPrice: item.originalPrice ?? undefined,
          stock: item.stock,
          purchaseLimit: item.purchaseLimit ?? undefined,
          stockWarningThreshold: item.stockWarningThreshold,
          isHot: item.isHot,
          status: item.status,
          sortOrder: item.sortOrder,
        }
      : emptyProduct(),
  );
  productDialog.value = true;
}

async function saveProduct(): Promise<void> {
  if (!(await productFormRef.value?.validate().catch(() => false))) return;
  productSaving.value = true;
  try {
    const payload = {
      ...productForm,
      ...(productForm.originalPrice ? {} : { originalPrice: undefined }),
      ...(productForm.purchaseLimit ? {} : { purchaseLimit: undefined }),
    };
    if (editingProductId.value) await updateProduct(editingProductId.value, payload);
    else await createProduct(payload);
    ElMessage.success(editingProductId.value ? '商品已更新' : '商品已创建');
    productDialog.value = false;
    await loadProducts();
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    productSaving.value = false;
  }
}

async function removeProduct(item: Product): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除商品“${item.name}”吗？`, '删除确认', { type: 'warning' });
    await deleteProduct(item.id);
    ElMessage.success('商品已删除');
    await loadProducts();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(getApiErrorMessage(error));
  }
}

onMounted(initialize);
</script>

<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">商品目录</p>
        <h1>分类与商品</h1>
        <p>维护单规格商品、价格、库存和上下架状态。</p>
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
    <el-empty v-if="!selectedStoreId" description="请先创建店铺" />
    <template v-else>
      <el-card shadow="never" class="catalog-section">
        <div class="section-heading">
          <h2>商品分类</h2>
          <el-button type="primary" plain @click="openCategory()">新建分类</el-button>
        </div>
        <el-table :data="categories" empty-text="暂无分类">
          <el-table-column prop="name" label="分类名称" /><el-table-column
            prop="sortOrder"
            label="排序"
            width="80"
          />
          <el-table-column label="状态" width="90"
            ><template #default="scope"
              ><el-tag :type="scope.row.status === 'ENABLED' ? 'success' : 'info'">{{
                scope.row.status === 'ENABLED' ? '启用' : '停用'
              }}</el-tag></template
            ></el-table-column
          >
          <el-table-column label="操作" width="150"
            ><template #default="scope"
              ><el-button text type="primary" @click="openCategory(scope.row)">编辑</el-button
              ><el-button text type="danger" @click="removeCategory(scope.row)"
                >删除</el-button
              ></template
            ></el-table-column
          >
        </el-table>
      </el-card>
      <el-card shadow="never" class="catalog-section">
        <div class="section-heading">
          <h2>商品列表</h2>
          <el-button type="primary" :disabled="!categories.length" @click="openProduct()"
            >新建商品</el-button
          >
        </div>
        <div class="table-toolbar">
          <el-input
            v-model="keyword"
            placeholder="搜索商品名称"
            clearable
            class="search-input"
            @keyup.enter="loadProducts"
          />
          <el-select v-model="categoryFilter" placeholder="全部分类" clearable class="status-select"
            ><el-option
              v-for="item in categories"
              :key="item.id"
              :label="item.name"
              :value="item.id"
          /></el-select>
          <el-select v-model="statusFilter" placeholder="全部状态" clearable class="status-select"
            ><el-option label="在售" value="ON_SALE" /><el-option
              label="售罄"
              value="SOLD_OUT" /><el-option label="下架" value="OFF_SHELF"
          /></el-select>
          <el-button @click="loadProducts">查询</el-button>
        </div>
        <el-table v-loading="loading" :data="products" empty-text="暂无商品">
          <el-table-column prop="name" label="商品名称" min-width="150" /><el-table-column
            prop="category.name"
            label="分类"
            width="110"
          />
          <el-table-column label="价格" width="100"
            ><template #default="scope">¥{{ scope.row.price }}</template></el-table-column
          ><el-table-column prop="stock" label="库存" width="80" />
          <el-table-column label="状态" width="90"
            ><template #default="scope"
              ><el-tag :type="scope.row.status === 'ON_SALE' ? 'success' : 'info'">{{
                scope.row.status === 'ON_SALE'
                  ? '在售'
                  : scope.row.status === 'SOLD_OUT'
                    ? '售罄'
                    : '下架'
              }}</el-tag></template
            ></el-table-column
          >
          <el-table-column label="操作" width="150"
            ><template #default="scope"
              ><el-button text type="primary" @click="openProduct(scope.row)">编辑</el-button
              ><el-button text type="danger" @click="removeProduct(scope.row)"
                >删除</el-button
              ></template
            ></el-table-column
          >
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
              loadProducts();
            }
          "
        />
      </el-card>
    </template>

    <el-dialog
      v-model="categoryDialog"
      :title="editingCategoryId ? '编辑分类' : '新建分类'"
      width="480px"
      destroy-on-close
    >
      <el-form
        ref="categoryFormRef"
        :model="categoryForm"
        :rules="categoryRules"
        label-position="top"
        ><el-form-item label="分类名称" prop="name"
          ><el-input v-model="categoryForm.name" /></el-form-item
        ><el-form-item label="状态"
          ><el-select v-model="categoryForm.status" class="full-width"
            ><el-option label="启用" value="ENABLED" /><el-option
              label="停用"
              value="DISABLED" /></el-select></el-form-item
        ><el-form-item label="排序值"
          ><el-input-number v-model="categoryForm.sortOrder" :min="0" :max="9999" /></el-form-item
      ></el-form>
      <template #footer
        ><el-button @click="categoryDialog = false">取消</el-button
        ><el-button type="primary" :loading="categorySaving" @click="saveCategory"
          >保存</el-button
        ></template
      >
    </el-dialog>
    <el-dialog
      v-model="productDialog"
      :title="editingProductId ? '编辑商品' : '新建商品'"
      width="680px"
      destroy-on-close
    >
      <el-form
        :key="editingProductId ?? 'new'"
        ref="productFormRef"
        :model="productForm"
        :rules="productRules"
        label-position="top"
      >
        <el-row :gutter="16"
          ><el-col :span="12"
            ><el-form-item label="商品名称" prop="name"
              ><el-input v-model="productForm.name" /></el-form-item></el-col
          ><el-col :span="12"
            ><el-form-item label="分类" prop="categoryId"
              ><el-select v-model="productForm.categoryId" class="full-width"
                ><el-option
                  v-for="item in categories"
                  :key="item.id"
                  :label="item.name"
                  :value="item.id" /></el-select></el-form-item></el-col
        ></el-row>
        <el-row :gutter="16"
          ><el-col :span="12"
            ><el-form-item label="销售价" prop="price"
              ><el-input v-model="productForm.price" /></el-form-item></el-col
          ><el-col :span="12"
            ><el-form-item label="原价"
              ><el-input
                v-model="productForm.originalPrice"
                placeholder="可选，如 3.00" /></el-form-item></el-col
        ></el-row>
        <el-row :gutter="16"
          ><el-col :span="8"
            ><el-form-item label="库存"
              ><el-input-number v-model="productForm.stock" :min="0" /></el-form-item></el-col
          ><el-col :span="8"
            ><el-form-item label="库存预警"
              ><el-input-number
                v-model="productForm.stockWarningThreshold"
                :min="0" /></el-form-item></el-col
          ><el-col :span="8"
            ><el-form-item label="限购"
              ><el-input-number
                v-model="productForm.purchaseLimit"
                :min="1"
                placeholder="不限" /></el-form-item></el-col
        ></el-row>
        <el-row :gutter="16"
          ><el-col :span="12"
            ><el-form-item label="状态"
              ><el-select v-model="productForm.status" class="full-width"
                ><el-option label="在售" value="ON_SALE" /><el-option
                  label="售罄"
                  value="SOLD_OUT" /><el-option
                  label="下架"
                  value="OFF_SHELF" /></el-select></el-form-item></el-col
          ><el-col :span="12"
            ><el-form-item label="排序值"
              ><el-input-number
                v-model="productForm.sortOrder"
                :min="0"
                :max="9999" /></el-form-item></el-col
        ></el-row>
        <el-form-item><el-checkbox v-model="productForm.isHot">热销商品</el-checkbox></el-form-item
        ><el-form-item label="商品简介"
          ><el-input v-model="productForm.description" type="textarea" :rows="2" /></el-form-item
        ><el-form-item label="商品详情"
          ><el-input v-model="productForm.detail" type="textarea" :rows="3"
        /></el-form-item>
      </el-form>
      <template #footer
        ><el-button @click="productDialog = false">取消</el-button
        ><el-button type="primary" :loading="productSaving" @click="saveProduct"
          >保存</el-button
        ></template
      >
    </el-dialog>
  </div>
</template>
