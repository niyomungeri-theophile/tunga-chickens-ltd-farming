# Device Blocking Implementation Guide

## Overview
When a farmer's account is marked as **inactive**, all their linked devices are automatically **locked and blocked** from operating. This prevents unauthorized use and ensures system security.

---

## Architecture

### 1. Device Registration Flow
```
ESP32 (unlinked)
    ↓
POST /api/devices/register
    ↓ (returns deviceSerial + apiKey)
    ↓
Farmer logs in → POST /api/devices/link (auth required)
    ↓ (stores user_id in device_registrations)
    ↓
Device is now LINKED to farmer account
```

### 2. Account Status Check Flow
```
Device (active) sends sensor data/status/commands
    ↓
Backend receives request with:
  - x-device-serial header
  - x-api-key header
    ↓
Query device_registrations + users tables:
  - Verify device credentials
  - Get linked user_id
  - Check users.status column
    ↓
If status != 'active':
  ↓
Return 403 with:
{
  "success": false,
  "message": "Account inactive - device locked",
  "deviceBlocked": true
}
    ↓
ESP32 detects deviceBlocked=true
    ↓
DEVICE LOCKED: Disable all relays + send SMS alert
```

---

## Backend Changes

### Device Registration Table (`device_registrations`)
```sql
CREATE TABLE device_registrations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  device_serial VARCHAR(100) NOT NULL UNIQUE,
  esp32_chip_id VARCHAR(100) NOT NULL UNIQUE,
  user_id VARCHAR(36) NULL,              -- Links device to farmer
  api_key VARCHAR(256) NOT NULL UNIQUE,
  status ENUM('unregistered', 'registered', 'linked', 'active', 'inactive', 'error'),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_device_registrations_user_id (user_id)
);
```

### Users Table (`users`)
```sql
ALTER TABLE users ADD COLUMN status ENUM('active','inactive') DEFAULT 'active';
```

### Protected Endpoints with Account Status Checking

#### 1. POST /api/devices/status
**Purpose**: Device sends periodic status updates (every 120 seconds)

**Request**:
```
POST /api/devices/status
Headers:
  x-device-serial: NT-01-TCL
  x-api-key: [48-char API key]

Body:
{
  "status": "active",
  "uptime": 3600000,
  "heaterStatus": "ON",
  "exhaustStatus": "OFF",
  "powerSource": "SOLAR"
}
```

**Response (Account Active)**:
```json
{
  "success": true,
  "message": "Status updated",
  "deviceBlocked": false
}
```

**Response (Account Inactive)**:
```json
{
  "success": false,
  "message": "Account inactive - device locked",
  "deviceBlocked": true
}
```

---

#### 2. POST /api/predictions/stream
**Purpose**: Device streams sensor data for ML predictions (every 30 seconds)

**Request**:
```
POST /api/predictions/stream
Headers:
  x-device-serial: NT-01-TCL
  x-api-key: [48-char API key]

Body:
{
  "deviceId": "NT-01-TCL",
  "temp1": 24.5,
  "temp2": 24.8,
  "humidity": 65.2,
  "light": 450,
  "co2": 1200,
  "nh3": 8.5,
  "lpg": 45.0,
  "solarVoltage": 18.5,
  "solarCurrent": 250,
  "solarPower": 4.625,
  "loadPower": 3.2
}
```

**Response (Account Inactive)**:
```json
{
  "success": false,
  "message": "Account inactive - device locked",
  "deviceBlocked": true
}
```

---

#### 3. GET /api/predictions/control/:deviceSerial
**Purpose**: Device polls for remote commands (every 60 seconds)

**Request**:
```
GET /api/predictions/control/NT-01-TCL
Headers:
  x-device-serial: NT-01-TCL
  x-api-key: [48-char API key]
```

**Response (Account Inactive)**:
```json
{
  "success": false,
  "message": "Account inactive - device locked",
  "deviceBlocked": true,
  "commands": []
}
```

---

## Firmware Changes (ESP32)

### New Variables
```cpp
bool deviceBlocked = false;           // Track blocking state
unsigned long lastBlockCheckTime = 0; // For periodic checks
```

### New Functions

#### `handleDeviceBlocking()`
Triggered when device receives `deviceBlocked: true` from backend:

1. **Disable all relays**:
   - HEATER_RELAY → LOW
   - EXHAUST_RELAY → LOW
   - SOLAR_RELAY → LOW
   - GRID_RELAY → HIGH (safety - ensure grid power available)

2. **Alert user**:
   - LED (INDICATOR_PIN) → ON continuously
   - Buzzer → 5x 3000Hz beeps
   - Send SMS to primary phone

3. **Display lock screen**:
```
   +-----------------------+
   |!!! SYSTEM LOCKED !!!  |
   |Account: INACTIVE      |
   |All relays: OFF        |
   |Contact admin          |
   +-----------------------+
```

4. **Set flag**: `deviceBlocked = true` (prevents further API calls)

#### `handleDeviceUnblocking()`
Triggered when device reconnects and detects account is now active:

1. **Resume operations**:
   - Clear `deviceBlocked` flag
   - Resume sensor readings
   - Resume relay control

2. **Confirm unlock**:
   - LED/Buzzer confirmation sequence
   - Send SMS to primary phone
   - Display ready screen

### Main Loop Changes

