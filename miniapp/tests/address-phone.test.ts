import { describe, expect, it } from 'vitest';

import type { UserProfile } from '../src/types/domain';
import { prefillPhoneForNewAddress } from '../src/utils/address-phone';

const boundProfile: UserProfile = {
  id: 'user-1',
  nickname: null,
  avatarUrl: null,
  phone: '13800138000',
  phoneBound: true,
  currentCommunity: null,
};

describe('new address phone prefill', () => {
  it('prefills the bound account phone only for a blank new address', () => {
    expect(prefillPhoneForNewAddress('', '', boundProfile)).toBe('13800138000');
    expect(prefillPhoneForNewAddress('13900139000', '', boundProfile)).toBe('13900139000');
    expect(prefillPhoneForNewAddress('', 'existing-address', boundProfile)).toBe('');
    expect(
      prefillPhoneForNewAddress('', '', { ...boundProfile, phone: null, phoneBound: false }),
    ).toBe('');
  });
});
