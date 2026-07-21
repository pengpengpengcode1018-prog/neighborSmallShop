import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { WechatProviderError } from '../providers/wechat-identity.provider.js';
import type { WechatPhoneProvider } from '../providers/wechat-phone.provider.js';
import { userAuthRepository } from '../repositories/user-auth.repository.js';
import { toPublicUser } from './user-auth.service.js';

function bindingFailure(reason: WechatProviderError['reason']): HttpError {
  if (reason === 'invalid_code') {
    return new HttpError(401, ERROR_CODES.WECHAT_PHONE_FAILED, '手机号授权凭证无效，请重新授权');
  }
  if (reason === 'rate_limited') {
    return new HttpError(429, ERROR_CODES.RATE_LIMITED, '手机号授权操作过于频繁，请稍后重试');
  }
  return new HttpError(503, ERROR_CODES.SERVICE_UNAVAILABLE, '微信手机号服务暂时不可用');
}

export class UserPhoneService {
  constructor(private readonly provider: WechatPhoneProvider) {}

  async bind(userId: string, code: string) {
    let phoneNumber: string;
    try {
      ({ phoneNumber } = await this.provider.exchangeCode(code));
    } catch (error) {
      const reason = error instanceof WechatProviderError ? error.reason : 'unavailable';
      throw bindingFailure(reason);
    }

    const owner = await userAuthRepository.findByPhone(phoneNumber);
    if (owner && owner.id !== userId) {
      throw new HttpError(409, ERROR_CODES.PHONE_ALREADY_BOUND, '该手机号已绑定其他账号');
    }

    try {
      return await toPublicUser(await userAuthRepository.bindPhone(userId, phoneNumber));
    } catch (error) {
      if ((error as { code?: string }).code === 'P2002') {
        throw new HttpError(409, ERROR_CODES.PHONE_ALREADY_BOUND, '该手机号已绑定其他账号');
      }
      throw error;
    }
  }
}
