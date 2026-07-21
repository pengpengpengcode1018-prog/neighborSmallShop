-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(30) NOT NULL,
    `wechat_open_id` VARCHAR(128) NOT NULL,
    `wechat_union_id` VARCHAR(128) NULL,
    `nickname` VARCHAR(64) NULL,
    `avatar_url` VARCHAR(1024) NULL,
    `phone` VARCHAR(32) NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uk_users_wechat_open_id`(`wechat_open_id`),
    UNIQUE INDEX `uk_users_wechat_union_id`(`wechat_union_id`),
    UNIQUE INDEX `uk_users_phone`(`phone`),
    INDEX `idx_users_status_created_at`(`status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_login_logs` (
    `id` VARCHAR(30) NOT NULL,
    `user_id` VARCHAR(30) NULL,
    `result` ENUM('success', 'failed', 'disabled') NOT NULL,
    `failure_reason` VARCHAR(64) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_login_logs_user_time`(`user_id`, `created_at`),
    INDEX `idx_user_login_logs_result_time`(`result`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `user_login_logs` ADD CONSTRAINT `user_login_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
