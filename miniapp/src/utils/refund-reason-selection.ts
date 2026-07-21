import type { RefundReason } from '../types/domain';

export interface RefundReasonOption {
  value: RefundReason;
  label: string;
}

export interface RefundReasonSelection {
  option: RefundReasonOption | null;
  error: string | null;
}

interface ActionSheetOptions {
  itemList: string[];
  success: (result: { tapIndex: number }) => void;
  fail: (result: { errMsg?: string }) => void;
}

type ShowActionSheet = (options: ActionSheetOptions) => void;

type ActionSheetResult =
  { kind: 'selected'; tapIndex: number } | { kind: 'cancelled' } | { kind: 'failed' };

const MAX_WECHAT_ACTION_SHEET_ITEMS = 6;
const MORE_REASONS_LABEL = '更多退款原因';

export const refundReasons: RefundReasonOption[] = [
  { value: 'NO_LONGER_NEEDED', label: '不想要了' },
  { value: 'WRONG_PRODUCT', label: '商品选错' },
  { value: 'WRONG_ADDRESS', label: '地址填写错误' },
  { value: 'UNSUITABLE_DELIVERY_TIME', label: '配送时间不合适' },
  { value: 'DUPLICATE_ORDER', label: '重复下单' },
  { value: 'WAIT_TOO_LONG', label: '店铺等待时间过长' },
  { value: 'OTHER', label: '其他' },
];

export const primaryRefundReasonItems = [
  ...refundReasons.slice(0, MAX_WECHAT_ACTION_SHEET_ITEMS - 1).map((item) => item.label),
  MORE_REASONS_LABEL,
];

export const secondaryRefundReasonItems = refundReasons
  .slice(MAX_WECHAT_ACTION_SHEET_ITEMS - 1)
  .map((item) => item.label);

function showReasonActionSheet(
  showActionSheet: ShowActionSheet,
  itemList: string[],
): Promise<ActionSheetResult> {
  return new Promise((resolve) => {
    showActionSheet({
      itemList,
      success: (result) => resolve({ kind: 'selected', tapIndex: result.tapIndex }),
      fail: (result) => {
        const errMsg = result.errMsg ?? '';
        resolve(
          errMsg.toLowerCase().includes('cancel') ? { kind: 'cancelled' } : { kind: 'failed' },
        );
      },
    });
  });
}

export async function selectRefundReason(
  showActionSheet: ShowActionSheet,
): Promise<RefundReasonSelection> {
  const primaryResult = await showReasonActionSheet(showActionSheet, primaryRefundReasonItems);
  if (primaryResult.kind === 'cancelled') return { option: null, error: null };
  if (primaryResult.kind === 'failed') {
    return { option: null, error: '无法打开退款原因，请稍后重试' };
  }

  const moreReasonsIndex = primaryRefundReasonItems.length - 1;
  if (primaryResult.tapIndex !== moreReasonsIndex) {
    return { option: refundReasons[primaryResult.tapIndex] ?? null, error: null };
  }

  const secondaryResult = await showReasonActionSheet(showActionSheet, secondaryRefundReasonItems);
  if (secondaryResult.kind === 'cancelled') return { option: null, error: null };
  if (secondaryResult.kind === 'failed') {
    return { option: null, error: '无法打开退款原因，请稍后重试' };
  }

  return {
    option: refundReasons[moreReasonsIndex + secondaryResult.tapIndex] ?? null,
    error: null,
  };
}
