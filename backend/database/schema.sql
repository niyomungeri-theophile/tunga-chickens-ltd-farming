-- Eco-Smart Poultry Care System - MySQL Database Schema
-- Run this script to create the database and tables

CREATE DATABASE IF NOT EXISTS eco_smart_poultry;
USE eco_smart_poultry;

-- Users Table
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    role ENUM('farmer', 'supervisor', 'admin', 'customer') DEFAULT 'farmer',
    status ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    contact VARCHAR(100) NULL,
    farm_size VARCHAR(100) NULL,
    farm_location VARCHAR(255) NULL,
    device_serial_number VARCHAR(100) NULL,
    can_sell TINYINT(1) NOT NULL DEFAULT 0,
    photo_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_users_device_serial_number (device_serial_number)
);

-- Seller Applications Table
CREATE TABLE IF NOT EXISTS seller_applications (
    id VARCHAR(36) PRIMARY KEY,
    full_name VARCHAR(120) NOT NULL,
    email VARCHAR(150) NOT NULL,
    contact VARCHAR(120) NOT NULL,
    location VARCHAR(255) NULL,
    farm_size VARCHAR(120) NULL,
    reason TEXT NULL,
    status ENUM('pending','approved','rejected') DEFAULT 'pending',
    reviewed_by VARCHAR(36) NULL,
    reviewed_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_seller_applications_status (status),
    INDEX idx_seller_applications_email (email)
);

-- Sensors Data Table (for real-time monitoring)
CREATE TABLE IF NOT EXISTS sensors (
    id INT AUTO_INCREMENT PRIMARY KEY,
    temperature DECIMAL(5,2) DEFAULT 37.5,
    humidity DECIMAL(5,2) DEFAULT 62.0,
    light_lux DECIMAL(10,2) DEFAULT 520,
    co2 DECIMAL(8,2) DEFAULT 400,
    nh3 DECIMAL(8,2) DEFAULT 2,
    ch4 DECIMAL(8,2) DEFAULT 0,
    o2 DECIMAL(5,2) DEFAULT 20.9,
    lpg DECIMAL(8,2) DEFAULT 0,
    h2s DECIMAL(8,2) DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Gas Readings Table
CREATE TABLE IF NOT EXISTS gas_readings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    co2 DECIMAL(8,2) DEFAULT 415,
    nh3 DECIMAL(8,2) DEFAULT 2,
    ch4 DECIMAL(8,2) DEFAULT 0,
    o2 DECIMAL(5,2) DEFAULT 20.9,
    lpg DECIMAL(8,2) DEFAULT 0,
    h2s DECIMAL(8,2) DEFAULT 0,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);



-- Power Readings (preferred; per-user + per-device by serial)
CREATE TABLE IF NOT EXISTS power_readings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(36) NULL,
    device_serial VARCHAR(100) NULL,
    reading_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    power_source ENUM('SOLAR', 'GRID') DEFAULT 'SOLAR',
    voltage_dc DECIMAL(6,2) DEFAULT 13.2,
    current_dc DECIMAL(6,2) DEFAULT 1.8,
    grid_energy_kwh DECIMAL(12,4) DEFAULT 0,
    cost_rwf DECIMAL(12,2) DEFAULT 0,
    cost_usd DECIMAL(12,4) DEFAULT 0,
    battery_percent INT DEFAULT 95,
    battery_status VARCHAR(20) NULL,
    energy_note VARCHAR(100) NULL,
    INDEX idx_power_readings_user_id (user_id),
    INDEX idx_power_readings_device_serial (device_serial),
    INDEX idx_power_readings_reading_time (reading_time)
);

