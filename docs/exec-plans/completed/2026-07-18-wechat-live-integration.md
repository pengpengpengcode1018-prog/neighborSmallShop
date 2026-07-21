# 微信正式身份与域名联调

- 状态：Completed
- 日期：2026-07-18
- 关联功能：`wechat-login`、`release-quality-gates`
- 替换计划：`2026-07-17-admin-bundle-optimization.md`（尚未实施，事项仍在技术债跟踪）

## 目标

使用已确认的小程序身份和生产候选域名，完成不泄露凭证的微信登录联调准备，并把 DNS、HTTPS、微信合法域名和真机登录的剩余阻塞项变成可逐项关闭的发布证据。

## 用户可见结果

- 小程序生产构建使用已确认的正式 AppID 和 `https://api.surroundsmallshops.com/api/v1`。
- 新生成的 AppSecret 只进入未提交的本机或部署环境，不写入代码、文档、日志或聊天。
- HTTPS、微信 request 合法域名和真实 `wx.login -> code2Session` 登录均有明确验收结果。

## 范围

- 写入公开 AppID，并为本机生产模式准备 API HTTPS 地址。
- 验证 `api`/`www` DNS、HTTP/HTTPS 可达性和 API 反向代理路径。
- 使用 RDS 内网独立数据库和 ECS 内部 Redis 建立生产数据路径，不复用或删除 RDS 现有数据库。
- AppSecret 轮换后，通过本机未提交环境变量启动服务端并验证真实微信登录。
- 更新发布清单、可靠性和质量证据；完成后恢复后台构建体积优化债务的后续排期。

## 非目标

- 不使用已在聊天中暴露的 AppSecret，也不代替用户操作微信平台的密钥轮换。
- 本切片不声明微信支付、退款或订阅消息通过；它们还需要商户凭证、模板和批准的小额订单。
- 不在 443 端口不可达时绕过 `urlCheck` 或使用 HTTP 作为正式 request 域名。

## 当前唯一步骤

已完成：正式身份、生产域名、真实微信登录、会话恢复、生产订单与超时关单均已验证；`0.1.1` 体验版移除开发标记并通过真机复核。

## 验证路径与证据

- `dig +short api.surroundsmallshops.com A` 与 `www` 均返回生产候选服务器地址。
- `curl -i https://api.surroundsmallshops.com/api/v1/health` 返回有效证书、HTTP 200 和统一 API 响应。
- 微信开发者工具使用正式 AppID 构建，`urlCheck=true` 下完成登录并由 `/api/v1/users/me` 恢复会话。
- `npm run verify` 保持通过，发布清单只在真实证据完成后关闭对应 `NO-GO`。

## 风险与开放决策

- 2026-07-18 提供到聊天的旧 AppSecret 已视为泄露且不得再使用；2026-07-20 已由用户在平台轮换，并只注入 ECS 私密环境。
- DNS、HTTPS、双域名切流及微信公众平台 request 合法域名已通过；request 列表还包含非必需的后台 `www` 域名，建议按最小权限删除。
- 尚未获得商户凭证、订阅模板和真实支付/订阅消息联调证据。
- RDS 旧库仍保留；新 `nearby_shop` 已隔离、完成迁移并通过 ECS 内网 readiness，但自动备份和恢复演练仍未形成发布证据。

## 进度日志

