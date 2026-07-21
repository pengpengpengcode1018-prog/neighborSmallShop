import type { CommunitySummary, UserProfile } from '../types/domain';
import { request } from '../utils/request';

export function listAvailableCommunities(): Promise<{ list: CommunitySummary[] }> {
  return request<{ list: CommunitySummary[] }>('/communities');
}

export function updateCurrentCommunity(token: string, communityId: string): Promise<UserProfile> {
  return request<UserProfile>('/users/current-community', {
    method: 'PUT',
    header: { authorization: `Bearer ${token}` },
    data: { communityId },
  });
}
