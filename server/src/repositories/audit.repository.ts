import { prisma } from '../config/database.js';
import type { Prisma } from '../generated/prisma/client.js';

export interface AuditActor {
  adminId: string | null;
  operatorName: string;
  requestIp?: string;
  requestPath?: string;
  requestId?: string;
}

export interface AuditEvent {
  actor: AuditActor;
  module: string;
  action: string;
  businessDataId?: string;
  description: string;
  beforeData?: unknown;
  afterData?: unknown;
}

const allowedKeys = new Set([
  'asapEnabled',
  'byteSize',
  'categoryId',
  'city',
  'communityIds',
  'cutoffTime',
  'deleted',
  'deliveryTime',
  'district',
  'hasRemark',
  'isHot',
  'maxOrders',
  'mimeType',
  'name',
  'originalPrice',
  'price',
  'purchaseLimit',
  'scheduledEnabled',
  'sortOrder',
  'status',
  'stock',
  'stockWarningThreshold',
  'storeId',
]);

const sensitiveKey =
  /(?:address|phone|recipient|open.?id|union.?id|token|secret|password|private.?key|remark|note|description|detail)/i;

function sanitizeText(value: string): string {
  return value
    .replace(/\b1[3-9]\d{9}\b/g, '[手机号已隐藏]')
    .replace(/bearer\s+[a-z0-9._~-]+/gi, 'Bearer [凭证已隐藏]');
}

function sanitizeJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'string') return sanitizeText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeJson(item))
      .filter((item): item is Prisma.InputJsonValue => item !== undefined);
  }
  if (typeof value !== 'object') return undefined;

  const output: Record<string, Prisma.InputJsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (sensitiveKey.test(key) || !allowedKeys.has(key)) continue;
    const sanitized = sanitizeJson(item);
    if (sanitized !== undefined) output[key] = sanitized;
  }
  return Object.keys(output).length ? (output as Prisma.InputJsonObject) : undefined;
}

function data(event: AuditEvent): Prisma.OperationLogUncheckedCreateInput {
  const beforeData = sanitizeJson(event.beforeData);
  const afterData = sanitizeJson(event.afterData);
  return {
    ...(event.actor.adminId ? { adminId: event.actor.adminId } : {}),
    operatorName: sanitizeText(event.actor.operatorName).slice(0, 64),
    module: event.module.slice(0, 64),
    action: event.action.slice(0, 64),
    ...(event.businessDataId ? { businessDataId: event.businessDataId.slice(0, 64) } : {}),
    description: sanitizeText(event.description).slice(0, 500),
    ...(beforeData !== undefined ? { beforeData } : {}),
    ...(afterData !== undefined ? { afterData } : {}),
    ...(event.actor.requestIp ? { requestIp: event.actor.requestIp.slice(0, 45) } : {}),
    ...(event.actor.requestPath ? { requestPath: event.actor.requestPath.slice(0, 255) } : {}),
    ...(event.actor.requestId ? { requestId: event.actor.requestId.slice(0, 64) } : {}),
  };
}

export function publicAuditJson(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
  return (sanitizeJson(value) as Prisma.JsonValue | undefined) ?? null;
}

export const auditRepository = {
  create(client: Prisma.TransactionClient | typeof prisma, event: AuditEvent) {
    return client.operationLog.create({ data: data(event) });
  },
};
