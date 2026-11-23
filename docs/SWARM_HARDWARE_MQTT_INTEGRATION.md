# SWARM Hardware → MQTT → IoT Integration Specification

**Audience:** ESP32 / IoT gateway firmware engineers  
**Status:** Matches the current SWARM repository implementation (inspected source)  
**Companion:** [SWARM_MQTT_QUICK_REFERENCE.md](./SWARM_MQTT_QUICK_REFERENCE.md)

This document describes how field hardware publishes telemetry into SWARM. It is based on the live code paths below—not on aspirational architecture notes.

| Area | Primary sources |
|------|-----------------|
| MQTT subscribe | `backend/.../config/MqttConfig.java`, `application.yml` `mqtt.*` |
| MQTT parse / auth | `backend/.../mqtt/MqttTelemetryHandler.java` |
| Ingest pipeline | `backend/.../service/TelemetryIngestService.java` |
| Device + channel provision | `backend/.../service/DeviceProvisioningService.java` |
| Hardware JSON export | `HardwareProvisioningResponse` + `DeviceProvisioningService.toProvisioning` |
| HTTP device auth (optional path) | `backend/.../security/DeviceAuthenticationFilter.java` |
| Broker | `docker-compose.yml` service `mosquitto`, `docker/mosquitto/mosquitto.conf` |
| Core Timescale tables | `database/swarm-core-init.sql` |
| Channels / registry | Flyway `V1__swarm_app_schema.sql` (`device_registry`, `device_channels`, `sensor_nodes`) |

**Do not invent identifiers.** Tenant ID, plant ID, device UID, MQTT topic, and channel IDs must come from SWARM provisioning export.

---

## 1. Architecture

```
ESP32 / IoT Gateway
        │  MQTT publish (JSON)
        ▼
 Eclipse Mosquitto (Compose service `mosquitto`)
        │  backend subscribes (when MQTT_ENABLED=true)
        ▼
 Spring Boot SWARM backend
   MqttConfig → MqttTelemetryHandler → TelemetryIngestService
        │  validate device, topic, channels, timestamps, duplicates
        ▼
 PostgreSQL 16 + TimescaleDB
   sensor_messages (1 row) + sensor_readings (N rows)
        │
        ▼
 SWARM Dashboard / Analytics / NOVA (read APIs)
```

### Hard rule for hardware

- Hardware talks to the **MQTT broker** only.
- Hardware **never** connects to PostgreSQL / TimescaleDB.
- Hardware **does not** invent `tenantId`, `plantId`, `deviceUid`, or `channelId`.
- SWARM Control Center provisions the device and exports the exact topic and channel map.

Optional alternate path (not the primary MQTT path): HTTP ingest under `/api/iot/**` with headers `X-SWARM-Device-Id` / `X-SWARM-Device-Secret`. This document focuses on MQTT.

---

## 2. MQTT topic (implemented)

### Pattern

Verified regex in `MqttTelemetryHandler.SWARM_V1_TELEMETRY`:

```text
swarm/v1/{tenantId}/{plantId}/{deviceUid}/telemetry
```

Backend subscription pattern (default):

```text
swarm/v1/+/+/+/telemetry
```

Source: `application.yml` → `mqtt.swarm-topic`, `MqttConfig`.

### Segment meanings

| Segment | Meaning | Source of truth |
|---------|---------|-----------------|
| `swarm` | Protocol namespace | Fixed |
| `v1` | Protocol version | Fixed (`DeviceProvisioningService` uses `"swarm/v1"`) |
| `{tenantId}` | Tenant UUID (company id) | Plant’s company / `devices.tenant_id` |
| `{plantId}` | Numeric plant primary key | `plants.plant_id` / `device_registry.plant_id` |
| `{deviceUid}` | Stable device UID string | `devices.device_id` (JPA `Device.deviceUid`) |
| `telemetry` | Message kind | Fixed |

