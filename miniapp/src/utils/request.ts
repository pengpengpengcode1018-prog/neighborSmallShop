import type { ApiEnvelope } from '../types/api';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';

export function resolveApiAssetUrl(value: string | null | undefined): string {
  if (!value) return '';
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  if (!value.startsWith('/')) return value;

  const apiOrigin = baseUrl.match(/^(https?:\/\/[^/]+)/i)?.[1];
  return apiOrigin ? `${apiOrigin}${value}` : value;
}

export class ApiRequestError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

type RequestOptions = Omit<UniApp.RequestOptions, 'fail' | 'success' | 'url'>;

export function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    uni.request({
      ...options,
      url: `${baseUrl}${path}`,
      success(response) {
        const envelope = response.data as ApiEnvelope<T>;
        if (response.statusCode >= 200 && response.statusCode < 300 && envelope.code === 0) {
          resolve(envelope.data);
          return;
        }
        reject(
          new ApiRequestError(
            typeof envelope?.code === 'string' ? envelope.code : 'REQUEST_FAILED',
            typeof envelope?.message === 'string' ? envelope.message : '请求失败，请稍后重试',
          ),
        );
      },
      fail() {
        reject(new ApiRequestError('NETWORK_ERROR', '网络连接失败，请稍后重试'));
      },
    });
  });
}
