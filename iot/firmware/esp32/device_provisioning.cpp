#include <ArduinoJson.h>
#include "device_provisioning.h"

const unsigned long SERIAL_REQUEST_RETRY_INTERVAL = 30000;
const unsigned long DEVICE_STATUS_RETRY_INTERVAL = 30000;

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

void clearAndPrepareForNewAssignment(const String& receivedSerial, const String& receivedUserId, const String& receivedApiKey) {
  bool serialChanged = DEVICE_SERIAL != receivedSerial;
  bool userChanged = isValidAssignedUserId(DEVICE_USER_ID) && DEVICE_USER_ID != receivedUserId;

  if (serialChanged || userChanged) {
    Serial.println("[EEPROM] Assignment changed - clearing old provisioning data before saving new values");
    clearProvisioningEEPROM();
    storeFirmwareSignatureToEEPROM(String(__DATE__) + " " + String(__TIME__));
  }

  DEVICE_SERIAL = receivedSerial;
  if (!deviceSerialPersisted) {
    storeDeviceSerialToEEPROM(DEVICE_SERIAL);
    deviceSerialPersisted = true;
    logInfo(String("Serial synced to backend value: ") + DEVICE_SERIAL);
  }

  if (receivedApiKey.length() > 0) {
    API_KEY = receivedApiKey;
  }

  if (isValidAssignedUserId(receivedUserId)) {
    DEVICE_USER_ID = receivedUserId;
    deviceAssigned = true;
    provisioningComplete = true;
    needsSerialVerification = false;

    if (!deviceApiKeyPersisted && API_KEY.length() > 0) {
      storeApiKeyToEEPROM(API_KEY);
      deviceApiKeyPersisted = true;
    }

    if (!deviceUserIdPersisted) {
      storeUserIdToEEPROM(DEVICE_USER_ID);
      deviceUserIdPersisted = true;
    }

    shortBeep(1000, 200);
    logInfo("Provisioning complete: assignment confirmed and EEPROM saved");
  }
}

