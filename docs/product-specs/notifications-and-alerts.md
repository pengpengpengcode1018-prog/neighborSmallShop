# 订阅消息与后台提醒

来源：需求说明书第 2、4、36-37、50 页；微信小程序官方
[`wx.requestSubscribeMessage`](https://developers.weixin.qq.com/miniprogram/dev/api/open-api/subscribe-message/wx.requestSubscribeMessage.html)
与[发送订阅消息](https://developers.weixin.qq.com/miniprogram/dev/server/API/mp-message-management/subscribe-message/api_sendmessage.html)契约。

## 居民订阅消息

- 第一版只使用微信一次性订阅，不把一次 `accept` 当作永久开关。授权弹窗只能由居民点击“主动订阅”或支付回调允许的用户行为触发，页面加载、轮询和后台任务不得自动弹窗。
- 允许场景为支付成功、店铺接单、开始配送、送达完成、订单取消和退款成功。模板 ID 与字段关键词只从环境配置读取；仓库不提交真实模板、AppSecret 或 OpenID。
- 一次授权请求最多提交 5 个模板 ID，结果逐项记录 `accept/reject/ban/filter`。相同居民和请求 ID 使用结果摘要幂等；内容不同的重放返回冲突。
- 客户端上报的可用次数只是投递前的保守提示，微信仍是最终授权真相。`accept` 增加一次报告可用次数；`reject/filter` 不撤销旧次数；`ban` 和微信 `43101` 清零。
- 订单状态日志是通知事件源。Worker 按稳定状态日志 ID 创建 outbox，重复扫描不重复发送；禁用居民、未配置模板或没有报告授权时记录稳定跳过原因。
- 发送前短事务原子领取 outbox 并预占一次报告授权，随后离开事务调用微信。成功进入 `SENT`；微信明确未订阅、模板/字段错误或封禁进入可解释终态。
- 只有微信明确返回“未发送且可重试”的错误才按上限延迟重试并归还预占次数。请求已经发出但网络结果未知时进入 `UNKNOWN`，不自动重试，避免居民收到重复消息。
- 消息字段仅包含订单号、店铺名称、状态、发生时间和金额等最小业务信息；不包含姓名、电话、门牌、备注、token 或 OpenID。跳转仅进入当前居民仍需鉴权的订单详情。

## 后台提醒

- 新单提醒来自进入 `PAID` 的状态日志；10 分钟未接单来自当前仍为 `PAID` 且 `paidAt` 已超过阈值的订单；退款提醒来自 `PENDING_REVIEW`；库存不足来自在售/售罄且 `stock <= stockWarningThreshold` 的商品。
- 提醒使用稳定业务去重键。后台轮询只读取提醒，不改变订单、退款或库存；新单和超时未接单可在管理员明确开启本次页面会话的提醒音后响铃。
- 管理员可以把未读提醒标记已读。超时订单被接单、退款离开待审核或库存恢复时，服务端自动把对应提醒标记为已解决；若订单恢复待接单或库存再次跌破阈值，已解决提醒重新打开。
- 提醒内容只包含店铺、订单号、商品名和库存数等必要字段，不保存完整手机号、居民姓名、地址、OpenID 或外部响应。
- 需求中的“10 分钟未接单”第一版只提醒，不自动退款、不释放库存，也不修改订单状态。

## 接口与验收

- 居民：`GET /api/v1/notifications/subscriptions`、`POST /api/v1/notifications/subscriptions/report`。
- 管理员：`GET /api/v1/admin/alerts`、`GET /api/v1/admin/alerts/summary`、`POST /api/v1/admin/alerts/:alertId/read`。
- 验收覆盖授权结果幂等、未知模板、重复事件、并发授权领取、微信错误分类、外部未知结果不重试、禁用账号、提醒去敏、超时解决与库存恢复。
- 真实模板字段、真机授权、微信生产发送、多副本调度和积压告警仍是发布门禁；fixture 成功不能等同于真实消息可达。
