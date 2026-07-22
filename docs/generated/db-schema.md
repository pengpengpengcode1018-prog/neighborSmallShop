# 数据库结构

- 来源：`server/prisma/schema.prisma`
- 验证：`npm run prisma:validate --workspace @nearby-shop/server`
- 最近刷新：2026-07-22

## 当前模型

| 模型                         | 表                              | 目的                                                       |
| ---------------------------- | ------------------------------- | ---------------------------------------------------------- |
| `Admin`                      | `admins`                        | 第一版平台管理员账号、锁定和登录状态                       |
| `AdminLoginLog`              | `admin_login_logs`              | 成功、失败和锁定登录审计                                   |
| `User`                       | `users`                         | 居民微信身份、可选昵称头像、验证手机号、当前小区和登录状态 |
| `UserLoginLog`               | `user_login_logs`               | 去敏的居民登录成功、失败和禁用审计                         |
| `OperationLog`               | `operation_logs`                | 后台写操作的去敏、不可删除审计                             |
| `Community`                  | `communities`                   | 可配送小区和软删除状态                                     |
| `Store`                      | `stores`                        | 店铺、Logo/封面、营业时间、配送方式、起送额和默认配送费    |
| `StoreCommunity`             | `store_communities`             | 店铺配送范围和按小区覆盖配置                               |
| `DeliverySlot`               | `delivery_slots`                | 每日预约送达时刻、截止时间和订单容量                       |
| `ProductCategory`            | `product_categories`            | 店铺内商品分类                                             |
| `Product`                    | `products`                      | 单规格商品、主图/轮播图、价格、库存和上下架状态            |
| `Cart`                       | `carts`                         | 居民当前单店铺购物车                                       |
| `CartItem`                   | `cart_items`                    | 购物车商品与当前选择数量                                   |
| `Address`                    | `addresses`                     | 居民收货地址、平台小区、默认与软删除状态                   |
| `Order`                      | `orders`                        | 订单状态、幂等请求、履约节点和交易快照                     |
| `OrderItem`                  | `order_items`                   | 不可变商品名称、图片、成交价、数量与小计快照               |
| `OrderStatusLog`             | `order_status_logs`             | 不可删除的订单状态变化与操作人审计                         |
| `Payment`                    | `payments`                      | 每单唯一微信支付、关单租约、状态与交易标识                 |
| `PaymentNotification`        | `payment_notifications`         | 去原文的通知/查单幂等键、摘要与处理审计                    |
| `Refund`                     | `refunds`                       | 每单唯一整单退款、审核、微信状态与金额快照                 |
| `RefundNotification`         | `refund_notifications`          | 去原文的退款通知幂等键、摘要与处理审计                     |
| `SubscriptionConsent`        | `subscription_consents`         | 居民按模板报告的一次性授权结果与剩余次数                   |
| `SubscriptionConsentReceipt` | `subscription_consent_receipts` | 授权结果请求的幂等摘要                                     |
| `UserNotification`           | `user_notifications`            | 从订单状态日志派生的居民消息 outbox                        |
| `AdminAlert`                 | `admin_alerts`                  | 新单、超时、退款和低库存的去敏后台提醒                     |
| `MediaAsset`                 | `media_assets`                  | 管理员上传的不可变 PNG/JPEG/WebP 图片二进制与受控媒体标识  |

## 已明确延期

需求说明书列出的完整 RBAC、公告和系统配置，分别在对应领域计划中与行为测试一起加入 migration。部分退款、SKU、营销、配送员和结算不属于第一版。字段和关系以 Prisma schema 为权威。

金额使用 `Decimal(10,2)`，绝对时间使用 UTC `DateTime(3)`，营业钟表时间使用经 Zod 校验的 `HH:mm`。生成内容不直接编辑；schema 变化时同步运行验证并更新本页。

预约配送时段同样使用 `HH:mm`，按每日固定送达时刻建模；停止下单时刻必须早于同日送达时刻，同一店铺的送达时刻唯一。时段不提供删除 API，停用后保留配置。

微信登录临时 code、手机号动态 code、access token 与 session key 不落库。`users` 只保存服务所需的稳定微信身份、居民主动提交的可选昵称与受控头像、经微信平台验证且全局唯一的可选手机号和当前小区；头像二进制只接受 PNG、JPEG、WebP 且不超过 512 KiB，对外通过受控读取接口返回。`user_login_logs` 只保存稳定失败分类，不保存 code、OpenID、session key 或 JWT。本人资料可按地址预填需要返回完整手机号，后台居民查询只返回脱敏号码、绑定状态及可展示资料，不返回头像二进制。

