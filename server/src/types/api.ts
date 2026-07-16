export interface ApiSuccess<T> {
  code: 0;
  message: 'success';
  data: T;
}

export interface ApiFailure {
  code: string;
  message: string;
  data: null;
}

export interface AppState {
  requestId?: string;
}

export function success<T>(data: T): ApiSuccess<T> {
  return { code: 0, message: 'success', data };
}

export function failure(code: string, message: string): ApiFailure {
  return { code, message, data: null };
}
