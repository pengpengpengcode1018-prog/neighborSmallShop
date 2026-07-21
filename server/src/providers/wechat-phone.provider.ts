import { wechatConfig } from '../config/wechat.js';
import {
  WechatProviderError,
  type WechatFetch,
  type WechatProviderFailure,
} from './wechat-identity.provider.js';

const ACCESS_TOKEN_URL = 'https://api.weixin.qq.com/cgi-bin/token';
const PHONE_NUMBER_URL = 'https://api.weixin.qq.com/wxa/business/getuserphonenumber';
const REQUEST_TIMEOUT_MS = 5_000;
const TOKEN_EXPIRY_SAFETY_MS = 5 * 60 * 1_000;
const TOKEN_FAILURE_CODES = new Set([40014, 42001]);

export interface WechatPhoneNumber {
  phoneNumber: string;
  countryCode: string;
}

export interface WechatPhoneProvider {
  exchangeCode(code: string): Promise<WechatPhoneNumber>;
}

export interface WechatPhoneProviderConfig {
  appId?: string;
  appSecret?: string;
}

interface AccessTokenResponse {
  access_token?: unknown;
  expires_in?: unknown;
  errcode?: unknown;
}

interface PhoneNumberResponse {
  errcode?: unknown;
  phone_info?: {
    phoneNumber?: unknown;
    purePhoneNumber?: unknown;
    countryCode?: unknown;
  };
}

function providerFailureFor(errorCode: unknown): WechatProviderFailure {
  if (errorCode === 40029 || errorCode === 40163) return 'invalid_code';
  if (errorCode === 45011) return 'rate_limited';
  return 'unavailable';
}

function validMainlandPhone(value: unknown): value is string {
  return typeof value === 'string' && /^1[3-9]\d{9}$/.test(value);
}

export function createWechatPhoneProvider(
  config: WechatPhoneProviderConfig,
  fetchWechat: WechatFetch = fetch,
): WechatPhoneProvider {
  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function accessToken(forceRefresh = false): Promise<string> {
    if (!config.appId || !config.appSecret) {
      throw new WechatProviderError('unavailable');
    }
    if (!forceRefresh && cachedToken && cachedToken.expiresAt > Date.now()) {
      return cachedToken.value;
    }

    const url = new URL(ACCESS_TOKEN_URL);
    url.searchParams.set('grant_type', 'client_credential');
    url.searchParams.set('appid', config.appId);
    url.searchParams.set('secret', config.appSecret);

    let response: Response;
    try {
      response = await fetchWechat(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    } catch {
      throw new WechatProviderError('unavailable');
    }

    let body: AccessTokenResponse;
    try {
      body = (await response.json()) as AccessTokenResponse;
    } catch {
      throw new WechatProviderError('unavailable');
    }
    if (
      !response.ok ||
      typeof body.access_token !== 'string' ||
      typeof body.expires_in !== 'number'
    ) {
      throw new WechatProviderError(providerFailureFor(body.errcode));
    }

    cachedToken = {
      value: body.access_token,
      expiresAt: Date.now() + Math.max(0, body.expires_in * 1_000 - TOKEN_EXPIRY_SAFETY_MS),
    };
    return cachedToken.value;
  }

  async function requestPhone(code: string, token: string): Promise<PhoneNumberResponse> {
    const url = new URL(PHONE_NUMBER_URL);
    url.searchParams.set('access_token', token);
    let response: Response;
    try {
      response = await fetchWechat(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new WechatProviderError('unavailable');
    }

    try {
      const body = (await response.json()) as PhoneNumberResponse;
      if (!response.ok && body.errcode === undefined) {
        throw new WechatProviderError('unavailable');
      }
      return body;
    } catch (error) {
      if (error instanceof WechatProviderError) throw error;
      throw new WechatProviderError('unavailable');
    }
  }

  return {
    async exchangeCode(code) {
      let body = await requestPhone(code, await accessToken());
      if (TOKEN_FAILURE_CODES.has(Number(body.errcode))) {
        cachedToken = null;
        body = await requestPhone(code, await accessToken(true));
      }
      if (body.errcode !== 0) {
        throw new WechatProviderError(providerFailureFor(body.errcode));
      }

      const phoneNumber = body.phone_info?.purePhoneNumber ?? body.phone_info?.phoneNumber;
      if (!validMainlandPhone(phoneNumber) || body.phone_info?.countryCode !== '86') {
        throw new WechatProviderError('unavailable');
      }
      return { phoneNumber, countryCode: '86' };
    },
  };
}

export const officialWechatPhoneProvider = createWechatPhoneProvider({
  ...(wechatConfig.appId ? { appId: wechatConfig.appId } : {}),
  ...(wechatConfig.appSecret ? { appSecret: wechatConfig.appSecret } : {}),
});
