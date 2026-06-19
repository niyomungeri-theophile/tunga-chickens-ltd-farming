# Server Connection Retry + Farmer Notification Implementation

## Overview
Implemented robust backend server connectivity retry logic with farmer notification after repeated failures.

**Behavior**: After GSM initialization, ESP32 attempts to connect to the backend server up to 3 times. If all 3 attempts fail, the system waits 1 minute then sends the farmer an SMS and makes a call explaining the situation. Meanwhile, the device continues normal operation offline.

---

## Changes Made

### 1. New Global Variables (Lines 356-365)
```cpp
bool serverCheckDoneAfterGsm = false;
bool lastDatabaseSendSuccess = false;
bool databaseConnectionAlertSent = false;
bool wifiConnectionAlertSent = false;
bool wifiReconnectLocked = false;
bool serverConnectionAlertSent = false;

// Server Connection Retry & Notification State
int serverConnectionRetryCount = 0;                          // NEW: tracks current retry attempt (0-3)
const int SERVER_CONNECTION_MAX_RETRIES = 3;               // NEW: maximum retries before notifying
unsigned long serverConnectionFirstFailureTime = 0;        // NEW: timestamp of first failure
const unsigned long SERVER_CONNECTION_NOTIFY_DELAY = 60000; // NEW: 1 minute delay before notifying
```

**Purpose**: 
- `serverConnectionRetryCount` increments on each failed connection attempt
- `serverConnectionFirstFailureTime` records milliseconds when first failure occurred
- `SERVER_CONNECTION_NOTIFY_DELAY` enforces 1-minute wait before SMS/call alert

---

### 2. Redesigned `displayServerConnectionStatusAfterGsm()` (Lines 698-761)

**Old Behavior**: Called once after GSM init. If server unavailable, sent SMS immediately.

**New Behavior**: Implements retry loop with delay before notification.

```cpp
void displayServerConnectionStatusAfterGsm() {
  bool serverConnected = checkServerConnectivityAfterGsm();
  String deviceSerialText = (DEVICE_SERIAL.length() > 0) ? DEVICE_SERIAL : "UNREGISTERED";

  lcd.clear();
  lcd.setCursor(0,0); lcd.print("Connecting to server !!!!!");
  
  if (serverConnected) {
    // ✓ Connection succeeded on this attempt
    lcd.setCursor(0,1); lcd.print("Server: CONNECTED");
    lcd.setCursor(0,2); lcd.print("Provisioning: READY");
    lcd.setCursor(0,3); lcd.print(deviceSerialText.substring(0, 20));
    Serial.println("[SERVER] Connected after GSM ready");
    
    // Reset retry counters on success
    serverConnectionRetryCount = 0;
    serverConnectionFirstFailureTime = 0;
    serverConnectionAlertSent = false;
    
    smartDelay(900);
    return;
  }

  // ✗ Connection failed — implement retry logic with 1-minute delay before notifying
  serverConnectionRetryCount++;
  
  if (serverConnectionRetryCount == 1) {
    // First failure: record the time
    serverConnectionFirstFailureTime = millis();
    Serial.printf("[SERVER] First connection failure. Will retry %d more times over ~1 minute.\n", 
                  SERVER_CONNECTION_MAX_RETRIES - 1);
  }

  if (serverConnectionRetryCount <= SERVER_CONNECTION_MAX_RETRIES) {
    // Still within retry window: show status, do not notify yet
    lcd.setCursor(0,1); lcd.print("Server: FAILED");
    lcd.setCursor(0,2); lcd.print("Retrying...");
    lcd.setCursor(0,3); lcd.print(String("Attempt ") + serverConnectionRetryCount + "/" + SERVER_CONNECTION_MAX_RETRIES);
    Serial.printf("[SERVER] Retry attempt %d/%d\n", serverConnectionRetryCount, SERVER_CONNECTION_MAX_RETRIES);
    smartDelay(1400);
    return;
  }

  // Retries exhausted: check if 1 minute has passed and notify farmer once
  unsigned long timeSinceFirstFailure = millis() - serverConnectionFirstFailureTime;
  
  if (timeSinceFirstFailure >= SERVER_CONNECTION_NOTIFY_DELAY && !serverConnectionAlertSent) {
    // ⚠️ All retries failed AND 1 minute has passed: notify farmer
    lcd.setCursor(0,1); lcd.print("Server: FAILED");
    lcd.setCursor(0,2); lcd.print("Device Serial:");
    lcd.setCursor(0,3); lcd.print(deviceSerialText.substring(0, 20));
    Serial.println("[SERVER] Failed after max retries and 1-minute delay — sending farmer notification");
    notifyServerConnectionIssueOnce();
    smartDelay(1400);
  } else if (timeSinceFirstFailure < SERVER_CONNECTION_NOTIFY_DELAY) {
    // Waiting for 1-minute delay to pass
    unsigned long remainingMs = SERVER_CONNECTION_NOTIFY_DELAY - timeSinceFirstFailure;
    unsigned long remainingSec = remainingMs / 1000;
    lcd.setCursor(0,1); lcd.print("Server: FAILED");
    lcd.setCursor(0,2); lcd.print("Waiting to notify...");
    lcd.setCursor(0,3); lcd.print(String("Notify in ") + remainingSec + "s");
    Serial.printf("[SERVER] Waiting to notify farmer: %lu seconds remaining\n", remainingSec);
    smartDelay(1400);
  } else {
    // Already notified, just show status
    lcd.setCursor(0,1); lcd.print("Server: FAILED");
    lcd.setCursor(0,2); lcd.print("Farmer notified");
    lcd.setCursor(0,3); lcd.print("Check network");
    smartDelay(1400);
  }
}
```

