#include <Wire.h>
#include <LiquidCrystal_I2C.h>
#include <MQUnifiedsensor.h>
#include <CO2Sensor.h>
#include <WiFi.h>
#include <DHT.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <Adafruit_INA219.h>
#include <HardwareSerial.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <EEPROM.h>

// ====================== PIN DEFINITIONS ======================
#define PIN_MQ6     32
#define PIN_MQ137   35
#define PIN_MG811   34
#define PIN_LDR     33
#define PIN_DHT     26
#define PIN_DS18B20 27
#define PIN_LDR_DAYNIGHT 12
#define BUZZER_PIN  5
#define INDICATOR_PIN 13
// Buzzer enabled on pin 5 (connected directly, not via relay)

// ====================== RELAYS ======================
#define SOLAR_RELAY 2
#define GRID_RELAY  4
#define HEATER_RELAY    19
#define EXHAUST_RELAY   18
// Relay to control supplemental light (active-low on the relay module)
#define LIGHT_RELAY 15

// ====================== SIM800L SETUP ======================
#define GSM_RX 16
#define GSM_TX 17
HardwareSerial gsm(2);

// Phone numbers (UPDATE THESE!)
const char* PHONE_1 = "+250785133511";
const char* PHONE_2 = "+250725283858";

// ====================== POWER MONITORING ======================
Adafruit_INA219 ina219;
float solarVoltage = 0;
float solarCurrent_mA = 0;
float solarPower_W = 0;
float loadCurrent_A = 0;
float loadPower_W = 0;
bool ina219Found = false;
bool solarRelayActive = false;
// Active-low relay modules:
// RELAY_OFF keeps the relay in NC (no input signal received).
// RELAY_ON energizes the coil and switches the load from NC to NO.
const uint8_t RELAY_ON = LOW;
const uint8_t RELAY_OFF = HIGH;

// Forward declarations for functions used before their definitions
void notifyBeforeLocking(const String& reason);

// ====================== DS18B20 SETUP ======================
OneWire oneWire(PIN_DS18B20);
DallasTemperature ds18b20(&oneWire);
DeviceAddress ds18b20Address;
bool ds18b20Found = false;
float temperatureDS18B20 = 0;
unsigned long lastDS18B20Read = 0;
const unsigned long DS18B20_INTERVAL = 2000;
int ds18b20ErrorCount = 0;

// ====================== THRESHOLDS ======================
const float SOLAR_SWITCH_ON_VOLTAGE = 12.0;
const float SOLAR_SWITCH_OFF_VOLTAGE = 11.0;
#define TEMP_GOOD_MIN      21.0
#define TEMP_GOOD_MAX      27.0
#define TEMP_DANGER_MIN    18.0
#define TEMP_DANGER_MAX    35.0
#define CO2_GOOD_MAX       1500
#define CO2_DANGER         2500
#define NH3_GOOD_MAX       10
#define NH3_DANGER         25
#define LPG_GOOD_MAX       100
#define LPG_DANGER         300
// Light thresholds (percentage)
const int LUX_GOOD_MIN = 20; // percent
const int LUX_GOOD_MAX = 40; // percent
// Day/night detection from LDR2 on pin 12 (digital module output)
const int DAY_NIGHT_DAY_THRESHOLD = 55;   // switch to DAY above this
const int DAY_NIGHT_NIGHT_THRESHOLD = 45; // switch to NIGHT below this

// ====================== ALERT TIMING VARIABLES ======================
int alertStage = 0;
unsigned long alertStartTime = 0;
unsigned long lastAlertActionTime = 0;
String currentIssueType = "";
bool userNotified = false;
unsigned long userNotifiedTime = 0;

// One-shot SMS flags for warning-level sensor issues.
bool warningHighTempSent = false;
bool warningLowTempSent = false;
bool warningHighCO2Sent = false;
bool warningHighNH3Sent = false;
bool warningHighLPGSent = false;

const unsigned long USER_NOTIFIED_COOLDOWN = 300000;
const unsigned long CALL_DURATION = 5000; // default outgoing call length (ms)
const unsigned long SMS_WAIT = 60000;
const unsigned long SWITCH_NUMBER_WAIT = 60000;

const unsigned long ALERT_CALL_DURATION = 60000;
const unsigned long ALERT_STAGE_GAP = 180000;
 
// Wait this long while monitoring sensors before promoting a detected issue
// to an active alert that triggers GSM calls. This allows temporary spikes
// to settle (e.g., cooling) and avoids immediate calls for transient warnings.
const unsigned long ALERT_CONFIRMATION_MS = 60000; // 60s confirmation

// Candidate issue tracking while waiting for confirmation
String candidateIssueType = "";
unsigned long candidateStartTime = 0;
// ====================== PERSISTENT INDICATION VARIABLES ======================
bool hasActiveIssue = false;
String activeIssueMessage = "";
unsigned long issueStartTime = 0;
unsigned long lastPersistentBeepTime = 0;
const unsigned long PERSISTENT_BEEP_INTERVAL = 2000;

// ====================== CALL STATE VARIABLES ======================
bool isCallActive = false;
bool isOutgoingCall = false;
unsigned long callStartTime = 0;
String activeCallNumber = "";
unsigned long lastCallBeepTime = 0;
const unsigned long CALL_BEEP_INTERVAL = 2000;

// ====================== INCOMING CALL VARIABLES ======================
bool incomingCallDetected = false;
String incomingCallerNumber = "";

// ====================== INDICATOR LED PIN 13 VARIABLES ======================
bool sensorErrorIndicatorActive = false;
bool indicatorLedState = false;
unsigned long indicatorNextToggleTime = 0;
const unsigned long SENSOR_ERROR_FLASH_INTERVAL = 2000; // 2 seconds

bool supplyChangeIndicatorActive = false;
unsigned long supplyChangeNextToggleTime = 0;
bool supplyChangeLedOn = false;
int supplyChangeFlashCount = 0;
const unsigned long SUPPLY_CHANGE_FLASH_INTERVAL = 1000; // 1 second between toggles
const int SUPPLY_CHANGE_FLASH_COUNT = 2; // Flash twice
bool indicatorMonitoringEnabled = false;
bool controllerOutputsArmed = false;
// Fallback: arm outputs after this timeout even if provisioning hasn't completed
const unsigned long STARTUP_ARM_TIMEOUT_MS = 120000; // 2 minutes
unsigned long startupBootMillis = 0;
bool startupArmByTimeout = false;
bool startupSensorPhaseComplete = false;

// ====================== DHT SETUP ======================
#define DHTTYPE DHT22
DHT dht(PIN_DHT, DHTTYPE);
float temperatureDHT = 0;
float humidity = 0;
bool dhtFound = true;

// ====================== LCD SETUP ======================
LiquidCrystal_I2C lcd(0x27, 20, 4);

// ====================== MQ SENSORS SETUP ======================
#define Board "ESP-32"
#define Voltage_Resolution 3.3
#define ADC_Bit_Resolution 12
#define RatioMQ6CleanAir 10.0
#define RatioMQ137CleanAir 3.6

MQUnifiedsensor MQ6(Board, Voltage_Resolution, ADC_Bit_Resolution, PIN_MQ6, "MQ-6");
MQUnifiedsensor MQ137(Board, Voltage_Resolution, ADC_Bit_Resolution, PIN_MQ137, "MQ-137");
CO2Sensor co2Sensor(PIN_MG811, 0.70, 30);

bool mq6Found = true, mq137Found = true, co2Found = true;
bool ldrFound = true;
bool lightRelayActive = false;
bool dayNightFound = true;
bool isDaytime = true;

int ldrValue = 0;
int dayNightLdrValue = 0;
float lightPercent = 0;
float dayNightPercent = 0;
float ppmLPG = 0, ppmNH3 = 0;
int ppmCO2 = 0;
float oxygenPercent = 20.95;

unsigned long lastMQRead = 0, lastDHTRead = 0, lastPowerRead = 0;
unsigned long lastSerialPrint = 0, lastDangerCheck = 0;
unsigned long lastWiFiRetry = 0;

const unsigned long MQ_INTERVAL = 2000;
const unsigned long DHT_INTERVAL = 3000;
const unsigned long POWER_INTERVAL = 1500;
const unsigned long SERIAL_INTERVAL = 5000;
const unsigned long DANGER_INTERVAL = 1000;
const unsigned long WIFI_RETRY_INTERVAL = 30000;
const unsigned long LCD_DISPLAY_HOLD_MS = 5000;

int displayState = 0;
bool dangerActive = false;
unsigned long dangerBeepTime = 0;
String currentDangerMessage = "";

// WiFi
struct WiFiNetwork {
  const char* ssid;
  const char* password;
};

WiFiNetwork networks[3] = {
  {"Theo-pc", "12345678910"},
  {"Theo2", "12345678Q"},
  {"WiFi_3", "password3"}
};

bool wifiConnected = false;
bool gsmInitialized = false;
bool gsmInitAttempted = false;
bool serverCheckDoneAfterGsm = false;
bool lastDatabaseSendSuccess = false;
bool databaseConnectionAlertSent = false;
bool wifiConnectionAlertSent = false;
bool wifiReconnectLocked = false;
bool serverConnectionAlertSent = false;
String lastDatabaseSendMessage = "";
unsigned long lastDatabaseSendTimestamp = 0;
bool wifiWaitAlertActive = false;
unsigned long lastWifiWaitAlertTime = 0;
const unsigned long WIFI_WAIT_ALERT_INTERVAL = 900;
const unsigned long WIFI_WAIT_BEEP_MS = 120;

// ====================== DATABASE & API CONFIG ======================
const char* BACKEND_URL_TUNNEL = "https://tunga-chickens-ltd-farming.onrender.com";
// LAN fallback is disabled for the hosted deployment.
const IPAddress BACKEND_LAN_TARGET(192, 168, 120, 199);
const uint16_t BACKEND_LAN_PORT = 5000;
const bool ENABLE_LAN_FALLBACK = true;
const char* BACKEND_TUNNEL_HOST = "tunga-chickens-ltd-farming.onrender.com";
String DEVICE_SERIAL = "";
String DEVICE_USER_ID = "";
const char* API_ENDPOINT = "/api/sensors/update-by-serial";
const char* SERIAL_REQUEST_ENDPOINT = "/api/devices/request-serial";
const char* DEVICE_STATUS_ENDPOINT = "/api/devices/status";

unsigned long lastDatabaseSend = 0;
const unsigned long DATABASE_SEND_INTERVAL = 60000;
int databaseSendFailCount = 0;
const int MAX_SEND_FAILURES = 3;
bool hasRequestedSerialFromBackend = false;
unsigned long lastSerialRequestTime = 0;
const unsigned long SERIAL_REQUEST_RETRY_INTERVAL = 30000;
bool deviceAssigned = false;
bool deviceSerialPersisted = false;
bool deviceApiKeyPersisted = false;
bool deviceUserIdPersisted = false;
String API_KEY = "";
unsigned long lastAssignmentStatusPrint = 0;
bool provisioningComplete = false;
bool debugMode = false;
unsigned long tunnelUnavailableUntil = 0;
const unsigned long TUNNEL_DOWN_COOLDOWN = 300000;
bool needsSerialVerification = false;
bool blockUntilDbConnected = false;
bool requireReProvision = false;
unsigned long lastDbReconnectAttempt = 0;
unsigned long dbReconnectBackoffMs = 5000;
bool deviceLocked = false;
unsigned long lastDeviceStatusCheck = 0;
const unsigned long DEVICE_STATUS_RETRY_INTERVAL = 30000;
bool lockWarningSent = false;

struct BackendTarget {
  IPAddress host;
  uint16_t port;
};

size_t buildBackendTargets(BackendTarget* targets, size_t maxTargets) {
  size_t count = 0;

  if (count < maxTargets) {
    IPAddress gateway = WiFi.gatewayIP();
    if (gateway != IPAddress(0, 0, 0, 0)) {
      targets[count++] = { gateway, BACKEND_LAN_PORT };
    }
  }

  if (count < maxTargets) {
    targets[count++] = { BACKEND_LAN_TARGET, BACKEND_LAN_PORT };
  }

  return count;
}

void setDeviceOperationalState(bool active) {
  if (active) {
    deviceLocked = false;
    lockWarningSent = false;
    blockUntilDbConnected = false;
    requireReProvision = false;
    provisioningComplete = true;
    if (DEVICE_SERIAL != "" && DEVICE_SERIAL != "UNREGISTERED") {
      deviceAssigned = true;
    }
    Serial.println("[ACTIVE] Backend reports active account - enabling normal device activity");
  } else {
    deviceLocked = true;
    provisioningComplete = false;
    Serial.println("[LOCKED] Backend reports inactive account - disabling normal device activity");
  }
}

// Forward declarations
void sendSensorDataToDatabase();
void shortBeep(int frequency, int duration);

// ====================== EEPROM CONFIG ======================
#define EEPROM_SIZE 512
#define EEPROM_SERIAL_ADDR 0
#define SERIAL_MAX_LENGTH 20
#define EEPROM_DEBUG_FLAG_ADDR (EEPROM_SERIAL_ADDR + SERIAL_MAX_LENGTH + 1)
#define EEPROM_API_KEY_ADDR (EEPROM_DEBUG_FLAG_ADDR + 1)
#define API_KEY_MAX_LENGTH 128
#define EEPROM_USER_ID_ADDR (EEPROM_API_KEY_ADDR + API_KEY_MAX_LENGTH + 1)
#define USER_ID_MAX_LENGTH 48
#define EEPROM_FIRMWARE_SIG_ADDR (EEPROM_USER_ID_ADDR + USER_ID_MAX_LENGTH + 1)
#define FIRMWARE_SIG_MAX_LENGTH 64

const String FIRMWARE_EEPROM_SIGNATURE = String(__DATE__) + " " + String(__TIME__);

// -------------------- Logging helpers --------------------
void logInfo(const String& m) {
  Serial.print("[INFO] "); Serial.println(m);
}
void logWarn(const String& m) {
  Serial.print("[WARN] "); Serial.println(m);
}
void logError(const String& m) {
  Serial.print("[ERROR] "); Serial.println(m);
}
void logDebug(const String& m) {
  if (debugMode) { Serial.print("[DEBUG] "); Serial.println(m); }
}

void setStartupAlertOutputs(bool active) {
  // Buzzer disabled — no-op
  (void)active;
}

void setIndicatorLed(bool active) {
  indicatorLedState = active;
  // Drive the indicator pin using relay polarity so the pin stays in NC by default
  digitalWrite(INDICATOR_PIN, active ? RELAY_ON : RELAY_OFF);
}

void setStartupPinDefaults() {
  // Start pins HIGH at boot per user preference (relays off if active-low)
  // Ensure INDICATOR_PIN is driven to the relay-safe level (RELAY_OFF = NC)
  digitalWrite(INDICATOR_PIN, RELAY_OFF);
  // Buzzer removed: do not touch buzzer pin
  digitalWrite(SOLAR_RELAY, RELAY_OFF);
  digitalWrite(GRID_RELAY, RELAY_OFF);
  digitalWrite(LIGHT_RELAY, RELAY_OFF);
  digitalWrite(HEATER_RELAY, RELAY_OFF);
  digitalWrite(EXHAUST_RELAY, RELAY_OFF);
}

void setInactivePinState() {
  // When the system is locked/inactive, drive the indicator ON (RELAY_ON -> NO)
  // per user's request, but keep the buzzer silent (no continuous beeps)
  digitalWrite(INDICATOR_PIN, RELAY_ON);
  // Buzzer removed: no-op
  // Ensure relays are in their NC (safe) position -> RELAY_OFF
  digitalWrite(SOLAR_RELAY, RELAY_OFF);
  digitalWrite(GRID_RELAY, RELAY_OFF);
  digitalWrite(LIGHT_RELAY, RELAY_OFF);
  digitalWrite(HEATER_RELAY, RELAY_OFF);
  digitalWrite(EXHAUST_RELAY, RELAY_OFF);
}

