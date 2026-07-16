# 近邻小铺子

面向固定社区居民与周边商家的本地购物、微信支付和店铺自配送平台。仓库当前完成了第一阶段的工程初始化：微信小程序、后台管理端、Koa API、Prisma 数据模型以及 MySQL/Redis 本地基础设施均已有可验证基线。

## 快速开始

要求 Node.js 22+、npm 10+ 和 Docker。

```bash
./init.sh
npm run infra:up
npm run dev:server
```

另开终端启动后台或微信小程序编译：

```bash
npm run dev:admin
npm run dev:miniapp
```

- API 健康检查：`http://localhost:3000/api/v1/health`
- 后台开发地址：`http://localhost:5173`
- 微信小程序产物：`miniapp/dist/dev/mp-weixin`

## 仓库结构

```text
admin-web/  Vue 3 + Vite + Element Plus 后台
miniapp/    uni-app + Vue 3 + Pinia + Vant Weapp 小程序
server/     Koa + TypeScript + Prisma 服务端
docs/       产品、设计、计划、质量、可靠性与安全真相来源
scripts/    文档与架构机械校验
compose.yaml
```

工程入口与边界见 `AGENTS.md` 和 `ARCHITECTURE.md`。当前实现范围与下一步见 `docs/exec-plans/active/`；需求说明书原件和页码追踪保存在 `docs/references/`。

## 常用命令

```bash
npm run verify
npm run test
npm run build
npm run format
npm run infra:down
```

真实微信登录、支付、退款、对象存储和订阅消息都需要平台凭证；初始化基线不会保存或模拟生产密钥。
