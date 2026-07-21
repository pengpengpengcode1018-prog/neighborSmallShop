import { describe, expect, it, vi } from 'vitest';

import {
  createWechatIdentityProvider,
  WechatProviderError,
  type WechatFetch,
} from '../src/providers/wechat-identity.provider.js';

const config = { appId: 'test-app-id', appSecret: 'test-app-secret' };

describe('WeChat identity provider contract', () => {
  it('uses the official code2Session contract and returns only durable identity fields', async () => {
    const fetchWechat = vi.fn<WechatFetch>(async () =>
      Response.json({
        openid: 'test-open-id',
        unionid: 'test-union-id',
        session_key: 'ephemeral-session-key',
      }),
    );
    const provider = createWechatIdentityProvider(config, fetchWechat);

    await expect(provider.exchangeCode('temporary-login-code')).resolves.toEqual({
      openId: 'test-open-id',
      unionId: 'test-union-id',
    });

    const url = fetchWechat.mock.calls[0]?.[0];
    expect(url).toBeInstanceOf(URL);
    const parsed = url as URL;
    expect(parsed.origin + parsed.pathname).toBe('https://api.weixin.qq.com/sns/jscode2session');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      appid: 'test-app-id',
      secret: 'test-app-secret',
      js_code: 'temporary-login-code',
      grant_type: 'authorization_code',
    });
  });

  it.each([
    [40029, 'invalid_code'],
    [40163, 'invalid_code'],
    [45011, 'rate_limited'],
    [-1, 'unavailable'],
  ] as const)('normalizes provider error %s as %s', async (errcode, reason) => {
    const provider = createWechatIdentityProvider(config, async () =>
      Response.json({ errcode, errmsg: 'raw provider detail' }),
    );

    const error = await provider.exchangeCode('sensitive-code').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(WechatProviderError);
    expect(error).toMatchObject({ reason });
    expect(String(error)).not.toContain('raw provider detail');
    expect(String(error)).not.toContain('sensitive-code');
  });

  it('fails closed for missing credentials, network errors, and malformed responses', async () => {
    await expect(
      createWechatIdentityProvider({}, async () => Response.json({})).exchangeCode('code'),
    ).rejects.toMatchObject({ reason: 'unavailable' });

    await expect(
      createWechatIdentityProvider(config, async () => {
        throw new Error('network detail');
      }).exchangeCode('code'),
    ).rejects.toMatchObject({ reason: 'unavailable' });

    await expect(
      createWechatIdentityProvider(config, async () =>
        Response.json({ openid: 'only-id' }),
      ).exchangeCode('code'),
    ).rejects.toMatchObject({ reason: 'unavailable' });
  });
});
