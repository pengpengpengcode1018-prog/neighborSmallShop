# 数据库结构

- 来源：`server/prisma/schema.prisma`
- 验证：`npm run prisma:validate --workspace @nearby-shop/server`
- 最近刷新：2026-07-15

## 当前模型

| 模型              | 表                   | 目的                                 |
| ----------------- | -------------------- | ------------------------------------ |
| `Admin`           | `admins`             | 第一版平台管理员账号、锁定和登录状态 |
| `AdminLoginLog`   | `admin_login_logs`   | 成功、失败和锁定登录审计             |
| `OperationLog`    | `operation_logs`     | 后台写操作的去敏、不可删除审计       |
| `Community`       | `communities`        | 可配送小区和软删除状态               |
| `Store`           | `stores`             | 店铺、营业时间、起送额和默认配送费   |
| `StoreCommunity`  | `store_communities`  | 店铺配送范围和按小区覆盖配置         |
| `ProductCategory` | `product_categories` | 店铺内商品分类                       |
| `Product`         | `products`           | 单规格商品、价格、库存和上下架状态   |

## 已明确延期

需求说明书列出的用户/地址/购物车、配送时段、订单/状态日志、支付/退款、完整 RBAC、公告和系统配置，分别在对应领域计划中与行为测试一起加入 migration。SKU、营销、配送员和结算不属于第一版。字段和关系以 Prisma schema 为权威。

金额使用 `Decimal(10,2)`，绝对时间使用 UTC `DateTime(3)`，营业钟表时间使用经 Zod 校验的 `HH:mm`。生成内容不直接编辑；schema 变化时同步运行验证并更新本页。