### Realistic example (**illustrative IDs**)

```text
swarm/v1/01a57a5b-0179-4337-8dca-7022a0d4b1ed/2/SWARM-HUB-C4A43B7D/telemetry
```

Use the **exact** `mqttTelemetryTopic` string from the provisioning export. Do not reassemble from guessed parts.

### How IDs are assigned

1. **Tenant** — Control Center creates a company (tenant). Plant must be assigned to that company before device registration (`DeviceProvisioningService.register` rejects plants with no company).
2. **Plant** — Created/assigned in Control Center; numeric `plantId`.
3. **Device UID** — Either supplied at register time, or auto-generated as `SWARM-HUB-{SUFFIX}` (`DeviceSecretHasher.generateDeviceUid` / `DeviceRegistryService.allocateDeviceUid`).
4. **Topic** — Built in `toProvisioning` as:

```text
swarm/v1/{tenantId}/{plantId}/{deviceUid}/telemetry
```

### Topic validation (backend)

On each MQTT message, after resolving the registered device, SWARM checks (`validateTopicMatchesDevice`):

- Topic `plantId` equals registered device plant.
- Topic `deviceUid` equals registered device UID (case-insensitive).
- If topic tenant is a UUID (and not `_`), it must equal registered `tenantId`.

Mismatch → unauthorized; rejection may be recorded in `ingest_rejected`.

### Legacy topic (compatibility only)

SWARM also subscribes to `biopower/sensors/#` for older firmware. New ESP32 / gateway work **must** use `swarm/v1/.../telemetry`.

---

## 3. JSON payload (schemaVersion 1.0)

### Expected V1 body

Verified by `MqttTelemetryHandler.ingestV1` and the provisioning `payloadExample`.

```json
{
  "schemaVersion": "1.0",
  "deviceId": "SWARM-HUB-C4A43B7D",
  "messageId": "unique-message-id-000001",
  "timestamp": "2026-11-18T10:30:00Z",
  "readings": [
    {
      "channelId": "1",
      "value": 42.5
    },
    {
      "channelId": "2",
      "value": 28.7
    }
  ]
}
```

`channelId` may be a JSON string (`"1"`) or number (`1`); the parser uses `asText()`. Prefer strings to match the DB `device_channels.channel_id` text type.

### Field reference

| Field | Type | Required | Backend behaviour |
|-------|------|----------|-------------------|
| `schemaVersion` | string | Recommended | Defaults to `"1.0"` if omitted. **Not** a DB column; may appear only inside message excerpt. V1 path is selected by presence of `readings` array, not by this string alone. |
| `deviceId` | string | Required for MQTT identity | Must match registered UID / topic device segment. Compared case-insensitively to authenticated device. |
| `messageId` | string | Strongly recommended | Trimmed; max **128** chars. Dedup key in `sensor_messages.message_id`. If blank → synthetic `auto-{devicePk}-{second}`. |
| `timestamp` | string (ISO-8601) | Recommended | Parsed as Instant (`…Z` / offset) or `LocalDateTime`. Rejected if &gt; **10 minutes** in the future or &gt; **30 days** in the past vs receive time. If omitted → server time, quality `CLOCK_INFERRED`. |
| `readings` | array | **Required** for v1 | Max **64** points (`SWARM_IOT_MAX_READINGS`, hard cap 64). Empty → reject. |
| `readings[].channelId` | string/number | Required* | Must exist on this device in `device_channels`, be `active`, and map to a `sensor_nodes` row on the **same plant**. *Alternatively `nodeId` / `sensorType` for legacy-style points; new firmware should send `channelId`. |
| `readings[].value` | number | Required | Raw engineering input. Transformed: `engineering = slope * value + intercept` from channel. Null/NaN/Inf skipped with warning. Hard range breach → reject. Soft range → store with quality `BAD`. |
| `readings[].nodeId` | number | Optional / legacy | Resolves channel by node mapping. |
| `readings[].sensorType` | string enum | Optional | If present must match channel `measurement_type`. |
| `chipId` | string | Optional | If present must match registered chip when device has one. |
| `plantId` | number | Optional | If present must match authenticated device plant. Prefer topic plant. |