void flashWiFiConnectedIndicator() {
  bool previousMonitoring = indicatorMonitoringEnabled;
  indicatorMonitoringEnabled = true;
  sensorErrorIndicatorActive = false;
  supplyChangeIndicatorActive = false;
  // 3 short confirmation flashes — 1 second on, 1 second off
  for (int i = 0; i < 3; i++) {
    setIndicatorLed(true);
    delay(1000);
    setIndicatorLed(false);
    delay(1000);
  }
  indicatorMonitoringEnabled = previousMonitoring;
}

String buildBackendUrl(const IPAddress& host, uint16_t port, const char* endpoint) {
  return String("http://") + host.toString() + ":" + String(port) + String(endpoint);
}

bool isSameSubnet(const IPAddress& left, const IPAddress& right, const IPAddress& mask) {
  for (int i = 0; i < 4; i++) {
    if ((left[i] & mask[i]) != (right[i] & mask[i])) {
      return false;
    }
  }
  return true;
}

bool testTcpConnectToHost(const char* host, uint16_t port, unsigned long timeoutMs = 5000) {
  IPAddress resolved;
  logInfo(String("Resolving host: ") + host);
  if (!WiFi.hostByName(host, resolved)) {
    logWarn("hostByName failed");
    return false;
  }

  logDebug(String(host) + " -> " + resolved.toString());

  WiFiClient client;
  client.setTimeout(timeoutMs / 1000);
  logInfo(String("Trying TCP connect to ") + resolved.toString() + ":" + String(port));
  bool ok = client.connect(resolved, port);
  logInfo(String("TCP connect result: ") + String(ok ? "OK" : "FAILED"));
  client.stop();
  return ok;
}

void configureWiFiClient() {
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(false);
}

bool canConnectToBackend(const IPAddress& host, uint16_t port) {
  WiFiClient client;
  client.setTimeout(15000);

  logInfo(String("Connecting to ") + host.toString() + ":" + String(port));

  bool connected = client.connect(host, port);
  logInfo(String("Connect result: ") + String(connected ? "OK" : "FAILED"));
  client.stop();
  return connected;
}

bool checkServerConnectivityAfterGsm() {
  if (!wifiConnected) return false;

  // Try tunnel first (HTTPS endpoint)
  if (testTcpConnectToHost(BACKEND_TUNNEL_HOST, 443, 3000)) {
    return true;
  }

  if (!ENABLE_LAN_FALLBACK) {
    return false;
  }

  // Then try local backend targets
  if (canConnectToBackend(BACKEND_LAN_TARGET, BACKEND_LAN_PORT)) {
    return true;
  }

  if (canConnectToBackend(WiFi.gatewayIP(), BACKEND_LAN_PORT)) {
    return true;
  }

  return false;
}

void displayServerConnectionStatusAfterGsm() {
  bool serverConnected = checkServerConnectivityAfterGsm();
  String deviceSerialText = (DEVICE_SERIAL.length() > 0) ? DEVICE_SERIAL : "UNREGISTERED";

  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Connecting to server !!!!!");
  if (serverConnected) {
    lcd.setCursor(0,1); lcd.print("Server: CONNECTED");
    lcd.setCursor(0,2); lcd.print("Provisioning: READY");
    lcd.setCursor(0,3); lcd.print(deviceSerialText.substring(0, 20));
    Serial.println("[SERVER] Connected after GSM ready");
    serverConnectionAlertSent = false;
    delay(900);
  } else {
    lcd.setCursor(0,1); lcd.print("Server: FAILED");
    lcd.setCursor(0,2); lcd.print("Device Serial:");
    lcd.setCursor(0,3); lcd.print(deviceSerialText.substring(0, 20));
    Serial.println("[SERVER] Failed after GSM ready - send support alert once");
    notifyServerConnectionIssueOnce();
    delay(1400);
  }
}

int postJsonRequest(const String& url, const String& payload, String& response) {
  HTTPClient http;

  Serial.print("Trying URL: ");
  Serial.println(url);

  bool beginOk = false;
  if (url.startsWith("https://")) {
    WiFiClientSecure secureClient;
    secureClient.setInsecure();
    beginOk = http.begin(secureClient, url);
  } else {
    WiFiClient client;
    beginOk = http.begin(client, url);
  }

  if (!beginOk) {
    Serial.println("[WARN] HTTP begin failed");
    return -1;
  }

  http.setReuse(false);
  http.setTimeout(15000);
  http.setConnectTimeout(15000);
  http.addHeader("Content-Type", "application/json");
  if (DEVICE_SERIAL != "" && DEVICE_SERIAL != "UNREGISTERED") {
    http.addHeader("x-device-serial", DEVICE_SERIAL);
  }
  if (API_KEY.length() > 0) {
    http.addHeader("x-api-key", API_KEY);
  }

  int httpCode = http.POST(payload);
  Serial.print("HTTP Response: ");
  Serial.println(httpCode);

  if (httpCode <= 0) {
    String err = "[HTTP ERROR] ";
    switch (httpCode) {
      case -1: err += "HTTPC_ERROR_CONNECTION_FAILED"; break;
      case -2: err += "HTTPC_ERROR_SEND_HEADER_FAILED"; break;
      case -3: err += "HTTPC_ERROR_SEND_PAYLOAD_FAILED"; break;
      case -4: err += "HTTPC_ERROR_NOT_CONNECTED"; break;
      case -5: err += "HTTPC_ERROR_CONNECTION_LOST"; break;
      case -6: err += "HTTPC_ERROR_NO_STREAM"; break;
      case -7: err += "HTTPC_ERROR_NO_HTTP_SERVER"; break;
      case -8: err += "HTTPC_ERROR_TOO_LESS_RAM"; break;
      case -9: err += "HTTPC_ERROR_ENCODING"; break;
      case -10: err += "HTTPC_ERROR_STREAM_WRITE"; break;
      case -11: err += "HTTPC_ERROR_SSL_CONNECT_OR_TLS_HANDSHAKE_FAILED"; break;
      default: err += "UNKNOWN_ERROR"; break;
    }
    Serial.println(err);
  }

  if (httpCode > 0) {
    response = http.getString();
    Serial.print("Response: ");
    Serial.println(response);
  }

  http.end();
  return httpCode;
}

// ====================== EEPROM FUNCTIONS ======================
void storeDeviceSerialToEEPROM(String serial) {
  Serial.println("\n=== STORING DEVICE SERIAL TO EEPROM ===");
  
  if (serial.length() == 0 || serial.length() > SERIAL_MAX_LENGTH) {
    Serial.println("ERROR: Invalid serial length!");
    return;
  }
  
  for (int i = 0; i < SERIAL_MAX_LENGTH; i++) {
    EEPROM.write(EEPROM_SERIAL_ADDR + i, 0);
  }
  
  for (int i = 0; i < serial.length(); i++) {
    EEPROM.write(EEPROM_SERIAL_ADDR + i, serial[i]);
  }
  EEPROM.write(EEPROM_SERIAL_ADDR + serial.length(), '\0');
  EEPROM.commit();
  
  Serial.print("✓ Serial stored: ");
  Serial.println(serial);
  Serial.println("===================================");
}

void writeDebugFlagToEEPROM(bool enabled) {
  EEPROM.write(EEPROM_DEBUG_FLAG_ADDR, enabled ? 1 : 0);
  EEPROM.commit();
  debugMode = enabled;
  Serial.print("[DEBUG] Debug mode persisted: "); Serial.println(enabled ? "ON" : "OFF");
}

bool readDebugFlagFromEEPROM() {
  uint8_t v = EEPROM.read(EEPROM_DEBUG_FLAG_ADDR);
  debugMode = (v == 1);
  Serial.print("[DEBUG] Debug mode (boot read): "); Serial.println(debugMode ? "ON" : "OFF");
  return debugMode;
}

String readDeviceSerialFromEEPROM() {
  String serial = "";
  
  for (int i = 0; i < SERIAL_MAX_LENGTH; i++) {
    char c = EEPROM.read(EEPROM_SERIAL_ADDR + i);
    if (c == '\0' || c == 0xFF) break;
    if (c >= 32 && c <= 126) {
      serial += c;
    }
  }
  
  return serial;
}

void storeApiKeyToEEPROM(String apiKey) {
  Serial.println("\n=== STORING API KEY TO EEPROM ===");
  if (apiKey.length() == 0 || apiKey.length() > API_KEY_MAX_LENGTH) {
    Serial.println("ERROR: Invalid api_key length!");
    return;
  }

  for (int i = 0; i < API_KEY_MAX_LENGTH; i++) {
    EEPROM.write(EEPROM_API_KEY_ADDR + i, 0);
  }

  for (int i = 0; i < apiKey.length(); i++) {
    EEPROM.write(EEPROM_API_KEY_ADDR + i, apiKey[i]);
  }
  EEPROM.write(EEPROM_API_KEY_ADDR + apiKey.length(), '\0');
  EEPROM.commit();

  Serial.print("✓ API key stored: ");
  Serial.println(apiKey.substring(0, min((int)apiKey.length(), 8)) + "...");
  Serial.println("===================================");
}

String readFirmwareSignatureFromEEPROM() {
  String signature = "";
  for (int i = 0; i < FIRMWARE_SIG_MAX_LENGTH; i++) {
    char c = EEPROM.read(EEPROM_FIRMWARE_SIG_ADDR + i);
    if (c == '\0' || c == (char)0xFF) break;
    if (c >= 32 && c <= 126) signature += c;
  }
  return signature;
}

void storeFirmwareSignatureToEEPROM(const String& signature) {
  for (int i = 0; i < FIRMWARE_SIG_MAX_LENGTH; i++) {
    EEPROM.write(EEPROM_FIRMWARE_SIG_ADDR + i, 0);
  }

  for (int i = 0; i < signature.length() && i < FIRMWARE_SIG_MAX_LENGTH - 1; i++) {
    EEPROM.write(EEPROM_FIRMWARE_SIG_ADDR + i, signature[i]);
  }
  EEPROM.write(EEPROM_FIRMWARE_SIG_ADDR + min((int)signature.length(), FIRMWARE_SIG_MAX_LENGTH - 1), '\0');
  EEPROM.commit();
}

void clearProvisioningEEPROM() {
  Serial.println("[EEPROM] Clearing stored device credentials for new firmware");

  for (int i = 0; i < EEPROM_SIZE; i++) {
    EEPROM.write(i, 0);
  }
  EEPROM.commit();

  DEVICE_SERIAL = "UNREGISTERED";
  API_KEY = "";
  DEVICE_USER_ID = "";
  deviceAssigned = false;
  deviceSerialPersisted = false;
  deviceApiKeyPersisted = false;
  deviceUserIdPersisted = false;
  provisioningComplete = false;
  hasRequestedSerialFromBackend = false;
  lastSerialRequestTime = 0;
  needsSerialVerification = false;
  deviceLocked = false;
  lastDeviceStatusCheck = 0;
}

void ensureFirmwareEEPROMSignature() {
  String storedSignature = readFirmwareSignatureFromEEPROM();
  if (storedSignature != FIRMWARE_EEPROM_SIGNATURE) {
    Serial.println("[EEPROM] Firmware signature mismatch or empty - wiping provisioning data");
    clearProvisioningEEPROM();
    storeFirmwareSignatureToEEPROM(FIRMWARE_EEPROM_SIGNATURE);
  }
}

String readApiKeyFromEEPROM() {
  String key = "";
  for (int i = 0; i < API_KEY_MAX_LENGTH; i++) {
    char c = EEPROM.read(EEPROM_API_KEY_ADDR + i);
    if (c == '\0' || c == (char)0xFF) break;
    if (c >= 32 && c <= 126) key += c;
  }
  return key;
}

String readUserIdFromEEPROM() {
  String id = "";
  for (int i = 0; i < USER_ID_MAX_LENGTH; i++) {
    char c = EEPROM.read(EEPROM_USER_ID_ADDR + i);
    if (c == '\0' || c == (char)0xFF) break;
    if (c >= 32 && c <= 126) id += c;
  }
  return id;
}

bool isValidAssignedUserId(const String& userId) {
  String normalized = userId;
  normalized.trim();
  normalized.toLowerCase();
  return normalized.length() > 0 && normalized != "null" && normalized != "undefined" && normalized != "none";
}

void storeUserIdToEEPROM(String userId) {
  Serial.println("\n=== STORING USER ID TO EEPROM ===");
  if (userId.length() == 0 || userId.length() > USER_ID_MAX_LENGTH) {
    Serial.println("ERROR: Invalid user id length!");
    return;
  }

  for (int i = 0; i < USER_ID_MAX_LENGTH; i++) {
    EEPROM.write(EEPROM_USER_ID_ADDR + i, 0);
  }

  for (int i = 0; i < userId.length(); i++) {
    EEPROM.write(EEPROM_USER_ID_ADDR + i, userId[i]);
  }
  EEPROM.write(EEPROM_USER_ID_ADDR + userId.length(), '\0');
  EEPROM.commit();

  Serial.print("✓ User ID stored: ");
  Serial.println(userId);
  Serial.println("===================================");
}

void persistDeviceSerialIfChanged(const String& receivedSerial) {
  String currentSerial = DEVICE_SERIAL;
  currentSerial.trim();

  if (!deviceSerialPersisted || currentSerial != receivedSerial) {
    DEVICE_SERIAL = receivedSerial;
    storeDeviceSerialToEEPROM(DEVICE_SERIAL);
    deviceSerialPersisted = true;
    logInfo(String("Serial synced to backend value: ") + DEVICE_SERIAL);
  } else {
    DEVICE_SERIAL = receivedSerial;
  }
}

void clearAndPrepareForNewAssignment(const String& receivedSerial, const String& receivedUserId, const String& receivedApiKey) {
  bool serialChanged = DEVICE_SERIAL != receivedSerial;
  bool userChanged = isValidAssignedUserId(DEVICE_USER_ID) && DEVICE_USER_ID != receivedUserId;

  if (serialChanged || userChanged) {
    Serial.println("[EEPROM] Assignment changed - clearing old provisioning data before saving new values");
    clearProvisioningEEPROM();
    storeFirmwareSignatureToEEPROM(FIRMWARE_EEPROM_SIGNATURE);
  }

  persistDeviceSerialIfChanged(receivedSerial);

  if (receivedApiKey.length() > 0) {
    API_KEY = receivedApiKey;
  }

  if (isValidAssignedUserId(receivedUserId)) {
    DEVICE_USER_ID = receivedUserId;
    deviceAssigned = true;
    provisioningComplete = true;
    needsSerialVerification = false;

    if (!deviceSerialPersisted) {
      storeDeviceSerialToEEPROM(DEVICE_SERIAL);
      deviceSerialPersisted = true;
      logInfo("Serial obtained, assigned and persisted");
      shortBeep(1000, 200);
    }

    if (API_KEY.length() > 0 && !deviceApiKeyPersisted) {
      storeApiKeyToEEPROM(API_KEY);
      deviceApiKeyPersisted = true;
    }

    if (!deviceUserIdPersisted) {
      storeUserIdToEEPROM(DEVICE_USER_ID);
      deviceUserIdPersisted = true;
    }
  }
}

