-- AlterTable
ALTER TABLE `orders`
    ADD COLUMN `store_logo_url` VARCHAR(1024) NULL,
    ADD COLUMN `store_phone` VARCHAR(32) NULL,
    ADD COLUMN `admin_remark` VARCHAR(500) NULL,
    ADD COLUMN `paid_at` DATETIME(3) NULL,
    ADD COLUMN `accepted_at` DATETIME(3) NULL,
    ADD COLUMN `preparing_at` DATETIME(3) NULL,
    ADD COLUMN `waiting_delivery_at` DATETIME(3) NULL,
    ADD COLUMN `delivering_at` DATETIME(3) NULL,
    ADD COLUMN `completed_at` DATETIME(3) NULL,
    ADD COLUMN `cancelled_at` DATETIME(3) NULL,
    ADD COLUMN `cancellation_reason` VARCHAR(255) NULL;