**Units and measurement types are not taken from the payload.** They come from `device_channels.engineering_unit` and `measurement_type`.

### Examples

#### Single reading

```json
{
  "schemaVersion": "1.0",
  "deviceId": "SWARM-HUB-C4A43B7D",
  "messageId": "msg-20261118-0001",
  "timestamp": "2026-11-18T10:30:00Z",
  "readings": [
    { "channelId": "1", "value": 38.5 }
  ]
}
```

#### Temperature + humidity (two channels on one gateway)

```json
{
  "schemaVersion": "1.0",
  "deviceId": "SWARM-HUB-C4A43B7D",
  "messageId": "msg-20261118-0002",
  "timestamp": "2026-11-18T10:30:05Z",
  "readings": [
    { "channelId": "1", "value": 38.5 },
    { "channelId": "2", "value": 62.0 }
  ]
}
```

Channel `1` / `2` must already be provisioned (e.g. `TEMPERATURE` / `HUMIDITY`). Values above are **illustrative**.

#### Multi-channel gateway

```json
{
  "schemaVersion": "1.0",
  "deviceId": "SWARM-HUB-C4A43B7D",
  "messageId": "msg-20261118-0003",
  "timestamp": "2026-11-18T10:30:10Z",
  "readings": [
    { "channelId": "1", "value": 7.1 },
    { "channelId": "2", "value": 38.2 },
    { "channelId": "3", "value": 1.05 },
    { "channelId": "4", "value": 54.0 }
  ]
}
```

### Invalid payloads and rejection behaviour

| Case | Typical result |
|------|----------------|
| Unknown / wrong topic plant or device | Unauthorized; logged; may write `ingest_rejected` |
| Unknown `channelId` | Bad request: `Unknown channelId …` |
| Inactive channel | Bad request |
| Channel with no sensor node mapping | Bad request |
| Value outside **hard** min/max | Bad request |
| Duplicate `messageId` | Accepted as duplicate; **readings not re-applied** |
| Timestamp too far future/past | Bad request |
| Too many readings (&gt;64) | Bad request |
| Retired device | Bad request |

Failed validations persist a row in `ingest_rejected` (transport, reason, excerpt)—not into `sensor_readings`.

---

## 4. Device and channel mapping

### Provisioning flow (Control Center)

1. Create **tenant** (company).
2. Create / assign **plant** to tenant.
3. `POST /api/control-center/devices` with plant + optional channels  
   (`DeviceProvisioningService.register`).
4. Store the **one-time** `deviceSecret` immediately (shown once).
5. `GET /api/control-center/devices/{id}/provisioning` to re-fetch topic/channels (**secret omitted** on later GET).
6. Firmware uses exported topic + channel IDs only.

Register also creates a `sensor_nodes` inventory row per channel and links it via `device_channels.sensor_node_id`.

### Device UID

- Format when auto-generated: `SWARM-HUB-{SUFFIX}` (chip-derived or random hex).
- Stored in `devices.device_id` (text). Database PK is separate (`devices.id` / export field `devicePk`).

### Channel IDs

- Logical IDs local to the device (text), e.g. `"1"`, `"2"`.
- **Not** GPIO pin numbers.
- Unique per device: `UNIQUE (device_id, channel_id)` where `device_channels.device_id` is the **numeric** `devices.id`.
- Auto-assigned as `"1"`, `"2"`, … if omitted at register time.

### Hardware vs SWARM responsibilities

