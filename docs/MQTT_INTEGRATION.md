# SWARM MQTT Integration (Pi / ESP32)

**Audience:** Raspberry Pi + ESP32 developers integrating with the existing SWARM backend.  
**Full field contract:** [SWARM_HARDWARE_MQTT_INTEGRATION.md](./SWARM_HARDWARE_MQTT_INTEGRATION.md)  
**Quick card:** [SWARM_MQTT_QUICK_REFERENCE.md](./SWARM_MQTT_QUICK_REFERENCE.md)

Do not invent `tenantId`, `plantId`, `deviceUid`, or `channelId`. Use Control Center provisioning export.

---

## 1. Architecture (demo)

```
ESP32  --MQTT QoS1-->  Mosquitto (Pi)
                           |
                     Spring Boot (Pi)
                           |  JDBC TLS
                           v
                  Cloud PostgreSQL / TimescaleDB
                           ^
React frontend --REST /api--┘
```

- Backend **subscribes** to Mosquitto and calls `TelemetryIngestService` directly (never HTTP to itself).
- Devices never talk to the database.
- MQTT is optional: `MQTT_ENABLED=true`.

---

## 2. Broker settings required by the backend

| Variable | Example | Notes |
|----------|---------|--------|
| `MQTT_ENABLED` | `true` | Default `false` |
| `MQTT_BROKER` | `tcp://127.0.0.1:1883` | Or `tcp://mosquitto:1883` in Compose |
| `MQTT_CLIENT_ID` | `swarm-backend` | Unique per backend instance |
| `MQTT_USER` / `MQTT_PASSWORD` | service account | Broker login for the **subscriber** |
| `MQTT_SWARM_TOPIC` | `swarm/v1/+/+/+/telemetry` | Subscribe pattern |
| `MQTT_TRUST_BROKER_ACLS` | `true` | Live path; broker must ACL topics per device UID |
| `MQTT_INGEST_MAX_ATTEMPTS` | `3` | Bounded DB retries |

Compose Mosquitto: **anonymous disabled**. First start creates `MQTT_USER`/`MQTT_PASSWORD` in `/mosquitto/data/passwd`. Add device users with `mosquitto_passwd`.

---

## 3. Topic naming

```text
swarm/v1/{tenantId}/{plantId}/{deviceUid}/telemetry
```

Example:

```text
swarm/v1/01a57a5b-0179-4337-8dca-7022a0d4b1ed/2/SWARM-HUB-C4A43B7D/telemetry
```

Exact string: provisioning field `mqttTelemetryTopic`.

Backend checks topic `plantId` / `deviceUid` / tenant UUID against the registered device.

---

## 4. JSON payload contract (schemaVersion 1.0)

```json
{
  "schemaVersion": "1.0",
  "deviceId": "SWARM-HUB-C4A43B7D",
  "messageId": "unique-message-id-000001",
  "timestamp": "2026-11-18T10:30:00Z",
  "readings": [
    { "channelId": "1", "value": 38.5 },
    { "channelId": "2", "value": 62.0 }
  ]
}
```

| Field | Type | Required | Rules |
|-------|------|----------|--------|
| `schemaVersion` | string | Recommended | Defaults to `1.0` |
| `deviceId` | string | Yes | Must match topic + registered UID |
| `messageId` | string | Strongly yes | Unique; max 128; QoS1 dedupe key |
| `timestamp` | ISO-8601 | Recommended | Rejected if >10 min future or >30 days past |
| `readings` | array | Yes | 1–64 points |
| `readings[].channelId` | string/number | Yes* | *or `nodeId` |
| `readings[].value` | number | Yes | Units from `device_channels` / SensorCatalog |
| `chipId` / `plantId` | optional | If present must match device |
| `firmwareVersion` / `rssi` / `ip` | optional | Stored on device/node when present |

**Units (from catalog, not invent in firmware):** TEMPERATURE `°C`, HUMIDITY `%`, PRESSURE `bar`, METHANE `%`, PH `pH`, GAS_FLOW `m³/h`, H₂S/NH₃ `ppm`, etc.

### Identity agreement

Topic device, authenticated/registered device, and payload `deviceId` must agree. Payload `plantId` (if sent) must match topic/device plant. Mismatch → unauthorized; may land in `ingest_rejected`.