-- Device Status Table
CREATE TABLE IF NOT EXISTS device_status (
    id INT AUTO_INCREMENT PRIMARY KEY,
    heater ENUM('ON', 'OFF') DEFAULT 'OFF',
    fan ENUM('ON', 'OFF') DEFAULT 'ON',
    rotator ENUM('ON', 'OFF', 'AUTO') DEFAULT 'AUTO',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Transactions Table (for financial tracking)
CREATE TABLE IF NOT EXISTS transactions (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    date VARCHAR(20) NOT NULL,
    timestamp BIGINT NOT NULL,
    type ENUM('income', 'expense') NOT NULL,
    category VARCHAR(50) NOT NULL,
    amount DECIMAL(12,2) NOT NULL,
    user_id VARCHAR(36),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Password Resets (self-service)
CREATE TABLE IF NOT EXISTS password_resets (
    id VARCHAR(36) PRIMARY KEY,
    user_id VARCHAR(36) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    used_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_password_resets_user_id (user_id),
    INDEX idx_password_resets_expires_at (expires_at),
    INDEX idx_password_resets_used_at (used_at)
);

-- Incubators Table
CREATE TABLE IF NOT EXISTS incubators (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    physical_id VARCHAR(20) NOT NULL,
    description VARCHAR(100) NOT NULL,
    location VARCHAR(50) NOT NULL,
    capacity INT DEFAULT 100,
    status ENUM('Active', 'Inactive', 'Maintenance') DEFAULT 'Active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Home Hero Media Table
CREATE TABLE IF NOT EXISTS hero_media (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    media_type ENUM('image', 'video') NOT NULL DEFAULT 'image',
    media_data_url LONGTEXT NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Team Members Table
CREATE TABLE IF NOT EXISTS team_members (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(120) NOT NULL,
    role VARCHAR(120) NOT NULL,
    description TEXT NULL,
    image_url VARCHAR(500) NOT NULL,
    display_order INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);


-- Product Media Table (for images and videos uploaded by farmers)
CREATE TABLE IF NOT EXISTS product_media (
    id INT AUTO_INCREMENT PRIMARY KEY,
    product_id VARCHAR(36) NOT NULL,
    media_type ENUM('image', 'video') NOT NULL,
    media_url VARCHAR(255) NOT NULL,
    uploaded_by VARCHAR(36), -- user id (optional, for tracking)
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Products Table
CREATE TABLE IF NOT EXISTS products (
    id VARCHAR(36) PRIMARY KEY DEFAULT (UUID()),
    name VARCHAR(120) NOT NULL,
    description TEXT,
    price DECIMAL(12,2) NOT NULL,
    location VARCHAR(100),
    address VARCHAR(255),
    created_by VARCHAR(36),
    published BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Announcements Table
CREATE TABLE IF NOT EXISTS announcements (
    id INT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(255) NOT NULL,
    phone VARCHAR(50) NOT NULL,
    email VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    user_role VARCHAR(50) DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_user_id (user_id),
    INDEX idx_created_at (created_at)
);

-- Insert default admin user (password: admin123)
INSERT INTO users (id, full_name, email, password, role) VALUES 
('DEVELOPER_UID_BYPASS', 'Theophile Developer', 'niyomungeritheophile02@gmail.com', '$2a$10$0GU2Z6W49S6rtBtFvOXNc.erStvaF8OnAQYAx4xGsVlIzhKTt7rra', 'admin')
ON DUPLICATE KEY UPDATE email = email;

-- Insert default sensor data
INSERT INTO sensors (temperature, humidity, light_lux, co2, nh3, ch4, o2, lpg, h2s) VALUES (37.8, 60.5, 520, 415, 2, 0, 20.9, 0, 0);

-- Insert default gas reading
INSERT INTO gas_readings (co2, nh3, o2, lpg, h2s) VALUES (415, 2, 20.9, 0, 0);

-- Insert default power data
INSERT INTO power (source, voltage, current, cost_rwf, total_energy_kwh, consumed_kwh, cost_usd, battery_level) 
VALUES ('SOLAR', 13.2, 1.8, 3750, 12.5, 12.5, 2.6786, 95);

-- Insert default device status
INSERT INTO device_status (heater, fan, rotator) VALUES ('OFF', 'ON', 'AUTO');

-- Insert sample incubators
INSERT INTO incubators (physical_id, description, location, capacity, status) VALUES 
('9678588', 'Smart Brooder Alpha', 'Wing A', 100, 'Active'),
('1235433', 'Incubator Unit B', 'Section C4', 102, 'Active');

-- Insert sample transactions
INSERT INTO transactions (date, timestamp, type, category, amount) VALUES 
('20/10/2024', 1729411200000, 'income', 'Egg Sales', 25000),
('21/10/2024', 1729497600000, 'expense', 'Feed', 15000);
