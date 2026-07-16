# 项目初始化

- 状态：Completed
- 日期：2026-07-15
- 关联规格：`../../product-specs/index.md`
- 设计决策：`../../design-docs/0001-monorepo-and-layer-boundaries.md`

## 目标

把需求说明书转成可发现的仓库事实，并建立可安装、可构建、可测试、可干净重启的三端工程基线。

## 范围

- 高级 harness 文档树、质量快照、机器可读功能清单和机械检查。
- npm workspaces、统一格式/类型/测试/构建入口和 CI。
- uni-app/Vue 3/Pinia/Vant Weapp 小程序骨架。
- Vue 3/Vite/Pinia/Element Plus 后台骨架。
- Koa/TypeScript 统一响应、错误处理、日志和健康检查。
- Prisma/MySQL 第一阶段 8 个模型与 MySQL/Redis Compose。

## 非目标

- 不实现真实微信登录、支付、退款、订阅消息或生产部署。
- 不实现管理员登录、CRUD、购物车、订单等业务功能。
- 不创建迁移或写入数据库；模型确认后由后续计划产生首个 migration。

## 关键决策

- 使用 npm workspaces 管理 `admin-web`、`miniapp` 和 `server`，根命令作为唯一验证入口。
- uni-app Vue 3 编译器固定 DCloud `3.0.0-5010520260709002` 批次及其精确 Vite 5 peer；后台独立使用 Vite 8。
- Vant Weapp 作为原生微信小程序组件同步到 `src/wxcomponents`，不把 Vant Vue 用于小程序。
- Prisma 7 首个 schema 只包含管理员审计、小区、店铺、配送范围、分类和商品 8 个模型；其余表随行为和测试进入后续 migration。

## 验证证据

- `npm run verify`：文档、架构、Compose、ESLint、TypeScript、Vitest、三端构建和 Prettier 全部通过。
- `server/tests/health.test.ts`：健康接口与统一 404 响应共 2 个测试通过。
- 管理后台生产构建通过；小程序微信平台构建通过；服务端 Prisma Client 生成与 TypeScript 构建通过。
- 冷启动使用未占用的 `3100` 端口验证：`GET /api/v1/health` 返回 HTTP 200、`code=0` 和 request id；随后进程可干净停止且端口释放。
- `npm audit --omit=dev`：0 critical、9 high、14 moderate、11 low；未使用会破坏 DCloud/Prisma 兼容性的强制修复，已登记技术债。

## 遗留风险

- 微信 AppID、AppSecret、支付证书和生产 JWT secret 尚未配置，也不应写入仓库。
- MySQL/Redis Compose 配置已验证，但首个迁移和真实依赖 readiness 留给下一计划。
- DCloud 编译链依赖审计告警、Sass legacy API 告警和后台首包体积已进入技术债跟踪。

## 进度日志

- 2026-07-15：读取并视觉核验 52 页需求说明书，核对高级 harness 模板，确认三端技术栈、MVP 范围和分阶段顺序。
- 2026-07-15：建立仓库治理面、工程骨架、数据模型、基础设施与验证脚本。
- 2026-07-15：完成依赖隔离、全量验证、API 冷启动和依赖审计；归档计划。
