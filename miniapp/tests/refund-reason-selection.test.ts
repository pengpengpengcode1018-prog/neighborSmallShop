import { describe, expect, it, vi } from 'vitest';

import {
  primaryRefundReasonItems,
  refundReasons,
  secondaryRefundReasonItems,
  selectRefundReason,
} from '../src/utils/refund-reason-selection';

function selected(...tapIndexes: number[]) {
  const queue = [...tapIndexes];
  return vi.fn((options: { success: (result: { tapIndex: number }) => void }) => {
    options.success({ tapIndex: queue.shift() ?? 0 });
  });
}

describe('refund reason selection', () => {
  it('keeps each WeChat action sheet within the six-item platform limit', () => {
    expect(primaryRefundReasonItems).toHaveLength(6);
    expect(secondaryRefundReasonItems.length).toBeGreaterThan(0);
    expect(secondaryRefundReasonItems.length).toBeLessThanOrEqual(6);
    expect(new Set(refundReasons.map((item) => item.value)).size).toBe(refundReasons.length);
  });

  it('returns a primary reason without opening a second menu', async () => {
    const showActionSheet = selected(2);

    await expect(selectRefundReason(showActionSheet)).resolves.toEqual({
      option: { value: 'WRONG_ADDRESS', label: '地址填写错误' },
      error: null,
    });
    expect(showActionSheet).toHaveBeenCalledTimes(1);
  });

  it('opens a second menu for the remaining reasons', async () => {
    const showActionSheet = selected(5, 1);

    await expect(selectRefundReason(showActionSheet)).resolves.toEqual({
      option: { value: 'OTHER', label: '其他' },
      error: null,
    });
    expect(showActionSheet).toHaveBeenCalledTimes(2);
  });

  it('keeps an intentional menu cancellation silent', async () => {
    const showActionSheet = vi.fn((options: { fail: (result: { errMsg?: string }) => void }) =>
      options.fail({ errMsg: 'showActionSheet:fail cancel' }),
    );

    await expect(selectRefundReason(showActionSheet)).resolves.toEqual({
      option: null,
      error: null,
    });
  });

  it('returns a visible error for a real action-sheet failure', async () => {
    const showActionSheet = vi.fn((options: { fail: (result: { errMsg?: string }) => void }) =>
      options.fail({ errMsg: 'showActionSheet:fail invalid itemList' }),
    );

    await expect(selectRefundReason(showActionSheet)).resolves.toEqual({
      option: null,
      error: '无法打开退款原因，请稍后重试',
    });
  });
});
