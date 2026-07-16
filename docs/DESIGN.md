# 设计文档入口

设计文档记录需要跨会话持续存在的产品与系统决策。

## 入口

- `design-docs/index.md`：accepted、proposed、deprecated 决策索引
- `design-docs/core-beliefs.md`：仓库级 agent-first 信念
- `design-docs/0001-monorepo-and-layer-boundaries.md`：三端仓库和服务端依赖边界

## 规则

- 一个决策领域对应一份短文档，并写明状态和更新触发条件。
- active plan 链接依赖的设计决策。
- 已成为硬约束的规则应同时进入 `ARCHITECTURE.md` 和机械检查。
- 被替代的文档明确标为 deprecated 并指向替代项，不制造静默漂移。
