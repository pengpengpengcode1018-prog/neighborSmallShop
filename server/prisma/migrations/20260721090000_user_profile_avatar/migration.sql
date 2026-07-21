ALTER TABLE `users`
  ADD COLUMN `avatar_mime_type` VARCHAR(32) NULL,
  ADD COLUMN `avatar_data` MEDIUMBLOB NULL;
