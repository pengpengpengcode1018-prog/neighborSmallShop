-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(30) NOT NULL,
    `order_no` VARCHAR(32) NOT NULL,
    `user_id` VARCHAR(30) NOT NULL,
    `store_id` VARCHAR(30) NOT NULL,
    `address_id` VARCHAR(30) NOT NULL,
    `delivery_slot_id` VARCHAR(30) NULL,
    `request_id` VARCHAR(64) NOT NULL,
    `request_fingerprint` CHAR(64) NOT NULL,
    `preview_version` CHAR(64) NOT NULL,
    `status` ENUM('pending_payment', 'paid', 'accepted', 'preparing', 'waiting_delivery', 'delivering', 'completed', 'cancelled', 'refund_pending', 'refunded') NOT NULL DEFAULT 'pending_payment',
    `delivery_type` ENUM('asap', 'scheduled') NOT NULL,
    `delivery_date` DATE NULL,
    `delivery_time` CHAR(5) NULL,
    `remark` VARCHAR(200) NULL,
    `store_name` VARCHAR(120) NOT NULL,
    `merchandise_total` DECIMAL(10, 2) NOT NULL,
    `delivery_fee` DECIMAL(10, 2) NOT NULL,
    `payable_total` DECIMAL(10, 2) NOT NULL,
    `address_recipient_name` VARCHAR(64) NOT NULL,
    `address_phone` VARCHAR(32) NOT NULL,
    `address_community_name` VARCHAR(120) NOT NULL,
    `address_building` VARCHAR(80) NOT NULL,
    `address_unit` VARCHAR(80) NULL,
    `address_room` VARCHAR(80) NOT NULL,
    `address_detail` VARCHAR(255) NULL,
    `stock_released` BOOLEAN NOT NULL DEFAULT false,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `uk_orders_order_no`(`order_no`),
    UNIQUE INDEX `uk_orders_user_request`(`user_id`, `request_id`),
    INDEX `idx_orders_user_status_time`(`user_id`, `status`, `created_at`),
    INDEX `idx_orders_store_status_time`(`store_id`, `status`, `created_at`),
    INDEX `idx_orders_delivery_capacity`(`delivery_slot_id`, `delivery_date`, `status`),
    INDEX `idx_orders_expiry`(`expires_at`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(30) NOT NULL,
    `order_id` VARCHAR(30) NOT NULL,
    `product_id` VARCHAR(30) NOT NULL,
    `product_name` VARCHAR(120) NOT NULL,
    `product_image_url` VARCHAR(1024) NULL,
    `unit_price` DECIMAL(10, 2) NOT NULL,
    `quantity` INTEGER UNSIGNED NOT NULL,
    `line_total` DECIMAL(10, 2) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `uk_order_items_order_product`(`order_id`, `product_id`),
    INDEX `idx_order_items_product`(`product_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_status_logs` (
    `id` VARCHAR(30) NOT NULL,
    `order_id` VARCHAR(30) NOT NULL,
    `from_status` ENUM('pending_payment', 'paid', 'accepted', 'preparing', 'waiting_delivery', 'delivering', 'completed', 'cancelled', 'refund_pending', 'refunded') NULL,
    `to_status` ENUM('pending_payment', 'paid', 'accepted', 'preparing', 'waiting_delivery', 'delivering', 'completed', 'cancelled', 'refund_pending', 'refunded') NOT NULL,
    `operator_type` ENUM('user', 'admin', 'system', 'wechat') NOT NULL,
    `operator_id` VARCHAR(30) NULL,
    `operator_name` VARCHAR(64) NULL,
    `description` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_order_status_logs_order_time`(`order_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `orders` ADD CONSTRAINT `orders_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `orders` ADD CONSTRAINT `orders_address_id_fkey` FOREIGN KEY (`address_id`) REFERENCES `addresses`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `orders` ADD CONSTRAINT `orders_delivery_slot_id_fkey` FOREIGN KEY (`delivery_slot_id`) REFERENCES `delivery_slots`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE `order_status_logs` ADD CONSTRAINT `order_status_logs_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
