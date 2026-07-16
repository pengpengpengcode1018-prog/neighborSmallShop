import { env } from './env.js';

export const wechatConfig = Object.freeze({
  appId: env.WECHAT_APP_ID,
  appSecret: env.WECHAT_APP_SECRET,
  merchantId: env.WECHAT_MCH_ID,
});
