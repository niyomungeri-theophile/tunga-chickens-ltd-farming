# ESP32 Database Integration Setup Guide

## Overview
The ESP32 firmware now sends sensor data to your backend database every 60 seconds. This document explains the setup process and configuration.

---

## 1. Required Arduino Libraries

Install the following libraries via Arduino IDE > Sketch > Include Library > Manage Libraries:

### Essential Libraries:
- **HTTPClient** - Built-in with ESP32 (for HTTP requests)
- **ArduinoJson** (by Benoit Blanchon)
  - Version: 6.x or 7.x
  - Used for JSON payload creation

### Already Included:
- Wire.h (I2C communication)
- DHT (Temperature/Humidity)
- MQUnifiedsensor (Gas sensors)
- Adafruit_INA219 (Power monitoring)
- HardwareSerial (GSM communication)

### Installation Command:
Search for "ArduinoJson" in Library Manager and install version 7.0.0 or later.

---

## 2. Configuration (CRITICAL)

Open `eco_smart_esp32.ino` and update these values:

### Backend Server Address
```cpp
const char* BACKEND_URL = "http://192.168.x.x:5000";
```
**Update with:**
- `192.168.x.x` = Your backend server IP address or domain
- Port `5000` = Backend API port (verify with backend admin)

**Examples:**
- Local network: `http://192.168.1.100:5000`
- With domain: `http://eco-smart.example.com:5000`
- Cloud server: `http://your-domain.com:5000`

### Device Serial Number
```cpp
const char* DEVICE_SERIAL = "ESP32-POULTRY-001";
```
**This is CRITICAL:**
- Must match EXACTLY with `device_serial_number` in your backend `users` table
- Ask admin to provide the serial number assigned to this device
- This is how the backend knows which user owns this device
- Format recommendation: `ESP32-FARM-XXX` or similar

### Send Interval
```cpp
const unsigned long DATABASE_SEND_INTERVAL = 60000;  // milliseconds
```
- `60000` = send every 60 seconds
- Adjust based on your needs (minimum 10 seconds recommended)

---

## 3. Data Being Sent

The firmware sends this JSON payload to `/api/sensors/update-by-serial`:

```json
{
  "serialNumber": "ESP32-POULTRY-001",
  "temperature": 25.5,
  "humidity": 65.0,
  "light_lux": 520.0,
  "gas": {
    "CO2": 450,
    "NH3": 5,
    "CH4": 0,
    "O2": 20.9,
    "H2S": 0
  },
  "power": {
    "source": "SOLAR",
    "voltage": 13.2,
    "current": 1800,
    "power": 23.76,
    "load_power": 23.76,
    "batteryLevel": 95,
    "batteryStatus": "Good"
  },
  "status": {
    "heater": "OFF",
    "fan": "ON",
    "rotator": "AUTO"
  }
}
```

### Database Tables Updated:
1. **sensors** - temperature, humidity, light_lux, CO2, NH3, CH4, O2, H2S
2. **gas_readings** - detailed gas measurements
3. **power_readings** - solar/grid source, voltage, current, power
4. **device_status** - heater, fan, rotator states

---

## 4. Verification & Troubleshooting

### Serial Monitor Output
When data is sent successfully, you'll see:
```
=== SENDING DATA TO DATABASE ===
Target URL: http://192.168.1.100:5000/api/sensors/update-by-serial
Payload: {...}
HTTP Response Code: 200
✓ Data sent successfully to database
```

### Common Error Codes

#### 404 - Not Found
```
ERROR: Device serial not found on backend!
Please verify DEVICE_SERIAL matches backend database.
```
**Fix:** Check that device_serial_number is correct in backend users table

#### 403 - Forbidden
```
ERROR: Device account is locked!
Contact admin for support.
```
**Fix:** Device account is inactive. Admin needs to activate it.

#### -1 - Connection Failed
```
✗ Connection failed to backend server
```
**Fix:**
- Check BACKEND_URL is correct
- Verify backend server is running
- Check WiFi connection
- Verify firewall allows port 5000

