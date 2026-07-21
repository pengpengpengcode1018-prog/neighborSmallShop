import { describe, expect, it, vi } from 'vitest';

import {
  WechatProviderError,
  type WechatFetch,
} from '../src/providers/wechat-identity.provider.js';
import { createWechatPhoneProvider } from '../src/providers/wechat-phone.provider.js';

const config = { appId: 'test-app-id', appSecret: 'test-app-secret' };

describe('WeChat phone provider contract', () => {
  it('uses an access token and exchanges only the one-time dynamic code', async () => {
    const fetchWechat = vi.fn<WechatFetch>(async (input, init) => {
      const url = input as URL;
      if (url.pathname === '/cgi-bin/token') {
        return Response.json({ access_token: 'access-token', expires_in: 7200 });
      }
      expect(url.pathname).toBe('/wxa/business/getuserphonenumber');
      expect(url.searchParams.get('access_token')).toBe('access-token');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ code: 'one-time-phone-code' });
      return Response.json({
        errcode: 0,
        phone_info: {
          phoneNumber: '13800138000',
          purePhoneNumber: '13800138000',
          countryCode: '86',
          watermark: { appid: 'test-app-id' },
        },
      });
    });

    await expect(
      createWechatPhoneProvider(config, fetchWechat).exchangeCode('one-time-phone-code'),
    ).resolves.toEqual({ phoneNumber: '13800138000', countryCode: '86' });
    expect(fetchWechat).toHaveBeenCalledTimes(2);
  });

  it('refreshes an expired token once without exposing provider details', async () => {
    let tokenCalls = 0;
    const fetchWechat = vi.fn<WechatFetch>(async (input) => {
      const url = input as URL;
      if (url.pathname === '/cgi-bin/token') {
        tokenCalls += 1;
        return Response.json({ access_token: `token-${tokenCalls}`, expires_in: 7200 });
      }
      if (url.searchParams.get('access_token') === 'token-1') {
        return Response.json({ errcode: 42001, errmsg: 'raw token expired detail' });
      }
      return Response.json({
        errcode: 0,
        phone_info: { purePhoneNumber: '13900139000', countryCode: '86' },
      });
    });

    await expect(
      createWechatPhoneProvider(config, fetchWechat).exchangeCode('sensitive-code'),
    ).resolves.toEqual({ phoneNumber: '13900139000', countryCode: '86' });
    expect(tokenCalls).toBe(2);
  });

  it.each([
    [40029, 'invalid_code'],
    [40163, 'invalid_code'],
    [45011, 'rate_limited'],
    [-1, 'unavailable'],
  ] as const)('normalizes phone error %s as %s', async (errcode, reason) => {
    const provider = createWechatPhoneProvider(config, async (input) => {
      const url = input as URL;
      return url.pathname === '/cgi-bin/token'
        ? Response.json({ access_token: 'access-token', expires_in: 7200 })
        : Response.json({ errcode, errmsg: 'raw provider detail' });
    });

    const error = await provider.exchangeCode('sensitive-code').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WechatProviderError);
    expect(error).toMatchObject({ reason });
    expect(String(error)).not.toContain('raw provider detail');
    expect(String(error)).not.toContain('sensitive-code');
  });

  it('fails closed for missing credentials, malformed phone data, and network errors', async () => {
    await expect(
      createWechatPhoneProvider({}, async () => Response.json({})).exchangeCode('code'),
    ).rejects.toMatchObject({ reason: 'unavailable' });

    const malformed = createWechatPhoneProvider(config, async (input) => {
      const url = input as URL;
      return url.pathname === '/cgi-bin/token'
        ? Response.json({ access_token: 'token', expires_in: 7200 })
        : Response.json({
            errcode: 0,
            phone_info: { purePhoneNumber: 'not-a-phone', countryCode: '86' },
          });
    });
    await expect(malformed.exchangeCode('code')).rejects.toMatchObject({ reason: 'unavailable' });

    await expect(
      createWechatPhoneProvider(config, async () => {
        throw new Error('network detail');
      }).exchangeCode('code'),
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
