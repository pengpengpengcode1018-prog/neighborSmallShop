# ARCHITECTURE.md

## 系统形态

- 产品：近邻小铺子，固定社区内的多店铺购物和店铺自配送平台
- 核心流程：选小区 -> 浏览单一店铺 -> 购物车 -> 地址与配送时间 -> 下单 -> 微信支付 -> 店铺配送 -> 完成
- 运行面：微信小程序、Web 管理后台、Koa API、定时任务、MySQL、Redis、对象存储与微信平台
- 产品行为真相来源：`docs/product-specs/`

## 仓库与运行单元

| 单元           | 职责                                 | 入口                          | 主要依赖            |
| -------------- | ------------------------------------ | ----------------------------- | ------------------- |
| `miniapp/`     | 居民购物、地址、订单、支付和进度     | `src/main.ts`、`src/pages/`   | uni-app、Vant Weapp |
| `admin-web/`   | 平台基础数据、订单、退款和运营       | `src/main.ts`、`src/router/`  | Vue、Element Plus   |
| `server/`      | 鉴权、业务规则、交易、数据与外部集成 | `src/app.ts`、`src/server.ts` | Koa、Prisma、Redis  |
| `compose.yaml` | 本地 MySQL 与 Redis                  | Docker Compose                | MySQL 8、Redis      |

## 领域地图

| 领域         | 服务端边界                         | 客户端入口           | 规格                      |
| ------------ | ---------------------------------- | -------------------- | ------------------------- |
| 身份与权限   | `auth`、`users`、`admins`          | 登录、个人中心       | `overview-and-scope.md`   |
| 配送地域     | `communities`、`store_communities` | 小区选择、配送范围   | `shopping-journey.md`     |
| 店铺与商品   | `stores`、`categories`、`products` | 首页、店铺、商品     | `shopping-journey.md`     |
| 购物车与地址 | `cart`、`addresses`                | 购物车、地址         | `shopping-journey.md`     |
| 订单与库存   | `orders`、`order_items`、状态日志  | 下单、订单、后台订单 | `order-lifecycle.md`      |
| 支付与退款   | `payments`、`refunds`、微信适配器  | 支付、退款           | `payments-and-refunds.md` |
| 运营治理     | 统计、公告、配置、操作日志         | 看板、系统管理       | `admin-operations.md`     |

## 服务端分层

固定依赖方向：

`Types/Constants -> Config -> Repository -> Service -> Controller/Middleware/Job -> Route -> App`

- Route 只组合路径、中间件与 Controller。
- Controller 只解析输入、调用 Service、映射响应。
- Service 承担事务、状态机、金额、库存和授权规则。
- Repository 封装 Prisma/Redis 读写，不返回未经边界处理的外部输入。
- 微信支付、对象存储、消息发送通过 provider/adapter 接入。
- `npm run verify:architecture` 机械检查低层导入高层的违规边。

## 跨端契约

- API 前缀：`/api/v1`。
- 成功：`{ "code": 0, "message": "success", "data": ... }`。
- 业务失败：稳定字符串错误码、可理解消息和 `data: null`。
- 金额：数据库使用 `Decimal(10,2)`；API 使用两位小数字符串，禁止浮点计算。
- 时间：服务端存 UTC，API 输出 ISO 8601；界面按 `Asia/Shanghai` 展示。
- 标识：业务主键使用 CUID 字符串；订单阶段另加用户可读、唯一的订单号。

## 关键不变量

- 一个购物车和一个订单只能属于一家店铺。
- 地址小区必须在店铺配送范围内；店铺状态、起送价和时间段容量均由服务端校验。
- 创建订单在事务中锁定库存；取消或超时只允许恢复一次。
- 支付回调验签、验金额并幂等；累计退款不超过实付金额。
- 订单、支付、退款和审计记录不可物理删除；店铺、商品、分类、小区和地址软删除。

## 当前热点

- 微信登录、支付、退款和订阅消息尚未接入真实平台凭证。
- 订单并发、库存条件更新和回调幂等在实现前必须先写集成测试计划。
- Vant Weapp 是微信原生组件，只验证 `mp-weixin` 目标，不宣称全端兼容。
