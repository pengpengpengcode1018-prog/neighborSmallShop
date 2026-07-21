import { defineStore } from 'pinia';
import { ref } from 'vue';

import { getSubscriptionSettings, reportSubscriptionResults } from '../api/notification';
import type {
  SubscriptionConsent,
  SubscriptionDecision,
  SubscriptionSettings,
} from '../types/domain';
import { ApiRequestError } from '../utils/request';

function messageFor(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return '通知设置加载失败，请稍后重试';
  if (error.code === 'SUBSCRIPTION_TEMPLATE_INVALID') return '通知模板已更新，请刷新后重试';
  if (error.code === 'SUBSCRIPTION_REPORT_CONFLICT') return '本次授权结果已记录，请刷新查看';
  if (error.code === 'NETWORK_ERROR') return '网络连接失败，请稍后重试';
  return error.message;
}

function requestId(): string {
  return `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export const useNotificationStore = defineStore('notification', () => {
  const settings = ref<SubscriptionSettings | null>(null);
  const loading = ref(false);
  const reporting = ref(false);
  const error = ref<string | null>(null);

  async function load(token: string): Promise<SubscriptionSettings | null> {
    if (loading.value) return settings.value;
    loading.value = true;
    error.value = null;
    try {
      settings.value = await getSubscriptionSettings(token);
      return settings.value;
    } catch (caught) {
      error.value = messageFor(caught);
      return null;
    } finally {
      loading.value = false;
    }
  }

  async function report(
    token: string,
    results: { templateId: string; decision: SubscriptionDecision }[],
  ): Promise<SubscriptionConsent[] | null> {
    if (reporting.value || results.length === 0) return null;
    reporting.value = true;
    error.value = null;
    try {
      const recorded = await reportSubscriptionResults(token, {
        requestId: requestId(),
        results,
      });
      if (settings.value) settings.value.consents = recorded.consents;
      return recorded.consents;
    } catch (caught) {
      error.value = messageFor(caught);
      return null;
    } finally {
      reporting.value = false;
    }
  }

  return { settings, loading, reporting, error, load, report };
});
