ALTER TABLE `payments`
  MODIFY `status` ENUM('creating', 'pending', 'closing', 'success', 'failed', 'closed') NOT NULL DEFAULT 'creating',
  ADD COLUMN `close_reason` VARCHAR(255) NULL AFTER `last_queried_at`,
  ADD COLUMN `close_operator_type` ENUM('user', 'admin', 'system', 'wechat') NULL AFTER `close_reason`,
  ADD COLUMN `close_operator_id` VARCHAR(30) NULL AFTER `close_operator_type`,
  ADD COLUMN `close_operator_name` VARCHAR(64) NULL AFTER `close_operator_id`,
  ADD COLUMN `close_requested_at` DATETIME(3) NULL AFTER `close_operator_name`,
  ADD COLUMN `last_close_attempt_at` DATETIME(3) NULL AFTER `close_requested_at`,
  ADD COLUMN `close_attempt_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0 AFTER `last_close_attempt_at`,
  ADD COLUMN `closed_at` DATETIME(3) NULL AFTER `close_attempt_count`;
