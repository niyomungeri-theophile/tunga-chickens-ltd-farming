API mapping — firmware ⇄ backend ⇄ frontend

Summary
- Firmware: `iot/firmware/esp32/eco_smart_esp32.ino`
- Backend routes: `backend/routes/sensors.js`, `backend/routes/devices.js`, `backend/routes/predictions.js`
- Frontend API client: `frontend/src/api.ts`

Firmware constants (current)
- BACKEND_URL_TUNNEL = "https://tunga-chickens-ltd-farming.onrender.com"
- BACKEND_TUNNEL_HOST = "tunga-chickens-ltd-farming.onrender.com"
- BACKEND_LAN_TARGET = 192.168.120.199
- BACKEND_LAN_PORT = 5000
- ENABLE_LAN_FALLBACK = false
- API_ENDPOINT = "/api/sensors/update-by-serial"
- SERIAL_REQUEST_ENDPOINT = "/api/devices/request-serial"
- DEVICE_STATUS_ENDPOINT = "/api/devices/status"
- Headers: `x-device-serial`, `x-api-key` (added by `postJsonRequest`)

Firmware behaviour
- Tunnel-first: attempts HTTPS POST to BACKEND_URL_TUNNEL + endpoint.
- LAN fallback: enabled as a backup path after the hosted endpoint.
- Provisioning: POST chip id -> `/api/devices/request-serial` returns `device_serial`, `user_id`, `api_key`.
- Telemetry: `createSensorPayload()` builds JSON with `serialNumber`, `temperature`, `humidity`, `light_percent`, nested `gas`, `power`, `status` objects and POSTs to `/api/sensors/update-by-serial`.
- Device status: periodic POST to `/api/devices/status` to check lock/active (expects 200 or 403).

Backend expectations (from `backend/routes/sensors.js` & `devices.js`)
- POST /api/devices/request-serial
  - Body: { esp32_chip_id }
  - Response: { success: true, device_serial, user_id?, api_key? }
- POST /api/sensors/update-by-serial
  - Headers required: `x-device-serial`, `x-api-key` (server validates device_registrations table)
  - Payload shape: matches firmware `createSensorPayload()` (see above)
  - Responses: 200 on success; 404 if serial not found; 403 if device/account locked
- POST /api/devices/status
  - Headers: same device headers
  - Body: { device_serial } (firmware sends JSON)
  - Responses: 200 = active, 403 = inactive/locked
- Predictions endpoints exist (`/api/predictions/stream` and `/api/predictions/control/:deviceId`) and also expect device headers when called by devices.

Frontend usage (from `frontend/src/api.ts`)
- `API_BASE_URL = import.meta.env.VITE_API_URL || '/api'` — frontend calls backend at `${API_BASE_URL}/...`.
- Dashboard and admin UI call `/sensors`, `/devices/my-device`, `/sensors/update` (admin), `/predictions/*`, etc.
- Vercel-hosted frontend must be allowed in backend CORS (see `backend/server.js` allowlist).

Recommendations / Next steps
1) TLS: `WiFiClientSecure.setInsecure()` is used currently (no cert verification). For production, prefer certificate pinning or valid CA verification; discuss if you want me to enable cert verification (you must provide CA or pin).
2) Headers/payload: keep `x-device-serial` and `x-api-key` — backend enforces these. Ensure device registrations table has matching serials and API keys for deployed devices.
3) Backend CORS: add your Vercel deployed domain (e.g. `https://<your-app>.vercel.app`) to `backend/server.js` allowlist so frontend UI can call the API.
4) Repo reorganization: you requested separating frontend and backend folders — the repo already has top-level `frontend/` and `backend/`. If you want a clean split for deployment, I can move any remaining server-or-client files currently outside these folders into their respective folder (confirm which files to move).

Files I inspected
- `iot/firmware/esp32/eco_smart_esp32.ino`
- `backend/server.js`
- `backend/routes/sensors.js`
- `backend/routes/devices.js`
- `backend/routes/predictions.js`
- `frontend/src/api.ts`

What I can do now
- Optionally enable cert verification/pinning (needs cert or pin).  
- Produce a more formal API reference (endpoint-by-endpoint with sample requests/responses).  
- Move files to complete the frontend/backend separation — tell me which files to move.

Next action required from you
- Confirm whether you want cert verification/pinning enabled.
- Tell me if you want me to reorganize repo files now.

