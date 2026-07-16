# 0001：三端单仓与显式分层

- 状态：Accepted
- 日期：2026-07-15
- 更新触发：拆分部署仓库、引入共享包或改变服务端依赖方向

## 决策

小程序、后台和 Koa 服务保存在一个 npm workspaces 仓库中，各自拥有独立运行与构建命令。服务端按 `types/config/repository/service/controller/route/runtime` 单向依赖；前端只通过 HTTP 契约接触服务端。

## 原因

- 第一版功能跨三端演进，单仓让契约、计划和验证保持同一提交边界。
- 明确层级减少 Controller 写 SQL、页面复制规则和 agent 临场发明结构。
- 各 workspace 独立依赖，使 uni-app 固定编译器不阻塞后台采用较新的 Vite。

## 结果

- 根 `npm run verify` 是共同质量门禁。
- 业务共享以 API/schema 文档为主；出现真实复用需求后再建立 `packages/`，不预建万能 utils。
- `scripts/check-architecture.mjs` 检查服务端的逆向依赖。