| Responsibility | Owner |
|----------------|-------|
| Wire sensors to GPIO / ADC / I²C / UART | Firmware / hardware |
| Map physical input → provisioned `channelId` | Firmware config (from SWARM export) |
| Define measurement type, unit, slope/intercept, ranges | SWARM Control Center / channel upsert |
| Publish MQTT JSON | Firmware |
| Validate device, channel, store Timescale rows | SWARM backend |

### Sensor mapping table (**illustrative only**)

GPIO pins and channel numbers below are **examples**. Real channel IDs come from provisioning.

| Physical sensor | GPIO / ADC pin | SWARM channel ID | Measurement (`SensorType`) | Typical unit |
|-----------------|----------------|------------------|----------------------------|--------------|
| Temperature | Configurable on PCB | Provisioned (e.g. `"1"`) | `TEMPERATURE` | `°C` |
| Humidity | Configurable on PCB | Provisioned (e.g. `"2"`) | `HUMIDITY` | `%` |
| Pressure | Configurable on PCB | Provisioned (e.g. `"3"`) | `PRESSURE` | catalog default |

Default units / hard ranges: `SensorCatalog` in the backend.

---

## 5. Hardware provisioning export

### API

| Method | Path | Notes |
|--------|------|-------|
| `POST` | `/api/control-center/devices` | Register; returns full `HardwareProvisioningResponse` **including** one-time `deviceSecret` |
| `GET` | `/api/control-center/devices/{id}/provisioning` | Same structure; `deviceSecret` is **null** |
| `POST` | `/api/control-center/devices/{id}/rotate-secret` | Issues new secret (shown once) |

Requires Control Center admin authentication (JWT).

### Export fields (actual DTO)

From `HardwareProvisioningResponse`:

| Field | Meaning |
|-------|---------|
| `tenantId`, `tenantName` | Tenant UUID / name |
| `plantId`, `plantName` | Plant |
| `devicePk` | DB primary key |
| `deviceUid` | MQTT / payload identity |
| `chipId`, `deviceName`, `deviceKind`, `lifecycle` | Registry metadata |
| `credentialsIssued` | Secret hash exists |
| `secretShownOnce` | Whether this response includes plaintext secret |
| `deviceSecret` | **One-time plaintext** (`swd_…`); null on later GET |
| `mqttBrokerHost`, `mqttBrokerPort` | **Public** broker hint (`SWARM_MQTT_PUBLIC_HOST` / `PORT`, default `127.0.0.1:1884`) |
| `mqttInternalHost`, `mqttInternalPort` | Docker-internal (`mosquitto:1883`) for backend / in-network clients |
| `mqttTelemetryTopic` | Exact publish topic |
| `mqttLegacyTopic` | Legacy pattern (do not use for new firmware) |
| `mqttQos` | Documented as **1** |
| `mqttAuthUsername` | Device UID |
| `mqttAuthHint` | How to use username/password |
| `protocolVersion` | `swarm/v1` |
| `schemaVersion` | `1.0` |
| `payloadExample` | Example JSON object |
| `channels[]` | Channel map (`FieldDeviceChannelResponse`) |
| `notes[]` | Operator notes |

### Representative export (**illustrative values**)

Structure matches code; IDs/secrets are placeholders.

