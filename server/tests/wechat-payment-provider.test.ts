import { createCipheriv, createSign, createVerify, generateKeyPairSync } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import {
  createWechatPaymentProvider,
  WechatPaymentProviderError,
} from '../src/providers/wechat-payment.provider.js';

const merchantKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const wechatKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const replacementWechatKeys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const merchantPrivateKey = merchantKeys.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();
const merchantPublicKey = merchantKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const wechatPrivateKey = wechatKeys.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const wechatPublicKey = wechatKeys.publicKey.export({ type: 'spki', format: 'pem' }).toString();
const replacementWechatPrivateKey = replacementWechatKeys.privateKey
  .export({ type: 'pkcs8', format: 'pem' })
  .toString();
const replacementWechatPublicKey = replacementWechatKeys.publicKey
  .export({ type: 'spki', format: 'pem' })
  .toString();
const apiV3Key = '0123456789abcdef0123456789abcdef';
const publicKeyId = 'PUB_KEY_ID_3000000001';
const replacementPublicKeyId = 'PUB_KEY_ID_3000000002';
const primarySigningKey = { id: publicKeyId, privateKey: wechatPrivateKey };
const replacementSigningKey = {
  id: replacementPublicKeyId,
  privateKey: replacementWechatPrivateKey,
};

const config = {
  appId: 'wx-test-app',
  merchantId: '1900000001',
  merchantSerialNo: 'MERCHANT_SERIAL_1',
  merchantPrivateKey,
  apiV3Key,
  publicKeyId,
  publicKeys: { [publicKeyId]: wechatPublicKey },
  notifyUrl: 'https://example.test/api/v1/payments/wechat/notify',
  refundNotifyUrl: 'https://example.test/api/v1/refunds/wechat/notify',
};

function sign(privateKey: string, value: string): string {
  return createSign('RSA-SHA256').update(value).sign(privateKey, 'base64');
}

function signedResponse(body: Record<string, unknown>, signingKey = primarySigningKey): Response {
  const rawBody = JSON.stringify(body);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 'response-nonce';
  return new Response(rawBody, {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'wechatpay-serial': signingKey.id,
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': sign(signingKey.privateKey, `${timestamp}\n${nonce}\n${rawBody}\n`),
    },
  });
}

function signedNoContentResponse(signingKey = primarySigningKey): Response {
  const rawBody = '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 'response-nonce-empty';
  return new Response(null, {
    status: 204,
    headers: {
      'wechatpay-serial': signingKey.id,
      'wechatpay-timestamp': timestamp,
      'wechatpay-nonce': nonce,
      'wechatpay-signature': sign(signingKey.privateKey, `${timestamp}\n${nonce}\n${rawBody}\n`),
    },
  });
}

function encryptedNotification(signingKey = primarySigningKey) {
  const success = {
    appid: config.appId,
    mchid: config.merchantId,
    out_trade_no: 'NS20260717PAYMENT000000000001',
    transaction_id: '420000000000000000000000000001',
    trade_type: 'JSAPI',
    trade_state: 'SUCCESS',
    trade_state_desc: '支付成功',
    success_time: '2026-07-17T14:30:00+08:00',
    amount: { total: 2700, payer_total: 2700, currency: 'CNY', payer_currency: 'CNY' },
  };
  const nonce = 'notify-nonce';
  const associatedData = 'transaction';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(success), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
  const rawBody = JSON.stringify({
    id: 'notify-provider-test',
    create_time: '2026-07-17T14:30:01+08:00',
    event_type: 'TRANSACTION.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: {
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext: encrypted,
      nonce,
      associated_data: associatedData,
    },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureNonce = 'callback-nonce';
  return {
    rawBody,
    serial: signingKey.id,
    timestamp,
    nonce: signatureNonce,
    signature: sign(signingKey.privateKey, `${timestamp}\n${signatureNonce}\n${rawBody}\n`),
  };
}

function encryptedRefundNotification(signingKey = primarySigningKey) {
  const refund = {
    mchid: config.merchantId,
    out_trade_no: 'NS20260717PAYMENT000000000001',
    transaction_id: '420000000000000000000000000001',
    out_refund_no: 'RF2026071700000000000001',
    refund_id: '503000000000000000000000000001',
    refund_status: 'SUCCESS',
    success_time: '2026-07-17T15:30:00+08:00',
    amount: { total: 2700, refund: 2700, currency: 'CNY' },
  };
  const nonce = 'refund-nonce';
  const associatedData = 'refund';
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(apiV3Key), Buffer.from(nonce));
  cipher.setAAD(Buffer.from(associatedData));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(refund), 'utf8'),
    cipher.final(),
    cipher.getAuthTag(),
  ]).toString('base64');
  const rawBody = JSON.stringify({
    id: 'notify-refund-provider-test',
    create_time: '2026-07-17T15:30:01+08:00',
    event_type: 'REFUND.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: {
      original_type: 'refund',
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext: encrypted,
      nonce,
      associated_data: associatedData,
    },
  });
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signatureNonce = 'refund-callback-nonce';
  return {
    rawBody,
    serial: signingKey.id,
    timestamp,
    nonce: signatureNonce,
    signature: sign(signingKey.privateKey, `${timestamp}\n${signatureNonce}\n${rawBody}\n`),
  };
}