`users.current_community_id` 可空并引用固定小区；居民只能通过服务端选择启用且未删除的小区。管理员后续停用或软删除已选小区时，资料恢复会清空该引用，避免失效范围继续参与下单判断。

`media_assets` 由管理员上传产生，保存已验证的 MIME、字节数和二进制内容；创建管理员删除时仅置空创建者引用，媒体本身不可变且无公共覆盖/删除 API。店铺 Logo/封面和商品主图/轮播图字段只保存服务端生成的 `/api/v1/media/images/:id` URL，历史订单继续使用创建时的独立图片 URL。

`carts.user_id` 唯一，保证每位居民同时只有一个购物车；`carts.store_id` 固定其单店上下文，跨店替换必须在事务中先清空旧 `cart_items`。购物车项只保存商品引用和数量，价格、库存、配送费与起送额每次读取和写入时从权威表重新计算；清空购物车可以物理删除当前临时状态，不影响未来订单快照。

`addresses` 按居民隔离并使用 `deleted_at` 软删除；`community_id` 只能引用平台固定小区，小区失效后保留地址供居民编辑或删除。`default_key` 只在默认地址上保存居民 ID，其可空唯一索引从数据库层阻止一个居民出现多个默认地址；`last_used_at` 在订单创建成功时更新，删除默认地址时优先选择最近使用、否则选择最近编辑的剩余地址。历史订单保存独立地址快照，不回读可变地址。

`orders` 以 `(user_id, request_id)` 唯一键兜底居民创建幂等，并保存请求参数 SHA-256、预览版本、店铺名称/Logo/电话、地址、配送和金额快照；初始状态固定为 `pending_payment`，`expires_at` 为创建后 15 分钟。订单同时保存支付、接单、制作、待配送、配送中、完成和取消节点时间，以及只向后台返回的内部备注。`order_items` 保存成交商品快照，`order_status_logs` 保存首条及后续状态审计；三张表均不提供物理删除业务。预约创建先锁定 `delivery_slots` 行再统计指定日期容量，库存使用 `stock >= quantity` 条件扣减；待付款取消/关闭使用 `stock_released` 条件位保证库存只恢复一次，任一失败由同一事务整体回滚。

`payments.order_id`、`out_trade_no` 和可空 `transaction_id` 分别唯一，保证每单一个商户支付号且微信交易不可重复入账；金额使用订单快照 Decimal，状态区分创建中、待支付、关闭中、成功、失败和关闭。关单原因/操作人、领取时间、最近尝试、尝试次数和完成时间形成可过期租约与恢复审计；支付成功在最终本地关单前仍可通过订单行锁胜出。`payment_notifications.notification_id` 唯一，通知与可信查单只保存 SHA-256 摘要、交易号、来源和处理结果，不保存回调原文。支付成功原子更新 `payments`、`orders`、商品销量、通知审计和订单状态日志；确认关单原子更新支付/订单、恢复一次库存并写状态审计。

`refunds.order_id` 和 `payment_id` 唯一，第一版从数据库层限定一单一次整单退款；`(user_id, request_id)`、`refund_no`、可空 `provider_refund_id` 分别唯一，保证居民申请和微信原号重试幂等。退款金额复制自成功支付 Decimal，状态区分待审核、已通过、已拒绝、处理中、成功和失败，并保存审核人、稳定失败分类、外部尝试与查询时间。`refund_notifications.notification_id` 唯一，只保存通知摘要和处理结果。退款写事务以 `READ COMMITTED` 配合订单/退款行锁抵御等待锁后的旧快照；可信成功原子更新退款/订单、恢复一次库存、扣回一次销量并写状态日志。

`subscription_consents` 以 `(user_id, template_id)` 唯一，保存客户端最近报告决定和保守可用次数；`subscription_consent_receipts` 以 `(user_id, request_id)` 唯一并保存参数 SHA-256，阻止重复结果增加次数。`user_notifications.source_status_log_id` 唯一，使重复事件发现只生成一个 outbox；发送状态区分待发送、发送中、成功、跳过、失败和外部未知，状态日志清理时派生 outbox 级联清理，但生产业务不提供删除状态日志的入口。

`admin_alerts.dedupe_key` 唯一，提醒只保存资源类型/标识、店铺/订单/商品的去敏摘要、严重级别和未读/已读/已解决状态。提醒不对订单、退款或商品建立级联业务关系，状态恢复由幂等刷新任务依据权威表判断。

`operation_logs.request_id` 独立保存服务端请求标识并建立索引，IP 和路径继续保留为请求上下文；before/after 只写白名单业务摘要，列表不查询 JSON，详情输出前再次去敏。支付成功时间和退款完成时间分别建立 `(status, succeeded_at)`、`(status, completed_at)` 索引，为 7/30 天经营窗口提供有界扫描。