```json
{
  "tenantId": "01a57a5b-0179-4337-8dca-7022a0d4b1ed",
  "tenantName": "Local Plant Ops",
  "plantId": 2,
  "plantName": "Local Demo Plant",
  "devicePk": 10,
  "deviceUid": "SWARM-HUB-C4A43B7D",
  "chipId": null,
  "deviceName": "SWARM-HUB-C4A43B7D",
  "deviceKind": "MQTT_GATEWAY",
  "lifecycle": "COMMISSIONING",
  "credentialsIssued": true,
  "secretShownOnce": true,
  "deviceSecret": "swd_<one-time-hex-only-on-register-or-rotate>",
  "mqttBrokerHost": "127.0.0.1",
  "mqttBrokerPort": 1884,
  "mqttInternalHost": "mosquitto",
  "mqttInternalPort": 1883,
  "mqttTelemetryTopic": "swarm/v1/01a57a5b-0179-4337-8dca-7022a0d4b1ed/2/SWARM-HUB-C4A43B7D/telemetry",
  "mqttLegacyTopic": "biopower/sensors/#",
  "mqttQos": 1,
  "mqttAuthUsername": "SWARM-HUB-C4A43B7D",
  "mqttAuthHint": "MQTT username is the device UID; password is the one-time device secret.",
  "protocolVersion": "swarm/v1",
  "schemaVersion": "1.0",
  "payloadExample": {
    "schemaVersion": "1.0",
    "deviceId": "SWARM-HUB-C4A43B7D",
    "messageId": "unique-message-id",
    "timestamp": "2026-01-01T00:00:00Z",
    "readings": [
      { "channelId": 1, "value": 38.5 },
      { "channelId": 2, "value": 65.0 }
    ]
  },
  "channels": [
    {
      "channelId": "1",
      "measurementType": "TEMPERATURE",
      "engineeringUnit": "°C",
      "slope": 1.0,
      "intercept": 0.0,
      "active": true
    },
    {
      "channelId": "2",
      "measurementType": "HUMIDITY",
      "engineeringUnit": "%",
      "slope": 1.0,
      "intercept": 0.0,
      "active": true
    }
  ],
  "notes": [
    "Topic tenant, plant and device UID must match this registered device.",
    "Measurement type and unit come from device_channels, not the payload.",
    "Store the device secret now. It is shown once and never stored in plaintext."
  ]
}
```

**Important:** Export advertises MQTT username = device UID and password = device secret. Whether the **broker** currently enforces that is a separate security fact (see §9).

---

## 6. MQTT connection and firmware requirements

### Currently configured (Compose / Mosquitto / Spring)

| Item | Implemented value | Source |
|------|-------------------|--------|
| Broker image | `eclipse-mosquitto:2` | `docker-compose.yml` |
| Container listener | `1883` inside Docker network | `mosquitto.conf` |
| Host publish | `127.0.0.1:1884→1883` | Compose ports |
| Anonymous access | **`allow_anonymous true`** | `mosquitto.conf` |
| Password file / ACL | **Not configured** | `mosquitto.conf` |
| TLS on broker | **Not configured** | — |
| Backend subscribe | Only if `MQTT_ENABLED=true` | Compose / `application.yml` |
| Backend broker URL (Docker) | `tcp://mosquitto:1883` | Compose `MQTT_BROKER` |
| Backend client id | `biopower-server` (+ `-inbound` adapter) | `application.yml` / `MqttConfig` |
| Subscribe QoS | **1** | `MqttConfig` adapter |
| Keepalive (backend client) | 30 s | `MqttConfig` |
| Auto-reconnect (backend) | enabled | `MqttConfig` |
| Public host/port in export | defaults `127.0.0.1` / `1884` | `biopower.swarm.mqtt-public-*` |

### Critical connectivity note for physical ESP32

**`127.0.0.1:1884` is loopback on the SWARM host only.** An ESP32 on Wi‑Fi/LAN **cannot** reach that address.

To connect real hardware you must, at minimum:

1. Set `MQTT_ENABLED=true` and restart/recreate the **backend** so it subscribes.
2. Expose Mosquitto on a LAN-reachable address (for example bind `0.0.0.0:1884:1883` or another host port)—**not** only `127.0.0.1`.
3. Set `SWARM_MQTT_PUBLIC_HOST` (and port if needed) to the host’s LAN IP or DNS name so provisioning export shows the correct endpoint.
4. Point firmware at that LAN IP/DNS and port.
5. Prefer enabling Mosquitto authentication + topic ACLs before production (today anonymous is allowed).

Until those steps are done, use host-side tools (`mosquitto_pub` to `127.0.0.1:1884`) for lab tests only.

### Implemented vs recommended firmware behaviour

