-- AlterTable
ALTER TABLE `users` ADD COLUMN `current_community_id` VARCHAR(30) NULL;

-- CreateIndex
CREATE INDEX `idx_users_current_community` ON `users`(`current_community_id`);

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_current_community_id_fkey` FOREIGN KEY (`current_community_id`) REFERENCES `communities`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
