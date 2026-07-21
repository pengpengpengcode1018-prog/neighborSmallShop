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

export interface PublicCommunity {
  id: string;
  name: string;
  city: string;
  district: string;
  detailedAddress: string;
}

export interface PublicUser {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  phoneBound: boolean;
  currentCommunity: PublicCommunity | null;
}

export interface AppState {
  requestId?: string;
  admin?: {
    id: string;
    username: string;
    displayName: string;
    role: 'PLATFORM_ADMIN';
  };
  user?: PublicUser;
}

export function success<T>(data: T): ApiSuccess<T> {
  return { code: 0, message: 'success', data };
}

export function failure(code: string, message: string): ApiFailure {
  return { code, message, data: null };
}
