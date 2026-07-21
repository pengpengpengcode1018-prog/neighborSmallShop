import type { UserProfile } from '../types/domain';

export function prefillPhoneForNewAddress(
  currentValue: string,
  addressId: string,
  profile: UserProfile | null,
): string {
  if (addressId || currentValue.trim()) return currentValue;
  return profile?.phone ?? '';
}
