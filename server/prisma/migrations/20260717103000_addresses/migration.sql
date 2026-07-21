-- CreateTable
CREATE TABLE `addresses` (
    `id` VARCHAR(30) NOT NULL,
    `user_id` VARCHAR(30) NOT NULL,
    `community_id` VARCHAR(30) NOT NULL,
    `recipient_name` VARCHAR(64) NOT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `building` VARCHAR(80) NOT NULL,
    `unit` VARCHAR(80) NULL,
    `room` VARCHAR(80) NOT NULL,
    `detail` VARCHAR(255) NULL,
    `label` ENUM('home', 'company', 'school', 'other') NOT NULL DEFAULT 'home',
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `default_key` VARCHAR(30) NULL,
    `last_used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `uk_addresses_default_key`(`default_key`),
    INDEX `idx_addresses_user_list`(`user_id`, `deleted_at`, `is_default`, `updated_at`),
    INDEX `idx_addresses_community`(`community_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
