import { wechatConfig } from '../config/wechat.js';

const ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const SUBSCRIPTION_SEND_URL = 'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';
const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_EXPIRY_SAFETY_MS = 5 * 60 * 1_000;

export type WechatSubscriptionFailure =
  | 'not_configured'
  | 'unavailable'
  | 'not_subscribed'
  | 'invalid_openid'
  | 'invalid_template'
  | 'invalid_data'
  | 'blocked'
  | 'concurrent'
  | 'rejected';

export type WechatSendOutcome = 'NOT_SENT' | 'UNKNOWN';

export class WechatSubscriptionProviderError extends Error {
  constructor(
    public readonly reason: WechatSubscriptionFailure,
    public readonly sendOutcome: WechatSendOutcome,
    public readonly retryable: boolean,
  ) {
    super(`wechat_subscription_${reason}`);
    this.name = 'WechatSubscriptionProviderError';
  }
}

export interface WechatSubscriptionMessage {
  openId: string;
  templateId: string;
  page: string;
  data: Record<string, { value: string }>;
}

export interface WechatSubscriptionProvider {
  send(message: WechatSubscriptionMessage): Promise<void>;
}

export interface WechatSubscriptionProviderConfig {
  appId?: string;
  appSecret?: string;
  miniProgramState: 'developer' | 'trial' | 'formal';
}

export type WechatSubscriptionFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

interface AccessTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  errcode?: unknown;
}

interface SendResponse {
  errcode?: unknown;
}

function explicitFailure(errorCode: unknown): WechatSubscriptionProviderError {
  if (errorCode === -1 || errorCode === 43108) {
    return new WechatSubscriptionProviderError(
      errorCode === 43108 ? 'concurrent' : 'unavailable',
      'NOT_SENT',
      true,
    );
  }
  if (errorCode === 43101) {
    return new WechatSubscriptionProviderError('not_subscribed', 'NOT_SENT', false);
  }
  if (errorCode === 40003) {
    return new WechatSubscriptionProviderError('invalid_openid', 'NOT_SENT', false);
  }
  if (errorCode === 40037) {
    return new WechatSubscriptionProviderError('invalid_template', 'NOT_SENT', false);
  }
  if (errorCode === 47003) {
    return new WechatSubscriptionProviderError('invalid_data', 'NOT_SENT', false);
  }
  if (errorCode === 43107 || errorCode === 45168) {
    return new WechatSubscriptionProviderError('blocked', 'NOT_SENT', false);
  }
  return new WechatSubscriptionProviderError('rejected', 'NOT_SENT', false);
}

export function createWechatSubscriptionProvider(
  config: WechatSubscriptionProviderConfig,
  fetchWechat: WechatSubscriptionFetch = fetch,
): WechatSubscriptionProvider {
  let accessToken: { value: string; expiresAt: number } | null = null;

  async function getAccessToken(forceRefresh = false): Promise<string> {
    if (!config.appId || !config.appSecret) {
      throw new WechatSubscriptionProviderError('not_configured', 'NOT_SENT', false);
    }
    if (!forceRefresh && accessToken && accessToken.expiresAt > Date.now()) {
      return accessToken.value;
    }

    const url = new URL(ACCESS_TOKEN_URL);
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', config.appId);
    url.searchParams.set('secret', config.appSecret);
    let response: Response;
    try {
      response = await fetchWechat(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new WechatSubscriptionProviderError('unavailable', 'NOT_SENT', true);
    }

    let body: AccessTokenResponse;
    try {
      body = (await response.json()) as AccessTokenResponse;
    } catch {
      throw new WechatSubscriptionProviderError('unavailable', 'NOT_SENT', true);
    }
    if (
      !response.ok ||
      typeof body.access_token !== 'string' ||
      typeof body.expires_in !== 'number'
    ) {
      throw new WechatSubscriptionProviderError('unavailable', 'NOT_SENT', true);
    }
    accessToken = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(1_000, body.expires_in * 1_000 - TOKEN_EXPIRY_SAFETY_MS),
    };
    return accessToken.value;
  }

  async function sendWithToken(message: WechatSubscriptionMessage, retryToken: boolean) {
    const token = await getAccessToken(!retryToken);
    const url = new URL(SUBSCRIPTION_SEND_URL);
    url.searchParams.set('access_token', token);
    let response: Response;
    try {
      response = await fetchWechat(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          touser: message.openId,
          template_id: message.templateId,
          page: message.page,
          miniprogram_state: config.miniProgramState,
          lang: 'zh_CN',
          data: message.data,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new WechatSubscriptionProviderError('unavailable', 'UNKNOWN', false);
    }

    let body: SendResponse;
    try {
      body = (await response.json()) as SendResponse;
    } catch {
      throw new WechatSubscriptionProviderError('unavailable', 'UNKNOWN', false);
    }
    if (response.ok && body.errcode === 0) return;
    if (retryToken && (body.errcode === 40014 || body.errcode === 42001)) {
      accessToken = null;
      return sendWithToken(message, false);
    }
    throw explicitFailure(body.errcode);
  }

  return {
    send(message) {
      return sendWithToken(message, true);
    },
  };
}

export const officialWechatSubscriptionProvider = createWechatSubscriptionProvider({
  ...(wechatConfig.appId ? { appId: wechatConfig.appId } : {}),
  ...(wechatConfig.appSecret ? { appSecret: wechatConfig.appSecret } : {}),
  miniProgramState: wechatConfig.miniProgramState,
});
