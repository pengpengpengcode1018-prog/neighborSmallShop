# 阿里云 ECS + RDS 生产部署

当前目标拓扑：RDS MySQL 使用内网连接；Redis 暂时作为 ECS 内部 Docker 服务；API 与后台只绑定 ECS loopback，再由宝塔 Nginx 终止 HTTPS。

## 1. RDS MySQL

1. 确认 ECS 与 RDS 位于同一账号、华东 2（上海）和同一 VPC，并在两个实例的“专有网络”详情中核对 VPC ID。
2. 生产运行时只允许 ECS 私网 IP 访问 RDS，或关联该 ECS 的专用安全组；禁止 `0.0.0.0/0`。确需从本地发布迁移时，只在独立 `local_dev` 组临时保留当前公网单 IP，并强制客户端使用 CA 严格校验的 SSL 连接；IP 变化后立即替换旧值。
3. 当前 RDS 已有旧库，禁止复用或清理。独立数据库为 `nearby_shop`、字符集 `utf8mb4`；普通账号 `nearby_shop_migrator` 仅对该库拥有 DDL+DML，`nearby_shop_app` 仅拥有 DML，不使用高权限账号。
4. 在“数据库连接”复制 RDS 内网连接地址。应用必须使用域名连接地址，不能把解析出的 VIP 固定到配置中。
5. 生产部署使用两个独立连接 URL：一次性迁移容器只接收 `MIGRATION_DATABASE_URL`，API 运行容器只接收 `DATABASE_URL`，不能把迁移账号传给 API。格式为：

   ```text
   MIGRATION_DATABASE_URL=mysql://nearby_shop_migrator:URL_ENCODED_PASSWORD@RDS_INTERNAL_ENDPOINT:3306/nearby_shop
   mysql://nearby_shop_app:URL_ENCODED_PASSWORD@RDS_INTERNAL_ENDPOINT:3306/nearby_shop
   ```

   密码若包含 `@`、`:`、`/`、`#`、`%` 等字符必须先做 URL 编码。真实地址和密码只写入 ECS 的 `deploy/production.env`。

6. 上线前确认自动数据备份和日志备份已开启并设置保留期；完成一次恢复到临时实例/新库的演练后，才能关闭备份恢复 `NO-GO`。

本地受控迁移使用 Git 忽略且权限为 `600` 的 `server/.env.rds-migrate.local`，连接 URL 必须包含下载到本机的阿里云 CA 和严格校验参数：

```text
mysql://nearby_shop_migrator:URL_ENCODED_PASSWORD@RDS_EXTERNAL_ENDPOINT:3306/nearby_shop?sslcert=/ABSOLUTE/PATH/ApsaraDB-CA-Chain.pem&sslaccept=strict
```

在 `server/` 中执行：

```bash
DOTENV_CONFIG_PATH=.env.rds-migrate.local npm exec -- prisma migrate status
DOTENV_CONFIG_PATH=.env.rds-migrate.local npm run db:migrate
```

本地迁移文件、数据库密码和 CA 文件均不得提交。日常开发仍使用本地 MySQL，不运行指向生产库的本地常驻服务。

## 2. Redis

当前代码只把 Redis 用作 readiness 依赖，但生产配置仍要求密码。未购买 Tair 时，`compose.production.yaml` 在 ECS 内启动 Redis 7.4：

- 不发布 `6379` 宿主机或公网端口，只允许 Docker backend 网络访问。
- 开启 AOF，每秒刷盘；独立数据卷保存 `/data`。
- 显式使用镜像内的 `redis` 用户，使命名卷属主与进程身份一致；继续移除全部额外 capabilities。
- `maxmemory=256mb`、`noeviction`，容器内存上限 384 MiB。
- Redis 密码与 RDS/JWT/管理员密码完全独立。

首次启动前在 ECS 持久化 Redis 所需的内核参数：

```bash
printf 'vm.overcommit_memory = 1\n' | sudo tee /etc/sysctl.d/99-nearby-shop-redis.conf >/dev/null
sudo sysctl --system
```

本地 Redis 不是高可用服务。购买阿里云 Tair 后，应让 Tair 与 ECS 位于同一 VPC、只把 ECS 私网 IP 加入白名单，并使用 Tair 连接域名替换 `REDIS_URL`；不要使用公网连接或固定 VIP。

## 3. ECS 生产环境文件

在 ECS 项目目录执行：

```bash
cp deploy/production.env.example deploy/production.env
chmod 600 deploy/production.env
```

