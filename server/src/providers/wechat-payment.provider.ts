import { createDecipheriv, createHash, createSign, createVerify, randomBytes } from 'node:crypto';

import { wechatConfig } from '../config/wechat.js';

const WECHAT_API_ORIGIN = 'https://api.mch.weixin.qq.com';
const REQUEST_TIMEOUT_MS = 5_000;
const CALLBACK_CLOCK_SKEW_SECONDS = 5 * 60;

export interface WechatClientPaymentParameters {
  timeStamp: string;
  nonceStr: string;
  package: string;
  signType: 'RSA';
  paySign: string;
}

export interface CreateWechatTransactionInput {
  orderNo: string;
  description: string;
  amountTotal: number;
  openId: string;
  expiresAt: Date;
}

export interface WechatPaymentSuccess {
  appId: string;
  merchantId: string;
  outTradeNo: string;
  transactionId: string;
  tradeState: 'SUCCESS';
  successTime: string;
  amountTotal: number;
  currency: string;
}

export interface WechatPaymentNotification extends WechatPaymentSuccess {
  notificationId: string;
  eventType: string;
  payloadDigest: string;
}

export interface WechatPaymentQueryResult {
  appId: string;
  merchantId: string;
  outTradeNo: string;
  tradeState: string;
  success: WechatPaymentSuccess | null;
}

export type WechatRefundProviderStatus = 'SUCCESS' | 'CLOSED' | 'PROCESSING' | 'ABNORMAL';

export interface CreateWechatRefundInput {
  transactionId: string;
  outRefundNo: string;
  reason: string;
  amountRefund: number;
  amountTotal: number;
  currency: 'CNY';
}

export interface WechatRefundResult {
  refundId: string;
  outRefundNo: string;
  transactionId: string;
  outTradeNo: string;
  status: WechatRefundProviderStatus;
  amountRefund: number;
  amountTotal: number;
  currency: string;
  successTime: string | null;
}

export interface WechatRefundNotification extends WechatRefundResult {
  merchantId: string;
  notificationId: string;
  eventType: string;
  payloadDigest: string;
}

export interface WechatNotificationRequest {
  serial: string;
  signature: string;
  timestamp: string;
  nonce: string;
  rawBody: string;
}

export interface WechatPaymentProvider {
  readonly merchant: { appId: string; merchantId: string } | null;
  createTransaction(input: CreateWechatTransactionInput): Promise<{
    prepayId: string;
    clientParameters: WechatClientPaymentParameters;
  }>;
  buildClientParameters(prepayId: string): WechatClientPaymentParameters;
  verifyNotification(input: WechatNotificationRequest): Promise<WechatPaymentNotification>;
  queryTransaction(orderNo: string): Promise<WechatPaymentQueryResult>;
  closeTransaction(orderNo: string): Promise<void>;
}

export interface WechatRefundProvider {
  readonly merchant: { appId: string; merchantId: string } | null;
  createRefund(input: CreateWechatRefundInput): Promise<WechatRefundResult>;
  queryRefund(outRefundNo: string): Promise<WechatRefundResult>;
  verifyRefundNotification(input: WechatNotificationRequest): Promise<WechatRefundNotification>;
}

export interface WechatPaymentProviderConfig {
  appId?: string;
  merchantId?: string;
  merchantSerialNo?: string;
  merchantPrivateKey?: string;
  apiV3Key?: string;
  publicKeyId?: string;
  publicKeys?: Readonly<Record<string, string>>;
  /** @deprecated Use publicKeys for rotation-safe verification. */
  publicKey?: string;
  notifyUrl?: string;
  refundNotifyUrl?: string;
}

export type WechatPaymentFetch = (
  input: string | URL | globalThis.Request,
  init?: RequestInit,
) => Promise<Response>;

export type WechatPaymentProviderFailure =
  'not_configured' | 'unavailable' | 'rejected' | 'invalid_notification';

export class WechatPaymentProviderError extends Error {
  constructor(public readonly reason: WechatPaymentProviderFailure) {
    super(`wechat_payment_provider_${reason}`);
    this.name = 'WechatPaymentProviderError';
  }
}