| Topic | Implemented in SWARM today | Recommended on firmware |
|-------|----------------------------|-------------------------|
| Publish QoS | Backend subscribes QoS 1 | Publish QoS **1** |
| Client ID | N/A (device chooses) | Unique per device, e.g. `deviceUid` |
| Auth to broker | Broker allows anonymous | Use device UID/secret **and** harden broker |
| TLS | Not in Compose Mosquitto | Add TLS before internet exposure |
| NTP / UTC timestamps | Backend accepts ISO-8601 UTC | Sync clock via NTP; send `…Z` timestamps |
| Unique `messageId` | Dedup in DB | UUID or monotonic unique id per message |
| Offline buffer | Not provided by SWARM | Local queue; retry with same or new ids carefully |
| Reconnect | Backend reconnects to broker | Firmware must reconnect MQTT + Wi‑Fi |
| Keepalive | Backend uses 30 s | 30–60 s typical |

---

## 7. Database persistence (for understanding only)

Hardware does **not** need DB credentials.

### Acceptance path

1. MQTT message received (`MqttConfig` handler).
2. JSON parsed; device resolved from topic/UID into `DevicePrincipal`.
3. `TelemetryIngestService.ingest`:
   - Validate envelope, device lifecycle, plant/UID match.
   - Dedup `messageId`.
   - For each reading: resolve channel → transform value → save `sensor_readings`.
   - Save one `sensor_messages` row.
   - Update device `last_seen_at`; may run plant health analysis.

### Tables (verified)

| Table | Role |
|-------|------|
| `tenants` | Tenant UUID |
| `devices` | Device UID + tenant (`device_id` text = UID) |
| `device_registry` | Plant, secret hash, lifecycle, last seen (1:1 with `devices.id`) |
| `device_channels` | Channel map, units, slope, ranges, `sensor_node_id` |
| `sensor_nodes` | Plant inventory nodes |
| `sensor_messages` | One row per accepted `messageId` (PK) |
| `sensor_readings` | Timescale hypertable; one row per reading |
| `ingest_rejected` | Failed ingest audit |

One MQTT message with N valid readings → **1** `sensor_messages` + **N** `sensor_readings` (same `message_id`).

Units: `sensor_readings.unit` ← `device_channels.engineering_unit`.  
Plant/node/quality/raw live partly in `sensor_readings.metadata` JSON (JPA entity design).

---

## 8. Security audit

### Implemented protections

| Control | Status |
|---------|--------|
| Device must exist in registry | Yes (MQTT path) |
| Topic plant / device UID / tenant UUID match registry | Yes |
| Payload deviceId must match authenticated device | Yes |
| Channel must belong to that device + mapped node on same plant | Yes |
| Device secret hashed at rest (`swd_` secret → SHA-256 hex) | Yes |
| HTTP `/api/iot/**` can authenticate with device id+secret headers | Yes (`DeviceAuthenticationFilter`) |
| Duplicate `messageId` not re-applied | Yes |
| Retired devices rejected | Yes |

### Missing / weak for production MQTT

| Control | Status |
|---------|--------|
| Mosquitto requires username/password | **No** — `allow_anonymous true` |
| Mosquitto per-device topic ACL | **Not configured** |
| Backend verifies device secret on every MQTT publish | **No** for the live Compose subscriber path (`MqttConfig` calls `handle(topic, payload, null, null)`). Identity is from topic/payload + registry; password check runs only when credentials are passed into the handler. |
| TLS / mTLS to broker | **Not configured** in current Mosquitto Compose |
| Broker bound for LAN ESP32 | Default **loopback-only** host port |
| MQTT ingest enabled by default | **No** — `MQTT_ENABLED` defaults **false** |

### PRODUCTION-READINESS WARNING