```cpp
// In loop():

// Periodic status check (every 120 seconds)
if (deviceRegistered && wifiConnected) {
  updateDeviceStatus();
  // ↓ Returns 403 with deviceBlocked=true if account inactive
  // ↓ handleDeviceBlocking() called automatically
}

// Periodic sensor streaming (every 30 seconds)
if (deviceRegistered && wifiConnected) {
  sendSensorDataToAPI();
  // ↓ Returns 403 with deviceBlocked=true if account inactive
  // ↓ handleDeviceBlocking() called automatically
}

// Periodic command polling (every 60 seconds)
if (deviceRegistered && wifiConnected) {
  checkAndExecuteRemoteCommands();
  // ↓ Checks for unblocking before polling
  // ↓ If blocked, calls updateDeviceStatus() to see if account reactivated
}

// If device is blocked, halt normal operations
if (deviceBlocked) {
  // Show lock screen, don't read sensors, don't control relays
  delay(100);
  return;
}
```

---

## Testing Flow

### Test Case 1: Normal Device Operation → Account Deactivation → Reactivation

```
1. Device linked to farmer account (status='active')
   ✓ Device registers successfully
   ✓ Device sends sensor data
   ✓ Device receives commands
   ✓ All relays respond to temperature/gas logic

2. Admin deactivates farmer account:
   UPDATE users SET status='inactive' WHERE id='farmer-123'

3. Device sends next status/stream/command request
   ✗ Returns 403 with deviceBlocked=true
   → Device immediately disables all relays
   → Device sends SMS alert
   → Device displays lock screen
   → No relays respond to sensor logic

4. Admin reactivates farmer account:
   UPDATE users SET status='active' WHERE id='farmer-123'

5. Device polls for commands (60-second interval)
   → First detects account is inactive (still in cooldown)
   → Next status update (120-second interval)
   → Status endpoint returns 200 (account now active!)
   → Device calls handleDeviceUnblocking()
   → Device resumes sensor readings and relay control
```

### Test Case 2: Multiple Devices, Single Account

```
1. Farmer links 2 devices:
   Device 1: NT-01-TCL
   Device 2: NT-02-TCL
   Both linked to user_id='farmer-123'

2. Admin deactivates farmer account

3. Both devices receive 403 responses simultaneously
   → Both lock instantly
   → Both send SMS alerts
   → Both disable relays

4. Admin reactivates account

5. Both devices unlock simultaneously within next polling cycle
```

### Test Case 3: Unlinked Device Attempting to Send Data

```
1. Device registers but NOT linked:
   POST /api/devices/register → Returns deviceSerial + apiKey
   Device still in 'unregistered' status (user_id = NULL)

2. Device attempts to send sensor data:
   POST /api/predictions/stream
   Headers: x-device-serial, x-api-key

3. Backend checks device_registrations:
   SELECT user_id FROM device_registrations WHERE device_serial=...
   → user_id is NULL (not linked)

4. Returns 403:
   "Device not linked to any account"
   deviceBlocked: false (not a blocking issue, just not linked yet)

5. Device shows message on LCD:
   "Device not linked"
   "Use app to link account"
```

---

## Admin Testing Commands

### Check Device Status
```sql
SELECT 
  d.device_serial, 
  d.api_key, 
  d.user_id, 
  d.status as device_status,
  u.full_name, 
  u.status as user_status
FROM device_registrations d
LEFT JOIN users u ON d.user_id = u.id
ORDER BY d.created_at DESC;
```

### Deactivate Account (Blocks Device)
```sql
UPDATE users 
SET status = 'inactive' 
WHERE id = 'farmer-123';
```

### Reactivate Account (Unblocks Device)
```sql
UPDATE users 
SET status = 'active' 
WHERE id = 'farmer-123';
```

### Check All Active Devices
```sql
SELECT 
  d.device_serial, 
  u.full_name, 
  u.email,
  d.last_seen,
  d.status as device_status,
  u.status as user_status
FROM device_registrations d
LEFT JOIN users u ON d.user_id = u.id
WHERE d.status = 'linked' 
  AND u.status = 'active'
ORDER BY d.last_seen DESC;
```

### Check Blocked Devices
```sql
SELECT 
  d.device_serial, 
  u.full_name, 
  u.email,
  u.status as account_status,
  d.status as device_status
FROM device_registrations d
LEFT JOIN users u ON d.user_id = u.id
WHERE u.status = 'inactive' 
  AND d.user_id IS NOT NULL;
```

---

## SMS Alert Messages

### Device Locked Alert
```
SYSTEM LOCKED
Account is INACTIVE
Serial: NT-01-TCL
All controls disabled
Contact admin to reactivate
```

### Device Unlocked Alert
```
SYSTEM UNLOCKED
Account reactivated
Serial: NT-01-TCL
Monitoring resumed
```

---

## Security Considerations

1. **API Key Storage**: Device stores API key in EEPROM (encrypted if possible)
2. **Header Validation**: All API endpoints require both headers:
   - `x-device-serial` (identifies device)
   - `x-api-key` (authenticates device)
3. **Account Check**: Database query verifies user status on EVERY protected request
4. **Relay Disable**: Hardware cutoff is failsafe - relays explicitly disabled
5. **SMS Notification**: User is immediately notified of blocking event
6. **Audit Trail**: All API calls logged with response codes

---

## Deployment Checklist

- [ ] Update database schema (add status column to users if not present)
- [ ] Update `/backend/routes/devices.js` with account status checking
- [ ] Update `/backend/routes/predictions.js` with device auth and account checking
- [ ] Deploy updated firmware to ESP32 devices
- [ ] Test device registration and linking flow
- [ ] Test account deactivation → device blocking
- [ ] Test account reactivation → device unblocking
- [ ] Verify SMS alerts work
- [ ] Verify relay disable on lock
- [ ] Monitor logs for any API errors
- [ ] Document device serial numbers for each farmer
