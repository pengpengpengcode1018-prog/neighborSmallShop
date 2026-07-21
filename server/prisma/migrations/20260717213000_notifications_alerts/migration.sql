CREATE TABLE `subscription_consents` (
  `id` VARCHAR(30) NOT NULL,
  `user_id` VARCHAR(30) NOT NULL,
  `template_id` VARCHAR(128) NOT NULL,
  `decision` ENUM('accept', 'reject', 'ban', 'filter') NOT NULL,
  `available_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `last_reported_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_subscription_consents_user_template` (`user_id`, `template_id`),
  INDEX `idx_subscription_consents_user_status` (`user_id`, `decision`, `updated_at`),
  CONSTRAINT `subscription_consents_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `subscription_consent_receipts` (
  `id` VARCHAR(30) NOT NULL,
  `user_id` VARCHAR(30) NOT NULL,
  `request_id` VARCHAR(64) NOT NULL,
  `request_fingerprint` CHAR(64) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_subscription_receipts_user_request` (`user_id`, `request_id`),
  INDEX `idx_subscription_receipts_created_at` (`created_at`),
  CONSTRAINT `subscription_consent_receipts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `user_notifications` (
  `id` VARCHAR(30) NOT NULL,
  `user_id` VARCHAR(30) NOT NULL,
  `order_id` VARCHAR(30) NOT NULL,
  `source_status_log_id` VARCHAR(30) NOT NULL,
  `scene` ENUM('order_paid', 'order_accepted', 'order_delivering', 'order_completed', 'order_cancelled', 'refund_success') NOT NULL,
  `template_id` VARCHAR(128) NULL,
  `status` ENUM('pending', 'sending', 'sent', 'skipped', 'failed', 'unknown') NOT NULL DEFAULT 'pending',
  `attempt_count` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `send_started_at` DATETIME(3) NULL,
  `next_attempt_at` DATETIME(3) NULL,
  `last_error_code` VARCHAR(64) NULL,
  `sent_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_user_notifications_source_log` (`source_status_log_id`),
  INDEX `idx_user_notifications_delivery` (`status`, `next_attempt_at`, `created_at`),
  INDEX `idx_user_notifications_user_time` (`user_id`, `created_at`),
  INDEX `idx_user_notifications_order_scene` (`order_id`, `scene`),
  CONSTRAINT `user_notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_notifications_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `user_notifications_source_status_log_id_fkey` FOREIGN KEY (`source_status_log_id`) REFERENCES `order_status_logs` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_alerts` (
  `id` VARCHAR(30) NOT NULL,
  `type` ENUM('new_paid_order', 'unaccepted_order', 'refund_request', 'low_stock') NOT NULL,
  `resource_type` VARCHAR(32) NOT NULL,
  `resource_id` VARCHAR(30) NOT NULL,
  `dedupe_key` VARCHAR(96) NOT NULL,
  `title` VARCHAR(120) NOT NULL,
  `message` VARCHAR(255) NOT NULL,
  `severity` ENUM('info', 'warning', 'urgent') NOT NULL,
  `status` ENUM('unread', 'read', 'resolved') NOT NULL DEFAULT 'unread',
  `occurred_at` DATETIME(3) NOT NULL,
  `read_at` DATETIME(3) NULL,
  `read_by_admin_id` VARCHAR(30) NULL,
  `resolved_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `uk_admin_alerts_dedupe_key` (`dedupe_key`),
  INDEX `idx_admin_alerts_status_type_time` (`status`, `type`, `occurred_at`),
  INDEX `idx_admin_alerts_resource` (`resource_type`, `resource_id`),
  INDEX `idx_admin_alerts_read_by_admin_id` (`read_by_admin_id`),
  CONSTRAINT `admin_alerts_read_by_admin_id_fkey` FOREIGN KEY (`read_by_admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
