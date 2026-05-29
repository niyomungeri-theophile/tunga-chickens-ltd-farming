# ESP32 Database Integration - Admin Checklist

## 📋 Pre-Deployment Checklist

Use this checklist to ensure everything is configured correctly before deploying the system.

---

## 1. Library Installation ✓

- [ ] Arduino IDE installed
- [ ] ESP32 board package installed
- [ ] ArduinoJson library installed (v6.x or v7.x)
- [ ] HTTPClient available (included with ESP32)

**Verify in Arduino IDE:**
```
Sketch → Include Library → Manage Libraries
Search "ArduinoJson" → Should show installed
```

---

## 2. Backend Configuration ✓

- [ ] Backend server is running
- [ ] Backend API accessible on configured IP:port
- [ ] MySQL database created and tables exist
- [ ] `/api/sensors/update-by-serial` endpoint available

**Quick Test:**
```bash
curl http://192.168.1.100:5000/api/sensors/update-by-serial
→ Should return a JSON response or 400 error (not 404)
```

---

## 3. Database Tables Ready ✓

In your MySQL database, verify these tables exist:

```sql
-- Check table structure
DESCRIBE sensors;
DESCRIBE gas_readings;
DESCRIBE power_readings;
DESCRIBE device_status;

-- Verify columns present
SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
WHERE TABLE_NAME='sensors' AND TABLE_SCHEMA='eco_smart_poultry';
```

**Required Tables:**
- [ ] `sensors` (temperature, humidity, light_lux, co2, nh3, ch4, o2, h2s)
- [ ] `gas_readings` (co2, nh3, ch4, o2, h2s)
- [ ] `power_readings` (voltage_dc, current_dc, power_source, cost_rwf, cost_usd)
- [ ] `device_status` (heater, fan, rotator)
- [ ] `users` (device_serial_number, status)

---

## 4. Device Serial Configuration ✓

**For Each ESP32 Device:**

```sql
-- 1. Assign unique serial to user account
UPDATE users 
SET device_serial_number = 'ESP32-FARM-001' 
WHERE id = 'user-uuid-here';

-- 2. Verify assignment
SELECT id, full_name, email, device_serial_number, status 
FROM users 
WHERE device_serial_number = 'ESP32-FARM-001';

-- 3. Verify user is ACTIVE
-- If status is 'inactive', update it:
UPDATE users 
SET status = 'active' 
WHERE device_serial_number = 'ESP32-FARM-001';
```

**Device Serial Format:**
- [ ] Unique for each device
- [ ] No spaces or special characters (except -)
- [ ] Format: `ESP32-FARM-XXX` or similar
- [ ] Exactly 15-30 characters
- [ ] Matches in both ESP32 code AND database

**Document Your Devices:**

| Device | Serial Number | Location | User | Status |
|--------|---------------|----------|------|--------|
| Device 1 | ESP32-FARM-001 | _________ | _________ | ✓ Active |
| Device 2 | ESP32-FARM-002 | _________ | _________ | ✓ Active |
| Device 3 | ESP32-FARM-003 | _________ | _________ | ✓ Active |

---

## 5. ESP32 Firmware Configuration ✓

For each device, update these values in `eco_smart_esp32.ino`:

```cpp
// Line ~163: Backend server (must be accessible from ESP32 network)
const char* BACKEND_URL = "http://192.168.1.100:5000";

// Line ~164: Must match device_serial_number in database
const char* DEVICE_SERIAL = "ESP32-FARM-001";

// Line ~166: Send frequency (60000ms = 60 seconds)
const unsigned long DATABASE_SEND_INTERVAL = 60000;
```

**Verification:**
- [ ] BACKEND_URL is correct IP:port
- [ ] DEVICE_SERIAL matches database
- [ ] DATABASE_SEND_INTERVAL is reasonable (30-300 seconds)
- [ ] Firmware compiles without errors
- [ ] Uploaded to ESP32 successfully

---

## 6. WiFi Network Configuration ✓

Edit `eco_smart_esp32.ino` lines ~125-130:

```cpp
WiFiNetwork networks[3] = {
  {"Your-WiFi-SSID", "your-password"},
  {"Backup-WiFi", "backup-password"},
  {"WiFi3", "password3"}
};
```

- [ ] At least one WiFi network configured
- [ ] WiFi is stable and accessible from ESP32 location
- [ ] ESP32 can reach backend server from this WiFi

**Test WiFi:**
```
1. Upload firmware
2. Monitor LCD: Should show "WiFi Connected" within 30 seconds
3. Check Serial Monitor for WiFi SSID and IP address
```

---

## 7. Testing & Verification ✓

### Test 1: Upload & LED Check
- [ ] Firmware uploads successfully
- [ ] No compilation errors
- [ ] LED blinks 3 times (system ready)

### Test 2: WiFi Connection
- [ ] Serial Monitor shows "WiFi Connected Successfully!"
- [ ] LCD displays WiFi connection message
- [ ] Device gets IP address

### Test 3: First Data Send
- [ ] Wait ~60 seconds
- [ ] Serial Monitor shows: `=== SENDING DATA TO DATABASE ===`
- [ ] Should show: `HTTP Response Code: 200`
- [ ] Should show: `✓ Data sent successfully`

