import type { UserProfile, WechatLoginResult } from '../types/domain';
import { request } from '../utils/request';

export function loginWithWechatCode(code: string): Promise<WechatLoginResult> {
  return request<WechatLoginResult>('/auth/wechat-login', {
    method: 'POST',
    data: { code },
  });
}

export function getUserProfile(token: string): Promise<UserProfile> {
  return request<UserProfile>('/users/profile', {
    method: 'GET',
    header: { authorization: `Bearer ${token}` },
  });
}

export function bindWechatPhone(token: string, code: string): Promise<UserProfile> {
  return request<UserProfile>('/users/phone', {
    method: 'POST',
    header: { authorization: `Bearer ${token}` },
    data: { code },
  });
}

export interface UpdateUserProfileInput {
  nickname?: string;
  avatarBase64?: string;
}

export function updateUserProfile(
  token: string,
  input: UpdateUserProfileInput,
): Promise<UserProfile> {
  return request<UserProfile>('/users/profile', {
    method: 'PUT',
    header: { authorization: `Bearer ${token}` },
    data: input,
  });
}
