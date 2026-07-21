import { prisma } from '../config/database.js';
import type { UserLoginResult } from '../generated/prisma/enums.js';
import type { WechatIdentity } from '../providers/wechat-identity.provider.js';

export interface UserLoginContext {
  ipAddress?: string;
  userAgent?: string;
}

export interface UserProfileUpdate {
  nickname?: string;
  avatar?: {
    data: Buffer;
    mimeType: string;
    url: string;
  };
}

interface UserLoginAuditInput extends UserLoginContext {
  userId?: string;
  result: UserLoginResult;
  failureReason?: string;
}

function auditData(input: UserLoginAuditInput) {
  return {
    result: input.result,
    ...(input.userId ? { userId: input.userId } : {}),
    ...(input.failureReason ? { failureReason: input.failureReason } : {}),
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
  };
}

export const userAuthRepository = {
  findOrCreateByWechatIdentity(identity: WechatIdentity) {
    return prisma.user.upsert({
      where: { wechatOpenId: identity.openId },
      create: {
        wechatOpenId: identity.openId,
        ...(identity.unionId ? { wechatUnionId: identity.unionId } : {}),
      },
      update: identity.unionId ? { wechatUnionId: identity.unionId } : {},
    });
  },

  findActiveById(id: string) {
    return prisma.user.findFirst({
      where: { id, status: 'ACTIVE' },
      include: { currentCommunity: true },
    });
  },

  findByPhone(phone: string) {
    return prisma.user.findUnique({ where: { phone }, select: { id: true } });
  },

  bindPhone(userId: string, phone: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { phone },
      include: { currentCommunity: true },
    });
  },

  updateProfile(userId: string, input: UserProfileUpdate) {
    return prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.nickname !== undefined ? { nickname: input.nickname } : {}),
        ...(input.avatar
          ? {
              avatarData: Uint8Array.from(input.avatar.data),
              avatarMimeType: input.avatar.mimeType,
              avatarUrl: input.avatar.url,
            }
          : {}),
      },
      include: { currentCommunity: true },
    });
  },

  findAvatarByUserId(userId: string) {
    return prisma.user.findFirst({
      where: { id: userId, status: 'ACTIVE' },
      select: { avatarData: true, avatarMimeType: true },
    });
  },

  recordSuccess(userId: string, context: UserLoginContext) {
    return prisma.$transaction(async (transaction) => {
      const user = await transaction.user.update({
        where: { id: userId },
        data: { lastLoginAt: new Date() },
        include: { currentCommunity: true },
      });
      await transaction.userLoginLog.create({
        data: auditData({ userId, result: 'SUCCESS', ...context }),
      });
      return user;
    });
  },

  recordFailure(input: UserLoginAuditInput) {
    return prisma.userLoginLog.create({ data: auditData(input) });
  },

  updateCurrentCommunity(userId: string, communityId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { currentCommunityId: communityId },
      include: { currentCommunity: true },
    });
  },

  clearCurrentCommunity(userId: string) {
    return prisma.user.update({
      where: { id: userId },
      data: { currentCommunityId: null },
    });
  },
};
