import axios from 'axios';

import type { ApiFailure } from '../types/api';

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export const http = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function resolveApiAssetUrl(value: string | null | undefined): string {
  if (!value) return '';
  if (/^(?:https?:|data:|blob:)/i.test(value)) return value;
  if (!value.startsWith('/')) return value;

  const apiOrigin = apiBaseUrl.match(/^(https?:\/\/[^/]+)/i)?.[1];
  return apiOrigin ? `${apiOrigin}${value}` : value;
}

http.interceptors.request.use((config) => {
  const token = window.sessionStorage.getItem('nearby-shop-admin-token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError<ApiFailure>(error)) {
    return error.response?.data.message ?? '网络连接失败，请稍后重试';
  }
  return '操作失败，请稍后重试';
}
