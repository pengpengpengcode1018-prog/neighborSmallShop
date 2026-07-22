import { ERROR_CODES } from '../constants/error-codes.js';
import { HttpError } from '../middlewares/error.middleware.js';
import { mediaRepository } from '../repositories/media.repository.js';
import type { AuditActor } from '../repositories/audit.repository.js';

export const MAX_MEDIA_BYTES = 512 * 1024;
export const MEDIA_IMAGE_URL_PREFIX = '/api/v1/media/images/';

const extensionMimeTypes: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};
const mediaIdPattern = /^[a-z0-9]{20,30}$/;
const managedUrlPattern = new RegExp(
  `^${MEDIA_IMAGE_URL_PREFIX.replaceAll('/', '\\/')}([a-z0-9]{20,30})$`,
);

export interface ImageUploadInput {
  fileName: string;
  mimeType: string;
  base64: string;
}

function invalidImage(message = '图片文件格式无效'): HttpError {
  return new HttpError(400, ERROR_CODES.VALIDATION_ERROR, message);
}

function detectedMimeType(data: Buffer): 'image/jpeg' | 'image/png' | 'image/webp' | null {
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

function decodeBase64(value: string): Buffer {
  const normalized = value.trim();
  if (!normalized || normalized.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) {
    throw invalidImage();
  }
  const data = Buffer.from(normalized, 'base64');
  if (data.length > MAX_MEDIA_BYTES) {
    throw new HttpError(413, ERROR_CODES.PAYLOAD_TOO_LARGE, '图片不能超过 512KB');
  }
  if (data.length === 0) throw invalidImage();
  return data;
}

function extension(fileName: string): string {
  if (!/^[^/\\]{1,128}$/.test(fileName)) throw invalidImage('图片文件名无效');
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) throw invalidImage('图片扩展名无效');
  return fileName.slice(dot + 1).toLowerCase();
}

function validateUpload(input: ImageUploadInput) {
  const fileName = input.fileName.trim();
  const mimeType = input.mimeType.trim().toLowerCase();
  const expectedMimeType = extensionMimeTypes[extension(fileName)];
  if (!expectedMimeType || mimeType !== expectedMimeType) {
    throw invalidImage('图片扩展名与 MIME 类型不匹配');
  }
  const data = decodeBase64(input.base64);
  if (detectedMimeType(data) !== expectedMimeType) {
    throw invalidImage('图片文件内容与声明类型不匹配');
  }
  return { data, mimeType: expectedMimeType };
}

function mediaUrl(id: string): string {
  return `${MEDIA_IMAGE_URL_PREFIX}${id}`;
}

function mediaIdFromUrl(value: string): string | null {
  const match = managedUrlPattern.exec(value);
  return match?.[1] ?? null;
}

export const mediaService = {
  async uploadImage(input: ImageUploadInput, actor: AuditActor) {
    if (!actor.adminId) throw new HttpError(401, ERROR_CODES.UNAUTHORIZED, '请先登录');
    const validated = validateUpload(input);
    const created = await mediaRepository.create(
      {
        data: validated.data,
        mimeType: validated.mimeType,
        byteSize: validated.data.length,
        createdByAdminId: actor.adminId,
      },
      actor,
    );
    return { ...created, url: mediaUrl(created.id) };
  },

  async getImage(id: string) {
    if (!mediaIdPattern.test(id)) {
      throw new HttpError(404, ERROR_CODES.NOT_FOUND, '图片不存在');
    }
    const asset = await mediaRepository.findById(id);
    if (!asset) throw new HttpError(404, ERROR_CODES.NOT_FOUND, '图片不存在');
    return { data: Buffer.from(asset.data), mimeType: asset.mimeType };
  },

  async assertManagedUrls(values: Array<string | null | undefined>) {
    const urls = values.filter((value): value is string => value !== null && value !== undefined);
    const ids = urls.map(mediaIdFromUrl);
    if (ids.some((id) => id === null)) throw invalidImage('图片地址必须来自受控媒体');
    const uniqueIds = [...new Set(ids as string[])];
    if (uniqueIds.length === 0) return;
    const existing = await mediaRepository.findIds(uniqueIds);
    if (existing.length !== uniqueIds.length) throw invalidImage('图片媒体不存在');
  },
};