> **Do not treat the current Compose Mosquitto setup as production device security.**  
> Any client that can reach the broker can publish if they know/guess a valid topic for a registered device. The backend validates **registered identity and topic consistency**, not a per-publish MQTT password, on the standard server subscription path.  
> Before field deployment: enable broker auth + ACLs (device UID can publish only its topic), prefer TLS, bind broker appropriately for the network, set `MQTT_ENABLED=true`, and rotate device secrets carefully.

The provisioning UI hint that “MQTT password is the device secret” describes the **intended** credential model; Mosquitto must be configured to enforce it.

---

## 9. Firmware implementation example (ESP32 Arduino / PubSubClient)

Placeholders only. Replace with **exported** values. Requires Wi‑Fi, NTP, and an MQTT library.

```cpp
// ILLUSTRATIVE firmware sketch — align topic/payload with SWARM export.
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

// --- From SWARM provisioning export (do not invent) ---
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASS = "YOUR_WIFI_PASSWORD";

const char* MQTT_HOST = "192.168.1.50";   // LAN IP of SWARM host — NOT 127.0.0.1 on the ESP32
const uint16_t MQTT_PORT = 1884;         // host-mapped port once exposed beyond loopback

const char* DEVICE_UID = "SWARM-HUB-C4A43B7D";
const char* DEVICE_SECRET = "swd_REPLACE_WITH_ONE_TIME_SECRET"; // store in NVS; never commit
const char* MQTT_TOPIC =
  "swarm/v1/01a57a5b-0179-4337-8dca-7022a0d4b1ed/2/SWARM-HUB-C4A43B7D/telemetry";

// Channel IDs from export — map your GPIO/ADC reads to these strings
const char* CH_TEMP = "1";
const char* CH_HUM  = "2";

WiFiClient wifi;
PubSubClient mqtt(wifi);
uint32_t seq = 0;

void ensureWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  while (WiFi.status() != WL_CONNECTED) delay(500);
}

void ensureMqtt() {
  while (!mqtt.connected()) {
    // Username = deviceUid; password = deviceSecret (when broker enforces auth)
    if (mqtt.connect(DEVICE_UID, DEVICE_UID, DEVICE_SECRET)) {
      break;
    }
    delay(2000);
  }
}

String utcNowIso() {
  time_t now = time(nullptr);
  struct tm tm_now;
  gmtime_r(&now, &tm_now);
  char buf[32];
  strftime(buf, sizeof(buf), "%Y-%m-%dT%H:%M:%SZ", &tm_now);
  return String(buf);
}

String nextMessageId() {
  // Must be unique; max 128 chars
  return String(DEVICE_UID) + "-" + String(++seq) + "-" + String((uint32_t)time(nullptr));
}

void publishTelemetry(float tempC, float humidityPct) {
  StaticJsonDocument<512> doc;
  doc["schemaVersion"] = "1.0";
  doc["deviceId"] = DEVICE_UID;
  doc["messageId"] = nextMessageId();
  doc["timestamp"] = utcNowIso();
  JsonArray readings = doc.createNestedArray("readings");
  JsonObject r0 = readings.createNestedObject();
  r0["channelId"] = CH_TEMP;
  r0["value"] = tempC;
  JsonObject r1 = readings.createNestedObject();
  r1["channelId"] = CH_HUM;
  r1["value"] = humidityPct;

  char payload[512];
  size_t n = serializeJson(doc, payload, sizeof(payload));
  mqtt.publish(MQTT_TOPIC, payload, n); // prefer QoS 1 if library API allows
}

void setup() {
  Serial.begin(115200);
  ensureWifi();
  configTime(0, 0, "pool.ntp.org"); // UTC
  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setBufferSize(1024);
}

void loop() {
  ensureWifi();
  ensureMqtt();
  mqtt.loop();

  // Replace with real sensor reads mapped to provisioned channels
  float t = 38.5;
  float h = 62.0;
  publishTelemetry(t, h);

  delay(30000);
}
```

---

## 10. Hardware testing procedure