interface RequiredWechatPaymentConfig {
  appId: string;
  merchantId: string;
  merchantSerialNo: string;
  merchantPrivateKey: string;
  apiV3Key: string;
  publicKeyId: string;
  publicKeys: ReadonlyMap<string, string>;
  notifyUrl: string;
  refundNotifyUrl?: string;
}

function normalizePem(value: string): string {
  return value.replaceAll('\\n', '\n');
}

function requireConfig(config: WechatPaymentProviderConfig): RequiredWechatPaymentConfig {
  const publicKeyId = config.publicKeyId?.trim();
  const publicKeys = new Map(
    Object.entries(config.publicKeys ?? {}).map(
      ([id, publicKey]) => [id.trim(), normalizePem(publicKey)] as const,
    ),
  );
  if (publicKeyId && config.publicKey) {
    const normalizedLegacyKey = normalizePem(config.publicKey);
    const configuredKey = publicKeys.get(publicKeyId);
    if (configuredKey && configuredKey !== normalizedLegacyKey) {
      throw new WechatPaymentProviderError('not_configured');
    }
    publicKeys.set(publicKeyId, normalizedLegacyKey);
  }
  if (
    !config.appId ||
    !config.merchantId ||
    !config.merchantSerialNo ||
    !config.merchantPrivateKey ||
    !config.apiV3Key ||
    !publicKeyId ||
    !publicKeys.has(publicKeyId) ||
    publicKeys.size === 0 ||
    publicKeys.size > 8 ||
    [...publicKeys].some(([id, publicKey]) => !id || !publicKey.trim()) ||
    !config.notifyUrl ||
    Buffer.byteLength(config.apiV3Key) !== 32
  ) {
    throw new WechatPaymentProviderError('not_configured');
  }
  return {
    appId: config.appId,
    merchantId: config.merchantId,
    merchantSerialNo: config.merchantSerialNo,
    merchantPrivateKey: normalizePem(config.merchantPrivateKey),
    apiV3Key: config.apiV3Key,
    publicKeyId,
    publicKeys,
    notifyUrl: config.notifyUrl,
    ...(config.refundNotifyUrl ? { refundNotifyUrl: config.refundNotifyUrl } : {}),
  };
}

function nonce(): string {
  return randomBytes(16).toString('hex');
}

function rsaSign(privateKey: string, value: string): string {
  return createSign('RSA-SHA256').update(value).sign(privateKey, 'base64');
}

