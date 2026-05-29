-- Create database (if not exists)
CREATE DATABASE IF NOT EXISTS announcement_system;
USE announcement_system;

-- Create users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    uid VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    role ENUM('farmer', 'customer_operator', 'admin', 'supervisor') DEFAULT 'farmer',
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create announcements table
CREATE TABLE IF NOT EXISTS announcements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) DEFAULT 'farmer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(uid) ON DELETE CASCADE
);

-- Insert sample users (passwords: 'password123' hashed with bcrypt)
-- For testing only - use proper password hashing in production
INSERT INTO users (uid, name, email, phone, role, password_hash) VALUES
('user_farmer_1', 'John Farmer', 'farmer@example.com', '1234567890', 'farmer', '$2b$10$YourHashedPasswordHere'),
('user_operator_1', 'Sarah Operator', 'operator@example.com', '0987654321', 'customer_operator', '$2b$10$YourHashedPasswordHere'),
('user_admin_1', 'Admin User', 'admin@example.com', '1122334455', 'admin', '$2b$10$YourHashedPasswordHere'),
('user_supervisor_1', 'Supervisor User', 'supervisor@example.com', '5544332211', 'supervisor', '$2b$10$YourHashedPasswordHere');

-- Insert sample announcements
INSERT INTO announcements (name, phone, email, message, user_id, user_role) VALUES
('John Farmer', '1234567890', 'farmer@example.com', 'Harvest season starting next week!', 'user_farmer_1', 'farmer'),
('Sarah Operator', '0987654321', 'operator@example.com', 'New customer support hours announced', 'user_operator_1', 'customer_operator'),
('Admin User', '1122334455', 'admin@example.com', 'System maintenance on Sunday', 'user_admin_1', 'admin');

-- Create auto-delete event (MySQL Event Scheduler - alternative to node cron)
-- Enable event scheduler: SET GLOBAL event_scheduler = ON;
DELIMITER $$
CREATE EVENT IF NOT EXISTS auto_delete_old_announcements
ON SCHEDULE EVERY 1 HOUR
DO
BEGIN
    DELETE FROM announcements WHERE created_at < (NOW() - INTERVAL 24 HOUR);
END$$
DELIMITER ;
