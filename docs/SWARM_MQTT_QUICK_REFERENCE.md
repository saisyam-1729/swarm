# SWARM MQTT Quick Reference (Hardware)

**Full spec:** [SWARM_HARDWARE_MQTT_INTEGRATION.md](./SWARM_HARDWARE_MQTT_INTEGRATION.md)  
**Rule:** Use identifiers and topic from SWARM provisioning export. Do not invent them.

---

## Topic

```text
swarm/v1/{tenantId}/{plantId}/{deviceUid}/telemetry
```

| Part | Example (**illustrative**) |
|------|----------------------------|
| tenantId | `01a57a5b-0179-4337-8dca-7022a0d4b1ed` (UUID) |
| plantId | `2` (number) |
| deviceUid | `SWARM-HUB-C4A43B7D` |

Exact string: export field `mqttTelemetryTopic`.

Backend subscribe pattern: `swarm/v1/+/+/+/telemetry`  
Sources: `MqttTelemetryHandler`, `mqtt.swarm-topic`.

---

## Payload (schemaVersion 1.0)

```json
{
  "schemaVersion": "1.0",
  "deviceId": "SWARM-HUB-C4A43B7D",
  "messageId": "unique-message-id-000001",
  "timestamp": "2026-11-18T10:30:00Z",
  "readings": [
    { "channelId": "1", "value": 42.5 },
    { "channelId": "2", "value": 28.7 }
  ]
}
```

| Field | Required | Notes |
|-------|----------|-------|
| `schemaVersion` | Recommended | Default `"1.0"` |
| `deviceId` | Yes | Must match registered UID / topic |
| `messageId` | Strongly yes | Unique; max 128; deduped |
| `timestamp` | Recommended | UTC ISO-8601; ± window enforced |
| `readings[].channelId` | Yes (new firmware) | Must exist & be active |
| `readings[].value` | Yes | Number; units from SWARM channel config |

Max readings per message: **64**.  
Measurement type & unit: from `device_channels`, not payload.

---

## Connection (current Compose defaults)

| Setting | Value | Caution |
|---------|-------|---------|
| Enable ingest | `MQTT_ENABLED=true` | Default is **false** |
| Host (export default) | `127.0.0.1` | **Loopback only** — ESP32 on LAN cannot use this |
| Port (export default) | `1884` | Maps to container `1883` |
| Internal (Docker) | `mosquitto:1883` | Backend only |
| QoS (documented) | `1` | |
| Mosquitto auth | Anonymous allowed | **Not production-safe** |
| TLS | Not configured | |

**Physical ESP32:** publish Mosquitto on a LAN-reachable address; set `SWARM_MQTT_PUBLIC_HOST` to that host; point firmware there.

Export username = `deviceUid`. Secret shown **once** at register/rotate (`swd_…`). Broker does **not** currently enforce password unless you harden Mosquitto.

---

## Provisioning checklist

1. Control Center: tenant → plant → register device (+ channels).  
2. Save `deviceSecret`, `mqttTelemetryTopic`, `channels[]`.  
3. Map PCB sensors → exported `channelId`s (GPIO is firmware-local).  
4. Enable MQTT; confirm backend subscribed / healthy.  
5. Ensure broker reachable from the device network.  
6. Publish V1 JSON; confirm dashboard / no `ingest_rejected`.  
7. Retest duplicate `messageId` and bad `channelId`.

APIs: `POST /api/control-center/devices`, `GET /api/control-center/devices/{id}/provisioning`.

---

## Lab publish (host loopback only)

```bash
mosquitto_pub -h 127.0.0.1 -p 1884 -q 1 \
  -t 'swarm/v1/<tenantId>/<plantId>/<deviceUid>/telemetry' \
  -m '{"schemaVersion":"1.0","deviceId":"<deviceUid>","messageId":"lab-001","timestamp":"2026-11-18T10:30:00Z","readings":[{"channelId":"1","value":42.5}]}'
```

---

## Security (one-liner)

Backend checks **registered device + topic/channel consistency**. Stock Mosquitto is **anonymous** and the live MQTT subscriber path does **not** verify the device secret on every publish. Harden before production.

---

## Sensor map template (**illustrative**)

| Sensor | Pin (your PCB) | Channel ID (from SWARM) | Type |
|--------|----------------|-------------------------|------|
| Temperature | TBD | Provisioned | `TEMPERATURE` |
| Humidity | TBD | Provisioned | `HUMIDITY` |
| Pressure | TBD | Provisioned | `PRESSURE` |