void requestDeviceSerialFromBackend() {
  if (!wifiConnected) {
    Serial.println("[WARN] WiFi not connected - cannot request serial");
    return;
  }
  
  if (hasRequestedSerialFromBackend && (millis() - lastSerialRequestTime < SERIAL_REQUEST_RETRY_INTERVAL)) {
    return;
  }
  
  Serial.println("\n=== REQUESTING DEVICE SERIAL FROM BACKEND ===");
  Serial.print("ESP32 IP: ");
  Serial.println(WiFi.localIP());
  Serial.print("Gateway: ");
  Serial.println(WiFi.gatewayIP());
  Serial.print("Subnet: ");
  Serial.println(WiFi.subnetMask());
  String chipId = String((uint32_t)ESP.getEfuseMac(), HEX);
  Serial.print("Chip ID: ");
  Serial.println(chipId);

  StaticJsonDocument<256> doc;
  doc["esp32_chip_id"] = chipId;
  String payload;
  serializeJson(doc, payload);

  Serial.print("Payload: ");
  Serial.println(payload);

  IPAddress localIp = WiFi.localIP();
  IPAddress subnetMask = WiFi.subnetMask();

  String response;
  String tunnelUrl = String(BACKEND_URL_TUNNEL) + String(SERIAL_REQUEST_ENDPOINT);
  
  if (!(millis() < tunnelUnavailableUntil)) {
    String response_tunnel;
    int tunnelCode = postJsonRequest(tunnelUrl, payload, response_tunnel);
    if (tunnelCode == 200) {
      DynamicJsonDocument tunnelDoc(512);
      DeserializationError tunnelError = deserializeJson(tunnelDoc, response_tunnel);
      if (!tunnelError && tunnelDoc["success"].as<bool>()) {
        String receivedSerial = tunnelDoc["device_serial"].as<String>();
        String receivedUserId = tunnelDoc["user_id"].as<String>();
        String receivedApiKey = tunnelDoc["api_key"].as<String>();
        bool hasValidUserId = isValidAssignedUserId(receivedUserId);
        if (receivedSerial.length() > 0) {
          if (hasValidUserId) {
            clearAndPrepareForNewAssignment(receivedSerial, receivedUserId, receivedApiKey);
          } else {
            persistDeviceSerialIfChanged(receivedSerial);
            if (receivedApiKey.length() > 0) {
              API_KEY = receivedApiKey;
            }
          }
          hasRequestedSerialFromBackend = true;
          
          if (hasValidUserId) {
            if (wifiConnected) {
              logInfo("Attempting immediate data send after assignment...");
              sendSensorDataToDatabase();
            }
            logInfo("Provisioning complete: assignment confirmed and EEPROM saved");
            lastSerialRequestTime = millis();
            return;
          } else {
            deviceAssigned = false;
            provisioningComplete = false;
            logWarn("Device serial obtained but NOT assigned to a user yet.");
            logInfo("Waiting for admin to assign...");
          }
          lastSerialRequestTime = millis();
          return;
        }
      }
    } else {
      logWarn(String("Tunnel HTTP error: ") + String(tunnelCode));
      tunnelUnavailableUntil = millis() + TUNNEL_DOWN_COOLDOWN;
    }
  }

  BackendTarget targets[2];
  const size_t targetCount = buildBackendTargets(targets, 2);
  bool success = false;

  if (!ENABLE_LAN_FALLBACK) {
    logInfo("LAN fallback disabled. Using tunnel only.");
  }

  for (size_t i = 0; i < targetCount; i++) {
    if (!ENABLE_LAN_FALLBACK) {
      break;
    }
    logInfo(String("Local subnet: ") + localIp.toString());
    logInfo(String("Target subnet: ") + targets[i].host.toString());

    if (!isSameSubnet(localIp, targets[i].host, subnetMask)) {
      logWarn("Subnet mismatch detected; trying route anyway");
    }

    if (!canConnectToBackend(targets[i].host, targets[i].port)) {
      Serial.println("[WARN] Raw TCP connection failed before HTTP request");
      continue;
    }

    String url = buildBackendUrl(targets[i].host, targets[i].port, SERIAL_REQUEST_ENDPOINT);
    int httpCode = postJsonRequest(url, payload, response);

    if (httpCode == 200) {
      DynamicJsonDocument responseDoc(512);
      DeserializationError jsonError = deserializeJson(responseDoc, response);
      if (jsonError) {
        Serial.print("[ERROR] JSON parse failed: ");
        Serial.println(jsonError.c_str());
        continue;
      }

      if (responseDoc["success"].as<bool>()) {
        String receivedSerial = responseDoc["device_serial"].as<String>();
        String receivedUserId = responseDoc["user_id"].as<String>();
        String receivedApiKey = responseDoc["api_key"].as<String>();
        bool hasValidUserId = isValidAssignedUserId(receivedUserId);
        if (receivedSerial.length() > 0) {
          if (hasValidUserId) {
            clearAndPrepareForNewAssignment(receivedSerial, receivedUserId, receivedApiKey);
          } else {
            persistDeviceSerialIfChanged(receivedSerial);
            if (receivedApiKey.length() > 0) {
              API_KEY = receivedApiKey;
            }
          }
          hasRequestedSerialFromBackend = true;
          if (hasValidUserId) {
            if (wifiConnected) {
              Serial.println("[INFO] Attempting immediate data send after assignment...");
              sendSensorDataToDatabase();
            }
            logInfo("Provisioning complete: assignment confirmed and EEPROM saved");
            Serial.println("✓ Serial obtained and assigned by backend!");
            shortBeep(1000, 200);
            success = true;
            break;
          } else {
            deviceAssigned = false;
            provisioningComplete = false;
            Serial.println("⚠ Serial obtained but not yet assigned to a user.");
            Serial.println("Admin must assign this serial via Device Manager.");
            success = true;
            break;
          }
        }
      } else {
        String error = responseDoc["message"].as<String>();
        Serial.print("Backend error: ");
        Serial.println(error);
      }
    } else if (httpCode == -1) {
      Serial.println("[WARN] Connection failed on this target");
    } else {
      String errorResponse = response;
      Serial.print("[ERROR] HTTP ");
      Serial.print(httpCode);
      Serial.print(": ");
      Serial.println(errorResponse);
    }
  }

  if (!success) {
    provisioningComplete = false;
    Serial.println("[ERROR] Connection failed (hosted backend and LAN fallback both unreachable)");
    hasRequestedSerialFromBackend = false;
  }

  lastSerialRequestTime = millis();
  Serial.println("===================================\n");
}

bool refreshDeviceLockState() {
  if (!wifiConnected) {
    return deviceLocked;
  }

  if (DEVICE_SERIAL == "" || DEVICE_SERIAL == "UNREGISTERED" || API_KEY.length() == 0) {
    return deviceLocked;
  }

  if (millis() - lastDeviceStatusCheck < DEVICE_STATUS_RETRY_INTERVAL) {
    return deviceLocked;
  }

  lastDeviceStatusCheck = millis();

  StaticJsonDocument<128> doc;
  doc["device_serial"] = DEVICE_SERIAL;
  String payload;
  serializeJson(doc, payload);

  String response;
  String tunnelUrl = String(BACKEND_URL_TUNNEL) + String(DEVICE_STATUS_ENDPOINT);
  int tunnelCode = postJsonRequest(tunnelUrl, payload, response);
  if (tunnelCode == 200) {
    setDeviceOperationalState(true);
    return false;
  }

  if (tunnelCode == 403) {
    notifyBeforeLocking("Account inactive - device locked");
    setDeviceOperationalState(false);
    blockUntilDbConnected = true;
    return true;
  }

  BackendTarget targets[2];
  const size_t targetCount = buildBackendTargets(targets, 2);

  for (size_t i = 0; i < targetCount; i++) {
    if (!ENABLE_LAN_FALLBACK) break;

    if (!canConnectToBackend(targets[i].host, targets[i].port)) {
      continue;
    }

    String fullUrl = buildBackendUrl(targets[i].host, targets[i].port, DEVICE_STATUS_ENDPOINT);
    int httpCode = postJsonRequest(fullUrl, payload, response);
    if (httpCode == 200) {
      setDeviceOperationalState(true);
      return false;
    }

    if (httpCode == 403) {
      notifyBeforeLocking("Account inactive - device locked");
      setDeviceOperationalState(false);
      blockUntilDbConnected = true;
      return true;
    }
  }

  return deviceLocked;
}

void pollForAssignment() {
  if (!wifiConnected) return;
  if (!hasRequestedSerialFromBackend) return;
  if (deviceAssigned) return;
  if (millis() - lastSerialRequestTime < SERIAL_REQUEST_RETRY_INTERVAL) return;

  Serial.println("[POLL] Checking assignment status for serial: " + DEVICE_SERIAL);

  requestDeviceSerialFromBackend();

  if (!deviceAssigned) {
    Serial.println("[POLL] Still unassigned (or backend unreachable). Waiting...");
  }
}

// ====================== DS18B20 FUNCTIONS ======================
void initDS18B20() {
  Serial.println("\n==========================================");
  Serial.println("Initializing DS18B20 on pin 27...");
  
  pinMode(PIN_DS18B20, INPUT_PULLUP);
  delay(100);
  
  ds18b20.begin();
  delay(100);
  
  int deviceCount = ds18b20.getDeviceCount();
  Serial.printf("DS18B20 devices found: %d\n", deviceCount);
  
  if (deviceCount == 0) {
    Serial.println("ERROR: No DS18B20 sensor detected on pin 27!");
    ds18b20Found = false;
    temperatureDS18B20 = 0;
    return;
  }
  
  if (ds18b20.getAddress(ds18b20Address, 0)) {
    Serial.print("Device address: ");
    for (uint8_t i = 0; i < 8; i++) {
      Serial.printf("%02X", ds18b20Address[i]);
    }
    Serial.println();
    ds18b20Found = true;
  } else {
    Serial.println("ERROR: Failed to get DS18B20 address!");
    ds18b20Found = false;
    temperatureDS18B20 = 0;
    return;
  }
  
  ds18b20.setResolution(ds18b20Address, 12);
  
  ds18b20.requestTemperatures();
  delay(750);
  float testTemp = ds18b20.getTempC(ds18b20Address);
  
  if (testTemp == DEVICE_DISCONNECTED_C || testTemp < -55 || testTemp > 125) {
    Serial.println("ERROR: DS18B20 read failed!");
    ds18b20Found = false;
    temperatureDS18B20 = 0;
  } else {
    temperatureDS18B20 = testTemp;
    Serial.printf("DS18B20 Temperature: %.2f C\n", temperatureDS18B20);
  }
  
  lastDS18B20Read = millis();
  Serial.println("==========================================\n");
}

void readDS18B20() {
  if (!ds18b20Found) {
    temperatureDS18B20 = 0;
    return;
  }
  
  unsigned long currentTime = millis();
  
  if (currentTime - lastDS18B20Read >= DS18B20_INTERVAL) {
    ds18b20.requestTemperatures();
    delay(100);
    
    float temp = ds18b20.getTempC(ds18b20Address);
    
    if (temp != DEVICE_DISCONNECTED_C && temp > -55 && temp < 125) {
      temperatureDS18B20 = temp;
      ds18b20ErrorCount = 0;
      Serial.printf("DS18B20 (TEMP2): %.2f C\n", temperatureDS18B20);
    } else {
      ds18b20ErrorCount++;
      Serial.printf("DS18B20 read error! Count: %d\n", ds18b20ErrorCount);
      
      if (ds18b20ErrorCount >= 5) {
        Serial.println("DS18B20 sensor appears to be disconnected!");
        ds18b20Found = false;
        temperatureDS18B20 = 0;
      }
    }
    
    lastDS18B20Read = currentTime;
  }
}

