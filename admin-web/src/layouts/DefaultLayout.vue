<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  activePath: string;
  content: Component;
}>();

const navigation = [
  { path: '/dashboard', label: '数据看板' },
  { path: '/communities', label: '配送小区' },
  { path: '/stores', label: '店铺管理' },
  { path: '/products', label: '商品管理' },
  { path: '/orders', label: '订单管理' },
];
</script>

<template>
  <el-container class="app-shell">
    <el-aside width="220px" class="app-sidebar">
      <div class="brand">近邻小铺子</div>
      <el-menu :default-active="activePath" router>
        <el-menu-item v-for="item in navigation" :key="item.path" :index="item.path">
          {{ item.label }}
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-header">平台管理后台</el-header>
      <el-main>
        <component :is="content" />
      </el-main>
    </el-container>
  </el-container>
</template>
