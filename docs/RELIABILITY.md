# 可靠性

## 标准路径

- Bootstrap：`./init.sh`
- 全量验证：`npm run verify`
- 基础设施：`npm run infra:up`，检查 `docker compose ps`
- API：`npm run dev:server`，访问 `GET http://localhost:3000/api/v1/health`
- 后台：`npm run dev:admin`
- 小程序：`npm run dev:miniapp`，用微信开发者工具打开 `miniapp/dist/dev/mp-weixin`

## 必需信号

- API 请求具有 request id、结构化完成日志和统一错误响应。
- `/api/v1/health` 在不依赖业务数据的情况下证明进程可服务。
- 后续数据库与 Redis readiness 独立于 liveness，不用假健康掩盖依赖故障。
- 支付回调、退款、定时关单、库存恢复和后台操作保留去敏审计日志。
- UI 明确提供 loading、empty、success、error 和 retry 状态。

## 黄金旅程

1. 管理员登录 -> 建小区 -> 建店铺 -> 配配送范围 -> 建分类和商品。
2. 用户选小区 -> 浏览单店 -> 加购物车 -> 选地址与时段 -> 创建待支付订单。
3. 微信支付 -> 后台接单和配送状态流转 -> 用户看到完成。
4. 可取消或退款的订单 -> 幂等处理 -> 库存和金额一致。

每条旅程在进入实现计划时必须补 API 集成测试；用户可见流程还需浏览器或微信开发者工具证据。

## 故障与重启

- 进程重启不丢失业务真相；MySQL 为权威数据源，Redis 只承载可重建状态或有明确恢复策略。
- 同一外部回调和同一请求 id 可安全重放。
- 某类故障重复两次以上时，将其升级成测试、健康信号或 guardrail。
- `npm run verify`、容器重启和服务冷启动未通过时，功能不能标记 passing。
