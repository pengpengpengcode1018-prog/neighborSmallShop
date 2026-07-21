import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { communityRepository } from '../repositories/community.repository.js';
import { userAuthRepository } from '../repositories/user-auth.repository.js';
import { toPublicUser } from './user-auth.service.js';

function communityNotFound(): HttpError {
  return new HttpError(404, ERROR_CODES.COMMUNITY_NOT_FOUND, '配送小区不存在或已停用');
}

export const communitySelectionService = {
  async listAvailable() {
    return { list: await communityRepository.listAvailable() };
  },

  async select(userId: string, communityId: string) {
    const community = await communityRepository.findAvailableById(communityId);
    if (!community) throw communityNotFound();
    const user = await userAuthRepository.updateCurrentCommunity(userId, community.id);
    return toPublicUser(user);
  },
};
