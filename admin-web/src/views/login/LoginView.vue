<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getApiErrorMessage } from '../../api/http';
import { useSessionStore } from '../../stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const formRef = ref<FormInstance>();
const submitting = ref(false);

const form = reactive({
  username: '',
  password: '',
});

const rules: FormRules<typeof form> = {
  username: [{ required: true, message: '请输入管理员账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
};

async function submit(): Promise<void> {
  if (!(await formRef.value?.validate().catch(() => false))) return;
  submitting.value = true;
  try {
    await session.login(form.username.trim(), form.password);
    ElMessage.success('登录成功');
    const redirect = typeof route.query.redirect === 'string' ? route.query.redirect : '/dashboard';
    await router.replace(
      redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/dashboard',
    );
  } catch (error) {
    ElMessage.error(getApiErrorMessage(error));
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <main class="login-page">
    <el-card class="login-card" shadow="never">
      <p class="eyebrow">近邻小铺子</p>
      <h1>平台管理后台</h1>
      <p class="login-hint">使用平台管理员账号登录后维护小区、店铺和商品。</p>
      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @submit.prevent="submit"
      >
        <el-form-item label="账号" prop="username">
          <el-input v-model="form.username" autocomplete="username" autofocus />
        </el-form-item>
        <el-form-item label="密码" prop="password">
          <el-input
            v-model="form.password"
            type="password"
            autocomplete="current-password"
            show-password
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button type="primary" native-type="submit" class="full-width" :loading="submitting">
          登录
        </el-button>
      </el-form>
    </el-card>
  </main>
</template>
