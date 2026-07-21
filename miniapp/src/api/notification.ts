import type {
  SubscriptionDecision,
  SubscriptionReportResult,
  SubscriptionSettings,
} from '../types/domain';
import { request } from '../utils/request';

function authorization(token: string) {
  return { authorization: `Bearer ${token}` };
}

export function getSubscriptionSettings(token: string): Promise<SubscriptionSettings> {
  return request<SubscriptionSettings>('/notifications/subscriptions', {
    header: authorization(token),
  });
}

export function reportSubscriptionResults(
  token: string,
  input: {
    requestId: string;
    results: { templateId: string; decision: SubscriptionDecision }[];
  },
): Promise<SubscriptionReportResult> {
  return request<SubscriptionReportResult>('/notifications/subscriptions/report', {
    method: 'POST',
    header: authorization(token),
    data: input,
  });
}
