import { wechatConfig } from '../config/wechat.js';

const CODE_TO_SESSION_URL = 'https://api.weixin.qq.com/sns/jscode2session';
const REQUEST_TIMEOUT_MS = 5_000;

export interface WechatIdentity {
  openId: string;
  unionId?: string;
}

export interface WechatIdentityProvider {
  exchangeCode(code: string): Promise<WechatIdentity>;
}

export interface WechatIdentityProviderConfig {
  appId?: string;
  appSecret?: string;
}

export type WechatFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export type WechatProviderFailure = 'invalid_code' | 'rate_limited' | 'unavailable';

export class WechatProviderError extends Error {
  constructor(public readonly reason: WechatProviderFailure) {
    super(`wechat_provider_${reason}`);
    this.name = 'WechatProviderError';
  }
}

interface CodeToSessionResponse {
  openid?: unknown;
  unionid?: unknown;
  session_key?: unknown;
  errcode?: unknown;
}

function providerFailureFor(errorCode: unknown): WechatProviderFailure {
  if (errorCode === 40029 || errorCode === 40163) return 'invalid_code';
  if (errorCode === 45011) return 'rate_limited';
  return 'unavailable';
}

export function createWechatIdentityProvider(
  config: WechatIdentityProviderConfig,
  fetchWechat: WechatFetch = fetch,
): WechatIdentityProvider {
  return {
    async exchangeCode(code) {
      if (!config.appId || !config.appSecret) {
        throw new WechatProviderError('unavailable');
      }

      const url = new URL(CODE_TO_SESSION_URL);
      url.searchParams.set('appid', config.appId);
      url.searchParams.set('secret', config.appSecret);
      url.searchParams.set('js_code', code);
      url.searchParams.set('grant_type', 'authorization_code');

      let response: Response;
      try {
        response = await fetchWechat(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      } catch {
        throw new WechatProviderError('unavailable');
      }

      let body: CodeToSessionResponse;
      try {
        body = (await response.json()) as CodeToSessionResponse;
      } catch {
        throw new WechatProviderError('unavailable');
      }

      if (!response.ok || body.errcode !== undefined) {
        throw new WechatProviderError(providerFailureFor(body.errcode));
      }
      if (typeof body.openid !== 'string' || typeof body.session_key !== 'string') {
        throw new WechatProviderError('unavailable');
      }

      return {
        openId: body.openid,
        ...(typeof body.unionid === 'string' ? { unionId: body.unionid } : {}),
      };
    },
  };
}

export const officialWechatIdentityProvider = createWechatIdentityProvider({
  ...(wechatConfig.appId ? { appId: wechatConfig.appId } : {}),
  ...(wechatConfig.appSecret ? { appSecret: wechatConfig.appSecret } : {}),
});
