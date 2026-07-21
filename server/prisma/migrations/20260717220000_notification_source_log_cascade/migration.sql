ALTER TABLE `user_notifications`
  DROP FOREIGN KEY `user_notifications_source_status_log_id_fkey`;

ALTER TABLE `user_notifications`
  ADD CONSTRAINT `user_notifications_source_status_log_id_fkey`
    FOREIGN KEY (`source_status_log_id`) REFERENCES `order_status_logs` (`id`)
    ON DELETE CASCADE ON UPDATE CASCADE;