describe('WeChat payment provider cryptographic contract', () => {
  it('signs JSAPI orders, verifies the response and returns valid miniapp parameters', async () => {
    const fetchWechat = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.method).toBe('POST');
      expect(init?.headers).toMatchObject({
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'Wechatpay-Serial': publicKeyId,
      });
      expect(String((init?.headers as Record<string, string>).Authorization)).toContain(
        'WECHATPAY2-SHA256-RSA2048',
      );
      expect(JSON.parse(String(init?.body))).toMatchObject({
        appid: config.appId,
        mchid: config.merchantId,
        out_trade_no: 'NS20260717PAYMENT000000000001',
        amount: { total: 2700, currency: 'CNY' },
        payer: { openid: 'openid-provider-test' },
      });
      return signedResponse({ prepay_id: 'wx-prepay-provider-test' });
    });
    const provider = createWechatPaymentProvider(config, fetchWechat);
    const result = await provider.createTransaction({
      orderNo: 'NS20260717PAYMENT000000000001',
      description: '近邻小铺子-测试店铺',
      amountTotal: 2700,
      openId: 'openid-provider-test',
      expiresAt: new Date('2026-07-17T06:45:00.000Z'),
    });
    expect(result.prepayId).toBe('wx-prepay-provider-test');
    expect(result.clientParameters).toMatchObject({
      package: 'prepay_id=wx-prepay-provider-test',
      signType: 'RSA',
    });
    expect(
      createVerify('RSA-SHA256')
        .update(
          `${config.appId}\n${result.clientParameters.timeStamp}\n${result.clientParameters.nonceStr}\n${result.clientParameters.package}\n`,
        )
        .verify(merchantPublicKey, result.clientParameters.paySign, 'base64'),
    ).toBe(true);
  });

  it('verifies the raw callback before decrypting its AES-256-GCM resource', async () => {
    const provider = createWechatPaymentProvider(config);
    await expect(provider.verifyNotification(encryptedNotification())).resolves.toMatchObject({
      notificationId: 'notify-provider-test',
      eventType: 'TRANSACTION.SUCCESS',
      appId: config.appId,
      merchantId: config.merchantId,
      transactionId: '420000000000000000000000000001',
      amountTotal: 2700,
      currency: 'CNY',
    });
  });

  it('rejects invalid and stale callback signatures without exposing provider content', async () => {
    const provider = createWechatPaymentProvider(config);
    const valid = encryptedNotification();
    const invalid = await provider
      .verifyNotification({ ...valid, signature: 'invalid-signature' })
      .catch((error: unknown) => error);
    expect(invalid).toBeInstanceOf(WechatPaymentProviderError);
    expect((invalid as WechatPaymentProviderError).reason).toBe('invalid_notification');

    const staleTimestamp = '1';
    await expect(
      provider.verifyNotification({
        ...valid,
        timestamp: staleTimestamp,
        signature: sign(wechatPrivateKey, `${staleTimestamp}\n${valid.nonce}\n${valid.rawBody}\n`),
      }),
    ).rejects.toMatchObject({ reason: 'invalid_notification' });
  });

  it('selects the exact public key by Wechatpay-Serial throughout a rotation window', async () => {
    const rotatingConfig = {
      ...config,
      publicKeyId: replacementPublicKeyId,
      publicKeys: {
        [publicKeyId]: wechatPublicKey,
        [replacementPublicKeyId]: replacementWechatPublicKey,
      },
    };
    const orderNo = 'NS20260717PAYMENT000000000001';
    const fetchWechat = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ 'Wechatpay-Serial': replacementPublicKeyId });
      return signedResponse(
        {
          appid: config.appId,
          mchid: config.merchantId,
          out_trade_no: orderNo,
          trade_state: 'NOTPAY',
          trade_state_desc: '未支付',
        },
        replacementSigningKey,
      );
    });
    const provider = createWechatPaymentProvider(rotatingConfig, fetchWechat);

    await expect(provider.queryTransaction(orderNo)).resolves.toMatchObject({
      outTradeNo: orderNo,
      tradeState: 'NOTPAY',
    });
    await expect(
      provider.verifyNotification(encryptedNotification(primarySigningKey)),
    ).resolves.toMatchObject({ notificationId: 'notify-provider-test' });
    await expect(
      provider.verifyRefundNotification(encryptedRefundNotification(replacementSigningKey)),
    ).resolves.toMatchObject({ notificationId: 'notify-refund-provider-test' });

    const valid = encryptedNotification(replacementSigningKey);
    await expect(
      provider.verifyNotification({ ...valid, serial: 'PUB_KEY_ID_UNKNOWN' }),
    ).rejects.toMatchObject({ reason: 'invalid_notification' });
    await expect(
      provider.verifyNotification({
        ...valid,
        signature: sign(wechatPrivateKey, `${valid.timestamp}\n${valid.nonce}\n${valid.rawBody}\n`),
      }),
    ).rejects.toMatchObject({ reason: 'invalid_notification' });
  });

  it('validates query identity and signs a 204 no-content close request', async () => {
    const orderNo = 'NS20260717PAYMENT000000000001';
    const fetchWechat = vi
      .fn()
      .mockResolvedValueOnce(
        signedResponse({
          appid: config.appId,
          mchid: config.merchantId,
          out_trade_no: orderNo,
          trade_state: 'NOTPAY',
          trade_state_desc: '未支付',
        }),
      )
      .mockImplementationOnce(async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toContain(`/out-trade-no/${orderNo}/close`);
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toEqual({ mchid: config.merchantId });
        expect(String((init?.headers as Record<string, string>).Authorization)).toContain(
          'WECHATPAY2-SHA256-RSA2048',
        );
        return signedNoContentResponse();
      });
    const provider = createWechatPaymentProvider(config, fetchWechat);

    await expect(provider.queryTransaction(orderNo)).resolves.toMatchObject({
      appId: config.appId,
      merchantId: config.merchantId,
      outTradeNo: orderNo,
      tradeState: 'NOTPAY',
      success: null,
    });
    await expect(provider.closeTransaction(orderNo)).resolves.toBeUndefined();
  });

  it('reuses signed requests for refund application/query and verifies encrypted refund results', async () => {
    const refundResult = {
      refund_id: '503000000000000000000000000001',
      out_refund_no: 'RF2026071700000000000001',
      transaction_id: '420000000000000000000000000001',
      out_trade_no: 'NS20260717PAYMENT000000000001',
      status: 'PROCESSING',
      create_time: '2026-07-17T15:00:00+08:00',
      amount: { total: 2700, refund: 2700, currency: 'CNY' },
    };
    const fetchWechat = vi
      .fn()
      .mockImplementationOnce(async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toContain('/v3/refund/domestic/refunds');
        expect(init?.method).toBe('POST');
        expect(JSON.parse(String(init?.body))).toMatchObject({
          transaction_id: refundResult.transaction_id,
          out_refund_no: refundResult.out_refund_no,
          notify_url: config.refundNotifyUrl,
          amount: { refund: 2700, total: 2700, currency: 'CNY' },
        });
        return signedResponse(refundResult);
      })
      .mockImplementationOnce(async (input: string | URL | Request, init?: RequestInit) => {
        expect(String(input)).toContain(
          `/v3/refund/domestic/refunds/${refundResult.out_refund_no}`,
        );
        expect(init?.method).toBe('GET');
        return signedResponse({
          ...refundResult,
          status: 'SUCCESS',
          success_time: '2026-07-17T15:30:00+08:00',
        });
      });
    const provider = createWechatPaymentProvider(config, fetchWechat);

    await expect(
      provider.createRefund({
        transactionId: refundResult.transaction_id,
        outRefundNo: refundResult.out_refund_no,
        reason: '不想要了',
        amountRefund: 2700,
        amountTotal: 2700,
        currency: 'CNY',
      }),
    ).resolves.toMatchObject({ status: 'PROCESSING', amountRefund: 2700 });
    await expect(provider.queryRefund(refundResult.out_refund_no)).resolves.toMatchObject({
      status: 'SUCCESS',
      successTime: '2026-07-17T15:30:00+08:00',
    });
    await expect(
      provider.verifyRefundNotification(encryptedRefundNotification()),
    ).resolves.toMatchObject({
      notificationId: 'notify-refund-provider-test',
      merchantId: config.merchantId,
      status: 'SUCCESS',
      amountRefund: 2700,
    });
  });
});