### Error handling

| Case | Behaviour |
|------|-----------|
| Invalid JSON / missing `value` | Rejected; logged |
| Unknown device | Unauthorized |
| Wrong plant/device topic | Unauthorized |
| Duplicate `messageId` | Ack’d; readings **not** re-applied |
| Transient DB error | Up to 3 retries, then failure logged |

**QoS 1 can deliver duplicates.** Always send unique `messageId`s.

---

## 5. Device authentication

1. Control Center registers device → one-time `deviceSecret` (`swd_…`).
2. Mosquitto user: username = `deviceUid`, password = secret (plus ACL on that device’s topic).
3. Backend subscriber uses a separate service account (`MQTT_USER`).
4. Live ingest trusts broker ACLs (`MQTT_TRUST_BROKER_ACLS=true`) and validates topic/registry/payload identity.
5. HTTP alternate: `POST /api/iot/batch` with `X-SWARM-Device-Id` + `X-SWARM-Device-Secret`.

Prod/demo profile defaults `SWARM_IOT_COMPAT_LEGACY=false` (no chip-only unauthenticated REST). Dev default remains `true`.

---

## 6. How the backend processes messages

`MqttConfig` → `MqttTelemetryHandler` → `TelemetryIngestService` → `sensor_readings` + `sensor_messages`.

Check `/api/health` → `mqtt.connected`, `messagesReceived`, `lastError`.

---

## 7. Test publish (`mosquitto_pub`)

```bash
# After adding the device user to Mosquitto passwd:
mosquitto_pub -h 127.0.0.1 -p 1884 -q 1 \
  -u 'SWARM-HUB-C4A43B7D' -P '<deviceSecret>' \
  -t 'swarm/v1/<tenantId>/<plantId>/SWARM-HUB-C4A43B7D/telemetry' \
  -m '{"schemaVersion":"1.0","deviceId":"SWARM-HUB-C4A43B7D","messageId":"lab-001","timestamp":"2026-11-18T10:30:00Z","readings":[{"channelId":"1","value":42.5}]}'
```

Enable backend: `MQTT_ENABLED=true`.

---

## 8. Verify telemetry reached the database

```sql
SELECT message_id, device_id, recorded_at FROM sensor_messages ORDER BY received_at DESC LIMIT 5;
SELECT device_uid, channel_id, raw_value, recorded_at FROM sensor_readings ORDER BY recorded_at DESC LIMIT 10;
SELECT * FROM ingest_rejected ORDER BY received_at DESC LIMIT 10;
```

Or dashboard / Control Center IoT status: `GET /api/control-center/iot/status`.

---

## 9. Cloud database (Pi backend)

| Variable | Example |
|----------|---------|
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://db.example.com:5432/swarm?sslmode=require` |
| or `DB_HOST` / `DB_PORT` / `DB_NAME` | + `DB_SSL_MODE=require` |
| `DB_USER` / `DB_PASSWORD` | from secrets manager |
| `DB_POOL_SIZE` | `5` on Pi |

No hardcoded production credentials. Startup fails within `DB_INIT_FAIL_TIMEOUT_MS` if DB is down.

---

## 10. Troubleshooting

| Symptom | Check |
|---------|--------|
| `mqtt.connected=false` | Broker URL, `MQTT_USER`/`PASSWORD`, firewall |
| Unknown MQTT device | Device registered; topic UID exact |
| Payload/topic mismatch | `deviceId` and topic segment identical |
| Not authorized on publish | Mosquitto passwd + ACL |
| Duplicate ignored | Expected for same `messageId` |
| DB DOWN on `/api/health` | Cloud URL, TLS, credentials, network |
| REST 401 after demo deploy | Pair with device headers; legacy compat off |

---

## Hardware developer remaining work

1. Install/configure Mosquitto on Pi (or use Compose service); create per-device users + ACLs.
2. Flash ESP32; map sensors → provisioned `channelId`s.
3. Publish V1 JSON to exact `mqttTelemetryTopic` at QoS 1 with unique `messageId`.
4. Point firmware at LAN-reachable broker host (`SWARM_MQTT_PUBLIC_HOST`).
5. Confirm readings in DB/dashboard; retest duplicate `messageId` and bad credentials.
