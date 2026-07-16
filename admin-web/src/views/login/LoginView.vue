<script setup lang="ts">
import { reactive } from 'vue';

const form = reactive({
  username: '',
  password: '',
});
</script>

<template>
  <main class="login-page">
    <el-card class="login-card" shadow="never">
      <p class="eyebrow">近邻小铺子</p>
      <h1>平台管理后台</h1>
      <el-alert
        title="管理员登录尚未实现"
        description="此表单是布局基线；服务端鉴权将在下一个 execution plan 中实现。"
        type="warning"
        :closable="false"
        show-icon
      />
      <el-form :model="form" label-position="top" disabled>
        <el-form-item label="账号">
          <el-input v-model="form.username" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" autocomplete="current-password" />
        </el-form-item>
        <el-button type="primary" class="full-width">登录</el-button>
      </el-form>
    </el-card>
  </main>
</template>
