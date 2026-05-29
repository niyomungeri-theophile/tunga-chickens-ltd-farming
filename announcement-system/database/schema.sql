-- Announcement system schema
CREATE DATABASE IF NOT EXISTS announcement_system;
USE announcement_system;

CREATE TABLE IF NOT EXISTS users (
    id INT PRIMARY KEY AUTO_INCREMENT,
    uid VARCHAR(255) UNIQUE NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    role ENUM('farmer','customer_operator','admin','supervisor') DEFAULT 'farmer',
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS announcements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    email VARCHAR(255),
    message TEXT NOT NULL,
    user_id VARCHAR(255),
    user_role VARCHAR(50) DEFAULT 'farmer',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at),
    FOREIGN KEY (user_id) REFERENCES users(uid) ON DELETE SET NULL
);

-- Optional: event to clean old announcements (requires event_scheduler)
-- SET GLOBAL event_scheduler = ON;
-- CREATE EVENT auto_delete_old_announcements
-- ON SCHEDULE EVERY 1 HOUR
-- DO DELETE FROM announcements WHERE created_at < (NOW() - INTERVAL 24 HOUR);
