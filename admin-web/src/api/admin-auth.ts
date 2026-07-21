import { http } from './http';
import type { ApiSuccess } from '../types/api';

export interface AdminProfile {
  id: string;
  username: string;
  displayName: string;
  role: 'PLATFORM_ADMIN';
}

interface LoginResult {
  token: string;
  expiresIn: number;
  admin: AdminProfile;
}

export async function loginAdmin(username: string, password: string): Promise<LoginResult> {
  const response = await http.post<ApiSuccess<LoginResult>>('/admin/auth/login', {
    username,
    password,
  });
  return response.data.data;
}

export async function getCurrentAdmin(): Promise<AdminProfile> {
  const response = await http.get<ApiSuccess<AdminProfile>>('/admin/auth/me');
  return response.data.data;
}
