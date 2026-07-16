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

export type ApiEnvelope<T> = ApiSuccess<T> | ApiFailure;
