import { prisma } from '../config/database.js';
import type { AuditActor } from './audit.repository.js';
import { auditRepository } from './audit.repository.js';

export interface MediaAssetCreateInput {
  mimeType: string;
  byteSize: number;
  data: Buffer;
  createdByAdminId: string;
}

export const mediaRepository = {
  create(input: MediaAssetCreateInput, actor: AuditActor) {
    return prisma.$transaction(async (tx) => {
      const created = await tx.mediaAsset.create({
        data: {
          mimeType: input.mimeType,
          byteSize: input.byteSize,
          data: Uint8Array.from(input.data),
          createdByAdminId: input.createdByAdminId,
        },
        select: { id: true, mimeType: true, byteSize: true },
      });
      await auditRepository.create(tx, {
        actor,
        module: 'media',
        action: 'upload',
        businessDataId: created.id,
        description: '上传图片媒体',
        afterData: { mimeType: created.mimeType, byteSize: created.byteSize },
      });
      return created;
    });
  },

  findById(id: string) {
    return prisma.mediaAsset.findUnique({
      where: { id },
      select: { id: true, mimeType: true, byteSize: true, data: true },
    });
  },

  findIds(ids: string[]) {
    return prisma.mediaAsset.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
  },
};