// ====================== ERROR DETECTION & INDICATION ======================
void checkAndUpdatePersistentIndication() {
  float currentTemp = (ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT;
  int errorCount = 0;
  
  if (!ds18b20Found) errorCount++;
  if (!dhtFound) errorCount++;
  
  if (ds18b20Found && currentTemp > 0) {
    if (currentTemp < TEMP_DANGER_MIN || currentTemp > TEMP_DANGER_MAX) errorCount++;
    else if (currentTemp < TEMP_GOOD_MIN || currentTemp > TEMP_GOOD_MAX) errorCount++;
  }
  
  if (ppmCO2 > CO2_DANGER) errorCount++;
  else if (ppmCO2 > CO2_GOOD_MAX) errorCount++;
  
  if (ppmNH3 > NH3_DANGER) errorCount++;
  else if (ppmNH3 > NH3_GOOD_MAX) errorCount++;
  
  if (ppmLPG > LPG_DANGER) errorCount++;
  else if (ppmLPG > LPG_GOOD_MAX) errorCount++;
  
  if (errorCount > 0) {
    if (!hasActiveIssue) {
      hasActiveIssue = true;
      activeIssueMessage = String(errorCount) + " error(s) detected";
      Serial.printf("\n!!! %d ERROR(S) DETECTED - LED ON, BUZZER ACTIVE !!!\n", errorCount);
    }
    // Emergency alert: drive indicator LED ON and produce high-frequency persistent beeps
    setIndicatorLed(true);
    unsigned long now = millis();
    if (now - lastPersistentBeepTime >= PERSISTENT_BEEP_INTERVAL) {
      // High-frequency emergency tone
      tone(BUZZER_PIN, 3000, 300);
      lastPersistentBeepTime = now;
    }
  } else {
    if (hasActiveIssue) {
      hasActiveIssue = false;
      activeIssueMessage = "";
      Serial.println("\n!!! ALL ERRORS RESOLVED - LED OFF, BUZZER OFF !!!\n");
    }
    noTone(BUZZER_PIN);
    setIndicatorLed(false);
  }
}

// ====================== BUZZER & LED FUNCTIONS ======================
void activateCallIndication() {
  unsigned long currentTime = millis();
  if (hasActiveIssue) return; // emergency alert takes precedence
  if (currentTime - lastCallBeepTime >= CALL_BEEP_INTERVAL) {
    if (isOutgoingCall) {
      tone(BUZZER_PIN, 1500, 200);
    } else {
      tone(BUZZER_PIN, 2000, 200);
    }
    lastCallBeepTime = currentTime;
  }
}

void deactivateCallIndication() {
  noTone(BUZZER_PIN);
}

void shortBeep(int frequency, int duration) {
  tone(BUZZER_PIN, frequency, duration);
  delay(duration);
  noTone(BUZZER_PIN);
}

void wifiWaitingAlertTick() {
  if (wifiConnected) {
    wifiWaitAlertActive = false;
    setStartupAlertOutputs(false);
    return;
  }

  unsigned long now = millis();
  if (now - lastWifiWaitAlertTime < WIFI_WAIT_ALERT_INTERVAL) {
    return;
  }

  lastWifiWaitAlertTime = now;
  wifiWaitAlertActive = true;

  // Keep the buzzer silent while waiting for WiFi; use LCD/LED status instead.
  setStartupAlertOutputs(false);
}

void powerChangeBeep() {
  for (int i = 0; i < 3; i++) {
    tone(BUZZER_PIN, 1500, 200);
    delay(250);
    delay(50);
  }
  noTone(BUZZER_PIN);
}

void systemReadyBeep() {
  shortBeep(1000, 150);
  delay(100);
  shortBeep(1200, 150);
  delay(100);
  shortBeep(1500, 250);
}

void wifiSuccessBeep() {
  shortBeep(1200, 120);
  delay(60);
  shortBeep(1700, 160);
}

// Single disconnect beep: 1 second tone
void wifiDisconnectBeep() {
  shortBeep(700, 140);
  delay(80);
  shortBeep(500, 220);
}

void gsmReadyBeep() {
  shortBeep(1100, 100);
  delay(50);
  shortBeep(1400, 100);
  delay(50);
  shortBeep(1800, 160);
}

void outgoingCallBeep() {
  shortBeep(1800, 180);
  delay(2000);
  shortBeep(1800, 180);
}

void incomingCallBeep() {
  shortBeep(2200, 220);
  delay(180);
  shortBeep(2200, 220);
  delay(180);
  shortBeep(2200, 320);
}

void dataSendSuccessBeep() {
  shortBeep(1800, 80);
  delay(40);
  shortBeep(2200, 80);
}

void notifyDatabaseConnectionIssueOnce() {
  if (databaseConnectionAlertSent) {
    return;
  }

  if (!gsmInitialized) {
    Serial.println("[DB ALERT] GSM not ready; cannot place one-time database-failure call/SMS");
    return;
  }

  databaseConnectionAlertSent = true;
  String alertMsg = "Dear farmer,\n";
  alertMsg += "The system cannot connect to the database.\n\n";
  alertMsg += "Please check the internet, backend server, and network.\n\n";
  alertMsg += "=== CURRENT STATUS ===\n";
  alertMsg += "WiFi: " + String(wifiConnected ? "CONNECTED" : "DISCONNECTED") + "\n";
  alertMsg += "DB: NOT CONNECTED\n";
  alertMsg += "Light: " + String(lightPercent, 0) + "%\n";
  alertMsg += "Temp: " + String((ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT, 1) + " C\n";
  alertMsg += "CO2: " + String(ppmCO2) + " ppm\n";
  alertMsg += "NH3: " + String(ppmNH3, 1) + " ppm\n";
  alertMsg += "LPG: " + String(ppmLPG, 1) + " ppm";

  sendSMS(PHONE_1, alertMsg);
  makeCall(PHONE_1, CALL_DURATION);
}

void notifyWiFiConnectionIssueOnce() {
  if (wifiConnectionAlertSent) {
    return;
  }

  if (!gsmInitialized) {
    Serial.println("[WIFI ALERT] GSM not ready; cannot place one-time WiFi-failure call/SMS");
    return;
  }

  wifiConnectionAlertSent = true;
  String alertMsg = "Dear farmer,\n";
  alertMsg += "The system cannot connect to WiFi.\n\n";
  alertMsg += "Please check the router, signal, and saved network passwords.\n\n";
  alertMsg += "=== CURRENT STATUS ===\n";
  alertMsg += "WiFi: DISCONNECTED\n";
  alertMsg += "DB: NOT CHECKED\n";
  alertMsg += "Light: " + String(lightPercent, 0) + "%\n";
  alertMsg += "Temp: " + String((ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT, 1) + " C\n";
  alertMsg += "CO2: " + String(ppmCO2) + " ppm\n";
  alertMsg += "NH3: " + String(ppmNH3, 1) + " ppm\n";
  alertMsg += "LPG: " + String(ppmLPG, 1) + " ppm";

  sendSMS(PHONE_1, alertMsg);
  makeCall(PHONE_1, CALL_DURATION);
}

void resetWiFiReconnectLock() {
  wifiReconnectLocked = false;
  wifiConnectionAlertSent = false;
  lastWiFiRetry = 0;
}

void notifyServerConnectionIssueOnce() {
  if (serverConnectionAlertSent) {
    return;
  }

  if (!gsmInitialized) {
    Serial.println("[SERVER ALERT] GSM not ready; cannot place one-time server-failure call/SMS");
    return;
  }

  serverConnectionAlertSent = true;

  String deviceSerialText = (DEVICE_SERIAL.length() > 0) ? DEVICE_SERIAL : "UNREGISTERED";
  String alertMsg = "Dear farmer,\n";
  alertMsg += "The system is connected to WiFi but cannot connect to the server.\n\n";
  alertMsg += "Please check WiFi and contact the Tunga Chicks Ltd Team for quick support.\n\n";
  alertMsg += "=== PROVISIONING STATUS ===\n";
  alertMsg += "Device Serial: " + deviceSerialText + "\n";
  alertMsg += "WiFi: CONNECTED\n";
  alertMsg += "Server: FAILED\n";
  alertMsg += "Wait admin to support.";

  sendSMS(PHONE_1, alertMsg);
  makeCall(PHONE_1, CALL_DURATION);
}

// ====================== DATABASE FUNCTIONS ======================
String createSensorPayload() {
  StaticJsonDocument<1024> doc;
  
  doc["serialNumber"] = DEVICE_SERIAL;
  doc["temperature"] = (ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT;
  doc["humidity"] = humidity;
  // Send a fixed 25% light value to backend during night; LCD still shows real `lightPercent`.
  float sendLightPercent = isDaytime ? lightPercent : 25.0;
  doc["light_lux"] = sendLightPercent * 5.2;
  doc["light_percent"] = sendLightPercent;
  
  JsonObject gas = doc.createNestedObject("gas");
  gas["CO2"] = ppmCO2;
  gas["NH3"] = ppmNH3;
  gas["CH4"] = 0;
  gas["O2"] = oxygenPercent;
  gas["LPG"] = ppmLPG;
  gas["H2S"] = 0;
  
  JsonObject power = doc.createNestedObject("power");
  power["source"] = solarRelayActive ? "SOLAR" : "GRID";
  power["voltage"] = solarVoltage;
  power["current"] = solarCurrent_mA;
  power["power"] = solarPower_W;
  power["load_power"] = loadPower_W;
  power["batteryLevel"] = 95;
  power["batteryStatus"] = "Good";
  
  JsonObject status = doc.createNestedObject("status");
  status["heater"] = (digitalRead(HEATER_RELAY) == RELAY_ON) ? "ON" : "OFF";
  status["fan"] = (digitalRead(EXHAUST_RELAY) == RELAY_ON) ? "ON" : "OFF";
  status["rotator"] = "AUTO";
  
  String payload;
  serializeJson(doc, payload);
  
  return payload;
}

float computeOxygenPercentFromCO2(float ppmCO2) {
  float o2 = 20.95 - ((ppmCO2 - 400.0) / 10000.0);
  if (o2 < 0.0) o2 = 0.0;
  if (o2 > 21.0) o2 = 21.0;
  return o2;
}

bool isReadyToPostSensorData() {
  return wifiConnected
    && DEVICE_SERIAL != ""
    && DEVICE_SERIAL != "UNREGISTERED"
    && deviceAssigned
    && provisioningComplete
    && deviceSerialPersisted;
}

void sendSensorDataToDatabase() {
  if (!wifiConnected) {
    Serial.println("WiFi not connected - skipping database send");
    return;
  }

  if (deviceLocked) {
    Serial.println("[LOCKED] System inactive - skipping telemetry upload until admin reactivates the account");
    return;
  }

  if (!isReadyToPostSensorData()) {
    if (DEVICE_SERIAL == "" || DEVICE_SERIAL == "UNREGISTERED") {
      Serial.print("[WARN] Device serial not obtained yet - waiting for admin assignment | serial=");
      Serial.println(DEVICE_SERIAL);
    } else if (!deviceAssigned) {
      Serial.print("[WARN] Device not yet assigned by admin - waiting before posting data | serial=");
      Serial.println(DEVICE_SERIAL);
    } else if (!provisioningComplete) {
      Serial.println("[WARN] Provisioning not complete - waiting before posting data");
    } else if (!deviceSerialPersisted) {
      Serial.print("[WARN] Device serial not persisted yet - waiting before posting data | serial=");
      Serial.println(DEVICE_SERIAL);
    }
    return;
  }
  
  unsigned long currentTime = millis();
  if (currentTime - lastDatabaseSend < DATABASE_SEND_INTERVAL) {
    return;
  }
  
  Serial.println("\n=== SENDING DATA TO DATABASE ===");
  String payload = createSensorPayload();
  Serial.print("Payload: ");
  Serial.println(payload);

  IPAddress localIp = WiFi.localIP();
  IPAddress subnetMask = WiFi.subnetMask();

  String response;
  String tunnelUrl = String(BACKEND_URL_TUNNEL) + String(API_ENDPOINT);
  int tunnelCode = postJsonRequest(tunnelUrl, payload, response);
  if (tunnelCode == 200) {
    databaseSendFailCount = 0;
    databaseConnectionAlertSent = false;
    lastDatabaseSend = currentTime;
    lastDatabaseSendSuccess = true;
    lastDatabaseSendMessage = "Via tunnel: OK";
    lastDatabaseSendTimestamp = currentTime;
    Serial.println("[OK] Data sent successfully to database via tunnel");
    dataSendSuccessBeep();
    Serial.println("=================================\n");
    return;
  }

  BackendTarget targets[2];
  const size_t targetCount = buildBackendTargets(targets, 2);
  bool sent = false;

  if (!ENABLE_LAN_FALLBACK) {
    Serial.println("[NET] LAN fallback disabled. Sending via tunnel only.");
  }

  for (size_t i = 0; i < targetCount; i++) {
    if (!ENABLE_LAN_FALLBACK) {
      break;
    }
    Serial.print("[NET] Local subnet: ");
    Serial.println(localIp);
    Serial.print("[NET] Target subnet: ");
    Serial.println(targets[i].host);

    if (!isSameSubnet(localIp, targets[i].host, subnetMask)) {
      Serial.println("[NET] Subnet mismatch detected; trying route anyway");
    }

    if (!canConnectToBackend(targets[i].host, targets[i].port)) {
      Serial.println("[WARN] Raw TCP connection failed before HTTP request");
      continue;
    }

    String fullUrl = buildBackendUrl(targets[i].host, targets[i].port, API_ENDPOINT);
    int httpResponseCode = postJsonRequest(fullUrl, payload, response);

    if (httpResponseCode == 200) {
      databaseSendFailCount = 0;
      databaseConnectionAlertSent = false;
      lastDatabaseSend = currentTime;
      sent = true;

        lastDatabaseSendSuccess = true;
        lastDatabaseSendMessage = "LAN: OK";
        lastDatabaseSendTimestamp = currentTime;
        Serial.println("[OK] Data sent successfully to database");
        dataSendSuccessBeep();
        // clear any blocking/re-provision flags on success
        blockUntilDbConnected = false;
        requireReProvision = false;
      break;
    }

    if (httpResponseCode == -1) {
      Serial.println("[WARN] Connection failed on this target");
    } else {
      Serial.print("[ERROR] HTTP Error: ");
      String errorResponse = response;
      Serial.println(errorResponse);

      if (httpResponseCode == 404) {
        Serial.println("ERROR: Device serial not found on backend!");
        Serial.println("Please verify DEVICE_SERIAL matches backend database.");
        // Backend says serial not found -> treat as deprovisioned; stop sending until admin reassigns
        provisioningComplete = false;
        deviceAssigned = false;
        needsSerialVerification = true;
        requireReProvision = true;
        blockUntilDbConnected = true;
      } else if (httpResponseCode == 403) {
        Serial.println("ERROR: Device account is locked!");
        Serial.println("Contact admin for support.");
        // Device locked or unauthorized - stop sending until admin action
        provisioningComplete = false;
        deviceAssigned = false;
        needsSerialVerification = true;
        requireReProvision = true;
        blockUntilDbConnected = true;
      }
    }
  }

  if (!sent) {
    databaseSendFailCount++;
    lastDatabaseSendSuccess = false;
    lastDatabaseSendMessage = "All routes failed";
    lastDatabaseSendTimestamp = currentTime;
    Serial.println("[ERROR] Connection failed (hosted backend and LAN fallback both unreachable)");
    Serial.print("Failure count: ");
    Serial.println(databaseSendFailCount);

    notifyDatabaseConnectionIssueOnce();

    if (databaseSendFailCount >= MAX_SEND_FAILURES) {
      Serial.println("[WARN] Multiple send failures - check backend connection");
      // Enter blocking mode: stop non-essential operations and keep retrying until DB reachable
      blockUntilDbConnected = true;
    }
  }
  
  lastDatabaseSend = currentTime;
  Serial.println("=================================\n");
}

void displayDatabaseStatus() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("=== DB STATUS ===");
  
  if (!wifiConnected) {
    lcd.setCursor(0,1); lcd.print("WiFi: DISCONNECTED");
    lcd.setCursor(0,2); lcd.print("Cannot send data");
    lcd.setCursor(0,3); lcd.print("Reconnecting...");
  } else if (databaseSendFailCount > 0) {
    lcd.setCursor(0,1); lcd.print("Sending DATA...");
    lcd.setCursor(0,2); lcd.print("Failures: ");
    lcd.print(databaseSendFailCount);
    lcd.setCursor(0,3); lcd.print("Last: ");
    lcd.print(lastDatabaseSendMessage.substring(0, 12));
  } else {
    lcd.setCursor(0,1); lcd.print("WiFi: CONNECTED");
    lcd.setCursor(0,2); lcd.print("Last Send: ");
    if (lastDatabaseSendTimestamp > 0) {
      lcd.print(lastDatabaseSendSuccess ? "OK" : "FAIL");
      lcd.print(" ");
      lcd.print(lastDatabaseSendMessage.substring(0, 8));
    } else {
      lcd.print("None yet");
    }
    lcd.setCursor(0,3); lcd.print("Serial: ");
    String serial = String(DEVICE_SERIAL);
    serial = serial.substring(0, 12);
    lcd.print(serial);
  }
  
  delay(2000);
}

// ====================== WIFI FUNCTIONS ======================
void connectToWiFi() {
  configureWiFiClient();

  if (wifiConnected) {
    if (WiFi.status() != WL_CONNECTED) {
      wifiConnected = false;
      Serial.println("WiFi connection lost! Reconnecting...");
    } else {
      return;
    }
  }
  
  Serial.println("\n=== Scanning for WiFi Networks ===");
  
  int n = WiFi.scanNetworks();
  if (n == 0) {
    Serial.println("No WiFi networks found. Scanning again in 30 seconds...");
    WiFi.scanDelete();
    notifyWiFiConnectionIssueOnce();
    wifiReconnectLocked = true;
    return;
  }
  
  Serial.printf("Found %d networks\n", n);
  for (int i = 0; i < n; i++) {
    Serial.printf("  %d: %s (signal: %d)\n", i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i));
  }
  
  for (int netIndex = 0; netIndex < 3; netIndex++) {
    for (int i = 0; i < n; i++) {
      if (WiFi.SSID(i) == networks[netIndex].ssid) {
        Serial.printf("\nAttempting to connect to: %s\n", networks[netIndex].ssid);
        
        lcd.clear();
        lcd.setCursor(0,0); lcd.print("WiFi Connecting...");
        lcd.setCursor(0,1); lcd.print("SSID: ");
        lcd.print(networks[netIndex].ssid);
        lcd.setCursor(0,2); lcd.print("Signal: ");
        lcd.print(WiFi.RSSI(i));
        lcd.print(" dBm");
        lcd.setCursor(0,3); lcd.print("Please wait...");
        
        WiFi.begin(networks[netIndex].ssid, networks[netIndex].password);
        
        unsigned long startTime = millis();
        while (millis() - startTime < 15000) {
          if (WiFi.status() == WL_CONNECTED) {
            wifiConnected = true;
            wifiReconnectLocked = false;
            wifiConnectionAlertSent = false;
            WiFi.setSleep(false);
            Serial.println("WiFi Connected Successfully!");
            Serial.print("IP Address: ");
            Serial.println(WiFi.localIP());
            Serial.print("Subnet Mask: ");
            Serial.println(WiFi.subnetMask());
            Serial.print("Gateway IP: ");
            Serial.println(WiFi.gatewayIP());
            Serial.print("RSSI: ");
            Serial.println(WiFi.RSSI());
            
            lcd.clear();
            lcd.setCursor(0,0); lcd.print("WiFi Connected!");
            lcd.setCursor(0,1); lcd.print("SSID: ");
            lcd.print(networks[netIndex].ssid);
            lcd.setCursor(0,2); lcd.print("IP: ");
            lcd.print(WiFi.localIP());
            lcd.setCursor(0,3); lcd.print("Ready!");
            delay(2000);
            
            flashWiFiConnectedIndicator();
            wifiSuccessBeep();
            WiFi.scanDelete();
            return;
          }
          wifiWaitingAlertTick();
          delay(250);
        }
        
        Serial.printf("Failed to connect to %s\n", networks[netIndex].ssid);
        WiFi.scanDelete();
        notifyWiFiConnectionIssueOnce();
          wifiReconnectLocked = true;
        lcd.clear();
        lcd.setCursor(0,0); lcd.print("WiFi: No Connection");
        lcd.setCursor(0,1); lcd.print("Alert sent once");
        lcd.setCursor(0,2); lcd.print("Will retry later...");
        lcd.setCursor(0,3); lcd.print("Stop searching...");
        delay(2000);
        wifiConnected = false;
        return;
      }
    }
  }
  
  Serial.println("Failed to connect to any saved WiFi network");
  notifyWiFiConnectionIssueOnce();
  wifiReconnectLocked = true;
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("WiFi: No Connection");
  lcd.setCursor(0,1); lcd.print("Alert sent once");
  lcd.setCursor(0,2); lcd.print("Will retry later...");
  lcd.setCursor(0,3); lcd.print("Stop searching...");
  delay(2000);
  
  WiFi.scanDelete();
  wifiConnected = false;
}

void handleWiFiReconnection() {
  if (wifiReconnectLocked || !wifiConnected) {
    return;
  }
  
  if (wifiConnected && WiFi.status() != WL_CONNECTED) {
    wifiConnected = false;
    wifiReconnectLocked = true;
    Serial.println("WiFi connection lost! Manual reconnect required.");
    wifiDisconnectBeep();
  }
}

// ====================== GSM FUNCTIONS ======================
void initGSM() {
  Serial.println("\n=== Initializing SIM800L ===");
  gsm.begin(9600, SERIAL_8N1, GSM_RX, GSM_TX);
  delay(250);
  
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Initializing GSM...");
  
  bool detected = false;
  for (int i = 0; i < 3; i++) {
    gsm.println("AT");
    delay(200);
    if (gsm.available()) {
      String response = gsm.readString();
      if (response.indexOf("OK") != -1) {
        detected = true;
        break;
      }
    }
  }
  
  if (!detected) {
    Serial.println("SIM800L NOT FOUND!");
    gsmInitialized = false;
    return;
  }
  
  gsm.println("ATE0"); delay(120);
  gsm.println("AT+CMGF=1"); delay(120);
  gsm.println("AT+CLIP=1"); delay(120);
  gsm.println("AT+CSQ"); delay(250);
  
  Serial.println("SIM800L Ready!");
  gsmInitialized = true;
  gsmReadyBeep();
}

void sendSMS(const char* number, String message) {
  Serial.print("Sending SMS to: ");
  Serial.println(number);
  
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Sending SMS...");
  lcd.setCursor(0,1); lcd.print("To: ");
  lcd.print(number);
  
  gsm.println("AT+CMGF=1");
  delay(1000);
  
  gsm.print("AT+CMGS=\"");
  gsm.print(number);
  gsm.println("\"");
  delay(1000);
  
  gsm.println(message);
  delay(1000);
  gsm.write(0x1A);
  delay(7000);
  
  Serial.println("SMS sent!");
}

void makeCall(const char* number, int durationMs) {
  Serial.print("Making call to: ");
  Serial.println(number);
  
  isCallActive = true;
  isOutgoingCall = true;
  activeCallNumber = String(number);
  callStartTime = millis();
  lastCallBeepTime = 0;
  
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("OUTGOING CALL");
  lcd.setCursor(0,1); lcd.print("To: ");
  lcd.print(number);
  lcd.setCursor(0,2); lcd.print("Call in progress");
  lcd.setCursor(0,3); lcd.print("Buzzer Active");
  outgoingCallBeep();
  
  gsm.print("ATD");
  gsm.print(number);
  gsm.println(";");
  delay(500);
  
  unsigned long startTime = millis();
  while (millis() - startTime < durationMs) {
    activateCallIndication();
    delay(100);
  }
  
  gsm.println("ATH");
  delay(500);
  
  deactivateCallIndication();
  isCallActive = false;
  isOutgoingCall = false;
  
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Call finished");
  lcd.setCursor(0,1); lcd.print(number);
  delay(800);
  
  Serial.println("Call finished");
}

void answerIncomingCall() {
  gsm.println("ATA");
  delay(500);
}

void hangUpCall() {
  gsm.println("ATH");
  delay(500);
}

String getSystemStatusMessage() {
  float temp = (ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT;
  String msg = "===== POULTRY SYSTEM STATUS =====\n";
  msg += "TEMP1 (DHT): " + String(temperatureDHT, 1) + "C\n";
  msg += "TEMP2 (DS18B20): " + String(temperatureDS18B20, 1) + "C\n";
  msg += "Humidity: " + String(humidity, 0) + "%\n";
  msg += "Light: " + String(lightPercent, 0) + "%\n\n";
  msg += "=== AIR QUALITY ===\n";
  msg += "CO2: " + String(ppmCO2) + " ppm\n";
  msg += "NH3: " + String(ppmNH3, 1) + " ppm\n";
  msg += "LPG: " + String(ppmLPG, 1) + " ppm\n\n";
  msg += "=== POWER SYSTEM ===\n";
  msg += "Source: " + String(solarRelayActive ? "SOLAR" : "GRID") + "\n";
  msg += "Solar V: " + String(solarVoltage, 2) + "V\n";
  msg += "Solar I: " + String(solarCurrent_mA, 0) + "mA\n";
  msg += "Solar P: " + String(solarPower_W, 2) + "W\n";
  msg += "Load P: " + String(loadPower_W, 2) + "W\n\n";
  msg += "=== CONTROLS ===\n";
  msg += "Heater: " + String((digitalRead(HEATER_RELAY) == RELAY_ON) ? "ON" : "OFF") + "\n";
  msg += "Exhaust: " + String((digitalRead(EXHAUST_RELAY) == RELAY_ON) ? "ON" : "OFF");
  
  if (hasActiveIssue) {
    msg += "\n\n!!! ACTIVE ISSUE !!!\n";
    msg += activeIssueMessage;
  }
  return msg;
}

// ====================== INCOMING CALL HANDLER ======================
void handleIncomingCall() {
  String data = "";
  while (gsm.available()) {
    char c = gsm.read();
    data += c;
    Serial.write(c);
  }
  
  if (data.indexOf("RING") != -1 && !isCallActive) {
    Serial.println("\n=== INCOMING CALL DETECTED ===");
    
    int clipStart = data.indexOf("+CLIP: \"");
    if (clipStart != -1) {
      int numberStart = clipStart + 8;
      int numberEnd = data.indexOf("\"", numberStart);
      if (numberEnd != -1) {
        incomingCallerNumber = data.substring(numberStart, numberEnd);
        Serial.print("Caller: ");
        Serial.println(incomingCallerNumber);
      }
    }
    
    isCallActive = true;
    isOutgoingCall = false;
    activeCallNumber = incomingCallerNumber;
    callStartTime = millis();
    lastCallBeepTime = 0;
    incomingCallDetected = true;
    
    lcd.clear();
    lcd.setCursor(0,0); lcd.print("!!! INCOMING CALL !!!");
    lcd.setCursor(0,1); lcd.print("From: ");
    lcd.print(incomingCallerNumber);
    lcd.setCursor(0,2); lcd.print("Answering...");
    lcd.setCursor(0,3); lcd.print("Buzzer Active");

    incomingCallBeep();
    
    delay(1500);
    answerIncomingCall();
    
    lcd.setCursor(0,2); lcd.print("Call Connected  ");
    lcd.setCursor(0,3); lcd.print("Sending Status...");
    
    bool statusSent = false;
    
    while (isCallActive) {
      activateCallIndication();
      
      if (!statusSent && millis() - callStartTime > 2000) {
        String statusMsg = getSystemStatusMessage();
        sendSMS(incomingCallerNumber.c_str(), statusMsg);
        statusSent = true;
        lcd.setCursor(0,3); lcd.print("Status Sent!     ");
      }
      
      if (gsm.available()) {
        String response = "";
        while (gsm.available()) {
          response += (char)gsm.read();
        }
        if (response.indexOf("NO CARRIER") != -1) {
          Serial.println("Call ended by remote");
          break;
        }
      }
      
      if (millis() - callStartTime > 30000) {
        Serial.println("Auto-hanging up after 30 seconds");
        hangUpCall();
        break;
      }
      
      delay(100);
    }
    
    deactivateCallIndication();
    isCallActive = false;
    incomingCallDetected = false;
    
    lcd.clear();
    lcd.setCursor(0,0); lcd.print("Call Completed");
    lcd.setCursor(0,1); lcd.print("Status Sent");
    delay(2000);
  }
  
  if (data.indexOf("NO CARRIER") != -1 && isCallActive) {
    Serial.println("\n=== CALL ENDED ===");
    deactivateCallIndication();
    isCallActive = false;
    isOutgoingCall = false;
    
    lcd.clear();
    lcd.setCursor(0,0); lcd.print("Call Ended");
    delay(2000);
  }
}

// ====================== ALERT LOGIC ======================
String detectCurrentIssue() {
  if (!ds18b20Found) return "ERROR_TEMP2_SENSOR";
  if (!dhtFound) return "ERROR_TEMP1_SENSOR";
  
  float temp = temperatureDS18B20;
  
  if (temp > TEMP_DANGER_MAX) return "DANGER_HIGH_TEMP";
  if (temp < TEMP_DANGER_MIN) return "DANGER_LOW_TEMP";
  if (ppmCO2 > CO2_DANGER) return "DANGER_HIGH_CO2";
  if (ppmNH3 > NH3_DANGER) return "DANGER_HIGH_NH3";
  if (ppmLPG > LPG_DANGER) return "DANGER_GAS_LEAK";
  
  if (temp > TEMP_GOOD_MAX) return "WARNING_HIGH_TEMP";
  if (temp < TEMP_GOOD_MIN) return "WARNING_LOW_TEMP";
  if (ppmCO2 > CO2_GOOD_MAX) return "WARNING_HIGH_CO2";
  if (ppmNH3 > NH3_GOOD_MAX) return "WARNING_HIGH_NH3";
  if (ppmLPG > LPG_GOOD_MAX) return "WARNING_HIGH_LPG";
  
  return "NORMAL";
}

bool isWarningIssue(const String& issue) {
  return issue == "WARNING_HIGH_TEMP" ||
         issue == "WARNING_LOW_TEMP" ||
         issue == "WARNING_HIGH_CO2" ||
         issue == "WARNING_HIGH_NH3" ||
         issue == "WARNING_HIGH_LPG";
}

bool hasWarningAlreadyBeenSent(const String& issue) {
  if (issue == "WARNING_HIGH_TEMP") return warningHighTempSent;
  if (issue == "WARNING_LOW_TEMP") return warningLowTempSent;
  if (issue == "WARNING_HIGH_CO2") return warningHighCO2Sent;
  if (issue == "WARNING_HIGH_NH3") return warningHighNH3Sent;
  if (issue == "WARNING_HIGH_LPG") return warningHighLPGSent;
  return false;
}

void markWarningAsSent(const String& issue) {
  if (issue == "WARNING_HIGH_TEMP") warningHighTempSent = true;
  else if (issue == "WARNING_LOW_TEMP") warningLowTempSent = true;
  else if (issue == "WARNING_HIGH_CO2") warningHighCO2Sent = true;
  else if (issue == "WARNING_HIGH_NH3") warningHighNH3Sent = true;
  else if (issue == "WARNING_HIGH_LPG") warningHighLPGSent = true;
}

void clearWarningSentFlag(const String& issue) {
  if (issue == "WARNING_HIGH_TEMP") warningHighTempSent = false;
  else if (issue == "WARNING_LOW_TEMP") warningLowTempSent = false;
  else if (issue == "WARNING_HIGH_CO2") warningHighCO2Sent = false;
  else if (issue == "WARNING_HIGH_NH3") warningHighNH3Sent = false;
  else if (issue == "WARNING_HIGH_LPG") warningHighLPGSent = false;
}

void handleAlertSystem() {
  static unsigned long lastCheckTime = 0;
  unsigned long currentTime = millis();
  
  if (isCallActive) return;
  if (!hasActiveIssue) return;
  if (currentTime - lastCheckTime < 1000) return;
  lastCheckTime = currentTime;
  
  String currentIssue = detectCurrentIssue();

  if (currentIssue == "NORMAL") {
    clearWarningSentFlag(currentIssueType);
  }
  
  if (userNotified && (currentTime - userNotifiedTime < USER_NOTIFIED_COOLDOWN) && 
      currentIssue == currentIssueType) {
    return;
  }
  
  if (currentIssue != currentIssueType || (userNotified && (currentTime - userNotifiedTime >= USER_NOTIFIED_COOLDOWN))) {
    alertStage = 0;
    userNotified = false;
    currentIssueType = "";
  }
  
  // If we don't have an active confirmed issue yet, use a candidate/confirmation
  // step to avoid calling on transient spikes. Only escalate to call stages for
  // DANGER-level issues. WARNING-level issues will result in an SMS only.
  if (currentIssueType == "") {
    // No active issue yet
    if (currentIssue == "NORMAL") {
      // nothing to do
      candidateIssueType = "";
      candidateStartTime = 0;
      return;
    }

    // If we just saw a new candidate, start confirmation timer
    if (candidateIssueType == "") {
      candidateIssueType = currentIssue;
      candidateStartTime = currentTime;
      Serial.println("[ALERT] Candidate issue detected, waiting for confirmation...");
      return;
    }

    // If the current reading changed, restart candidate
    if (currentIssue != candidateIssueType) {
      candidateIssueType = currentIssue;
      candidateStartTime = currentTime;
      Serial.println("[ALERT] Candidate changed, restarting confirmation timer...");
      return;
    }

    // If candidate persisted long enough, promote to active issue
    if (currentTime - candidateStartTime >= ALERT_CONFIRMATION_MS) {
      currentIssueType = candidateIssueType;
      candidateIssueType = "";
      candidateStartTime = 0;
      hasActiveIssue = true;
      alertStartTime = currentTime;
      lastAlertActionTime = currentTime;

      // WARNING -> only send SMS notification (no calls)
      if (currentIssueType.indexOf("WARNING") == 0) {
        if (hasWarningAlreadyBeenSent(currentIssueType)) {
          Serial.println("[ALERT] WARNING already notified once; skipping repeat SMS");
          return;
        }
        Serial.println("[ALERT] Confirmed WARNING - sending SMS only");
        String warnMsg = "Hello dear farmer,\n";
        warnMsg += "A warning condition was detected and the system data was saved in EEPROM.\n\n";
        warnMsg += "Issue: " + currentIssueType + "\n";
        warnMsg += "This issue may cause a call if it becomes dangerous.\n\n";
        warnMsg += "=== SYSTEM STATUS ===\n";
        warnMsg += "Temp1: " + String(temperatureDHT, 1) + " C\n";
        warnMsg += "Temp2: " + String(temperatureDS18B20, 1) + " C\n";
        warnMsg += "Humidity: " + String(humidity, 0) + " %\n";
        warnMsg += "Light: " + String(lightPercent, 0) + " %\n";
        warnMsg += "CO2: " + String(ppmCO2) + " ppm\n";
        warnMsg += "NH3: " + String(ppmNH3, 1) + " ppm\n";
        warnMsg += "LPG: " + String(ppmLPG, 1) + " ppm\n";
        warnMsg += "O2: " + String(oxygenPercent, 1) + " %\n";
        warnMsg += "Power: " + String(solarVoltage, 2) + "V, " + String(solarCurrent_mA, 0) + "mA\n";
        warnMsg += "Please check the farm sensors.";
        sendSMS(PHONE_1, warnMsg);
        markWarningAsSent(currentIssueType);
        userNotified = true;
        userNotifiedTime = currentTime;
        return;
      }

      // DANGER -> start call/SMS escalation sequence as before
      Serial.println("=== STAGE 1: First call for 1 minute ===");
      alertStage = 1;
      lastAlertActionTime = currentTime;
      makeCall(PHONE_1, ALERT_CALL_DURATION);
      return;
    }

    // still confirming
    return;
  }

  auto buildAlertSms = [&]() -> String {
    String alertMsg = "SHOME ERROR DETECTED\n";
    alertMsg += "STUTA OF ALL SYSTEM STATAS\n";
    alertMsg += "Temp: " + String((ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT, 1) + "C\n";
    alertMsg += "Humidity: " + String(humidity, 0) + "%\n";
    alertMsg += "Light: " + String(lightPercent, 0) + "%\n";
    alertMsg += "CO2: " + String(ppmCO2) + " ppm\n";
    alertMsg += "NH3: " + String(ppmNH3, 1) + " ppm\n";
    alertMsg += "LPG: " + String(ppmLPG, 1) + " ppm\n";
    alertMsg += "O2: " + String(oxygenPercent, 1) + "%\n";
    alertMsg += "Power: " + String(solarVoltage, 2) + "V, " + String(solarCurrent_mA, 0) + "mA\n";
    alertMsg += "Action required!";
    return alertMsg;
  };
  
  switch(alertStage) {
    case 1:
      if (currentTime - lastAlertActionTime >= SMS_WAIT) {
        Serial.println("=== STAGE 2: Sending SMS to primary ===");
        sendSMS(PHONE_1, buildAlertSms());
        alertStage = 2;
        lastAlertActionTime = currentTime;
      }
      break;
      
    case 2:
      if (currentTime - lastAlertActionTime >= ALERT_STAGE_GAP) {
        Serial.println("=== STAGE 3: Second call for 1 minute ===");
        makeCall(PHONE_2, ALERT_CALL_DURATION);
        alertStage = 3;
        lastAlertActionTime = currentTime;
      }
      break;
      
    case 3:
      Serial.println("=== STAGE 4: Sending SMS to secondary ===");
      sendSMS(PHONE_2, buildAlertSms());
      alertStage = 4;
      lastAlertActionTime = currentTime;
      break;
      
    case 4:
      if (!userNotified) {
        userNotified = true;
        userNotifiedTime = currentTime;
        Serial.println("=== USER NOTIFIED - cooldown before repeating this issue ===");
      }
      break;
  }
}

// ====================== POWER MANAGEMENT ======================
void initPowerSystem() {
  pinMode(SOLAR_RELAY, OUTPUT);
  pinMode(GRID_RELAY, OUTPUT);
  pinMode(INDICATOR_PIN, OUTPUT);
  pinMode(LIGHT_RELAY, OUTPUT);
  pinMode(HEATER_RELAY, OUTPUT);
  pinMode(EXHAUST_RELAY, OUTPUT);
  
  setStartupPinDefaults();
  solarRelayActive = false;
  startupSensorPhaseComplete = false;
  
  Wire.begin(21, 22);
  
  if (!ina219.begin()) {
    Serial.println("INA219 NOT FOUND!");
    ina219Found = false;
  } else {
    Serial.println("INA219 Power Monitor found!");
    ina219Found = true;
    ina219.setCalibration_16V_400mA();
  }
}

void readPowerData() {
  if (!ina219Found) {
    solarVoltage = 0;
    solarCurrent_mA = 0;
    solarPower_W = 0;
    loadCurrent_A = 0;
    loadPower_W = 0;
    return;
  }
  
  solarVoltage = ina219.getBusVoltage_V();
  solarCurrent_mA = ina219.getCurrent_mA();
  
  if (solarCurrent_mA < 5) solarCurrent_mA = 0;
  if (solarVoltage < 0 || solarVoltage > 30) {
    solarVoltage = 0;
    solarCurrent_mA = 0;
  }
  
  solarPower_W = solarVoltage * (solarCurrent_mA / 1000.0);
  loadPower_W = solarPower_W;
  loadCurrent_A = solarCurrent_mA / 1000.0;
}

void controlPowerRelays() {
  // If controller outputs are not yet armed or initial sensor checks are incomplete,
  // keep both relays OFF (safe state) and do not make control decisions.
  if (!controllerOutputsArmed) {
    digitalWrite(SOLAR_RELAY, RELAY_OFF);
    digitalWrite(GRID_RELAY, RELAY_OFF);
    solarRelayActive = false;
    return;
  }

  // Prevent relay actions until the startup sensor-reading phase has completed
  if (!startupSensorPhaseComplete && !startupArmByTimeout) {
    digitalWrite(SOLAR_RELAY, RELAY_OFF);
    digitalWrite(GRID_RELAY, RELAY_OFF);
    solarRelayActive = false;
    return;
  }
  static bool lastSolarState = false;
  bool currentSolarState = lastSolarState;

  if (!ina219Found) {
    currentSolarState = false;
  } else if (lastSolarState) {
    if (solarVoltage < SOLAR_SWITCH_OFF_VOLTAGE) {
      currentSolarState = false;
    }
  } else {
    if (solarVoltage >= SOLAR_SWITCH_ON_VOLTAGE) {
      currentSolarState = true;
    }
  }
  
  if (currentSolarState) {
    digitalWrite(SOLAR_RELAY, RELAY_ON);
    digitalWrite(GRID_RELAY, RELAY_OFF);
  } else {
    digitalWrite(SOLAR_RELAY, RELAY_OFF);
    digitalWrite(GRID_RELAY, RELAY_ON);
  }

  solarRelayActive = currentSolarState;
  
  if (currentSolarState != lastSolarState) {
    // Beep on power change only when system is not locked
    if (!deviceLocked) {
      powerChangeBeep();
      powerChangeBeep();
    }

    // Trigger 3x LED flash for supply change, but only if system is active
    if (!deviceLocked && controllerOutputsArmed) {
      flashWiFiConnectedIndicator();
    }
    
    if (currentSolarState) {
      Serial.println("=== POWER CHANGED TO SOLAR ===");
    } else {
      Serial.println("=== POWER CHANGED TO GRID ===");
    }
    
    lastSolarState = currentSolarState;
  }
}

// ====================== INDICATOR LED CONTROL PIN 13 ======================

// Check if any sensor has an error
bool hasSensorError() {
  return !dhtFound || !ina219Found || !mq6Found || !mq137Found || !co2Found || !ldrFound || !ds18b20Found;
}

// Trigger supply change LED flash (3 times with 3-second interval)
void triggerSupplyChangeIndicator() {
  supplyChangeIndicatorActive = true;
  supplyChangeFlashCount = 1;
  supplyChangeLedOn = true;
  supplyChangeNextToggleTime = millis() + SUPPLY_CHANGE_FLASH_INTERVAL;
  setIndicatorLed(true);
  Serial.println("[INDICATOR] Supply change detected - flashing LED 3 times");
}

// Handle supply change LED flashing
void updateSupplyChangeIndicator() {
  if (!supplyChangeIndicatorActive) return;

  unsigned long currentTime = millis();
  if (currentTime < supplyChangeNextToggleTime) {
    return;
  }

  if (supplyChangeLedOn) {
    setIndicatorLed(false);
    supplyChangeLedOn = false;
    supplyChangeNextToggleTime = currentTime + SUPPLY_CHANGE_FLASH_INTERVAL;

    if (supplyChangeFlashCount >= SUPPLY_CHANGE_FLASH_COUNT) {
      supplyChangeIndicatorActive = false;
    }
    return;
  }

  if (supplyChangeFlashCount >= SUPPLY_CHANGE_FLASH_COUNT) {
    supplyChangeIndicatorActive = false;
    setIndicatorLed(false);
    return;
  }

  supplyChangeFlashCount++;
  setIndicatorLed(true);
  supplyChangeLedOn = true;
  supplyChangeNextToggleTime = currentTime + SUPPLY_CHANGE_FLASH_INTERVAL;
}

// Handle sensor error LED flashing (continuous flash with 2-second interval)
void updateSensorErrorIndicator() {
  if (!sensorErrorIndicatorActive) return;
  
  unsigned long currentTime = millis();
  
  // Toggle LED every 2 seconds
  if (currentTime >= indicatorNextToggleTime) {
    setIndicatorLed(!indicatorLedState);
    indicatorNextToggleTime = currentTime + SENSOR_ERROR_FLASH_INTERVAL;
  }
}

// Update indicator LED status based on sensor errors and supply changes
void updateIndicatorLED() {
  if (!indicatorMonitoringEnabled) {
    setIndicatorLed(false);
    return;
  }

  if (!controllerOutputsArmed || !startupSensorPhaseComplete) {
    setIndicatorLed(false);
    return;
  }

  if (deviceLocked) {
    supplyChangeIndicatorActive = false;
    sensorErrorIndicatorActive = false;
    supplyChangeLedOn = false;
    setInactivePinState();
    return;
  }

  // Supply change takes priority
  if (supplyChangeIndicatorActive) {
    updateSupplyChangeIndicator();
    return;
  }
  
  // Check for sensor errors
  bool currentSensorError = hasSensorError();
  
  if (currentSensorError && !sensorErrorIndicatorActive) {
    // Sensor error detected - start flashing
    sensorErrorIndicatorActive = true;
    indicatorNextToggleTime = millis() + SENSOR_ERROR_FLASH_INTERVAL;
    setIndicatorLed(true);
    Serial.println("[INDICATOR] Sensor error detected - LED flashing with 2-second interval");
  } else if (!currentSensorError && sensorErrorIndicatorActive) {
    // Sensor error cleared - stop flashing
    sensorErrorIndicatorActive = false;
    setIndicatorLed(false);
    Serial.println("[INDICATOR] Sensor error cleared - LED off");
  } else if (!currentSensorError && !supplyChangeIndicatorActive) {
    setIndicatorLed(false);
  }
  
  if (sensorErrorIndicatorActive) {
    updateSensorErrorIndicator();
  }
}

// ====================== SENSOR FUNCTIONS ======================
void readLDR() {
  ldrValue = analogRead(PIN_LDR);
  if (ldrValue < 0 || ldrValue > 4095) {
    ldrFound = false;
    lightPercent = 0;
  } else {
    ldrFound = true;
    lightPercent = map(ldrValue, 0, 4095, 0, 100);
    if (lightPercent > 100) lightPercent = 100;
    if (lightPercent < 0) lightPercent = 0;
  }
}

void readDayNightLDR() {
  // Using the digital output of the LDR module (comparator on-board).
  // Digital modules return HIGH/LOW based on threshold set by the trimmer.
  static bool lastReportedIsDaytime = true;

  int digitalVal = digitalRead(PIN_LDR_DAYNIGHT);
  // With INPUT_PULLUP enabled and the module comparator, LOW indicates bright/light (day)
  dayNightFound = true;
  bool newIsDaytime = (digitalVal == LOW);
  dayNightPercent = newIsDaytime ? 100.0 : 0.0;

  if (newIsDaytime != isDaytime) {
    isDaytime = newIsDaytime;
    Serial.printf("[DAY/NIGHT] Mode changed: %s (LDR2 pin12 digital=%d)\\n", isDaytime ? "DAY" : "NIGHT", digitalVal);
    lastReportedIsDaytime = isDaytime;
  }
}

// Control supplemental light relay on LIGHT_RELAY (pin 15)
// Rule: only in DAY mode use LDR pin 33 to control lamp; at NIGHT force lamp relay OFF.
void controlLightRelay() {
  if (deviceLocked) {
    digitalWrite(LIGHT_RELAY, RELAY_OFF);
    lightRelayActive = false;
    return;
  }

  if (!ldrFound) {
    digitalWrite(LIGHT_RELAY, RELAY_OFF);
    lightRelayActive = false;
    return;
  }

  // At night, do not enable the lamp relay at all.
  if (!isDaytime) {
    if (lightRelayActive) {
      Serial.println("[LIGHT] Night detected from pin 12 - forcing lamp relay OFF");
    }
    digitalWrite(LIGHT_RELAY, RELAY_OFF);
    lightRelayActive = false;
    return;
  }

  // Activate when light is too low
  if (lightPercent < LUX_GOOD_MIN) {
    if (!lightRelayActive) {
      Serial.println("[LIGHT] Low lux (<20%) detected - activating light relay (NO closed)");
      digitalWrite(LIGHT_RELAY, RELAY_ON);
      lightRelayActive = true;
    }
    return;
  }

  // Deactivate once light reaches the minimum acceptable level again.
  if (lightPercent >= LUX_GOOD_MIN) {
    if (lightRelayActive) {
      Serial.println("[LIGHT] Lux >= 20% - deactivating light relay (NO opened)");
      digitalWrite(LIGHT_RELAY, RELAY_OFF);
      lightRelayActive = false;
    }
    return;
  }

  // No other state change needed.
}

void readDHT22() {
  humidity = dht.readHumidity();
  temperatureDHT = dht.readTemperature();
  
  if (isnan(temperatureDHT) || temperatureDHT < -40 || temperatureDHT > 80) {
    dhtFound = false;
    temperatureDHT = 0;
    humidity = 0;
  } else {
    dhtFound = true;
  }
  
  if (isnan(humidity) || humidity < 0 || humidity > 100) {
    dhtFound = false;
    humidity = 0;
  }
}

void checkDangerConditions() {
  float temp = (ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT;
  bool anyDanger = false;
  
  if (temp > 0) {
    if (temp < TEMP_DANGER_MIN) {
      digitalWrite(HEATER_RELAY, RELAY_ON);
      currentDangerMessage = "COLD! Heater ON";
      anyDanger = true;
    } else if (temp > TEMP_DANGER_MAX) {
      digitalWrite(HEATER_RELAY, RELAY_OFF);
      digitalWrite(EXHAUST_RELAY, RELAY_ON);
      currentDangerMessage = "HOT! Exhaust ON";
      anyDanger = true;
    } else if (temp >= TEMP_GOOD_MIN && temp <= TEMP_GOOD_MAX) {
      if (digitalRead(HEATER_RELAY) == RELAY_ON) digitalWrite(HEATER_RELAY, RELAY_OFF);
    }
  }
  
  if (ppmCO2 > CO2_GOOD_MAX || ppmNH3 > NH3_GOOD_MAX || ppmLPG > LPG_GOOD_MAX) {
    digitalWrite(EXHAUST_RELAY, RELAY_ON);
    anyDanger = true;
    if (ppmCO2 > CO2_DANGER) currentDangerMessage = "HIGH CO2!";
    if (ppmNH3 > NH3_DANGER) currentDangerMessage = "HIGH NH3!";
    if (ppmLPG > LPG_DANGER) currentDangerMessage = "GAS LEAK!";
  }
  
  if (!anyDanger && !(temp > TEMP_DANGER_MAX)) {
    digitalWrite(EXHAUST_RELAY, RELAY_OFF);
  }
}

// ====================== DISPLAY FUNCTIONS ======================
void displayProjectName() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print(" Eco-Smart Poultry ");
  lcd.setCursor(0,1); lcd.print("     Care System    ");
  lcd.setCursor(0,2); lcd.print("   Power Monitoring ");
  lcd.setCursor(0,3); lcd.print("   GSM Alert Ready  ");
  delay(3000);
}

void displayAirQualityData() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("=== AIR QUALITY ===");
  lcd.setCursor(0,1); lcd.print("LPG:"); lcd.print(ppmLPG, 1); lcd.print(" ppm");
  lcd.setCursor(0,2); lcd.print("NH3:"); lcd.print(ppmNH3, 1); lcd.print(" ppm");
  lcd.setCursor(0,3); lcd.print("CO2:"); lcd.print(ppmCO2); lcd.print(" ppm ");
  lcd.print("O2:"); lcd.print(oxygenPercent, 1); lcd.print("%");
}

void displayEnvironmentalData() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("== ENVIRONMENT ==");

  Serial.println("=== ENVIRONMENTAL CONDITIONS ===");
  
  lcd.setCursor(0,1); lcd.print("TEMP1:");
  if (dhtFound && temperatureDHT > 0) {
    lcd.print(temperatureDHT, 1);
  } else {
    lcd.print("0.0");
  }
  lcd.print("C");
  
  lcd.setCursor(10,1); lcd.print("HUM:");
  if (dhtFound && humidity > 0) {
    lcd.print(humidity, 0);
  } else {
    lcd.print("0");
  }
  lcd.print("%");
  
  lcd.setCursor(0,2); lcd.print("TEMP2:");
  if (ds18b20Found && temperatureDS18B20 != 0) {
    lcd.print(temperatureDS18B20, 1);
  } else {
    lcd.print("0.0");
  }
  lcd.print("C");
  
  lcd.setCursor(0,3); lcd.print("LIGHT:");
  if (ldrFound && lightPercent > 0) {
    lcd.print(lightPercent, 0);
  } else {
    lcd.print("0");
  }
  lcd.print("%");

  Serial.printf("TEMP1 (DHT): %.1f C\n", dhtFound ? temperatureDHT : 0.0);
  Serial.printf("HUMIDITY: %.0f %%\n", dhtFound ? humidity : 0.0);
  Serial.printf("TEMP2 (DS18B20): %.1f C\n", ds18b20Found ? temperatureDS18B20 : 0.0);
  Serial.printf("LIGHT: %.0f %% (%s relay, threshold < %d%% / off >= %d%%)\n",
                lightPercent,
                lightRelayActive ? "ON" : "OFF",
                LUX_GOOD_MIN,
                LUX_GOOD_MAX);
  
  lcd.setCursor(10,3);
  lcd.print("H:");
  lcd.print((digitalRead(HEATER_RELAY) == RELAY_ON) ? "ON" : "OFF");
  lcd.print(" E:");
  lcd.print((digitalRead(EXHAUST_RELAY) == RELAY_ON) ? "ON" : "OF");
}

void displayPowerData() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("===== POWER =====");
  lcd.setCursor(0,1); lcd.print("Src:");
  lcd.print(solarRelayActive ? "SOLAR" : "GRID");
  lcd.setCursor(0,2); lcd.print("Sol:");
  if (solarRelayActive) {
    lcd.print(solarVoltage, 2);
    lcd.print("V ");
    lcd.print(solarCurrent_mA, 0);
    lcd.print("mA");
  } else {
    lcd.print("0.00V 0mA");
  }
  lcd.setCursor(0,3); lcd.print("Pwr:"); lcd.print(solarPower_W, 2); lcd.print("W");
}

void displaySystemErrors() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("=== SYSTEM ISSUES ===");
  
  float temp = (ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT;
  int errorCount = 0;
  String errorMessages[5];
  int errorIndex = 0;
  
  if (!ds18b20Found) {
    errorMessages[errorIndex++] = "ERROR: TEMP2 Sensor!";
    errorCount++;
  }
  
  if (!dhtFound) {
    errorMessages[errorIndex++] = "ERROR: TEMP1 Sensor!";
    errorCount++;
  }
  
  if (ds18b20Found && temp > 0) {
    if (temp < TEMP_DANGER_MIN) {
      errorMessages[errorIndex++] = "DANGER: LOW TEMP " + String(temp, 1) + "C";
      errorCount++;
    }
    else if (temp > TEMP_DANGER_MAX) {
      errorMessages[errorIndex++] = "DANGER: HIGH TEMP " + String(temp, 1) + "C";
      errorCount++;
    }
    else if (temp < TEMP_GOOD_MIN) {
      errorMessages[errorIndex++] = "WARNING: LOW TEMP " + String(temp, 1) + "C";
      errorCount++;
    }
    else if (temp > TEMP_GOOD_MAX) {
      errorMessages[errorIndex++] = "WARNING: HIGH TEMP " + String(temp, 1) + "C";
      errorCount++;
    }
  }
  
  if (ppmCO2 > CO2_DANGER) {
    errorMessages[errorIndex++] = "DANGER: HIGH CO2 " + String(ppmCO2) + "ppm";
    errorCount++;
  }
  else if (ppmCO2 > CO2_GOOD_MAX) {
    errorMessages[errorIndex++] = "WARNING: HIGH CO2 " + String(ppmCO2) + "ppm";
    errorCount++;
  }
  
  if (ppmNH3 > NH3_DANGER) {
    errorMessages[errorIndex++] = "DANGER: HIGH NH3 " + String(ppmNH3, 1) + "ppm";
    errorCount++;
  }
  else if (ppmNH3 > NH3_GOOD_MAX) {
    errorMessages[errorIndex++] = "WARNING: HIGH NH3 " + String(ppmNH3, 1) + "ppm";
    errorCount++;
  }
  
  if (ppmLPG > LPG_DANGER) {
    errorMessages[errorIndex++] = "DANGER: GAS LEAK " + String(ppmLPG, 1) + "ppm";
    errorCount++;
  }
  else if (ppmLPG > LPG_GOOD_MAX) {
    errorMessages[errorIndex++] = "WARNING: HIGH LPG " + String(ppmLPG, 1) + "ppm";
    errorCount++;
  }
  
  lcd.setCursor(0,1);
  lcd.print("Total Errors: ");
  lcd.print(errorCount);
  
  if (errorCount > 0) {
    if (errorIndex > 0) {
      lcd.setCursor(0,2);
      String firstError = errorMessages[0];
      firstError = firstError.substring(0, 19);
      lcd.print(firstError);
    }
    
    if (errorIndex > 1) {
      lcd.setCursor(0,3);
      String secondError = errorMessages[1];
      secondError = secondError.substring(0, 19);
      lcd.print(secondError);
    }
    
    // Keep the buzzer silent for system issue display; indicator LED carries the status.
    noTone(BUZZER_PIN);
    
    if (!hasActiveIssue) {
      hasActiveIssue = true;
      activeIssueMessage = String(errorCount) + " error(s) detected!";
      Serial.println("========================================");
      Serial.printf("!!! %d ERROR(S) DETECTED !!!\n", errorCount);
      for (int i = 0; i < errorIndex; i++) {
        Serial.printf("  %d. %s\n", i+1, errorMessages[i].c_str());
      }
      Serial.println("LED (PIN 13): ON (continuous)");
      Serial.println("Buzzer: OFF (LED only)");
      Serial.println("========================================");
    }
  } 
  else {
    noTone(BUZZER_PIN);
    
    if (hasActiveIssue) {
      hasActiveIssue = false;
      activeIssueMessage = "";
      Serial.println("========================================");
      Serial.println("!!! ALL ERRORS RESOLVED !!!");
      Serial.println("LED (PIN 13): OFF");
      Serial.println("Buzzer: OFF");
      Serial.println("========================================");
    }
    
    lcd.setCursor(0,2);
    lcd.print("No System Issues");
    lcd.setCursor(0,3);
    lcd.print("System Healthy");
  }
  
  delay(3000);
}

void displayAlertStatus() {
  lcd.clear();
  if (hasActiveIssue) {
    lcd.setCursor(0,0); lcd.print("!!! ACTIVE ISSUE !!!");
    lcd.setCursor(0,1); lcd.print(activeIssueMessage.substring(0, 19));
    lcd.setCursor(0,2); lcd.print("LED: ON | Buzzer:");
    lcd.setCursor(0,3); lcd.print("Every 2 seconds");
  } else {
    lcd.setCursor(0,0); lcd.print("=== SYSTEM OK ===");
    lcd.setCursor(0,1); lcd.print("All parameters");
    lcd.setCursor(0,2); lcd.print("within normal range");
    lcd.setCursor(0,3); lcd.print("Monitoring...");
  }
}

void displayCallStatus() {
  if (!isCallActive) return;
  
  lcd.clear();
  lcd.setCursor(0,0); lcd.print(isOutgoingCall ? "OUTGOING CALL" : "INCOMING CALL");
  lcd.setCursor(0,1); lcd.print(isOutgoingCall ? "To: " : "From: ");
  lcd.print(activeCallNumber);
  lcd.setCursor(0,2); lcd.print("Call in progress");
  lcd.setCursor(0,3); lcd.print("Buzzer Active");
}

void displayWiFiStatus() {
  if (!wifiConnected) {
    lcd.clear();
    lcd.setCursor(0,0); lcd.print("=== WiFi STATUS ===");
    lcd.setCursor(0,1); lcd.print("Status: DISCONNECTED");
    lcd.setCursor(0,2); lcd.print("Searching for");
    lcd.setCursor(0,3); lcd.print("available networks...");
    delay(2000);
  }
}

void displayWiFiConnecting(const char* ssidName) {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("WiFi Connecting...");
  lcd.setCursor(0,1); lcd.print("SSID:");
  lcd.print(ssidName == NULL ? "" : ssidName);
  lcd.setCursor(0,2); lcd.print("Please wait...");
  lcd.setCursor(0,3); lcd.print("Attempting to join");
  delay(1500);
}

void displayAssignmentPendingStatus() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("=== PROVISIONING ===");
  String serial = DEVICE_SERIAL.length() > 0 ? DEVICE_SERIAL : "UNREGISTERED";

  if (!wifiConnected) {
    lcd.setCursor(0,1); lcd.print("Step1: Connect WiFi");
    lcd.setCursor(0,2); lcd.print("Status: WAIT WiFi");
    lcd.setCursor(0,3); lcd.print("...");
  } else if (DEVICE_SERIAL == "" || DEVICE_SERIAL == "UNREGISTERED") {
    lcd.setCursor(0,1); lcd.print("Step2: Get Serial");
    lcd.setCursor(0,2); lcd.print("Status: WAIT server");
    lcd.setCursor(0,3); lcd.print("ChipID request...");
  } else if (!deviceAssigned) {
    lcd.setCursor(0,1); lcd.print("Serial: ");
    lcd.print(serial.substring(0, min((int)serial.length(), 12)));
    lcd.setCursor(0,2); lcd.print("Step3: WAIT admin");
    lcd.setCursor(0,3); lcd.print("Assign in manager");
  } else if (!deviceSerialPersisted) {
    lcd.setCursor(0,1); lcd.print("Step4: Save EEPROM");
    lcd.setCursor(0,2); lcd.print("Status: saving...");
    lcd.setCursor(0,3); lcd.print(serial.substring(0, min((int)serial.length(), 12)));
  } else {
    lcd.setCursor(0,1); lcd.print("Step5: Ready");
    lcd.setCursor(0,2); lcd.print("EEPROM saved");
    lcd.setCursor(0,3); lcd.print(serial.substring(0, min((int)serial.length(), 12)));
  }

  unsigned long now = millis();
  if (now - lastAssignmentStatusPrint > 10000) {
    Serial.println("[STEP 1] Connect WiFi");
    Serial.println("[STEP 2] Request serial by ESP chip ID");
    Serial.println("[STEP 3] If unassigned, wait in Device Manager (ascending NT-01, NT-02...)");
    Serial.println("[STEP 4] After admin assigns, save serial to EEPROM");
    Serial.println("[STEP 5] Start sending sensor data");
    Serial.println("[STATE] serial=" + DEVICE_SERIAL + " assigned=" + String(deviceAssigned ? "true" : "false") + " persisted=" + String(deviceSerialPersisted ? "true" : "false"));
    lastAssignmentStatusPrint = now;
  }

  delay(1500);
}

