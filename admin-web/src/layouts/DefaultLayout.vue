<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { getAlertSummary, type AdminAlertSummary } from '../api/alerts';
import { useSessionStore } from '../stores/session';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();

const navigation = [
  { path: '/dashboard', label: '数据看板' },
  { path: '/communities', label: '配送小区' },
  { path: '/stores', label: '店铺管理' },
  { path: '/products', label: '商品管理' },
  { path: '/delivery', label: '配送时间' },
  { path: '/orders', label: '订单管理' },
  { path: '/users', label: '居民用户' },
  { path: '/refunds', label: '退款审核' },
  { path: '/alerts', label: '提醒中心' },
  { path: '/operation-logs', label: '操作日志' },
];

const alertSummary = ref<AdminAlertSummary | null>(null);
const soundEnabled = ref(false);
let lastSoundEventId: string | null = null;
let lastSoundEventAt = 0;
let timer: ReturnType<typeof setInterval> | null = null;
let audioContext: AudioContext | null = null;

function playAlert(type: 'NEW_PAID_ORDER' | 'UNACCEPTED_ORDER'): void {
  if (!soundEnabled.value) return;
  audioContext ??= new AudioContext();
  const context = audioContext;
  if (context.state === 'suspended') void context.resume();
  const frequencies = type === 'NEW_PAID_ORDER' ? [880, 1100] : [620, 620, 520];
  frequencies.forEach((frequency, index) => {
    const start = context.currentTime + index * 0.16;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.13, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.13);
  });
}

async function refreshAlertSummary(): Promise<void> {
  if (!session.isAuthenticated) return;
  try {
    const next = await getAlertSummary();
    const event = next.latestSoundEvent;
    const eventTime = event ? Date.parse(event.occurredAt) : 0;
    if (
      alertSummary.value !== null &&
      event &&
      event.id !== lastSoundEventId &&
      eventTime > lastSoundEventAt
    ) {
      playAlert(event.type);
    }
    lastSoundEventId = event?.id ?? lastSoundEventId;
    lastSoundEventAt = Math.max(lastSoundEventAt, eventTime);
    alertSummary.value = next;
  } catch {
    // Polling is best-effort. The reminder page exposes actionable load errors.
  }
}

async function enableSound(): Promise<void> {
  audioContext ??= new AudioContext();
  await audioContext.resume();
  soundEnabled.value = true;
  ElMessage.success('提醒音已开启，仅新单与超时未接单会响铃');
}

function disableSound(): void {
  soundEnabled.value = false;
  ElMessage.info('提醒音已关闭');
}

async function logout(): Promise<void> {
  session.clear();
  await router.replace('/login');
}

onMounted(() => {
  void refreshAlertSummary();
  timer = setInterval(() => void refreshAlertSummary(), 15_000);
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
  void audioContext?.close();
});
</script>

<template>
  <el-container class="app-shell">
    <el-aside width="220px" class="app-sidebar">
      <div class="brand">近邻小铺子</div>
      <el-menu :default-active="route.path" router>
        <el-menu-item v-for="item in navigation" :key="item.path" :index="item.path">
          <el-badge
            v-if="item.path === '/alerts' && alertSummary?.unread"
            :value="alertSummary.unread"
            :max="99"
          >
            {{ item.label }}
          </el-badge>
          <template v-else>{{ item.label }}</template>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="app-header">
        <span>平台管理后台</span>
        <div class="header-account">
          <el-button v-if="!soundEnabled" text @click="enableSound">开启提醒音</el-button>
          <el-button v-else text @click="disableSound">提醒音已开启</el-button>
          <el-badge :value="alertSummary?.unread ?? 0" :hidden="!alertSummary?.unread">
            <el-button @click="router.push('/alerts')">提醒</el-button>
          </el-badge>
          <span>{{ session.admin?.displayName }}</span>
          <el-button text @click="logout">退出登录</el-button>
        </div>
      </el-header>
      <el-main>
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>