**State Machine**:
1. **Success**: Reset all counters, display "CONNECTED", return
2. **Failure (Attempt 1)**: Record timestamp, increment counter, show "Attempt 1/3"
3. **Failure (Attempts 2-3)**: Show "Retrying...", "Attempt X/3"
4. **After 3 attempts**: Countdown "Notify in Xs" (remaining seconds)
5. **After 1-minute passes**: Call `notifyServerConnectionIssueOnce()`, show "Farmer notified"

---

### 3. Enhanced `notifyServerConnectionIssueOnce()` (Lines 2071-2095)

**Old Message**: Generic "cannot connect to server"

**New Message**: Specific retry explanation for farmer clarity.

```cpp
void notifyServerConnectionIssueOnce() {
  if (serverConnectionAlertSent) {
    return;  // Already notified, don't repeat
  }

  if (!gsmInitialized) {
    Serial.println("[SERVER ALERT] GSM not ready; cannot place one-time server-failure call/SMS");
    return;
  }

  serverConnectionAlertSent = true;

  String deviceSerialText = (DEVICE_SERIAL.length() > 0) ? DEVICE_SERIAL : "UNREGISTERED";
  String alertMsg = "Dear farmer,\n\n";
  alertMsg += "The system is connected to WiFi but cannot connect to the backend server after ";
  alertMsg += String(SERVER_CONNECTION_MAX_RETRIES) + " attempts over 1 minute.\n\n";
  alertMsg += "Please check WiFi and contact Tunga Chicks Ltd Team for support.\n\n";
  alertMsg += "=== PROVISIONING STATUS ===\n";
  alertMsg += "Device Serial: " + deviceSerialText + "\n";
  alertMsg += "WiFi: CONNECTED\n";
  alertMsg += "Server: FAILED (retried " + String(SERVER_CONNECTION_MAX_RETRIES) + " times)\n";
  alertMsg += "Action: Contact support";

  sendSMS(PHONE_1, alertMsg);
  makeCall(PHONE_1, CALL_DURATION);
}
```

