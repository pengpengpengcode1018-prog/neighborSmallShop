import type { ApiEnvelope } from '../types/api';

const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:3000/api/v1';

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
        reject(new ApiRequestError(String(envelope.code), envelope.message));
      },
      fail(error) {
        reject(new ApiRequestError('NETWORK_ERROR', error.errMsg));
      },
    });
  });
}
