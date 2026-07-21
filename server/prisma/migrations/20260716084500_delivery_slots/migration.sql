-- AlterTable
ALTER TABLE `stores` ADD COLUMN `asap_delivery_enabled` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `scheduled_delivery_enabled` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `delivery_slots` (
    `id` VARCHAR(30) NOT NULL,
    `store_id` VARCHAR(30) NOT NULL,
    `delivery_time` CHAR(5) NOT NULL,
    `cutoff_time` CHAR(5) NOT NULL,
    `max_orders` SMALLINT UNSIGNED NOT NULL,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `idx_delivery_slots_store_list`(`store_id`, `status`, `sort_order`),
    UNIQUE INDEX `uk_delivery_slots_store_time`(`store_id`, `delivery_time`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `delivery_slots` ADD CONSTRAINT `delivery_slots_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
