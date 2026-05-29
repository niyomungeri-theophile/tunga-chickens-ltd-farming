# ESP32 Database Configuration Template

## 🔧 CONFIGURATION REFERENCE
Use this template to organize the information needed to configure your ESP32 firmware.

---

## BACKEND SERVER DETAILS

| Setting | Value | Notes |
|---------|-------|-------|
| **Backend IP Address** | `192.168.1.___` | Ask backend admin |
| **Backend Port** | `5000` | Default for this system |
| **Protocol** | `http://` | Use http:// for local, https:// for cloud |
| **Full URL** | `http://192.168.1.___:5000` | Used in firmware |
| **Backend Status** | ☐ Running ☐ Stopped ☐ Unknown | Verify before uploading |

---

## DEVICE IDENTIFICATION

| Setting | Value | Notes |
|---------|-------|-------|
| **Device Serial Number** | `ESP32-POULTRY-___` | Must match backend `users.device_serial_number` |
| **Device Name** | _____________ | For your reference |
| **Farm Name** | _____________ | Owner information |
| **Location** | _____________ | Where ESP32 is installed |
| **Owner Email** | _____________ | Backend account email |
| **Backend User ID** | _____________ | From users table in database |

---

## WiFi NETWORKS

Add available WiFi networks that ESP32 should try to connect to:

```cpp
WiFiNetwork networks[3] = {
  {"WiFi Name 1", "password1"},
  {"WiFi Name 2", "password2"},
  {"WiFi Name 3", "password3"}
};
```

| Network | SSID | Password | Priority |
|---------|------|----------|----------|
| **Network 1** | _____________ | _____________ | Primary |
| **Network 2** | _____________ | _____________ | Secondary |
| **Network 3** | _____________ | _____________ | Tertiary |

---

## FIRMWARE CONFIGURATION VALUES

Copy these exact values into the firmware code (lines ~160-170):

```cpp
// BACKEND CONFIGURATION
const char* BACKEND_URL = "http://192.168.1.___:5000";
const char* DEVICE_SERIAL = "ESP32-POULTRY-___";
const unsigned long DATABASE_SEND_INTERVAL = 60000;  // milliseconds
```

### Configuration Checklist
- [ ] BACKEND_URL is correct format (http://IP:PORT)
- [ ] DEVICE_SERIAL matches backend database
- [ ] DATABASE_SEND_INTERVAL is appropriate (30-120 seconds typical)
- [ ] Recompiled after making changes
- [ ] Uploaded to ESP32

---

## BACKEND VERIFICATION QUERIES

Run these SQL queries on your backend database to verify configuration:

### 1. Verify Device Serial Exists
```sql
SELECT id, full_name, email, device_serial_number, status 
FROM users 
WHERE device_serial_number = 'ESP32-POULTRY-___';
```

**Expected Result:**
- ✓ User record found
- ✓ Status = "active"
- ✓ Email matches owner
- ✗ If nothing returns: Ask admin to add this serial number

### 2. Check Latest Sensor Data
```sql
SELECT * FROM sensors 
WHERE user_id = 'USER_ID_FROM_ABOVE'
ORDER BY recorded_at DESC 
LIMIT 1;
```

**Expected Result (after ESP32 has sent data):**
- ✓ New record with current timestamp
- ✓ Temperature, humidity values populated
- ✓ Gas readings populated

### 3. Check Power Readings
```sql
SELECT * FROM power_readings 
WHERE user_id = 'USER_ID_FROM_ABOVE'
ORDER BY reading_time DESC 
LIMIT 1;
```

**Expected Result:**
- ✓ New record with solar/grid source
- ✓ Voltage and current values present

---

## TROUBLESHOOTING REFERENCE

### Issue: HTTP 404 (Device Not Found)

**Quick Fix:**
1. Ask backend admin to provide correct device serial
2. Update DEVICE_SERIAL in firmware
3. Verify in database with query above
4. Recompile and upload

### Issue: HTTP 403 (Forbidden/Locked)

**Quick Fix:**
```sql
-- Check if account is active
SELECT status FROM users WHERE device_serial_number = 'YOUR_SERIAL';

-- If status = 'inactive', ask admin to activate it:
UPDATE users SET status = 'active' WHERE device_serial_number = 'YOUR_SERIAL';
```

### Issue: HTTP -1 (Connection Failed)

**Quick Fix:**
1. Verify backend server is running: `ping 192.168.1.___`
2. Check IP address and port in BACKEND_URL
3. Test from your computer: `curl http://192.168.1.___:5000/api/health`
4. Check firewall allows port 5000
5. Verify WiFi on ESP32 is connected

### Issue: No Data in Database

**Checklist:**
- [ ] Serial Monitor shows "HTTP Response Code: 200"
- [ ] device_serial_number matches exactly (case-sensitive)
- [ ] User status in database is "active"
- [ ] Waited at least 60 seconds after upload
- [ ] WiFi is connected (check LCD display)

---

## POST-DEPLOYMENT CHECKLIST

- [ ] Backend admin provided device serial number
- [ ] Backend admin created user account with this serial
- [ ] BACKEND_URL updated with correct IP and port
- [ ] DEVICE_SERIAL updated with assigned serial
- [ ] WiFi credentials added to networks array
- [ ] Firmware compiled without errors
- [ ] Uploaded to ESP32
- [ ] Serial Monitor shows successful WiFi connection
- [ ] Serial Monitor shows "✓ Data sent successfully"
- [ ] Verified data in database with SQL queries
- [ ] Tested dashboard displays data
- [ ] Monitored for 5+ minutes to confirm consistent sending

---

## OPERATIONAL NOTES

**Data Sending Schedule:**
- Default: Every 60 seconds
- Can be adjusted: 30-300 seconds recommended

**Data Retention:**
- All data is timestamped and logged to database
- No data is lost if system is temporarily offline
- Retries automatically when WiFi reconnects

**System Health Monitoring:**
- Check Serial Monitor output every session
- Monitor LCD displays for errors
- Verify database records every 24 hours
- Check for consecutive failures in logs

---

## CONTACT INFO

**Backend Admin:** ________________  
**Phone:** ________________  
**Email:** ________________  

**Date Configured:** ________________  
**Last Updated:** ________________  