void displayLockedStatus() {
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Dear farmer");
  lcd.setCursor(0,1); lcd.print("YOUR SYSTEM LOCKED!!");
  lcd.setCursor(0,2); lcd.print("Contact TCL Team");
  lcd.setCursor(0,3); lcd.print("For imadiatly call");
  delay(1500);
}

void notifyBeforeLocking(const String& reason) {
  if (lockWarningSent) {
    return;
  }

  lockWarningSent = true;

  String alertMsg = "Dear farmer, your system is locked !!\n";
  alertMsg += "Contact TCL Team for imadiatly call Eng Theophile\n";
  alertMsg += "+250785133511 & 0725283858\n";
  alertMsg += "Reason: " + reason + "\n";
  alertMsg += "Device: " + String(DEVICE_SERIAL);

  if (wifiConnected) {
    sendSMS(PHONE_1, alertMsg);
    makeCall(PHONE_1, CALL_DURATION);
  }

}

// ====================== SETUP ======================
void setup() {
  Serial.begin(115200);
  pinMode(BUZZER_PIN, OUTPUT);
  // Ensure buzzer is silent immediately at boot
  noTone(BUZZER_PIN);
  pinMode(INDICATOR_PIN, OUTPUT);
  pinMode(PIN_LDR_DAYNIGHT, INPUT_PULLUP);
  pinMode(HEATER_RELAY, OUTPUT);
  pinMode(EXHAUST_RELAY, OUTPUT);
  pinMode(PIN_LDR, INPUT);
  setStartupAlertOutputs(false);
  setStartupPinDefaults();
  // Enable indicator updates from the very beginning so GPIO13 shows alive/blink
  indicatorMonitoringEnabled = true;
  configureWiFiClient();
  
  EEPROM.begin(EEPROM_SIZE);
  delay(100);
  ensureFirmwareEEPROMSignature();
  readDebugFlagFromEEPROM();
  Serial.println("[LIGHT] Day/night sensor on GPIO12 (digital module) — using INPUT_PULLUP, LOW=day (inverted)");
  
  lcd.begin();
  lcd.backlight();
  displayProjectName();
  
  DEVICE_SERIAL = readDeviceSerialFromEEPROM();
  DEVICE_USER_ID = readUserIdFromEEPROM();

  controllerOutputsArmed = false;
  startupBootMillis = millis();
  
  if (DEVICE_SERIAL.length() > 0) {
    Serial.print("✓ Loaded serial from EEPROM: ");
    Serial.println(DEVICE_SERIAL);
    logInfo("Loaded stored provisioning data; backend verification is required before sending data");
    deviceSerialPersisted = true;
    if (isValidAssignedUserId(DEVICE_USER_ID)) {
      deviceUserIdPersisted = true;
    } else {
      DEVICE_USER_ID = "";
    }
    // Never trust EEPROM alone for assignment. Re-verify with backend so a farmer/account change forces a fresh assignment.
    deviceAssigned = false;
    provisioningComplete = false;
    hasRequestedSerialFromBackend = true;
    lastSerialRequestTime = millis() - SERIAL_REQUEST_RETRY_INTERVAL;
    needsSerialVerification = true;
  } else {
    Serial.println("⚠ No serial in EEPROM - will request from backend on WiFi connect");
    DEVICE_SERIAL = "UNREGISTERED";
    deviceSerialPersisted = false;
    deviceAssigned = false;
    hasRequestedSerialFromBackend = false;
    provisioningComplete = false;
  }

  API_KEY = readApiKeyFromEEPROM();
  if (API_KEY.length() > 0) {
    deviceApiKeyPersisted = true;
    Serial.print("✓ Loaded API key from EEPROM: ");
    Serial.println(API_KEY.substring(0, min((int)API_KEY.length(), 8)) + "...");
  }
  
  // Configure MQ-6 for LPG detection
  MQ6.setRegressionMethod(1);
  MQ6.setA(1009.2);
  MQ6.setB(-2.35);
  MQ6.init();
  
  // Configure MQ-137 for NH3 detection
  MQ137.setRegressionMethod(1);
  MQ137.setA(102.2);
  MQ137.setB(-2.473);
  MQ137.init();
  
  dht.begin();
  initDS18B20();
  initPowerSystem();
  
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Calibrating MQ...");
  
  // Calibrate MQ-6 and MQ-137 sensors in clean air
  float calcR0_MQ6 = 0, calcR0_MQ137 = 0;
  Serial.println("\n=== CALIBRATING MQ SENSORS ===");
  Serial.println("Make sure sensors are in clean air!");
  
  for (int i = 1; i <= 25; i++) {
    MQ6.update();
    MQ137.update();
    calcR0_MQ6 += MQ6.calibrate(RatioMQ6CleanAir);
    calcR0_MQ137 += MQ137.calibrate(RatioMQ137CleanAir);
    delay(150);
    
    if (i % 5 == 0) {
      Serial.printf("Calibration progress: %d/25\n", i);
    }
  }
  
  MQ6.setR0(calcR0_MQ6 / 25);
  MQ137.setR0(calcR0_MQ137 / 25);
  
  Serial.printf("MQ-6 R0 value: %.2f\n", MQ6.getR0());
  Serial.printf("MQ-137 R0 value: %.2f\n", MQ137.getR0());
  Serial.println("Calibration complete!\n");
  
  co2Sensor.calibrate();
  
  lcd.clear();
  lcd.setCursor(0,0); lcd.print("System Ready!");
  lcd.setCursor(0,1); lcd.print("Eco-Smart Poultry");
  delay(2000);
  systemReadyBeep();
  connectToWiFi();

  if (wifiConnected && DEVICE_SERIAL != "UNREGISTERED" && DEVICE_SERIAL.length() > 0) {
    delay(1000);
    requestDeviceSerialFromBackend();
    needsSerialVerification = false;
  }
  
  if (DEVICE_SERIAL == "UNREGISTERED" || DEVICE_SERIAL.length() == 0) {
    delay(1000);
    Serial.print("[WiFi] Status before backend request: ");
    Serial.println(WiFi.status());
    requestDeviceSerialFromBackend();
  }
  
  Serial.println("\n========================================");
  Serial.println("ECO-SMART POULTRY SYSTEM v5.0 - FINAL");
  Serial.println("========================================");
  Serial.println("SENSORS:");
  Serial.println("- TEMP1: DHT22 on pin 26");
  Serial.println("- TEMP2: DS18B20 on pin 27");
  Serial.println("- LPG: MQ-6 on pin 32");
  Serial.println("- NH3: MQ-137 on pin 35");
  Serial.println("- CO2: MG811 on pin 34");
  Serial.println("- Light: LDR on pin 33");
  Serial.println("- Power: INA219 on I2C (21,22)");
  Serial.println("\nWIFI:");
  Serial.println("- Continuous scanning until connected");
  Serial.println("- Retry every 30 seconds if disconnected");
  Serial.println("\nLED INDICATOR (PIN 13):");
  Serial.println("- OFF by default (no issues)");
  Serial.println("- ON continuously when ANY issue exists");
  Serial.println("\nBUZZER:");
  Serial.println("- Beeps every 2 seconds during ANY issue");
  Serial.println("\nDISPLAY SCREENS (4):");
  Serial.println("1. Air Quality (LPG, NH3, CO2)");
  Serial.println("2. Environmental (TEMP1, TEMP2, HUM, Light)");
  Serial.println("3. Power Data (Source, Solar V/I/P)");
  Serial.println("4. System Issues (Total errors + details)");
  Serial.println("========================================\n");
  Serial.println("Serial commands: 'DEBUG ON', 'DEBUG OFF', 'DEBUG?'\n");
}

