# AGENTS.md

本仓库面向长时运行的 coding-agent 工作流。本文件只做入口和路由；产品与工程事实以链接文档和可执行检查为准。

## 开工流程

1. 用 `pwd` 确认仓库根目录。
2. 读 `ARCHITECTURE.md` 和 `docs/QUALITY_SCORE.md`。
3. 读 `docs/PLANS.md` 与 `docs/exec-plans/active/` 中唯一的 active plan。
4. 读与任务相关的 `docs/product-specs/`。
5. 首次进入运行 `./init.sh`；已有依赖时至少运行 `npm run verify`。
6. baseline 失败时先恢复 baseline，再增加范围。

## 路由地图

- `ARCHITECTURE.md`：三端系统地图、领域和依赖方向
- `docs/product-specs/index.md`：有效产品行为与验收标准
- `docs/design-docs/index.md`：持久设计决策
- `docs/PLANS.md`：计划创建、更新与归档规则
- `docs/QUALITY_SCORE.md`：产品领域和架构层健康度
- `docs/RELIABILITY.md`：启动、验证、健康信号和黄金旅程
- `docs/SECURITY.md`：密钥、个人信息、支付与外部动作边界
- `docs/FRONTEND.md`：小程序和后台 UI 护栏
- `docs/generated/db-schema.md`：Prisma 数据模型的可读索引

## 硬性约定

- 一次只推进一个有边界的功能切片；`feature-list.json` 最多一个 `in_progress`。
- API 保持 `/api/v1` 前缀和 `{ code, message, data }` 响应契约。
- 服务端遵循 `types -> config -> repositories -> services -> controllers -> routes -> runtime`；数据访问不得绕过 repository。
- 订单金额只在服务端计算；支付、库存、退款和回调必须幂等且可审计。
- 不把 token、支付密钥、完整手机号或微信敏感数据写入代码、日志、截图或文档。
- 改变用户行为时同步更新产品规格；改变边界时同步更新架构或设计文档。
- 反复出现的 review 规则升级为 lint、测试或 `scripts/` 检查。

## 完成定义

- 目标行为已实现且范围外行为未被悄悄加入。
- `npm run verify` 通过，必要的运行态或 UI 验证也已执行。
- 证据写回 active plan；质量、可靠性和技术债文档保持真实。
- 项目能从干净进程按标准路径重启。

## 收尾

更新 active plan 和 `docs/product-specs/feature-list.json`。完成的计划移到 `completed/`；确认存在的延期工作写入技术债跟踪，不以聊天记忆代替仓库事实。
