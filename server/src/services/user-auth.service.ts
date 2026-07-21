import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import {
  WechatProviderError,
  type WechatIdentityProvider,
} from '../providers/wechat-identity.provider.js';
import { userAuthRepository, type UserLoginContext } from '../repositories/user-auth.repository.js';
import type { PublicCommunity, PublicUser } from '../types/api.js';

interface UserTokenPayload extends jwt.JwtPayload {
  sub: string;
  kind: 'USER';
}

interface UserWithCommunity {
  id: string;
  nickname: string | null;
  avatarUrl: string | null;
  phone: string | null;
  currentCommunityId: string | null;
  currentCommunity: {
    id: string;
    name: string;
    city: string;
    district: string;
    detailedAddress: string;
    status: 'ENABLED' | 'DISABLED';
    deletedAt: Date | null;
  } | null;
}

export interface UserProfileInput {
  nickname?: string;
  avatarBase64?: string;
}

const MAX_AVATAR_BYTES = 512 * 1024;

function avatarMimeType(data: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (
    data.length >= 8 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    return 'image/png';
  }
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    data.length >= 12 &&
    data.subarray(0, 4).toString('ascii') === 'RIFF' &&
    data.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

function decodeAvatar(value: string) {
  const normalized = value.trim();
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '头像文件格式无效');
  }
  const data = Buffer.from(normalized, 'base64');
  if (data.length > MAX_AVATAR_BYTES) {
    throw new HttpError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, '头像不能超过 512KB');
  }
  const mimeType = avatarMimeType(data);
  if (!mimeType) {
    throw new HttpError(400, ERROR_CODES.VALIDATION_ERROR, '头像仅支持 JPEG、PNG 或 WebP');
  }
  return { data, mimeType };
}

function availableCommunity(user: UserWithCommunity): PublicCommunity | null {
  const community = user.currentCommunity;
  if (!community || community.status !== 'ENABLED' || community.deletedAt !== null) return null;
  return {
    id: community.id,
    name: community.name,
    city: community.city,
    district: community.district,
    detailedAddress: community.detailedAddress,
  };
}

export async function toPublicUser(user: UserWithCommunity): Promise<PublicUser> {
  const currentCommunity = availableCommunity(user);
  if (user.currentCommunityId && !currentCommunity) {
    await userAuthRepository.clearCurrentCommunity(user.id);
  }
  return {
    id: user.id,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    phone: user.phone,
    phoneBound: user.phone !== null,
    currentCommunity,
  };
}

function invalidSession(): HttpError {
  return new HttpError(401, ERROR_CODES.UNAUTHORIZED, '登录状态无效或已过期');
}

export class UserAuthService {
  constructor(private readonly provider: WechatIdentityProvider) {}

  async login(code: string, context: UserLoginContext) {
    let identity;
    try {
      identity = await this.provider.exchangeCode(code);
    } catch (error) {
      const reason = error instanceof WechatProviderError ? error.reason : 'unavailable';
      await userAuthRepository.recordFailure({
        result: 'FAILED',
        failureReason: reason === 'invalid_code' ? 'invalid_code' : 'provider_unavailable',
        ...context,
      });
      if (reason === 'invalid_code') {
        throw new HttpError(401, ERROR_CODES.WECHAT_LOGIN_FAILED, '微信登录凭证无效，请重试');
      }
      throw new HttpError(503, ERROR_CODES.SERVICE_UNAVAILABLE, '微信登录服务暂时不可用');
    }

    const user = await userAuthRepository.findOrCreateByWechatIdentity(identity);
    if (user.status !== 'ACTIVE') {
      await userAuthRepository.recordFailure({
        userId: user.id,
        result: 'DISABLED',
        failureReason: 'account_disabled',
        ...context,
      });
      throw new HttpError(403, ERROR_CODES.ACCOUNT_UNAVAILABLE, '账号当前不可用');
    }

    const updatedUser = await userAuthRepository.recordSuccess(user.id, context);
    const token = jwt.sign({ kind: 'USER' }, env.JWT_SECRET, {
      subject: user.id,
      expiresIn: env.JWT_EXPIRES_IN_SECONDS,
    });

    return {
      token,
      expiresIn: env.JWT_EXPIRES_IN_SECONDS,
      user: await toPublicUser(updatedUser),
    };
  }

  async authenticate(token: string) {
    let payload: UserTokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as UserTokenPayload;
    } catch {
      throw invalidSession();
    }

    if (!payload.sub) throw invalidSession();
    if (payload.kind !== 'USER') {
      throw new HttpError(403, ERROR_CODES.FORBIDDEN, '无权访问该资源');
    }

    const user = await userAuthRepository.findActiveById(payload.sub);
    if (!user) throw invalidSession();
    return toPublicUser(user);
  }

  async updateProfile(userId: string, input: UserProfileInput) {
    const avatar = input.avatarBase64 ? decodeAvatar(input.avatarBase64) : undefined;
    const updatedUser = await userAuthRepository.updateProfile(userId, {
      ...(input.nickname !== undefined ? { nickname: input.nickname.trim() } : {}),
      ...(avatar
        ? {
            avatar: {
              ...avatar,
              url: `/api/v1/users/${userId}/avatar?v=${Date.now()}`,
            },
          }
        : {}),
    });
    return toPublicUser(updatedUser);
  }

  async getAvatar(userId: string) {
    const avatar = await userAuthRepository.findAvatarByUserId(userId);
    if (!avatar?.avatarData || !avatar.avatarMimeType) {
      throw new HttpError(404, ERROR_CODES.NOT_FOUND, '头像不存在');
    }
    return {
      data: Buffer.from(avatar.avatarData),
      mimeType: avatar.avatarMimeType,
    };
  }
}