1. **Provision** tenant → plant → `POST /api/control-center/devices` with channels.  
2. **Export** / save `HardwareProvisioningResponse` (especially `deviceSecret`, `mqttTelemetryTopic`, `channels`).  
3. **Enable MQTT** (`MQTT_ENABLED=true`); confirm `GET /api/health` or Control Center IoT status shows connected.  
4. **Configure broker reachability** for the test client (loopback for PC tests; LAN bind for ESP32).  
5. **Flash / configure** firmware with exported topic, UID, channels, host/port.  
6. **Publish** one valid JSON (or use `mosquitto_pub` from the host).  
7. **Verify MQTT reception** — backend counters / Mosquitto logs / IoT status `messagesReceived`.  
8. **Verify ingest** — no new `ingest_rejected` for that publish; device `lastSeen` updates.  
9. **Verify persistence** — `sensor_messages` + `sensor_readings` for that `messageId` (ops/DBA only).  
10. **Verify dashboard** — live values / analytics for the plant.  
11. **Duplicate test** — republish same `messageId`; readings must not double.  
12. **Invalid channel** — unknown `channelId` → rejection, no readings.  
13. **Disconnect / reconnect** — Wi‑Fi and MQTT recovery; new unique `messageId`s.  
14. **Clock test** — far-future / ancient timestamps rejected.

### Host-side Mosquitto lab publish (**loopback**)

```bash
# From the SWARM host only (default Compose bind):
mosquitto_pub -h 127.0.0.1 -p 1884 \
  -t 'swarm/v1/<tenantId>/<plantId>/<deviceUid>/telemetry' \
  -q 1 \
  -m '{"schemaVersion":"1.0","deviceId":"<deviceUid>","messageId":"lab-001","timestamp":"2026-11-18T10:30:00Z","readings":[{"channelId":"1","value":42.5}]}'
```

Replace placeholders with **exported** values. With current Mosquitto config, username/password are not required by the broker.

---

## 11. Source index (quick)

- Topic regex / v1 parse: `MqttTelemetryHandler.java`  
- Subscribe / QoS / keepalive: `MqttConfig.java`  
- Dedup / channels / units / timestamps: `TelemetryIngestService.java`  
- Export builder: `DeviceProvisioningService.toProvisioning`  
- DTO: `HardwareProvisioningResponse.java`  
- Register API: `ControlCenterController` `/devices`, `/devices/{id}/provisioning`  
- Broker: `docker/mosquitto/mosquitto.conf`, `docker-compose.yml`  
- Schema: `database/swarm-core-init.sql`, `V1__swarm_app_schema.sql`

---

## 12. Implementation audit (verified / missing / before production hardware)

### Verified in repository

- V1 topic shape and parser.
- V1 JSON `readings[]` ingest with channel validation.
- Provisioning export of topic, QoS hint, payload example, channels, one-time secret.
- Timescale persistence model and duplicate `messageId` handling.
- Unit resolution from `device_channels`.
- HTTP device-secret auth for `/api/iot/**`.

### Missing or incomplete for production field devices

- Mosquitto anonymous access; no ACL/TLS in stock Compose.
- Backend MQTT path does **not** verify device secret on each publish.
- Default host port is **loopback-only** (`127.0.0.1:1884`).
- `MQTT_ENABLED` defaults to **false**.
- No first-class DB column for `schemaVersion`.

### Must complete before connecting physical hardware to production SWARM

1. Enable MQTT on backend.  
2. Expose broker on a controlled network path the ESP32 can reach.  
3. Harden Mosquitto (auth + ACL + TLS as required by threat model).  
4. Provision each device in Control Center; flash **exported** topic/channels/secret.  
5. Validate end-to-end with duplicate and invalid-channel tests.  
6. Confirm dashboard shows live data for the correct plant only.

---

*Document generated from repository inspection. Application code, migrations, and broker config were not modified to produce this specification.*
