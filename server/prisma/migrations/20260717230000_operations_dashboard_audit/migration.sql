ALTER TABLE `operation_logs`
  ADD COLUMN `request_id` VARCHAR(64) NULL;

CREATE INDEX `idx_operation_logs_request_id`
  ON `operation_logs`(`request_id`);

CREATE INDEX `idx_payments_status_succeeded_at`
  ON `payments`(`status`, `succeeded_at`);

CREATE INDEX `idx_refunds_status_completed_at`
  ON `refunds`(`status`, `completed_at`);