function verifyWechatSignature(
  config: RequiredWechatPaymentConfig,
  serial: string | null,
  signature: string | null,
  timestamp: string | null,
  nonceValue: string | null,
  rawBody: string,
  checkClock: boolean,
): void {
  const publicKey = serial ? config.publicKeys.get(serial) : undefined;
  if (!publicKey || !signature || !timestamp || !nonceValue) {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  const timestampNumber = Number(timestamp);
  if (
    !Number.isInteger(timestampNumber) ||
    (checkClock &&
      Math.abs(Math.floor(Date.now() / 1000) - timestampNumber) > CALLBACK_CLOCK_SKEW_SECONDS)
  ) {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  const valid = createVerify('RSA-SHA256')
    .update(`${timestamp}\n${nonceValue}\n${rawBody}\n`)
    .verify(publicKey, signature, 'base64');
  if (!valid) throw new WechatPaymentProviderError('invalid_notification');
}

function authorization(
  config: RequiredWechatPaymentConfig,
  method: string,
  canonicalUrl: string,
  body: string,
): string {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceValue = nonce();
  const signature = rsaSign(
    config.merchantPrivateKey,
    `${method}\n${canonicalUrl}\n${timestamp}\n${nonceValue}\n${body}\n`,
  );
  return `WECHATPAY2-SHA256-RSA2048 mchid="${config.merchantId}",nonce_str="${nonceValue}",signature="${signature}",timestamp="${timestamp}",serial_no="${config.merchantSerialNo}"`;
}

function decryptResource(config: RequiredWechatPaymentConfig, value: unknown): unknown {
  if (!value || typeof value !== 'object') {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  const resource = value as Record<string, unknown>;
  if (
    resource.algorithm !== 'AEAD_AES_256_GCM' ||
    typeof resource.nonce !== 'string' ||
    typeof resource.associated_data !== 'string' ||
    typeof resource.ciphertext !== 'string'
  ) {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  try {
    const encrypted = Buffer.from(resource.ciphertext, 'base64');
    if (encrypted.length <= 16) throw new Error('ciphertext too short');
    const decipher = createDecipheriv(
      'aes-256-gcm',
      Buffer.from(config.apiV3Key),
      Buffer.from(resource.nonce),
    );
    decipher.setAAD(Buffer.from(resource.associated_data));
    decipher.setAuthTag(encrypted.subarray(-16));
    const plain = Buffer.concat([
      decipher.update(encrypted.subarray(0, -16)),
      decipher.final(),
    ]).toString('utf8');
    return JSON.parse(plain) as unknown;
  } catch {
    throw new WechatPaymentProviderError('invalid_notification');
  }
}

function paymentSuccess(value: unknown): WechatPaymentSuccess {
  if (!value || typeof value !== 'object') {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  const body = value as Record<string, unknown>;
  const amount = body.amount;
  if (!amount || typeof amount !== 'object') {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  const amountValue = amount as Record<string, unknown>;
  if (
    typeof body.appid !== 'string' ||
    typeof body.mchid !== 'string' ||
    typeof body.out_trade_no !== 'string' ||
    typeof body.transaction_id !== 'string' ||
    body.trade_state !== 'SUCCESS' ||
    typeof body.success_time !== 'string' ||
    !Number.isInteger(amountValue.total) ||
    typeof amountValue.currency !== 'string'
  ) {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  return {
    appId: body.appid,
    merchantId: body.mchid,
    outTradeNo: body.out_trade_no,
    transactionId: body.transaction_id,
    tradeState: 'SUCCESS',
    successTime: body.success_time,
    amountTotal: amountValue.total as number,
    currency: amountValue.currency,
  };
}

const refundProviderStatuses = new Set<WechatRefundProviderStatus>([
  'SUCCESS',
  'CLOSED',
  'PROCESSING',
  'ABNORMAL',
]);

function refundResult(value: unknown, statusField: 'status' | 'refund_status'): WechatRefundResult {
  if (!value || typeof value !== 'object') {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  const body = value as Record<string, unknown>;
  const amount = body.amount;
  const status = body[statusField];
  if (!amount || typeof amount !== 'object' || typeof status !== 'string') {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  const amountValue = amount as Record<string, unknown>;
  if (
    typeof body.refund_id !== 'string' ||
    typeof body.out_refund_no !== 'string' ||
    typeof body.transaction_id !== 'string' ||
    typeof body.out_trade_no !== 'string' ||
    !refundProviderStatuses.has(status as WechatRefundProviderStatus) ||
    !Number.isInteger(amountValue.refund) ||
    !Number.isInteger(amountValue.total) ||
    typeof amountValue.currency !== 'string' ||
    (body.success_time !== undefined && typeof body.success_time !== 'string')
  ) {
    throw new WechatPaymentProviderError('invalid_notification');
  }
  return {
    refundId: body.refund_id,
    outRefundNo: body.out_refund_no,
    transactionId: body.transaction_id,
    outTradeNo: body.out_trade_no,
    status: status as WechatRefundProviderStatus,
    amountRefund: amountValue.refund as number,
    amountTotal: amountValue.total as number,
    currency: amountValue.currency,
    successTime: typeof body.success_time === 'string' ? body.success_time : null,
  };
}

export function createWechatPaymentProvider(
  inputConfig: WechatPaymentProviderConfig,
  fetchWechat: WechatPaymentFetch = fetch,
): WechatPaymentProvider & WechatRefundProvider {
  const configured = () => requireConfig(inputConfig);
  const merchant =
    inputConfig.appId && inputConfig.merchantId
      ? { appId: inputConfig.appId, merchantId: inputConfig.merchantId }
      : null;

  async function requestWechat(
    method: 'GET' | 'POST',
    canonicalUrl: string,
    requestBody = '',
    expectNoContent = false,
  ): Promise<Record<string, unknown>> {
    const config = configured();
    let response: Response;
    try {
      response = await fetchWechat(`${WECHAT_API_ORIGIN}${canonicalUrl}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization(config, method, canonicalUrl, requestBody),
          'Wechatpay-Serial': config.publicKeyId,
          ...(requestBody ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(requestBody ? { body: requestBody } : {}),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new WechatPaymentProviderError('unavailable');
    }
    const rawBody = await response.text();
    try {
      verifyWechatSignature(
        config,
        response.headers.get('wechatpay-serial'),
        response.headers.get('wechatpay-signature'),
        response.headers.get('wechatpay-timestamp'),
        response.headers.get('wechatpay-nonce'),
        rawBody,
        false,
      );
    } catch {
      throw new WechatPaymentProviderError('unavailable');
    }
    if (!response.ok) throw new WechatPaymentProviderError('rejected');
    if (expectNoContent) {
      if (response.status !== 204 || rawBody.length !== 0) {
        throw new WechatPaymentProviderError('unavailable');
      }
      return {};
    }
    try {
      const parsed = JSON.parse(rawBody) as unknown;
      if (!parsed || typeof parsed !== 'object') throw new Error('invalid response');
      return parsed as Record<string, unknown>;
    } catch {
      throw new WechatPaymentProviderError('unavailable');
    }
  }

  function buildClientParameters(prepayId: string): WechatClientPaymentParameters {
    const config = configured();
    const timeStamp = Math.floor(Date.now() / 1000).toString();
    const nonceStr = nonce();
    const packageValue = `prepay_id=${prepayId}`;
    return {
      timeStamp,
      nonceStr,
      package: packageValue,
      signType: 'RSA',
      paySign: rsaSign(
        config.merchantPrivateKey,
        `${config.appId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`,
      ),
    };
  }

  return {
    merchant,
    async createTransaction(input) {
      const config = configured();
      const body = JSON.stringify({
        appid: config.appId,
        mchid: config.merchantId,
        description: input.description,
        out_trade_no: input.orderNo,
        time_expire: input.expiresAt.toISOString(),
        notify_url: config.notifyUrl,
        amount: { total: input.amountTotal, currency: 'CNY' },
        payer: { openid: input.openId },
      });
      const response = await requestWechat('POST', '/v3/pay/transactions/jsapi', body);
      if (typeof response.prepay_id !== 'string') {
        throw new WechatPaymentProviderError('unavailable');
      }
      return {
        prepayId: response.prepay_id,
        clientParameters: buildClientParameters(response.prepay_id),
      };
    },

    buildClientParameters,

    async verifyNotification(input) {
      const config = configured();
      verifyWechatSignature(
        config,
        input.serial,
        input.signature,
        input.timestamp,
        input.nonce,
        input.rawBody,
        true,
      );
      let envelope: Record<string, unknown>;
      try {
        const parsed = JSON.parse(input.rawBody) as unknown;
        if (!parsed || typeof parsed !== 'object') throw new Error('invalid body');
        envelope = parsed as Record<string, unknown>;
      } catch {
        throw new WechatPaymentProviderError('invalid_notification');
      }
      if (typeof envelope.id !== 'string' || envelope.event_type !== 'TRANSACTION.SUCCESS') {
        throw new WechatPaymentProviderError('invalid_notification');
      }
      const success = paymentSuccess(decryptResource(config, envelope.resource));
      if (success.appId !== config.appId || success.merchantId !== config.merchantId) {
        throw new WechatPaymentProviderError('invalid_notification');
      }
      return {
        notificationId: envelope.id,
        eventType: envelope.event_type,
        payloadDigest: createHash('sha256').update(input.rawBody).digest('hex'),
        ...success,
      };
    },

    async queryTransaction(orderNo) {
      const config = configured();
      const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}?mchid=${encodeURIComponent(config.merchantId)}`;
      const response = await requestWechat('GET', path);
      if (
        typeof response.appid !== 'string' ||
        typeof response.mchid !== 'string' ||
        typeof response.out_trade_no !== 'string' ||
        typeof response.trade_state !== 'string' ||
        response.appid !== config.appId ||
        response.mchid !== config.merchantId ||
        response.out_trade_no !== orderNo
      ) {
        throw new WechatPaymentProviderError('unavailable');
      }
      const success = response.trade_state === 'SUCCESS' ? paymentSuccess(response) : null;
      return {
        appId: response.appid,
        merchantId: response.mchid,
        outTradeNo: response.out_trade_no,
        tradeState: response.trade_state,
        success,
      };
    },

    async closeTransaction(orderNo) {
      const config = configured();
      const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderNo)}/close`;
      await requestWechat('POST', path, JSON.stringify({ mchid: config.merchantId }), true);
    },

    async createRefund(input) {
      const config = configured();
      if (!config.refundNotifyUrl) throw new WechatPaymentProviderError('not_configured');
      const body = JSON.stringify({
        transaction_id: input.transactionId,
        out_refund_no: input.outRefundNo,
        reason: input.reason,
        notify_url: config.refundNotifyUrl,
        amount: {
          refund: input.amountRefund,
          total: input.amountTotal,
          currency: input.currency,
        },
      });
      return refundResult(
        await requestWechat('POST', '/v3/refund/domestic/refunds', body),
        'status',
      );
    },

    async queryRefund(outRefundNo) {
      const path = `/v3/refund/domestic/refunds/${encodeURIComponent(outRefundNo)}`;
      return refundResult(await requestWechat('GET', path), 'status');
    },

    async verifyRefundNotification(input) {
      const config = configured();
      verifyWechatSignature(
        config,
        input.serial,
        input.signature,
        input.timestamp,
        input.nonce,
        input.rawBody,
        true,
      );
      let envelope: Record<string, unknown>;
      try {
        const parsed = JSON.parse(input.rawBody) as unknown;
        if (!parsed || typeof parsed !== 'object') throw new Error('invalid body');
        envelope = parsed as Record<string, unknown>;
      } catch {
        throw new WechatPaymentProviderError('invalid_notification');
      }
      const eventType = envelope.event_type;
      const resource = envelope.resource;
      if (
        typeof envelope.id !== 'string' ||
        typeof eventType !== 'string' ||
        !['REFUND.SUCCESS', 'REFUND.CLOSED', 'REFUND.ABNORMAL'].includes(eventType) ||
        !resource ||
        typeof resource !== 'object' ||
        (resource as Record<string, unknown>).original_type !== 'refund'
      ) {
        throw new WechatPaymentProviderError('invalid_notification');
      }
      const decrypted = decryptResource(config, resource);
      if (!decrypted || typeof decrypted !== 'object') {
        throw new WechatPaymentProviderError('invalid_notification');
      }
      const merchantId = (decrypted as Record<string, unknown>).mchid;
      if (typeof merchantId !== 'string' || merchantId !== config.merchantId) {
        throw new WechatPaymentProviderError('invalid_notification');
      }
      return {
        merchantId,
        notificationId: envelope.id,
        eventType,
        payloadDigest: createHash('sha256').update(input.rawBody).digest('hex'),
        ...refundResult(decrypted, 'refund_status'),
      };
    },
  };
}

export const officialWechatPaymentProvider = createWechatPaymentProvider({
  ...(wechatConfig.appId ? { appId: wechatConfig.appId } : {}),
  ...(wechatConfig.merchantId ? { merchantId: wechatConfig.merchantId } : {}),
  ...(wechatConfig.merchantSerialNo ? { merchantSerialNo: wechatConfig.merchantSerialNo } : {}),
  ...(wechatConfig.merchantPrivateKey
    ? { merchantPrivateKey: wechatConfig.merchantPrivateKey }
    : {}),
  ...(wechatConfig.apiV3Key ? { apiV3Key: wechatConfig.apiV3Key } : {}),
  ...(wechatConfig.publicKeyId ? { publicKeyId: wechatConfig.publicKeyId } : {}),
  ...(wechatConfig.publicKeys ? { publicKeys: wechatConfig.publicKeys } : {}),
  ...(wechatConfig.notifyUrl ? { notifyUrl: wechatConfig.notifyUrl } : {}),
  ...(wechatConfig.refundNotifyUrl ? { refundNotifyUrl: wechatConfig.refundNotifyUrl } : {}),
});