然后只在 ECS 上编辑 `deploy/production.env`。分别填写 `nearby_shop_migrator` 与 `nearby_shop_app` 的内网连接 URL；Compose 只把前者注入一次性迁移容器，只把后者注入 API。AppSecret 必须先在微信平台轮换；数据库、Redis、JWT 和微信密钥都不能发送到聊天、写入 Git 或出现在命令历史截图中。

微信支付配置必须整组填写：商户号、商户证书序列号、商户私钥、APIv3 key、当前主动平台公钥 ID、公钥映射、支付通知 URL 和退款通知 URL 缺一不可。`WECHAT_PAY_PUBLIC_KEYS_JSON` 是单行 JSON 对象，键为微信平台公钥 ID，值为 PEM；dotenv 中 PEM 换行写成 `\\n`，例如：

```text
WECHAT_PAY_PUBLIC_KEY_ID=PUB_KEY_ID_ACTIVE
WECHAT_PAY_PUBLIC_KEYS_JSON={"PUB_KEY_ID_ACTIVE":"-----BEGIN PUBLIC KEY-----\\n...\\n-----END PUBLIC KEY-----"}
```

真实 PEM、私钥和 APIv3 key 不得复制到命令行、聊天或截图中。生产配置不使用兼容旧开发环境的单公钥变量 `WECHAT_PAY_PUBLIC_KEY`。

平台公钥轮换按以下顺序执行，每次外部密钥操作都需要显式批准：

1. 在密钥系统和 `WECHAT_PAY_PUBLIC_KEYS_JSON` 中加入新 ID/公钥，旧公钥继续保留；先部署“旧 + 新”重叠配置。
2. 将 `WECHAT_PAY_PUBLIC_KEY_ID` 切换为当前主动 ID，并重建 API 容器；调用微信的请求会携带该 ID。
3. 用不含秘密的请求 ID 证据确认新、旧 `Wechatpay-Serial` 响应/回调均能按各自公钥通过，未知 ID 与错配签名均失败。
4. 微信平台灰度期结束且在途通知已清空后，才从映射移除退役公钥；再次验证支付、退款通知和 readiness。不得先删旧公钥再部署新公钥。

第一次切流建议先把 `PRODUCTION_API_PORT`/`PRODUCTION_HTTP_PORT` 改为未占用端口，例如 `3110`/`8180`，避免覆盖当前旧应用。

## 4. 启动与迁移

先验证展开后的 Compose，不输出变量值：

```bash
docker compose --env-file deploy/production.env -f compose.production.yaml config --quiet
```

构建并启动。`migrate` 使用专用 DDL+DML 账号执行全部 Prisma 迁移且不会接收微信、JWT 或 Redis 密钥；成功后，API 才使用 DML 应用账号启动，随后启动后台：

```bash
docker compose --env-file deploy/production.env -f compose.production.yaml up -d --build
docker compose --env-file deploy/production.env -f compose.production.yaml ps
```

只在 ECS 本机验证候选端口：

```bash
curl -fsS http://127.0.0.1:3110/api/v1/health
curl -fsS http://127.0.0.1:3110/api/v1/ready
curl -fsS http://127.0.0.1:8180/
```

健康接口必须返回 `code=0`、`data.service=nearby-shop-server`，后台标题必须是“近邻小铺子管理后台”。

## 5. 一次性创建生产管理员

管理员初始化使用 `deploy/compose.admin-seed.yaml` 覆盖迁移容器的数据库变量，使其只使用 `nearby_shop_app` DML 账号。密码通过终端静默输入和临时环境变量传入，不写入 `production.env`、命令历史或聊天；命令结束后立即清除变量。重复执行会更新同名管理员的密码并恢复启用状态。

```bash
read -r -p '管理员用户名 [admin]: ' ADMIN_SEED_USERNAME
ADMIN_SEED_USERNAME="${ADMIN_SEED_USERNAME:-admin}"
read -r -p '显示名称 [生产管理员]: ' ADMIN_SEED_DISPLAY_NAME
ADMIN_SEED_DISPLAY_NAME="${ADMIN_SEED_DISPLAY_NAME:-生产管理员}"

while :; do
  read -r -s -p '输入至少 12 位管理员密码: ' ADMIN_SEED_PASSWORD
  printf '\n'
  read -r -s -p '再次输入密码: ' ADMIN_SEED_PASSWORD_CONFIRM
  printf '\n'
  if [ "${#ADMIN_SEED_PASSWORD}" -lt 12 ]; then
    echo '密码不足 12 位，请重新输入。'
    continue
  fi
  if [ "$ADMIN_SEED_PASSWORD" = "$ADMIN_SEED_PASSWORD_CONFIRM" ]; then
    break
  fi
  echo '两次密码不一致，请重新输入。'
done

export ADMIN_SEED_USERNAME ADMIN_SEED_DISPLAY_NAME ADMIN_SEED_PASSWORD
docker compose \
  --env-file deploy/production.env \
  -f compose.production.yaml \
  -f deploy/compose.admin-seed.yaml \
  run --rm --no-deps migrate \
  npm run db:seed --workspace @nearby-shop/server
seed_status=$?
unset ADMIN_SEED_USERNAME ADMIN_SEED_DISPLAY_NAME ADMIN_SEED_PASSWORD ADMIN_SEED_PASSWORD_CONFIRM
[ "$seed_status" -eq 0 ] && echo ADMIN_SEED_OK || echo ADMIN_SEED_FAILED
```