### Test 4: Database Verification
```sql
-- Check for new records
SELECT COUNT(*) FROM sensors WHERE recorded_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE);
-- Should show 1 or more recent records

-- Check data content
SELECT * FROM sensors ORDER BY recorded_at DESC LIMIT 1;
-- Should have temperature, humidity, gas values

-- Check power data
SELECT * FROM power_readings ORDER BY reading_time DESC LIMIT 1;
-- Should have voltage, current, power_source
```

### Test 5: Continuous Monitoring (5 minutes)
- [ ] Data sent every ~60 seconds
- [ ] No persistent error messages
- [ ] LCD shows database status screen without errors
- [ ] Database records increase by 5 every 5 minutes

---

## 8. Error Troubleshooting ✓

If tests fail, verify:

### HTTP 404 Error
```
ERROR: Device serial not found on backend!
```
**Check:**
```sql
-- Verify serial exists
SELECT * FROM users WHERE device_serial_number = 'YOUR_SERIAL';

-- If missing, add it:
UPDATE users 
SET device_serial_number = 'YOUR_SERIAL' 
WHERE id = 'user-uuid';
```

### HTTP 403 Error
```
ERROR: Device account is locked!
```
**Check:**
```sql
-- Verify user account is active
SELECT status FROM users WHERE device_serial_number = 'YOUR_SERIAL';

-- Activate if needed:
UPDATE users 
SET status = 'active' 
WHERE device_serial_number = 'YOUR_SERIAL';
```

### HTTP -1 Error (Connection Failed)
```
✗ Connection failed to backend server
```
**Check:**
1. Backend server running: `ping 192.168.1.100`
2. Correct IP in firmware
3. Firewall allows port 5000
4. WiFi connected on ESP32

### No Data in Database
**Check:**
1. Serial Monitor shows HTTP 200? (If not, fix errors above)
2. Waited 60+ seconds? (First send takes a minute)
3. Database tables exist? (Run DESCRIBE commands)
4. User account active? (Check status field)

---

## 9. Production Deployment ✓

Before going live, verify:

### Data Integrity
- [ ] All sensor readings are numeric (no NaN or null)
- [ ] Timestamps are in correct timezone
- [ ] Data updates every 60 seconds consistently
- [ ] No duplicate records

### Reliability
- [ ] System survives WiFi disconnection/reconnection
- [ ] System retries failed sends automatically
- [ ] No data loss during brief outages
- [ ] LED/buzzer working for alerts

### Performance
- [ ] Database queries complete <500ms
- [ ] No memory leaks (monitoring for 1+ hours)
- [ ] Serial Monitor shows clean output
- [ ] No ESP32 crashes or resets

### Security
- [ ] Device serial numbers unique and documented
- [ ] Backend endpoint protected (consider adding auth)
- [ ] Passwords not hardcoded (WiFi credentials secure)
- [ ] Data validated before database insert

---

## 10. Monitoring & Maintenance ✓

### Daily
- [ ] Check device is online (LCD shows "CONNECTED")
- [ ] Verify data arriving in database (SQL query)
- [ ] Monitor for error messages in Serial Monitor
- [ ] Check dashboard displays recent data

### Weekly
- [ ] Review data consistency
- [ ] Check for any failed sends
- [ ] Verify all sensors reading normal values
- [ ] Confirm database storage space available

### Monthly
- [ ] Backup database
- [ ] Review error logs
- [ ] Update firmware if available
- [ ] Check WiFi signal strength
- [ ] Verify device serial numbers documented

---

## 11. Documentation ✓

- [ ] Device serial numbers documented
- [ ] Backend IP/port documented
- [ ] WiFi network credentials documented
- [ ] Admin contact information documented
- [ ] Troubleshooting guide available

---

## 12. User Communication ✓

- [ ] Users know how to check data on dashboard
- [ ] Users know who to contact for issues
- [ ] Users understand data sending frequency
- [ ] Users know system alert procedures

---

## Final Sign-Off

**System Administrator:** _________________________ Date: _______

**Backend Developer:** _________________________ Date: _______

**Device Configuration:** _________________________ Date: _______

---

## Deployment Status

- [ ] All checks complete
- [ ] No critical issues remaining
- [ ] System ready for production
- [ ] Users notified and trained
- [ ] Emergency contacts established

---

## Quick Reference

| Component | Status | Issue | Action |
|-----------|--------|-------|--------|
| Arduino Library | ✓ | | Install ArduinoJson |
| Backend API | ✓ | | Verify running |
| Database Tables | ✓ | | Run schema SQL |
| Device Serial | ✓ | | Assign and document |
| Firmware Upload | ✓ | | Compile and upload |
| WiFi Connection | ✓ | | Configure networks |
| First Send | ✓ | | Monitor Serial output |
| Continuous Send | ✓ | | Wait 5 minutes |
| Data Storage | ✓ | | Run SQL query |

---

## Contact

**Backend Admin:** _________________________________  
**Phone:** _________________________________  
**Email:** _________________________________  
**Available:** _________________________________  

---

## Notes

_Space for additional notes and observations:_

```
______________________________________________________________________________

______________________________________________________________________________

______________________________________________________________________________

______________________________________________________________________________

```

---

**System Status:** 🟢 Ready for Deployment

