<script setup lang="ts">
const modules = [
  { title: '配送小区', description: '维护平台可服务的小区范围' },
  { title: '店铺与商品', description: '建立店铺、分类和单规格商品' },
  { title: '订单与退款', description: '后续计划接入状态机和微信交易' },
];
</script>

<template>
  <div class="page">
    <div class="page-heading">
      <div>
        <p class="eyebrow">工程基线</p>
        <h1>管理后台已完成初始化</h1>
        <p>当前仅提供可构建的导航与视觉基线，业务数据将在第一阶段计划中逐项接入。</p>
      </div>
      <el-tag type="warning" effect="plain">业务功能未开始</el-tag>
    </div>

    <el-alert
      title="不要把此页面当作经营数据看板"
      description="管理员登录、统计接口和 CRUD 尚未实现；进度以仓库 active plan 为准。"
      type="info"
      show-icon
      :closable="false"
    />

    <el-row :gutter="20" class="module-grid">
      <el-col v-for="module in modules" :key="module.title" :md="8" :sm="24">
        <el-card shadow="never">
          <h2>{{ module.title }}</h2>
          <p>{{ module.description }}</p>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>