### LCD Display
New 5th display screen shows database status:
- WiFi connection status
- Data sending status
- Device serial number
- Failure count if applicable

---

## 5. Backend Verification

### Check if Data is Being Stored

Connect to your backend database and run:

```sql
-- Check latest sensor data
SELECT * FROM sensors ORDER BY recorded_at DESC LIMIT 5;

-- Check power readings
SELECT * FROM power_readings ORDER BY reading_time DESC LIMIT 5;

-- Check data for specific user
SELECT * FROM sensors 
WHERE user_id = (SELECT id FROM users WHERE device_serial_number = 'ESP32-POULTRY-001')
ORDER BY recorded_at DESC LIMIT 10;
```

### View Real-time Data via Dashboard
- Log in to your web dashboard
- Navigate to your farm dashboard
- Check sensor readings and power data
- Should update every 60 seconds

---

## 6. Adjusting Send Frequency

Change `DATABASE_SEND_INTERVAL`:

```cpp
const unsigned long DATABASE_SEND_INTERVAL = 30000;  // Every 30 seconds
const unsigned long DATABASE_SEND_INTERVAL = 120000; // Every 2 minutes
```

**Considerations:**
- **More frequent (10-30s):** Better real-time monitoring, more bandwidth usage
- **Less frequent (2-5min):** Lower bandwidth, less power consumption
- **Recommended:** 60-120 seconds for balanced monitoring

---

## 7. Debugging Mode

Enable detailed logging by adding to setup():

```cpp
// Add serial output for debugging
#define DEBUG_DATABASE 1
```

Then uncomment additional Serial.println() calls in `sendSensorDataToDatabase()` for detailed logs.

---

## 8. Failure Recovery

The firmware tracks failures:
- Counts consecutive send failures (max 3 before warning)
- Retries automatically every 60 seconds
- Continues collecting sensor data even if sends fail
- LED/Buzzer indication for critical failures

### Force Reconnection
If data isn't sending:
1. Power cycle the ESP32
2. Check WiFi connection
3. Verify BACKEND_URL
4. Check serial monitor for error messages

---

## 9. Important Security Notes

⚠️ **Current Configuration (Development)**
- No API authentication (open endpoint)
- Device identified by serial number only
- Suitable for local network testing

⚠️ **Production Recommendations**
- Add API key authentication
- Use HTTPS instead of HTTP
- Implement rate limiting on backend
- Add request validation

---

## 10. Testing Procedure

1. **Configure:**
   - Set correct BACKEND_URL
   - Set correct DEVICE_SERIAL
   - Ensure backend is running

2. **Upload firmware** to ESP32

3. **Connect WiFi:**
   - Should see WiFi connection messages
   - LED beeps for successful connection

4. **Monitor Serial Output:**
   - Open Arduino IDE > Serial Monitor
   - Set baud rate to 115200
   - Watch for database send attempts

5. **Verify Data in Database:**
   - Run SQL query from backend database
   - Should see new sensor records every 60 seconds

6. **Check Web Dashboard:**
   - Real-time data should appear
   - Charts should update

---

## 11. Support

If data isn't appearing:

1. **Check WiFi:**
   ```
   Is WiFi Connected message visible on LCD?
   ```

2. **Check Backend:**
   ```
   Is backend server running on specified IP/port?
   curl http://192.168.1.100:5000/api/health
   ```

3. **Check Device Serial:**
   ```
   SELECT id, full_name, device_serial_number 
   FROM users WHERE device_serial_number = 'YOUR-SERIAL';
   ```

4. **Check Network Connectivity:**
   ```
   From ESP32: ping 192.168.1.100
   From Backend: check firewall logs
   ```

---

## Summary of Changes

✓ Added HTTP client for database communication
✓ Added ArduinoJson library for JSON payload creation
✓ Added `sendSensorDataToDatabase()` function
✓ Added database status display screen
✓ Integrated database sending into main loop (every 60 seconds)
✓ Added failure tracking and error handling
✓ Updated serial monitor with database status
✓ Added comprehensive logging

**Status:** Ready for deployment after configuration!

