const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        
        if (!token) {
            return res.status(401).json({ 
                success: false, 
                message: 'Access denied. No token provided.' 
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (error) {
        return res.status(401).json({ 
            success: false, 
            message: 'Invalid or expired token.' 
        });
    }
};

// Role-based middleware
const roleMiddleware = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !allowedRoles.includes(req.user.role)) {
            return res.status(403).json({ 
                success: false, 
                message: 'Access denied. Insufficient permissions.' 
            });
        }
        next();
    };
};

// ====================== DEVICE DATA ISOLATION MIDDLEWARE ======================
// Ensures users only access data from their assigned devices

// Middleware to verify device ownership
const verifyDeviceOwnership = async (req, res, next) => {
    try {
        const userId = req.user?.id;
        const deviceSerial = req.query?.device_serial || req.body?.device_serial || req.headers?.['x-device-serial'];
        
        if (!userId || !deviceSerial) {
            return res.status(400).json({ 
                success: false, 
                message: 'Missing user ID or device serial' 
            });
        }
        
        // For admins/supervisors, allow access to any device
        const userRole = String(req.user?.role || '').toLowerCase();
        if (['admin', 'supervisor'].includes(userRole)) {
            req.authorizedDeviceSerial = deviceSerial;
            return next();
        }
        
        // For farmers, verify they own this device
        const [users] = await pool.query(
            'SELECT device_serial_number FROM users WHERE id = ? LIMIT 1',
            [userId]
        );
        
        if (users.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: 'User not found' 
            });
        }
        
        const assignedSerial = users[0].device_serial_number;
        
        if (!assignedSerial || assignedSerial !== deviceSerial) {
            return res.status(403).json({ 
                success: false, 
                message: 'Unauthorized: This device is not assigned to your account',
                hint: 'Contact admin to assign a device to your account'
            });
        }
        
        req.authorizedDeviceSerial = deviceSerial;
        next();
    } catch (error) {
        console.error('Device ownership verification error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Authorization check failed' 
        });
    }
};

// Middleware to verify API key for ESP32 (device authentication)
const deviceAuthMiddleware = async (req, res, next) => {
    try {
        const deviceSerial = req.headers?.['x-device-serial'];
        const apiKey = req.headers?.['x-api-key'];
        
        if (!deviceSerial || !apiKey) {
            return res.status(401).json({ 
                success: false, 
                message: 'Missing device credentials in headers' 
            });
        }
        
        // Check if device is registered and credentials are valid
        const [devices] = await pool.query(
            `SELECT dr.user_id, dr.status, u.status as user_status 
             FROM device_registrations dr
             LEFT JOIN users u ON dr.user_id = u.id
             WHERE dr.device_serial = ? AND dr.api_key = ? LIMIT 1`,
            [deviceSerial, apiKey]
        );
        
        if (devices.length === 0) {
            return res.status(403).json({ 
                success: false, 
                message: 'Invalid device credentials',
                deviceBlocked: false 
            });
        }
        
        const device = devices[0];
        
        // Check if device is linked to a user
        if (!device.user_id) {
            return res.status(403).json({ 
                success: false, 
                message: 'Device not linked to any user account',
                deviceBlocked: false 
            });
        }
        
        // Check if user account is active
        const userStatus = String(device.user_status || 'active').toLowerCase();
        if (userStatus !== 'active') {
            return res.status(403).json({ 
                success: false, 
                message: 'Associated user account is inactive',
                deviceBlocked: true 
            });
        }
        
        // Device is authorized
        req.authorizedDeviceSerial = deviceSerial;
        req.deviceUserId = device.user_id;
        next();
    } catch (error) {
        console.error('Device authentication error:', error);
        return res.status(500).json({ 
            success: false, 
            message: 'Device authentication failed' 
        });
    }
};

// Middleware to get user's devices (for querying data)
const getUserDevices = async (userId) => {
    try {
        const [users] = await pool.query(
            'SELECT device_serial_number FROM users WHERE id = ? LIMIT 1',
            [userId]
        );
        
        if (users.length === 0 || !users[0].device_serial_number) {
            return [];
        }
        
        return [users[0].device_serial_number];
    } catch (error) {
        console.error('Error getting user devices:', error);
        return [];
    }
};

module.exports = { 
    authMiddleware, 
    roleMiddleware,
    verifyDeviceOwnership,
    deviceAuthMiddleware,
    getUserDevices
};