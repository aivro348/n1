-- ==============================================================================
-- CA Buddy Enterprise Audit System - Clean Production Database Schema
-- Compatible with: Hostinger, cPanel, StackCP, Localhost MySQL (5.7+ / 8.0+)
-- ==============================================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ------------------------------------------------------------------------------
-- 1. Table structure for `users`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `users`;
CREATE TABLE `users` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `email` VARCHAR(191) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL DEFAULT '12345678',
  `role` ENUM('SUPER_ADMIN', 'MANAGER', 'USER') NOT NULL DEFAULT 'USER',
  `role_title` VARCHAR(100) NOT NULL DEFAULT 'Field Auditor',
  `unit` VARCHAR(255) NOT NULL DEFAULT 'Procurement [Marketing Department]',
  `student_reg_no` VARCHAR(100) NULL,
  `phone` VARCHAR(100) NULL,
  `sub_unit` VARCHAR(255) NULL,
  `managed_by` VARCHAR(64) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_users_email` (`email`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_manager` (`managed_by`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 2. Table structure for `attendance`
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `attendance`;
CREATE TABLE `attendance` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NOT NULL,
  `user_name` VARCHAR(191) NOT NULL,
  `user_email` VARCHAR(191) NOT NULL,
  `manager_id` VARCHAR(64) NULL,
  `role_title` VARCHAR(100) NOT NULL,
  `unit` VARCHAR(255) NOT NULL,
  `login_time` VARCHAR(30) NOT NULL,
  `logout_time` VARCHAR(30) NULL,
  `date_str` VARCHAR(30) NOT NULL,
  `time_window` VARCHAR(80) NOT NULL,
  `duration` VARCHAR(50) NOT NULL DEFAULT 'Session Active',
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `server_verified` TINYINT(1) NOT NULL DEFAULT 1,
  `server_utc_iso` VARCHAR(50) NULL,
  `manager_remarks` TEXT NULL,
  `logout_latitude` DOUBLE NULL,
  `logout_longitude` DOUBLE NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_att_user` (`user_id`),
  INDEX `idx_att_manager` (`manager_id`),
  INDEX `idx_att_active` (`is_active`),
  INDEX `idx_att_date` (`date_str`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 3. Table structure for `assignments` (Manager Delegated Work Tasks)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `assignments`;
CREATE TABLE `assignments` (
  `id` VARCHAR(64) NOT NULL,
  `assigned_to_id` VARCHAR(64) NOT NULL,
  `assigned_to_name` VARCHAR(191) NOT NULL,
  `manager_id` VARCHAR(64) NOT NULL,
  `manager_name` VARCHAR(191) NOT NULL,
  `unit` VARCHAR(255) NOT NULL,
  `task_title` VARCHAR(255) NOT NULL,
  `instructions` TEXT NULL,
  `deadline` VARCHAR(80) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'ASSIGNED',
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_asn_user` (`assigned_to_id`),
  INDEX `idx_asn_manager` (`manager_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 4. Table structure for `complaints` (Audit Observations & Vault Evidence)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `complaints`;
CREATE TABLE `complaints` (
  `id` VARCHAR(64) NOT NULL,
  `unit` VARCHAR(255) NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `category` VARCHAR(191) NOT NULL,
  `urgency` ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') NOT NULL DEFAULT 'MEDIUM',
  `remarks` TEXT NULL,
  `file_name` VARCHAR(255) NULL,
  `file_type` VARCHAR(100) NULL,
  `file_size` VARCHAR(50) NULL,
  `file_data` LONGTEXT NULL,
  `sample_file_url` TEXT NULL,
  `auditor_id` VARCHAR(64) NOT NULL,
  `auditor_name` VARCHAR(191) NOT NULL,
  `manager_id` VARCHAR(64) NULL,
  `manager_name` VARCHAR(191) NULL,
  `date_str` VARCHAR(30) NOT NULL,
  `time_frame` VARCHAR(100) NOT NULL,
  `server_timestamp` VARCHAR(60) NOT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
  `robot_verified` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_cmp_unit` (`unit`),
  INDEX `idx_cmp_manager` (`manager_id`),
  INDEX `idx_cmp_urgency` (`urgency`),
  INDEX `idx_cmp_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 5. Table structure for `daily_reports` (10-Parameter Login, Logout & GPS Coordinates)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `daily_reports`;
CREATE TABLE `daily_reports` (
  `id` VARCHAR(64) NOT NULL,
  `user_id` VARCHAR(64) NULL,
  `login_time` VARCHAR(50) NOT NULL,
  `full_name` VARCHAR(191) NOT NULL,
  `student_reg_no` VARCHAR(100) NOT NULL,
  `unit_details` TEXT NOT NULL,
  `sub_unit_details` VARCHAR(255) NULL,
  `audit_work_type` TEXT NOT NULL,
  `work_objective` TEXT NULL,
  `vouchers_verified` TEXT NULL,
  `target_to_achieve` TEXT NULL,
  `ca_remarks` TEXT NULL,
  `poc_name` VARCHAR(255) NULL,
  `logout_time` VARCHAR(50) NULL,
  `logout_remarks` TEXT NULL,
  `objective_completed` TEXT NULL,
  `escalations` TEXT NULL,
  `work_description` TEXT NULL,
  `status` VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
  `date` VARCHAR(50) NOT NULL,
  `duration` VARCHAR(50) NULL,
  `login_latitude` DOUBLE NULL,
  `login_longitude` DOUBLE NULL,
  `logout_latitude` DOUBLE NULL,
  `logout_longitude` DOUBLE NULL,
  `concluded_at` VARCHAR(50) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_dr_user` (`user_id`),
  INDEX `idx_dr_date` (`date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 6. Table structure for `moms` (Minutes of Meeting)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `moms`;
CREATE TABLE `moms` (
  `id` VARCHAR(64) NOT NULL,
  `meeting_title` VARCHAR(255) NOT NULL,
  `meeting_type` VARCHAR(191) NOT NULL,
  `date` VARCHAR(50) NOT NULL,
  `time` VARCHAR(50) NOT NULL,
  `organizer` VARCHAR(191) NOT NULL,
  `location` VARCHAR(255) NULL,
  `attendees` TEXT NULL,
  `agenda` TEXT NULL,
  `discussions` TEXT NULL,
  `action_items` TEXT NULL,
  `next_meeting` VARCHAR(255) NULL,
  `author_id` VARCHAR(64) NULL,
  `server_timestamp` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_moms_author` (`author_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------------------------
-- 7. Table structure for `tasks` (Personal & Audit Tasks)
-- ------------------------------------------------------------------------------
DROP TABLE IF EXISTS `tasks`;
CREATE TABLE `tasks` (
  `id` VARCHAR(64) NOT NULL,
  `task_title` VARCHAR(255) NOT NULL,
  `priority` VARCHAR(50) NOT NULL DEFAULT 'Medium Priority',
  `description` TEXT NULL,
  `assigned_to` VARCHAR(191) NOT NULL,
  `due_date` VARCHAR(50) NOT NULL,
  `project` VARCHAR(191) NULL,
  `category` VARCHAR(100) NOT NULL DEFAULT 'General',
  `status` VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
  `created_by_id` VARCHAR(64) NULL,
  `created_by_name` VARCHAR(191) NULL,
  `server_timestamp` VARCHAR(100) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_tasks_assigned` (`assigned_to`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ==============================================================================
-- INITIAL MASTER SUPER ADMIN ACCOUNT (Zero demo dummy records)
-- ==============================================================================

INSERT INTO `users` (`id`, `name`, `email`, `password`, `role`, `role_title`, `unit`, `student_reg_no`, `phone`, `sub_unit`, `managed_by`) VALUES
('usr-admin-1', 'System Administrator', 'admin1', 'admin1', 'SUPER_ADMIN', 'Super Administrator', 'All Enterprise Units', 'FCA001', '+91 99999 99999', 'Central Administration Desk', NULL),
('usr-user-1', 'User One', 'user1', '123', 'USER', 'Field Auditor', 'Procurement [Marketing Department]', 'SRO0000001', '+91 91234 00001', 'Marketing Procurement Cell', 'usr-admin-1'),
('usr-user-2', 'User Two', 'user2', '123', 'USER', 'Field Auditor', 'Warehousing [Marketing Department]', 'SRO0000002', '+91 91234 00002', 'Warehousing Cold Storage', 'usr-admin-1'),
('usr-user-3', 'User Three', 'user3', '123', 'USER', 'Field Auditor', 'Auctions [Marketing Department]', 'SRO0000003', '+91 91234 00003', 'Counter No. 4 Daily Token Drawer', 'usr-admin-1'),
('usr-user-4', 'User Four', 'user4', '123', 'USER', 'Field Auditor', 'Kalyanakatta & Kalyanavedika [Tirumala]', 'SRO0000004', '+91 91234 00004', 'Kalyanakatta Hall No. 3', 'usr-admin-1'),
('usr-user-5', 'User Five', 'user5', '123', 'USER', 'Field Auditor', 'Annaprasadam Trust and Canteens TML & TPT', 'SRO0000005', '+91 91234 00005', 'Canteen Supervision Desk No. 2', 'usr-admin-1'),
('usr-user-6', 'User Six', 'user6', '123', 'USER', 'Field Auditor', 'Reception, TML including Marriage halls', 'SRO0000006', '+91 91234 00006', 'Marriage Halls Admin', 'usr-admin-1'),
('usr-user-7', 'User Seven', 'user7', '123', 'USER', 'Field Auditor', 'Sri Padmavathi Ammavari Temple, Tiruchanoor (Sri PAT)', 'SRO0000007', '+91 91234 00007', 'Temple Collections', 'usr-admin-1'),
('usr-user-8', 'User Eight', 'user8', '123', 'USER', 'Field Auditor', 'Donor cell along with Concurrent audit on donation of all allied trusts and Srivani Trust Receipts [Tirumala]', 'SRO0000008', '+91 91234 00008', 'Srivani Trust Donation Desk', 'usr-admin-1'),
('usr-user-9', 'User Nine', 'user9', '123', 'USER', 'Field Auditor', 'Procurement [Marketing Department]', 'SRO0000009', '+91 91234 00009', 'Marketing Procurement Cell', 'usr-admin-1'),
('usr-user-10', 'User Ten', 'user10', '123', 'USER', 'Field Auditor', 'Warehousing [Marketing Department]', 'SRO0000010', '+91 91234 00010', 'Warehousing Cold Storage', 'usr-admin-1')
ON DUPLICATE KEY UPDATE `password`=VALUES(`password`), `role`=VALUES(`role`), `name`=VALUES(`name`);

SET FOREIGN_KEY_CHECKS = 1;