// ====================== MAIN LOOP ======================
void loop() {
  unsigned long currentMillis = millis();
  
  if (gsm.available()) {
    handleIncomingCall();
  }

  if (Serial.available()) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();
    if (cmd == "DEBUG ON") {
      writeDebugFlagToEEPROM(true);
      Serial.println("[DEBUG] Enabled (persisted)");
    } else if (cmd == "DEBUG OFF") {
      writeDebugFlagToEEPROM(false);
      Serial.println("[DEBUG] Disabled (persisted)");
    } else if (cmd == "DEBUG?" || cmd == "DEBUG STATUS") {
      Serial.print("[DEBUG] Current: "); Serial.println(debugMode ? "ON" : "OFF");
    } else if (cmd == "REQUEST SERIAL" || cmd == "REQUEST_SERIAL" || cmd == "FORCE SERIAL") {
      Serial.println("[CMD] Forcing serial request to backend...");
      String chipId = String((uint32_t)ESP.getEfuseMac(), HEX);
      Serial.print("Chip ID: "); Serial.println(chipId);
      requestDeviceSerialFromBackend();
    } else if (cmd == "WIFI RESET" || cmd == "WIFI_RETRY" || cmd == "WIFI CONNECT") {
      Serial.println("[CMD] Manual WiFi reconnect requested...");
      resetWiFiReconnectLock();
      connectToWiFi();
    }
  }
  
  handleWiFiReconnection();

  if (wifiConnected && needsSerialVerification && DEVICE_SERIAL != "UNREGISTERED" && DEVICE_SERIAL.length() > 0) {
    requestDeviceSerialFromBackend();
    needsSerialVerification = false;
  }

  if (wifiConnected && !gsmInitialized && !gsmInitAttempted) {
    lcd.clear(); lcd.setCursor(0,0); lcd.print("Step: Init GSM");
    lcd.setCursor(0,1); lcd.print("Attempting SIM800L");
    initGSM();
    gsmInitAttempted = true;
    if (gsmInitialized) {
      lcd.setCursor(0,2); lcd.print("GSM: READY");
    } else {
      lcd.setCursor(0,2); lcd.print("GSM: FAILED");
    }
    delay(400);

    if (gsmInitialized && !serverCheckDoneAfterGsm) {
      displayServerConnectionStatusAfterGsm();
      serverCheckDoneAfterGsm = true;
    }
  }
  
  if ((DEVICE_SERIAL == "" || DEVICE_SERIAL == "UNREGISTERED") && wifiConnected) {
    requestDeviceSerialFromBackend();
  }

  if (hasRequestedSerialFromBackend && !deviceAssigned && wifiConnected) {
    pollForAssignment();
  }

  if (!wifiConnected) {
    wifiWaitingAlertTick();
    const char* ssidToShow = networks[0].ssid;
    displayWiFiConnecting(ssidToShow);
    delay(500);
    return;
  }

  if (wifiConnected && refreshDeviceLockState()) {
    Serial.println("[LOCKED] Backend reports inactive account - blocking normal device activity");
  }

  if (deviceLocked) {
    setInactivePinState();
    displayLockedStatus();
    delay(500);
    return;
  }

  // If backend provisioning was revoked or serial no longer valid, poll for assignment and wait
  if (requireReProvision) {
    Serial.println("[BLOCK] Waiting for admin re-assignment of device serial...");
    // try to request serial immediately if allowed
    if (wifiConnected && (millis() - lastSerialRequestTime >= SERIAL_REQUEST_RETRY_INTERVAL)) {
      requestDeviceSerialFromBackend();
    }
    // show DB status and pause other operations
    displayDatabaseStatus();
    delay(2000);
    return;
  }

  // If we've entered blocking mode due to repeated DB failures, keep retrying sends and avoid other actions
  if (blockUntilDbConnected) {
    if (millis() - lastDbReconnectAttempt >= dbReconnectBackoffMs) {
      Serial.println("[BLOCK] Attempting reconnection to DB (blocking mode)...");
      sendSensorDataToDatabase();
      lastDbReconnectAttempt = millis();
    }
    displayDatabaseStatus();
    delay(2000);
    return;
  }

  if (currentMillis - lastMQRead >= MQ_INTERVAL) {
    MQ6.update();
    MQ137.update();
    
    // Read LPG from MQ-6 sensor
    ppmLPG = MQ6.readSensor();
    // Read NH3 from MQ-137 sensor
    ppmNH3 = MQ137.readSensor();
    // Read CO2 from MG811 sensor
    ppmCO2 = co2Sensor.read();

    // Validate MQ-6 (LPG) reading
    int rawMq6 = analogRead(PIN_MQ6);
    if (isnan(ppmLPG) || ppmLPG <= 0.0 || rawMq6 < 5 || rawMq6 > 4090) {
      // suspicious reading - mark sensor as not found
      if (mq6Found) {
        Serial.println("[SENSOR] MQ-6 (LPG) read invalid or out of range — marking mq6Found = false");
      }
      mq6Found = false;
      // Keep ppmLPG at 0 to avoid false positives in thresholds
      ppmLPG = 0.0;
    } else {
      mq6Found = true;
    }

    // Validate MQ-137 (NH3) reading
    int rawMq137 = analogRead(PIN_MQ137);
    if (isnan(ppmNH3) || ppmNH3 <= 0.0 || rawMq137 < 5 || rawMq137 > 4090) {
      if (mq137Found) {
        Serial.println("[SENSOR] MQ-137 (NH3) read invalid or out of range — marking mq137Found = false");
      }
      mq137Found = false;
      ppmNH3 = 0.0;
    } else {
      mq137Found = true;
    }

    // Validate CO2 sensor reading
    if (isnan(ppmCO2) || ppmCO2 <= 0.0) {
      if (co2Found) {
        Serial.println("[SENSOR] CO2 sensor read invalid — marking co2Found = false");
      }
      co2Found = false;
      ppmCO2 = 0;
    } else {
      co2Found = true;
    }
    // Estimate O2 from CO2 reading
    oxygenPercent = computeOxygenPercentFromCO2((float)ppmCO2);
    
    // Debug output for troubleshooting
    if (debugMode) {
      Serial.printf("Raw ADC MQ6: %d, LPG: %.2f ppm\n", rawMq6, ppmLPG);
      Serial.printf("Raw ADC MQ137: %d, NH3: %.2f ppm\n", rawMq137, ppmNH3);
      Serial.printf("CO2: %.2f ppm (valid=%d)\n", ppmCO2, co2Found ? 1 : 0);
    }
    
    lastMQRead = currentMillis;
  }
  
  if (currentMillis - lastDHTRead >= DHT_INTERVAL) {
    readDHT22();
    lastDHTRead = currentMillis;
  }
  
  readDS18B20();
  readDayNightLDR();
  readLDR();
  controlLightRelay();
  startupSensorPhaseComplete = true;
  
  if (currentMillis - lastPowerRead >= POWER_INTERVAL) {
    readPowerData();
    if (!deviceLocked) {
      controlPowerRelays();
    } else {
      digitalWrite(SOLAR_RELAY, RELAY_OFF);
      digitalWrite(GRID_RELAY, RELAY_OFF);
      solarRelayActive = false;
    }
    lastPowerRead = currentMillis;
  }
  
  if (currentMillis - lastDangerCheck >= DANGER_INTERVAL) {
    checkDangerConditions();
    handleAlertSystem();
    lastDangerCheck = currentMillis;
  }

  // Keep indicator updated during startup/sensor checks
  updateIndicatorLED();

  if (!controllerOutputsArmed) {
    // Keep startup defaults until device is fully provisioned and ready to post data
    setStartupPinDefaults();
    unsigned long sinceBoot = millis() - startupBootMillis;
    if (isReadyToPostSensorData()) {
      controllerOutputsArmed = true;
      startupArmByTimeout = false;
      Serial.println("[STARTUP] Controller outputs armed — device ready (provisioned & WiFi)");
    } else if (sinceBoot >= STARTUP_ARM_TIMEOUT_MS) {
      controllerOutputsArmed = true;
      startupArmByTimeout = true;
      Serial.println("[STARTUP] Controller outputs armed by fallback timeout");
    } else {
      unsigned long remaining = STARTUP_ARM_TIMEOUT_MS - sinceBoot;
      Serial.print("[STARTUP] Holding outputs at startup defaults until provisioning completes. Timeout in ms: ");
      Serial.println(remaining);
      delay(500);
      return;
    }
  }

  indicatorMonitoringEnabled = true;
  
  // Update indicator LED for sensor errors and supply changes
  updateIndicatorLED();
  
  if (!deviceLocked && isReadyToPostSensorData()) {
    sendSensorDataToDatabase();
  } else if (!deviceLocked && wifiConnected && DEVICE_SERIAL != "" && DEVICE_SERIAL != "UNREGISTERED") {
    Serial.println("[INFO] Waiting for admin to assign the chip ID before posting to the database...");
  }
  
  if (isCallActive) {
    displayCallStatus();
    delay(500);
  } else if (!wifiConnected) {
    displayWiFiStatus();
  } else if (deviceLocked) {
    displayLockedStatus();
  } else if (!provisioningComplete) {
    displayAssignmentPendingStatus();
  } else {
    switch(displayState) {
      case 0:
        displayAirQualityData();
        delay(LCD_DISPLAY_HOLD_MS);
        displayState = 1;
        break;
      case 1:
        displayEnvironmentalData();
        delay(LCD_DISPLAY_HOLD_MS);
        displayState = 2;
        break;
      case 2:
        displayPowerData();
        delay(LCD_DISPLAY_HOLD_MS);
        displayState = 3;
        break;
      case 3:
        displaySystemErrors();
        displayState = 4;
        break;
      case 4:
        displayDatabaseStatus();
        displayState = 0;
        break;
    }
  }
  
  checkAndUpdatePersistentIndication();
  
  if (currentMillis - lastSerialPrint >= SERIAL_INTERVAL && !isCallActive) {
    float temp = (ds18b20Found && temperatureDS18B20 != 0) ? temperatureDS18B20 : temperatureDHT;

    Serial.println("\n========================================");
    Serial.println("=== SYSTEM STATUS ===");
    Serial.printf("TEMP (DS18B20): %.1f C\n", temperatureDS18B20);
    Serial.printf("DHT HUMIDITY: %.1f%%\n", humidity);
    Serial.printf("O2 (est): %.2f %%\n", oxygenPercent);
    Serial.printf("DS18B20 Found: %s\n", ds18b20Found ? "YES" : "NO");
    Serial.printf("Day/Night (LDR2 pin12): %s (%.1f%%)\n", isDaytime ? "DAY" : "NIGHT", dayNightPercent);
    Serial.printf("Light: %.1f%%\n", lightPercent);
    Serial.printf("CO2: %d ppm (Good: <%d)\n", ppmCO2, CO2_GOOD_MAX);
    Serial.printf("NH3: %.1f ppm (Good: <%d)\n", ppmNH3, NH3_GOOD_MAX);
    Serial.printf("LPG: %.1f ppm (Good: <%d)\n", ppmLPG, LPG_GOOD_MAX);
    Serial.println("\n=== INDICATION STATUS ===");
    Serial.printf("Active Issue: %s\n", hasActiveIssue ? "YES" : "NO");
    if (hasActiveIssue) {
      Serial.printf("Issue: %s\n", activeIssueMessage.c_str());
      Serial.println("LED (PIN 13): ON (continuous)");
      Serial.println("Buzzer: OFF (LED only)");
    } else {
      Serial.println("LED (PIN 13): OFF");
      Serial.println("Buzzer: OFF");
    }
    Serial.printf("Call Active: %s\n", isCallActive ? "YES" : "NO");
    Serial.printf("Alert Stage: %d\n", alertStage);
    Serial.println("\n=== DATABASE STATUS ===");
    Serial.printf("WiFi Connected: %s\n", wifiConnected ? "YES" : "NO");
    Serial.printf("DB Send Failures: %d\n", databaseSendFailCount);
    Serial.printf("Time since last send: %ld ms\n", currentMillis - lastDatabaseSend);
    Serial.println("========================================\n");
    lastSerialPrint = currentMillis;
  }
  
  delay(50);
}