void requestDeviceSerialFromBackend() {
  if (!wifiConnected) {
    logWarn("WiFi not connected - cannot request serial");
    return;
  }

  if (lastSerialRequestTime > 0 && (millis() - lastSerialRequestTime < SERIAL_REQUEST_RETRY_INTERVAL)) {
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

  String response;
  String tunnelUrl = String(BACKEND_URL_TUNNEL) + String(SERIAL_REQUEST_ENDPOINT);
  int tunnelCode = postJsonRequest(tunnelUrl, payload, response);

  if (tunnelCode == 200) {
    DynamicJsonDocument tunnelDoc(512);
    DeserializationError tunnelError = deserializeJson(tunnelDoc, response);
    if (!tunnelError && tunnelDoc["success"].as<bool>()) {
      String receivedSerial = tunnelDoc["device_serial"].as<String>();
      String receivedUserId = tunnelDoc["user_id"].as<String>();
      String receivedApiKey = tunnelDoc["api_key"].as<String>();
      bool hasValidUserId = isValidAssignedUserId(receivedUserId);
      if (receivedSerial.length() > 0) {
        if (hasValidUserId) {
          clearAndPrepareForNewAssignment(receivedSerial, receivedUserId, receivedApiKey);
        } else {
          DEVICE_SERIAL = receivedSerial;
          API_KEY = receivedApiKey;
          deviceAssigned = false;
          provisioningComplete = false;
          deviceSerialPersisted = false;
          deviceApiKeyPersisted = false;
          deviceUserIdPersisted = false;
          logWarn("Device serial obtained but not yet assigned to a farmer.");
          logInfo("Waiting for admin assignment before persisting and sending telemetry.");
        }
        lastSerialRequestTime = millis();
        return;
      }
    }
  }

  const IPAddress targets[] = { BACKEND_LAN_TARGET };
  const uint16_t targetPorts[] = { BACKEND_LAN_PORT };
  const size_t targetCount = sizeof(targets) / sizeof(targets[0]);
  bool success = false;

  if (!ENABLE_LAN_FALLBACK) {
    logInfo("LAN fallback disabled. Using tunnel only.");
  }

  for (size_t i = 0; i < targetCount; i++) {
    if (!ENABLE_LAN_FALLBACK) {
      break;
    }

    if (!isSameSubnet(WiFi.localIP(), targets[i], WiFi.subnetMask())) {
      logWarn("Subnet mismatch detected; trying route anyway");
    }

    if (!canConnectToBackend(targets[i], targetPorts[i])) {
      Serial.println("[WARN] Raw TCP connection failed before HTTP request");
      continue;
    }

    String url = buildBackendUrl(targets[i], targetPorts[i], SERIAL_REQUEST_ENDPOINT);
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
            DEVICE_SERIAL = receivedSerial;
            API_KEY = receivedApiKey;
            deviceAssigned = false;
            provisioningComplete = false;
            deviceSerialPersisted = false;
            deviceApiKeyPersisted = false;
            deviceUserIdPersisted = false;
            logWarn("Device serial obtained but not yet assigned to a farmer.");
            logInfo("Waiting for admin assignment before persisting and sending telemetry.");
          }
          hasRequestedSerialFromBackend = true;
          if (hasValidUserId) {
            if (wifiConnected) {
              Serial.println("[INFO] Attempting immediate data send after assignment...");
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
    Serial.println("[ERROR] Connection failed (tunnel unreachable; LAN fallback unavailable/disabled)");
    hasRequestedSerialFromBackend = false;
  }

  lastSerialRequestTime = millis();
}

bool refreshDeviceLockState() {
  if (!wifiConnected) {
    return deviceLocked;
  }

  if (DEVICE_SERIAL == "" || DEVICE_SERIAL == "UNREGISTERED" || API_KEY.length() == 0) {
    return deviceLocked;
  }

  if (!deviceAssigned || !provisioningComplete) {
    Serial.println("[INFO] Device not fully assigned yet - skipping lock state refresh");
    return deviceLocked;
  }

  if (millis() - lastDeviceStatusCheck < DEVICE_STATUS_RETRY_INTERVAL) {
    return deviceLocked;
  }

  lastDeviceStatusCheck = millis();
  StaticJsonDocument<256> doc;
  doc["device_serial"] = DEVICE_SERIAL;
  String payload;
  serializeJson(doc, payload);

  String response;
  String tunnelUrl = String(BACKEND_URL_TUNNEL) + String(DEVICE_CHECK_STATUS_ENDPOINT);
  int tunnelCode = postJsonRequest(tunnelUrl, payload, response);
  if (tunnelCode == 200) {
    DynamicJsonDocument statusDoc(256);
    DeserializationError statusError = deserializeJson(statusDoc, response);
    if (!statusError && statusDoc["success"].as<bool>()) {
      bool useEeprom = statusDoc["use_eeprom"].as<bool>();
      String registrationStatus = statusDoc["registration_status"].as<String>();

      if (useEeprom) {
        setDeviceOperationalState(true);
        return false;
      }

      Serial.print("[SAFE MODE] Backend reports non-active registration status: ");
      Serial.println(registrationStatus);
      notifyBeforeLocking("Device not fully registered - entering safe mode");
      setDeviceOperationalState(false);
      blockUntilDbConnected = true;
      return true;
    }
  }

  if (tunnelCode == 403) {
    notifyBeforeLocking("Account inactive - device locked");
    setDeviceOperationalState(false);
    blockUntilDbConnected = true;
    return true;
  }

  if (tunnelCode == 404) {
    Serial.println("[DELETED] Device registration removed from backend - clearing EEPROM and reprovisioning");
    clearProvisioningEEPROM();
    provisioningComplete = false;
    deviceAssigned = false;
    needsSerialVerification = true;
    requireReProvision = true;
    blockUntilDbConnected = true;
    return true;
  }

  const IPAddress targets[] = { BACKEND_LAN_TARGET };
  const uint16_t targetPorts[] = { BACKEND_LAN_PORT };

  for (size_t i = 0; i < sizeof(targets) / sizeof(targets[0]); i++) {
    if (!ENABLE_LAN_FALLBACK) break;

    if (!canConnectToBackend(targets[i], targetPorts[i])) {
      continue;
    }

    String fullUrl = buildBackendUrl(targets[i], targetPorts[i], DEVICE_CHECK_STATUS_ENDPOINT);
    int httpCode = postJsonRequest(fullUrl, payload, response);
    if (httpCode == 200) {
      DynamicJsonDocument statusDoc(256);
      DeserializationError statusError = deserializeJson(statusDoc, response);
      if (!statusError && statusDoc["success"].as<bool>()) {
        bool useEeprom = statusDoc["use_eeprom"].as<bool>();
        String registrationStatus = statusDoc["registration_status"].as<String>();

        if (useEeprom) {
          setDeviceOperationalState(true);
          return false;
        }

        Serial.print("[SAFE MODE] Backend reports non-active registration status: ");
        Serial.println(registrationStatus);
        notifyBeforeLocking("Device not fully registered - entering safe mode");
        setDeviceOperationalState(false);
        blockUntilDbConnected = true;
        return true;
      }
    }

    if (httpCode == 403) {
      notifyBeforeLocking("Account inactive - device locked");
      setDeviceOperationalState(false);
      blockUntilDbConnected = true;
      return true;
    }

    if (httpCode == 404) {
      Serial.println("[DELETED] Device registration removed from backend - clearing EEPROM and reprovisioning");
      clearProvisioningEEPROM();
      provisioningComplete = false;
      deviceAssigned = false;
      needsSerialVerification = true;
      requireReProvision = true;
      blockUntilDbConnected = true;
      return true;
    }
  }

  return deviceLocked;
}

bool refreshAssignmentStateFromBackend() {
  if (!wifiConnected) return false;
  if (DEVICE_SERIAL == "" || DEVICE_SERIAL == "UNREGISTERED" || API_KEY.length() == 0) return false;
  if (isValidAssignedUserId(DEVICE_USER_ID)) return false;
  if (millis() - lastSerialRequestTime < SERIAL_REQUEST_RETRY_INTERVAL) return false;

  Serial.println("[POLL] Checking backend assignment state for existing serial: " + DEVICE_SERIAL);

  StaticJsonDocument<256> doc;
  doc["device_serial"] = DEVICE_SERIAL;
  String payload;
  serializeJson(doc, payload);

  String response;
  String tunnelUrl = String(BACKEND_URL_TUNNEL) + String(DEVICE_CHECK_STATUS_ENDPOINT);
  int tunnelCode = postJsonRequest(tunnelUrl, payload, response);
  if (tunnelCode == 200) {
    DynamicJsonDocument statusDoc(256);
    DeserializationError statusError = deserializeJson(statusDoc, response);
    if (!statusError && statusDoc["success"].as<bool>()) {
      bool useEeprom = statusDoc["use_eeprom"].as<bool>();
      String receivedUserId = statusDoc["user_id"].as<String>();
      String registrationStatus = statusDoc["registration_status"].as<String>();

      if (useEeprom && isValidAssignedUserId(receivedUserId)) {
        DEVICE_USER_ID = receivedUserId;
        deviceAssigned = true;
        provisioningComplete = true;
        if (!deviceUserIdPersisted) {
          storeUserIdToEEPROM(DEVICE_USER_ID);
          deviceUserIdPersisted = true;
        }
        logInfo("Device assignment recovered from backend and persisted");
        setDeviceOperationalState(true);
        lastSerialRequestTime = millis();
        return true;
      }

      if (!useEeprom) {
        Serial.print("[SAFE MODE] Backend reports non-active registration status: ");
        Serial.println(registrationStatus);
        notifyBeforeLocking("Device not fully registered - entering safe mode");
        setDeviceOperationalState(false);
        blockUntilDbConnected = true;
        lastSerialRequestTime = millis();
        return false;
      }
    }
  }

  if (tunnelCode == 403 || tunnelCode == 404) {
    if (tunnelCode == 403) {
      notifyBeforeLocking("Account inactive - device locked");
    } else {
      Serial.println("[DELETED] Device registration removed from backend - clearing EEPROM and reprovisioning");
      clearProvisioningEEPROM();
      needsSerialVerification = true;
      requireReProvision = true;
    }
    setDeviceOperationalState(false);
    blockUntilDbConnected = true;
    lastSerialRequestTime = millis();
    return false;
  }

  return false;
}

void pollForAssignment() {
  if (!wifiConnected) return;
  if (deviceAssigned) return;
  if (millis() - lastSerialRequestTime < SERIAL_REQUEST_RETRY_INTERVAL) return;

  Serial.println("[POLL] Checking assignment status for serial: " + DEVICE_SERIAL);

  bool recovered = refreshAssignmentStateFromBackend();
  if (!recovered) {
    requestDeviceSerialFromBackend();
  }

  if (!deviceAssigned) {
    Serial.println("[POLL] Still unassigned (or backend unreachable). Waiting...");
  }
}