只在 `ADMIN_SEED_OK` 后打开公网后台登录；不得通过命令行参数或截图传递密码。登录后验证显示名、平台管理员角色和退出/重新登录，再由运营负责人通过安全通道保存凭证。

## 6. 宝塔切流

候选端口通过后再修改反向代理：

- `api.surroundsmallshops.com` -> `http://127.0.0.1:<PRODUCTION_API_PORT>`
- `www.surroundsmallshops.com` -> `http://127.0.0.1:<PRODUCTION_HTTP_PORT>`

删除宝塔层的 `Access-Control-Allow-Origin: *`；API 应只返回应用生成的精确 `https://www.surroundsmallshops.com` Origin。切流后复核公网 `/health`、`/ready`、后台标题、登录 401 边界和浏览器 CORS。

## 7. 安全组

- ECS 公网入方向只保留实际使用的 `80/443`；SSH 端口只允许固定管理 IP，宝塔管理端口不得向全网开放。
- 不开放 `3000/3100/3110/6379/8080/8180/3306` 公网入方向。
- RDS 生产运行只接受 ECS 私网来源；受控本地迁移例外仅允许当前公网单 IP + SSL，数据库账号只授权 `nearby_shop`。

## 8. 回滚

切流前保留旧反代目标。新版本异常时只把宝塔反代切回旧端口，不回滚数据库迁移；保留新栈日志和数据库状态用于排查。支付/退款结果未知时不得重复发起外部动作。

## 9. 已上线环境更新

更新现有生产栈前，先确认新源码包不包含 `deploy/production.env`、CA、私钥或其他秘密。把源码解压到新的版本目录，再从当前生产目录复制仅存在于 ECS 的环境文件并保持 `600` 权限。不要覆盖或上传本地示例密码。

重建前给当前应用镜像保留本机回滚标签；标签只保存应用镜像，Redis 数据继续使用同一个生产命名卷：

```bash
docker tag nearby-shop-production-server:latest nearby-shop-production-server:rollback-0.1.1
docker tag nearby-shop-production-admin-web:latest nearby-shop-production-admin-web:rollback-0.1.1
```

在新版本目录先检查配置并只构建应用镜像，不重建 Redis：

```bash
docker compose --env-file deploy/production.env -f compose.production.yaml config --quiet
docker compose --env-file deploy/production.env -f compose.production.yaml build migrate server admin-web
docker compose --env-file deploy/production.env -f compose.production.yaml run --rm migrate
docker compose --env-file deploy/production.env -f compose.production.yaml up -d --no-deps --force-recreate server
```

等待 API 容器变为 `healthy`，确认本机和公网 `/api/v1/ready` 均返回数据库、Redis `ready` 后，再更新后台容器：

```bash
docker compose --env-file deploy/production.env -f compose.production.yaml ps server
curl -fsS http://127.0.0.1:3100/api/v1/ready
curl -fsS https://api.surroundsmallshops.com/api/v1/ready
docker compose --env-file deploy/production.env -f compose.production.yaml up -d --no-deps --force-recreate admin-web
curl -fsS https://www.surroundsmallshops.com/ | grep -o '<title>[^<]*</title>'
```

端口以 ECS 的 `deploy/production.env` 为准；若不是 `3100`，本机检查命令同步替换。手机号授权版本更新后，还必须在体验版完成一次显式授权、新建地址自动预填及后台居民列表即时出现的真机复核。

若新应用异常且数据库迁移向后兼容，可把保留镜像重新标记为 `latest` 并强制重建两个应用容器；禁止自动回滚数据库迁移：

```bash
docker tag nearby-shop-production-server:rollback-0.1.1 nearby-shop-production-server:latest
docker tag nearby-shop-production-admin-web:rollback-0.1.1 nearby-shop-production-admin-web:latest
docker compose --env-file deploy/production.env -f compose.production.yaml up -d --no-deps --force-recreate server admin-web
```
