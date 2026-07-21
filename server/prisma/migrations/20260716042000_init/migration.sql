-- CreateTable
CREATE TABLE `admins` (
    `id` VARCHAR(30) NOT NULL,
    `username` VARCHAR(64) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `display_name` VARCHAR(64) NOT NULL,
    `status` ENUM('active', 'disabled') NOT NULL DEFAULT 'active',
    `failed_login_attempts` SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    `locked_until` DATETIME(3) NULL,
    `last_login_at` DATETIME(3) NULL,
    `last_login_ip` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    UNIQUE INDEX `uk_admins_username`(`username`),
    INDEX `idx_admins_status`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `admin_login_logs` (
    `id` VARCHAR(30) NOT NULL,
    `admin_id` VARCHAR(30) NULL,
    `username` VARCHAR(64) NOT NULL,
    `result` ENUM('success', 'failed', 'locked') NOT NULL,
    `failure_reason` VARCHAR(255) NULL,
    `ip_address` VARCHAR(45) NULL,
    `user_agent` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `idx_admin_login_logs_admin_time`(`admin_id`, `created_at`),
    INDEX `idx_admin_login_logs_username_time`(`username`, `created_at`),
    INDEX `idx_admin_login_logs_result_time`(`result`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `operation_logs` (
    `id` VARCHAR(30) NOT NULL,
    `admin_id` VARCHAR(30) NULL,
    `operator_name` VARCHAR(64) NOT NULL,
    `module` VARCHAR(64) NOT NULL,
    `action` VARCHAR(64) NOT NULL,
    `business_data_id` VARCHAR(64) NULL,
    `description` VARCHAR(500) NOT NULL,
    `before_data` JSON NULL,
    `after_data` JSON NULL,
    `request_ip` VARCHAR(45) NULL,
    `request_path` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    INDEX `idx_operation_logs_admin_time`(`admin_id`, `created_at`),
    INDEX `idx_operation_logs_target_time`(`module`, `business_data_id`, `created_at`),
    INDEX `idx_operation_logs_created_at`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `communities` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `city` VARCHAR(64) NOT NULL,
    `district` VARCHAR(64) NOT NULL,
    `detailed_address` VARCHAR(255) NOT NULL,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    INDEX `idx_communities_list`(`status`, `deleted_at`, `sort_order`),
    UNIQUE INDEX `uk_communities_location_name`(`city`, `district`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `stores` (
    `id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `logo_url` VARCHAR(1024) NULL,
    `cover_url` VARCHAR(1024) NULL,
    `description` TEXT NULL,
    `announcement` TEXT NULL,
    `phone` VARCHAR(32) NOT NULL,
    `address` VARCHAR(255) NOT NULL,
    `business_start_time` CHAR(5) NOT NULL DEFAULT '08:00',
    `business_end_time` CHAR(5) NOT NULL DEFAULT '22:00',
    `minimum_order_amount` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `default_delivery_fee` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `estimated_delivery_minutes` SMALLINT UNSIGNED NOT NULL DEFAULT 45,
    `status` ENUM('open', 'paused', 'disabled') NOT NULL DEFAULT 'open',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    INDEX `idx_stores_list`(`status`, `deleted_at`, `sort_order`),
    INDEX `idx_stores_name`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `store_communities` (
    `store_id` VARCHAR(30) NOT NULL,
    `community_id` VARCHAR(30) NOT NULL,
    `status` ENUM('active', 'paused') NOT NULL DEFAULT 'active',
    `minimum_order_amount_override` DECIMAL(10, 2) NULL,
    `delivery_fee_override` DECIMAL(10, 2) NULL,
    `estimated_delivery_minutes_override` SMALLINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    INDEX `idx_store_communities_community_status`(`community_id`, `status`),
    INDEX `idx_store_communities_store_status`(`store_id`, `status`),
    PRIMARY KEY (`store_id`, `community_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `product_categories` (
    `id` VARCHAR(30) NOT NULL,
    `store_id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `status` ENUM('enabled', 'disabled') NOT NULL DEFAULT 'enabled',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    INDEX `idx_product_categories_list`(`store_id`, `status`, `deleted_at`, `sort_order`),
    UNIQUE INDEX `uk_product_categories_store_name`(`store_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `products` (
    `id` VARCHAR(30) NOT NULL,
    `store_id` VARCHAR(30) NOT NULL,
    `category_id` VARCHAR(30) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `main_image_url` VARCHAR(1024) NULL,
    `gallery_image_urls` JSON NULL,
    `description` VARCHAR(500) NULL,
    `detail` LONGTEXT NULL,
    `after_sale_notes` TEXT NULL,
    `remark` VARCHAR(500) NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `original_price` DECIMAL(10, 2) NULL,
    `stock` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `sales_volume` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `purchase_limit` INTEGER UNSIGNED NULL,
    `stock_warning_threshold` INTEGER UNSIGNED NOT NULL DEFAULT 10,
    `is_hot` BOOLEAN NOT NULL DEFAULT false,
    `status` ENUM('on_sale', 'sold_out', 'off_shelf') NOT NULL DEFAULT 'off_shelf',
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    INDEX `idx_products_store_category_list`(`store_id`, `category_id`, `status`, `deleted_at`, `sort_order`),
    INDEX `idx_products_store_list`(`store_id`, `status`, `deleted_at`, `sort_order`),
    INDEX `idx_products_store_name`(`store_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `admin_login_logs` ADD CONSTRAINT `admin_login_logs_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_admin_id_fkey` FOREIGN KEY (`admin_id`) REFERENCES `admins`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE `store_communities` ADD CONSTRAINT `store_communities_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `store_communities` ADD CONSTRAINT `store_communities_community_id_fkey` FOREIGN KEY (`community_id`) REFERENCES `communities`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `product_categories` ADD CONSTRAINT `product_categories_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `products` ADD CONSTRAINT `products_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `products` ADD CONSTRAINT `products_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `product_categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