**Key Messages**:
- Mentions "3 attempts over 1 minute" so farmer knows the system tried hard
- Confirms WiFi is working (so farmer doesn't blame their network)
- Clear action: "Contact support"
- Includes device serial for support team reference

---

### 4. Main Loop Server Check Redesign (Lines 4490-4513)

**Old Code** (single call):
```cpp
if (gsmInitialized && !serverCheckDoneAfterGsm) {
  displayServerConnectionStatusAfterGsm();
  serverCheckDoneAfterGsm = true;
}
```

**New Code** (retry loop):
```cpp
if (!gsmInitialized && !gsmInitAttempted) {
  // ... GSM init code ...
  
  if (gsmInitialized && !serverCheckDoneAfterGsm) {
    // Begin server connection check with retries
    serverConnectionRetryCount = 0;
    serverConnectionFirstFailureTime = 0;
  }
}

// Call server check repeatedly during retry window until success or notification
if (gsmInitialized && !serverCheckDoneAfterGsm && wifiConnected) {
  bool serverConnected = checkServerConnectivityAfterGsm();
  
  if (serverConnected) {
    // Success on any attempt
    displayServerConnectionStatusAfterGsm();
    serverCheckDoneAfterGsm = true;
  } else {
    // Show retry progress
    displayServerConnectionStatusAfterGsm();
    
    // Once all retries exhausted and notification sent, mark as done to move on
    if (serverConnectionRetryCount > SERVER_CONNECTION_MAX_RETRIES && 
        serverConnectionAlertSent) {
      serverCheckDoneAfterGsm = true;
    }
  }
}
```

**Key Changes**:
1. **Initialize** on GSM init (reset counters, don't block)
2. **Retry Loop**: Called on each main loop cycle until success or done
3. **Exit Condition**: `serverCheckDoneAfterGsm = true` only when:
   - Connection succeeds, OR
   - (Retries exhausted AND farmer notification sent)
4. This allows the device to continue normal operation even if server is unreachable

---

## Timeline Example: Server Connection Failure

| Time | Event | LCD Display | Serial Log | SMS/Call |
|------|-------|-------------|-----------|----------|
| T=0ms | GSM ready, init retry | Initialize | `[SERVER] First connection failure...` | — |
| T≈500ms | Check server | "Attempt 1/3" | `[SERVER] Retry attempt 1/3` | — |
| T≈2000ms | Check server | "Attempt 2/3" | `[SERVER] Retry attempt 2/3` | — |
| T≈3500ms | Check server | "Attempt 3/3" | `[SERVER] Retry attempt 3/3` | — |
| T≈5000ms | Wait for 1-min | "Notify in 58s" | `[SERVER] Waiting to notify: 58s` | — |
| T≈30000ms | Waiting... | "Notify in 33s" | `[SERVER] Waiting to notify: 33s` | — |
| T≈65000ms | Delay expired | "Server: FAILED" | `[SERVER] Failed after max retries...` | ✓ SMS+Call |
| T≈66000ms | After notify | "Farmer notified" | Message sent | — |
| T≈66500ms+ | Done, continue | [Normal screens] | Proceeds to provisioning | — |

---

## Timeline Example: Server Connection Success

| Time | Event | LCD Display | Serial Log |
|------|-------|-------------|-----------|
| T=0ms | GSM ready, init retry | Initialize | `[SERVER] First connection failure...` |
| T≈500ms | Check server | "Attempt 1/3" | `[SERVER] Retry attempt 1/3` |
| T≈1000ms | Connection succeeds! | "Server: CONNECTED" | `[SERVER] Connected after GSM ready` |
| T≈2000ms+ | Done, proceed | Provisioning: READY | Device proceeds normally |

---

## Key Design Decisions

1. **Retry on Every Main Loop Cycle**
   - Don't block waiting for server
   - Device remains responsive for button input, sensor reads, control
   - Each loop iteration retries; gives connection multiple chances

2. **1-Minute Delay Before Notifying**
   - Allows time for network to stabilize
   - Reduces false alarms during WiFi reconnection
   - User hears SMS only if problem persists

3. **Single Notification**
   - `serverConnectionAlertSent` flag ensures SMS/call sent only once
   - Prevents spam if server stays down for extended time
   - Farmer knows to check and fix the issue

4. **Reset on Success**
   - Counters and timestamps zeroed immediately on connection
   - If server recovers mid-retry, system switches to success path
   - Clean slate for next startup cycle

5. **Continue Offline Operation**
   - System doesn't block when server unavailable
   - Temperature control, monitoring, local alerts all work
   - Only cloud sync and provisioning blocked

---

## Testing Checklist

- [ ] Test with server running: confirm "Server: CONNECTED" on first attempt
- [ ] Test with server down:
  - [ ] Confirm "Attempt 1/3", "Attempt 2/3", "Attempt 3/3" appears
  - [ ] Confirm LCD shows "Notify in Xs" countdown starting at ~60s
  - [ ] Confirm SMS+call received after 1 minute
  - [ ] Confirm SMS mentions "3 attempts over 1 minute"
  - [ ] Confirm device continues to operate (sensors, controls) while waiting
- [ ] Test server recovery mid-retry:
  - [ ] Bring down server
  - [ ] See retry 1-3 on LCD
  - [ ] During waiting period, bring server back up
  - [ ] On next main loop, confirm connection succeeds and SMS is NOT sent
- [ ] Test GSM unavailable:
  - [ ] Disable or remove SIM800L
  - [ ] Confirm system still retries (just doesn't send SMS)
  - [ ] Confirm no crash or freeze

---

## Dependencies
- `checkServerConnectivityAfterGsm()`: core connectivity test
- `notifyServerConnectionIssueOnce()`: farmer SMS/call notification
- `sendSMS()`, `makeCall()`: GSM message transmission
- Main loop `loop()` function

