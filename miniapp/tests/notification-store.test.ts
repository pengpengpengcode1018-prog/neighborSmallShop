import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { SubscriptionSettings } from '../src/types/domain';
import { ApiRequestError } from '../src/utils/request';

const api = vi.hoisted(() => ({
  getSubscriptionSettings: vi.fn(),
  reportSubscriptionResults: vi.fn(),
}));

vi.mock('../src/api/notification', () => api);

import { useNotificationStore } from '../src/stores/notification';

const settings: SubscriptionSettings = {
  authorizationMode: 'ONE_TIME',
  maxTemplatesPerRequest: 5,
  groups: [
    {
      key: 'ORDER_PROGRESS',
      title: '订单进度通知',
      templates: [
        {
          templateId: 'template-order-paid',
          scenes: ['ORDER_PAID'],
          label: '支付成功',
        },
      ],
    },
  ],
  consents: [],
};

describe('miniapp notification subscription store', () => {
  beforeEach(() => {
    api.getSubscriptionSettings.mockReset();
    api.reportSubscriptionResults.mockReset();
    setActivePinia(createPinia());
  });

  it('loads the one-time authorization mode and configured template groups', async () => {
    api.getSubscriptionSettings.mockResolvedValueOnce(structuredClone(settings));
    const store = useNotificationStore();

    await expect(store.load('resident-token')).resolves.toEqual(settings);
    expect(api.getSubscriptionSettings).toHaveBeenCalledWith('resident-token');
    expect(store.settings?.authorizationMode).toBe('ONE_TIME');
  });

  it('records the explicit WeChat result and updates the reported available count', async () => {
    api.getSubscriptionSettings.mockResolvedValueOnce(structuredClone(settings));
    api.reportSubscriptionResults.mockResolvedValueOnce({
      idempotentReplay: false,
      consents: [
        {
          templateId: 'template-order-paid',
          decision: 'ACCEPT',
          reportedAvailableCount: 1,
          lastReportedAt: '2026-07-17T09:00:00.000Z',
        },
      ],
    });
    const store = useNotificationStore();
    await store.load('resident-token');

    const result = await store.report('resident-token', [
      { templateId: 'template-order-paid', decision: 'accept' },
    ]);

    expect(result?.[0]).toMatchObject({ decision: 'ACCEPT', reportedAvailableCount: 1 });
    expect(store.settings?.consents).toEqual(result);
    expect(api.reportSubscriptionResults).toHaveBeenCalledWith(
      'resident-token',
      expect.objectContaining({
        requestId: expect.stringMatching(/^sub_/),
        results: [{ templateId: 'template-order-paid', decision: 'accept' }],
      }),
    );
  });

  it('surfaces stale-template errors without changing the previous settings', async () => {
    api.getSubscriptionSettings.mockResolvedValueOnce(structuredClone(settings));
    api.reportSubscriptionResults.mockRejectedValueOnce(
      new ApiRequestError('SUBSCRIPTION_TEMPLATE_INVALID', 'invalid template'),
    );
    const store = useNotificationStore();
    await store.load('resident-token');

    await expect(
      store.report('resident-token', [{ templateId: 'template-order-paid', decision: 'accept' }]),
    ).resolves.toBeNull();
    expect(store.error).toBe('通知模板已更新，请刷新后重试');
    expect(store.settings).toEqual(settings);
  });
});