- 2026-07-18：确认正式 AppID，写入小程序 manifest；本机生产 API 地址设为 `https://api.surroundsmallshops.com/api/v1`。
- 2026-07-18：外部检查确认 `api`/`www` DNS 已生效，HTTP Nginx 可达但 API 路径为 404，HTTPS 443 尚不可连接。
- 2026-07-18：因用户提供真实平台身份和域名，明确替换尚未开始的后台包体计划；其原技术债继续保留。
- 2026-07-18：初次 `npm run verify` 通过；服务端 130 项、小程序 44 项及三端构建成功，编译产物确认正式 AppID、`urlCheck=true` 和生产 API 地址。
- 2026-07-18：用户确认 `api` 专用于接口、`www` 专用于后台；发布栈新增 loopback API 端口、后台生产 API 地址及精确 CORS/CSP 边界，禁止当前入口的通配符 CORS。
- 2026-07-18：双端口演练先遇到 Docker Desktop 中断，清理后复跑发现 API 仅连接 internal 网络导致宿主端口和微信出口失效；改为 frontend/backend 双网络后演练通过并自动清理。
- 2026-07-18：最终 `npm run verify` 通过，服务端 134 项、小程序 44 项、三端构建和格式全绿；当前公网仍是旧应用，尚未执行服务器切换。
- 2026-07-18：用户确认已购买上海 ECS 和 RDS MySQL；新增 `compose.production.yaml`，生产不再启动 MySQL，Redis 暂时限制在 ECS backend 网络并启用密码、AOF、内存上限和独立卷。
- 2026-07-19：ECS 预检返回 `RDS_TCP_OK`、`COMPOSE_CONFIG_OK`，真实环境文件权限为 `600`。启动前将 `MIGRATION_DATABASE_URL` 与运行时 `DATABASE_URL` 分离：迁移账号只进入一次性容器，API 只接收 DML 账号。
- 2026-07-19：ECS 首次候选构建成功，迁移容器 `Exited (0)`；Redis 因命名卷属主与无 capability 的进程身份不一致而无法创建 `appendonlydir`。生产 Compose 改为显式 `user: redis`，并在部署说明中持久化 `vm.overcommit_memory=1`。
- 2026-07-19：Redis 权限修复后本地完整 `npm run verify` 通过；发布安全检查已强制生产 Redis 使用镜像内置用户且不得发布宿主端口，服务端 134 项、小程序 44 项及三端构建保持全绿。
- 2026-07-19：ECS 应用 Redis 身份和内核参数修复后，Redis `healthy` 并成功创建 AOF，API `healthy`，迁移再次 `Exited (0)`，后台容器已启动；候选回环端口仍待内容级健康复核后切换反向代理。
- 2026-07-19：ECS 候选端口内容级复核通过：`/health` 返回本项目服务标识，`/ready` 确认 RDS 与 Redis 均为 `ready`，后台标题为“近邻小铺子管理后台”，Redis、API 与后台全部 `healthy`；进入宝塔双域名逐一切流阶段。
- 2026-07-19：宝塔已将 `api.surroundsmallshops.com` 切到 `127.0.0.1:3110`；公网 HTTPS health/readiness 返回本项目且依赖均 `ready`，CORS 只允许 `https://www.surroundsmallshops.com`，未登录后台身份接口正确返回统一 `401 UNAUTHORIZED`。下一步切换并验证 `www` 后台。
- 2026-07-19：现有宝塔站点保留 SSL 与域名绑定，通过站内反向代理将根路径切到 `127.0.0.1:8180`；公网 `www` 返回“近邻小铺子管理后台”、HTTP/2 200、CSP/防点击劫持等安全头，API readiness 继续确认 RDS 与 Redis 均为 `ready`。双域名当前项目切流完成。
- 2026-07-20：生产管理员已通过一次性静默密码通道创建并完成后台登录；用户确认配送小区、店铺、商品、配送时间等后台基础数据已配置，未导入开发居民数据。当前主线转为 AppSecret 轮换、request 合法域名和体验版真机登录。
- 2026-07-20：用户已在 ECS 私密环境中替换轮换后的 AppSecret 并强制重建 API 容器；重建后的服务日志持续显示 `/api/v1/health` 与后台提醒汇总请求返回 HTTP 200，容器启动瞬间的临时 502 已在 API 进程就绪后消失。下一项人工证据为微信平台 request 合法域名配置和体验版真机登录。
- 2026-07-20：微信公众平台截图确认 `https://api.surroundsmallshops.com` 已进入 request 合法域名；本地重新生成 `mp-weixin` 正式构建并复核正式 AppID、`urlCheck=true`、生产 API 地址，产物约 2.4 MB。下一步为开发者工具上传体验版与真机登录。
- 2026-07-20：正式体验版 `0.1.0` 真机登录成功，首页显示微信会话已连接并恢复生产小区；居民完成无支付下单，管理后台同步显示 ¥0.01 待支付订单、相同店铺/小区及脱敏收货手机号。下一步只复核会话重启恢复和 15 分钟自动关单。
- 2026-07-20：完全结束微信进程后重新进入体验版，会话与当前小区恢复成功；11:54 创建的待支付订单于 12:09 被生产任务自动取消，小程序与管理后台均显示“支付超时，订单已自动关闭”。身份、合法域名、双端订单和生产超时任务人工证据通过。
- 2026-07-20：删除首页仅供开发阶段使用的“工程基线”标记并生成 `0.1.1` 体验版候选；完整 `npm run verify` 通过，服务端 134 项、小程序 44 项、三端构建与格式检查全绿。编译产物未再包含该标记，正式 AppID 已配置、`urlCheck=true`，包体约 2.4 MB；等待上传并完成最后一次真机外观复核后归档。
- 2026-07-20：`0.1.1` 体验版真机首页复核通过，“工程基线”开发标记已消失，生产微信会话、当前小区与附近店铺正常恢复。本计划目标全部完成并归档；真实支付、订阅消息、备份恢复与正式审核仍由发布门禁继续保持 `NO-GO`。
- 2026-07-18：新增 `docs/PRODUCTION_DEPLOYMENT.md` 与安全环境模板；控制台实配仍等待用户在 Codex 内置浏览器登录，真实密码禁止通过聊天传递。
- 2026-07-18：外部 RDS/本机 Redis 生产配置落地后再次运行完整 `npm run verify`，服务端 134 项、小程序 44 项、发布结构检查、三端构建和格式检查全部通过；公网切换仍保持 `NO-GO`。
- 2026-07-19：RDS 新建 `nearby_shop`、普通迁移账号（DDL+DML）和应用账号（仅 DML），旧库未改动；本地通过精确公网白名单与 CA 严格校验 SSL 成功应用 14 个 Prisma 迁移，复核为 `Database schema is up to date`。
