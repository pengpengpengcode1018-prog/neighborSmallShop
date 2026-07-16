# 订单、库存与配送状态

来源：需求说明书第 15-20、27-36、50-51 页。

## 状态机

正常路径：

`pending_payment -> paid -> accepted -> preparing -> waiting_delivery -> delivering -> completed`

取消/退款路径：

- `pending_payment -> cancelled`
- `paid|accepted -> refund_pending -> refunded`
- `completed`、`cancelled`、`refunded` 为终态。

任何未列出的跳转都返回 `INVALID_ORDER_STATUS`，不修改数据。

## 创建与库存

- 创建订单在一个数据库事务中校验配送/营业/起送/时段/库存，执行带库存下限条件的更新，写订单、商品快照和首条状态日志。
- 请求 id 对用户唯一；重复请求返回同一结果或稳定冲突，不产生第二个订单。
- 商品和地址保存快照，历史订单不受后续编辑影响。
- 取消或 15 分钟超时恢复库存；`stock_released` 保证只恢复一次。

## 状态日志

每次变化保存订单、前后状态、操作人类型（user/admin/system/wechat）、操作人标识与名称、说明和时间。状态更新和日志写入处于同一事务。

## 验收

- 并发下单不超卖；事务失败不留下半订单。
- 重复取消、关单任务或回调不重复恢复库存/销量。
- 后台和小程序读取同一订单状态真相；页面把状态映射为用户可理解的进度。
- 禁止删除订单、订单项和状态日志。
