import { http } from './http';
import type { ApiSuccess } from '../types/api';

export interface UploadedImage {
  id: string;
  url: string;
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
}

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const maxImageBytes = 512 * 1024;
const compressionDimensions = [2048, 1600, 1280, 1024, 800];
const compressionQualities = [0.82, 0.7, 0.58, 0.46, 0.34, 0.24];
const compressionFormats = [
  { mimeType: 'image/webp' as const, extension: 'webp' },
  { mimeType: 'image/jpeg' as const, extension: 'jpg' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) reject(new Error('图片读取失败'));
      else resolve(result);
    };
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.readAsDataURL(file);
  });
}

async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const comma = dataUrl.indexOf(',');
  if (comma < 0) throw new Error('图片读取失败');
  return dataUrl.slice(comma + 1);
}

function loadImageSource(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error('图片解码失败，请选择 PNG、JPEG 或 WebP 图片文件'));
    };
    image.src = source;
  });
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  try {
    const objectUrl = URL.createObjectURL(file);
    try {
      return await loadImageSource(objectUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  } catch {
    // Some browsers or privacy settings reject blob URLs; retry with an in-memory data URL.
    try {
      return loadImageSource(await fileToDataUrl(file));
    } catch {
      throw new Error('图片解码失败，请选择 PNG、JPEG 或 WebP 图片文件');
    }
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.type !== mimeType) {
          reject(new Error('当前浏览器不支持图片压缩'));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}

function compressedFileName(fileName: string, extension: string): string {
  const stem = fileName.replace(/\.[^.]+$/, '').trim() || 'image';
  return `${stem}.${extension}`;
}

async function compressImage(file: File): Promise<File | null> {
  const image = await loadImage(file);
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (!sourceWidth || !sourceHeight) return null;

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;

  for (const maxDimension of compressionDimensions) {
    const scale = Math.min(1, maxDimension / sourceWidth, maxDimension / sourceHeight);
    canvas.width = Math.max(1, Math.round(sourceWidth * scale));
    canvas.height = Math.max(1, Math.round(sourceHeight * scale));
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);

    for (const format of compressionFormats) {
      for (const quality of compressionQualities) {
        try {
          const blob = await canvasToBlob(canvas, format.mimeType, quality);
          if (blob.size <= maxImageBytes) {
            return new File([blob], compressedFileName(file.name, format.extension), {
              type: format.mimeType,
              lastModified: file.lastModified,
            });
          }
        } catch {
          // Try the next output format or quality; the server remains the final validator.
        }
      }
    }
  }
  return null;
}

export async function uploadImage(file: File): Promise<UploadedImage & { compressed: boolean }> {
  if (!allowedMimeTypes.has(file.type)) throw new Error('仅支持 PNG、JPEG 或 WebP 图片');
  const preparedFile = file.size > maxImageBytes ? await compressImage(file) : file;
  if (!preparedFile) {
    throw new Error('图片过大，自动压缩后仍超过 512KB，请选择更小的图片');
  }
  const response = await http.post<ApiSuccess<UploadedImage>>('/admin/media/images', {
    fileName: preparedFile.name,
    mimeType: preparedFile.type,
    base64: await fileToBase64(preparedFile),
  });
  return { ...response.data.data, compressed: preparedFile !== file };
}
