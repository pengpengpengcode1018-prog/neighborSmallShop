import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

import type { CommunitySummary } from '../types/domain';

export const useCommunityStore = defineStore('community', () => {
  const currentCommunity = ref<CommunitySummary | null>(null);
  const currentCommunityName = computed(() => currentCommunity.value?.name ?? '请先选择配送小区');

  function selectCommunity(community: CommunitySummary): void {
    currentCommunity.value = community;
  }

  return { currentCommunity, currentCommunityName, selectCommunity };
});
