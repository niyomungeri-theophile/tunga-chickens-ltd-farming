# ESP32 Database Integration - Quick Start

## ⚡ 5-Minute Setup

### Step 1: Install Required Library
1. Open Arduino IDE
2. Go to **Sketch → Include Library → Manage Libraries**
3. Search for **"ArduinoJson"**
4. Click **Install** (version 6.x or 7.x)

### Step 2: Update Configuration
Edit `eco_smart_esp32.ino` (around line 160-170):

```cpp
// CHANGE THESE THREE VALUES:
const char* BACKEND_URL = "http://192.168.1.100:5000";  // Your backend IP
const char* DEVICE_SERIAL = "ESP32-POULTRY-001";        // Serial from admin
const unsigned long DATABASE_SEND_INTERVAL = 60000;     // Send every 60 seconds
```

### Step 3: Verify Backend Configuration

**Ask your backend admin:**
- ✓ Backend server IP address
- ✓ Backend server port (usually 5000)
- ✓ Device serial number to use
- ✓ Confirm `users` table has this serial: `SELECT * FROM users WHERE device_serial_number='ESP32-POULTRY-001'`

### Step 4: Upload & Test
1. Upload firmware to ESP32
2. Open Serial Monitor (115200 baud)
3. Look for: `=== SENDING DATA TO DATABASE ===`
4. Expected result: `HTTP Response Code: 200`

### Step 5: Verify Data
In backend database:
```sql
SELECT * FROM sensors ORDER BY recorded_at DESC LIMIT 1;
SELECT * FROM power_readings ORDER BY reading_time DESC LIMIT 1;
```

✅ **Done!** Data should appear in your database every 60 seconds.

---

## 🔍 What Gets Sent

**Every 60 seconds, this data is sent:**

| Field | Source | Example |
|-------|--------|---------|
| Temperature | DS18B20 | 25.5°C |
| Humidity | DHT22 | 65% |
| Light | LDR | 520 lux |
| CO2 | MG811 | 450 ppm |
| NH3 | MQ-137 | 5 ppm |
| LPG | MQ-6 | 2 ppm |
| Solar Voltage | INA219 | 13.2V |
| Solar Current | INA219 | 1.8A |
| Power Source | Relays | SOLAR/GRID |
| Heater Status | GPIO5 | ON/OFF |
| Fan Status | GPIO18 | ON/OFF |

---

## 🚨 Troubleshooting

### "HTTP Response Code: 404"
**Problem:** Device serial not found on backend
```cpp
// Fix: Ask admin for correct serial number and update:
const char* DEVICE_SERIAL = "CORRECT-SERIAL-HERE";
```

### "HTTP Response Code: -1"
**Problem:** Cannot connect to backend
```
1. Check BACKEND_URL is correct: http://192.168.1.X:5000
2. Verify backend is running: ping 192.168.1.X
3. Check WiFi is connected (LCD should show)
4. Check firewall allows port 5000
```

### "WiFi not connected - skipping database send"
**Problem:** No WiFi connection
```
1. Add your WiFi to networks list (around line 125):
   {"Your-WiFi-Name", "password123"}
2. Recompile and upload
```

### Data not appearing in database
```
1. Check Serial Monitor shows: "✓ Data sent successfully"
2. Verify device_serial_number in database matches ESP32
3. Check user account is "active" status
4. Run: SELECT * FROM sensors ORDER BY recorded_at DESC LIMIT 1;
```

---

## 📊 Database Tables Updated

| Table | Fields | Purpose |
|-------|--------|---------|
| **sensors** | temperature, humidity, light_lux, CO2, NH3 | Environmental data |
| **gas_readings** | CO2, NH3, CH4, O2, H2S | Detailed gas analysis |
| **power_readings** | voltage, current, power, source, cost | Energy monitoring |
| **device_status** | heater, fan, rotator | Equipment status |

---

## 📡 API Endpoint

**Endpoint:** `/api/sensors/update-by-serial`  
**Method:** POST  
**Auth:** None (device identified by serialNumber)  
**Response:** `{ success: true, userId: "..." }`

---

## 🔐 Security Notes

⚠️ **Current:** Open API (serial number only identification)  
⚠️ **Recommendation:** Add authentication for production

---

## 📞 Support Checklist

- [ ] Backend URL updated correctly
- [ ] Device serial number matches backend
- [ ] WiFi connected (check LCD)
- [ ] ArduinoJson library installed
- [ ] Serial Monitor shows HTTP 200
- [ ] Database has new sensor records
- [ ] User account status is "active"

