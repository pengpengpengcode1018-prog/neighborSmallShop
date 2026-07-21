import { describe, expect, it, vi } from 'vitest';

import {
  createWechatSubscriptionProvider,
  WechatSubscriptionProviderError,
  type WechatSubscriptionFetch,
} from '../src/providers/wechat-subscription.provider.js';

const config = {
  appId: 'test-app-id',
  appSecret: 'test-app-secret',
  miniProgramState: 'developer' as const,
};
const message = {
  openId: 'test-open-id',
  templateId: 'test-template-id',
  page: 'pages/order/detail?id=order-id',
  data: { character_string1: { value: 'NP202607170001' } },
};

describe('WeChat subscription-message provider contract', () => {
  it('obtains an access token and sends the documented subscription payload', async () => {
    const fetchWechat = vi.fn<WechatSubscriptionFetch>(async (input) => {
      const url = input as URL;
      if (url.pathname === '/cgi-bin/token') {
        return Response.json({ access_token: 'fixture-token', expires_in: 7200 });
      }
      return Response.json({ errcode: 0, errmsg: 'ok' });
    });
    const provider = createWechatSubscriptionProvider(config, fetchWechat);

    await expect(provider.send(message)).resolves.toBeUndefined();

    const tokenUrl = fetchWechat.mock.calls[0]?.[0] as URL;
    expect(tokenUrl.origin + tokenUrl.pathname).toBe('https://api.weixin.qq.com/cgi-bin/token');
    expect(Object.fromEntries(tokenUrl.searchParams)).toEqual({
      grant_type: 'client_credential',
      appid: config.appId,
      secret: config.appSecret,
    });
    const sendUrl = fetchWechat.mock.calls[1]?.[0] as URL;
    expect(sendUrl.origin + sendUrl.pathname).toBe(
      'https://api.weixin.qq.com/cgi-bin/message/subscribe/send',
    );
    expect(sendUrl.searchParams.get('access_token')).toBe('fixture-token');
    expect(JSON.parse(String(fetchWechat.mock.calls[1]?.[1]?.body))).toEqual({
      touser: message.openId,
      template_id: message.templateId,
      page: message.page,
      miniprogram_state: 'developer',
      lang: 'zh_CN',
      data: message.data,
    });
  });

  it('refreshes an explicitly invalid token once before retrying the send', async () => {
    let tokenCount = 0;
    let sendCount = 0;
    const provider = createWechatSubscriptionProvider(config, async (input) => {
      const url = input as URL;
      if (url.pathname === '/cgi-bin/token') {
        tokenCount += 1;
        return Response.json({ access_token: `token-${tokenCount}`, expires_in: 7200 });
      }
      sendCount += 1;
      return Response.json(sendCount === 1 ? { errcode: 40014 } : { errcode: 0 });
    });

    await expect(provider.send(message)).resolves.toBeUndefined();
    expect({ tokenCount, sendCount }).toEqual({ tokenCount: 2, sendCount: 2 });
  });

  it.each([
    [43101, 'not_subscribed', false],
    [43108, 'concurrent', true],
    [40037, 'invalid_template', false],
    [47003, 'invalid_data', false],
  ] as const)(
    'normalizes explicit error %s without exposing raw data',
    async (code, reason, retryable) => {
      const provider = createWechatSubscriptionProvider(config, async (input) => {
        const url = input as URL;
        return url.pathname === '/cgi-bin/token'
          ? Response.json({ access_token: 'token', expires_in: 7200 })
          : Response.json({ errcode: code, errmsg: 'raw-sensitive-provider-detail' });
      });

      const error = await provider.send(message).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(WechatSubscriptionProviderError);
      expect(error).toMatchObject({ reason, sendOutcome: 'NOT_SENT', retryable });
      expect(String(error)).not.toContain('raw-sensitive-provider-detail');
      expect(String(error)).not.toContain(message.openId);
    },
  );

  it('classifies a message-endpoint network failure as unknown and not retryable', async () => {
    const provider = createWechatSubscriptionProvider(config, async (input) => {
      const url = input as URL;
      if (url.pathname === '/cgi-bin/token') {
        return Response.json({ access_token: 'token', expires_in: 7200 });
      }
      throw new Error('connection reset after request');
    });

    await expect(provider.send(message)).rejects.toMatchObject({
      reason: 'unavailable',
      sendOutcome: 'UNKNOWN',
      retryable: false,
    });
  });
});
