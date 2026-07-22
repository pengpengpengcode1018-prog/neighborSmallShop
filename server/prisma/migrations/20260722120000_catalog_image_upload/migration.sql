CREATE TABLE `media_assets` (
    `id` VARCHAR(30) NOT NULL,
    `mime_type` VARCHAR(32) NOT NULL,
    `byte_size` INT UNSIGNED NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `created_by_admin_id` VARCHAR(30) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`),
    INDEX `idx_media_assets_creator_time`(`created_by_admin_id`, `created_at`),
    CONSTRAINT `media_assets_created_by_admin_id_fkey` FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
