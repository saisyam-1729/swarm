// PURPOSE: MQTT ingest/health adapter for SWARM device telemetry.
package com.biopower.mqtt;

import com.biopower.exception.BadRequestException;
import com.biopower.exception.UnauthorizedException;
import com.biopower.model.entity.Device;
import com.biopower.model.enums.IngestTransport;
import com.biopower.model.enums.SensorType;
import com.biopower.repository.DeviceRepository;
import com.biopower.security.DevicePrincipal;
import com.biopower.service.TelemetryIngestService;
import com.biopower.telemetry.IngestEnvelope;
import com.biopower.telemetry.IngestPoint;
import com.biopower.util.DeviceSecretHasher;
import com.biopower.util.DeviceStatuses;
import org.springframework.beans.factory.annotation.Value;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses MQTT payloads (SWARM v1 and legacy) into {@link TelemetryIngestService}.
 * Broker username/password should be the device UID/secret; topic must match the device plant.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class MqttTelemetryHandler {

    /**
     * swarm/v1/{tenantId}/{plantId}/{deviceUid}/telemetry
     * tenantId may be company id or "_" when unknown.
     */
    public static final Pattern SWARM_V1_TELEMETRY = Pattern.compile(
            "^swarm/v1/([^/]+)/(\\d+)/([^/]+)/telemetry$");

    private final TelemetryIngestService telemetryIngestService;
    private final DeviceRepository deviceRepository;
    private final ObjectMapper objectMapper;

    /**
     * When true, SWARM as an MQTT subscriber trusts broker identity (publisher username
     * is not visible on the inbound adapter). Broker ACLs must restrict
     * swarm/v1/{tenant}/{plant}/{deviceUid}/telemetry to that device UID.
     * Tests set this false so a publisher without credentials is rejected.
     */
    @Value("${mqtt.trust-broker-acls:true}")
    private boolean trustBrokerAcls;

    public void handle(String topic, String payload, String mqttUsername, String mqttPassword) {
        String excerpt = payload != null && payload.length() > 512 ? payload.substring(0, 512) : payload;
        try {
            JsonNode root = objectMapper.readTree(payload);
            TopicContext topicCtx = parseTopic(topic);

            authenticateMqttDevice(topicCtx, root, mqttUsername, mqttPassword);
            assertIdentityAgreement(topicCtx, root);

            if (root.has("readings") && root.get("readings").isArray()) {
                ingestV1(topicCtx, root, excerpt, topic);
            } else {
                ingestLegacy(topicCtx, root, excerpt, topic);
            }
        } catch (UnauthorizedException | BadRequestException ex) {
            log.warn("MQTT ingest rejected topic={}: {}", topic, ex.getMessage());
            throw ex;
        } catch (Exception ex) {
            log.warn("MQTT message processing failed topic={}: {}", topic, ex.getMessage());
            throw new BadRequestException("Invalid MQTT telemetry payload");
        } finally {
            SecurityContextHolder.clearContext();
        }
    }

    /** Test / simulation entry without broker credentials (caller must set SecurityContext). */
    public void handleAuthenticated(String topic, String payload) {
        handle(topic, payload, null, null);
    }

    private void authenticateMqttDevice(TopicContext topicCtx, JsonNode root,
                                        String mqttUsername, String mqttPassword) {
        DevicePrincipal existing = null;
        if (SecurityContextHolder.getContext().getAuthentication() instanceof DevicePrincipal dp) {
            existing = dp;
        }
        if (existing != null) {
            validateTopicMatchesDevice(topicCtx, existing.getPlantId(), existing.getDeviceUid(), existing.getCompanyId());
            return;
        }

        String deviceUid = topicCtx != null ? topicCtx.deviceUid() : text(root, "deviceId");
        if (deviceUid == null || deviceUid.isBlank()) {
            deviceUid = text(root, "deviceId");
        }
        if (mqttUsername != null && !mqttUsername.isBlank()) {
            deviceUid = mqttUsername.trim();
        }
        if (deviceUid == null || deviceUid.isBlank()) {
            // Legacy biopower/sensors/# single-point messages without device UID:
            // leave SecurityContext empty; TelemetryIngestService applies compat-legacy rules.
            if (topicCtx == null && root.has("plantId") && root.has("nodeId")) {
                return;
            }
            throw new UnauthorizedException("MQTT device identity required");
        }

        Device device = deviceRepository.findFirstByDeviceUid(deviceUid)
                .orElseThrow(() -> new UnauthorizedException("Unknown MQTT device"));

        if (!DeviceStatuses.canPublish(device)) {
            throw new UnauthorizedException("Device is " + device.getLifecycle());
        }
        if (!DeviceStatuses.credentialsIssued(device) && (mqttPassword == null || mqttPassword.isBlank())) {
            throw new UnauthorizedException("Device is not provisioned");
        }

        if (mqttPassword != null && !mqttPassword.isBlank()) {
            if (!DeviceSecretHasher.matches(mqttPassword, device.getSecretHash())) {
                throw new UnauthorizedException("Invalid MQTT device credentials");
            }
        } else if (!trustBrokerAcls) {
            throw new UnauthorizedException("MQTT device credentials required");
        }

        validateTopicMatchesDevice(topicCtx, device.getPlantId(), device.getDeviceUid(), device.getTenantId());

        SecurityContextHolder.getContext().setAuthentication(new DevicePrincipal(
                device.getId(),
                device.getDeviceUid(),
                device.getPlantId(),
                device.getTenantId(),
                device.getChipId(),
                device.getDeviceKind(),
                device.isLegacyCompat(),
                device.getConfigVersion()
        ));
    }

    private void validateTopicMatchesDevice(TopicContext topicCtx, Long plantId, String deviceUid, UUID tenantId) {
        if (topicCtx == null) {
            return;
        }
        if (!topicCtx.plantId().equals(plantId)) {
            throw new UnauthorizedException("MQTT topic plant does not match registered device plant");
        }
        if (!topicCtx.deviceUid().equalsIgnoreCase(deviceUid)) {
            throw new UnauthorizedException("MQTT topic device does not match authenticated device");
        }
        String topicTenant = topicCtx.tenantId();
        if (topicTenant == null || topicTenant.isBlank() || "_".equals(topicTenant) || tenantId == null) {
            return;
        }
        try {
            UUID parsed = UUID.fromString(topicTenant);
            if (!tenantId.equals(parsed)) {
                throw new UnauthorizedException("MQTT topic tenant does not match registered device tenant");
            }
        } catch (IllegalArgumentException notUuid) {
            // Legacy numeric tenant segments remain accepted for existing firmware/tests.
            log.debug("MQTT topic tenant '{}' is not a UUID; registered tenant is {}", topicTenant, tenantId);
        }
    }

    /**
     * Topic segment, authenticated device, and payload deviceId/plantId must agree when present.
     */
    private void assertIdentityAgreement(TopicContext topicCtx, JsonNode root) {
        String payloadDeviceId = text(root, "deviceId");
        if (payloadDeviceId != null && !payloadDeviceId.isBlank()) {
            String trimmed = payloadDeviceId.trim();
            if (topicCtx != null && !topicCtx.deviceUid().equalsIgnoreCase(trimmed)) {
                throw new UnauthorizedException("MQTT payload deviceId does not match topic device");
            }
            if (SecurityContextHolder.getContext().getAuthentication() instanceof DevicePrincipal principal
                    && !principal.getDeviceUid().equalsIgnoreCase(trimmed)) {
                throw new UnauthorizedException("MQTT payload deviceId does not match authenticated device");
            }
        }
        if (root.has("plantId") && !root.get("plantId").isNull()) {
            long payloadPlant = root.get("plantId").asLong();
            if (topicCtx != null && !topicCtx.plantId().equals(payloadPlant)) {
                throw new UnauthorizedException("MQTT payload plantId does not match topic plant");
            }
            if (SecurityContextHolder.getContext().getAuthentication() instanceof DevicePrincipal principal
                    && !principal.getPlantId().equals(payloadPlant)) {
                throw new UnauthorizedException("MQTT payload plantId does not match authenticated device plant");
            }
        }
    }

    private void ingestV1(TopicContext topicCtx, JsonNode root, String excerpt, String topic) {
        JsonNode readingsNode = root.get("readings");
        if (readingsNode == null || !readingsNode.isArray() || readingsNode.isEmpty()) {
            throw new BadRequestException("readings array is required");
        }
        List<IngestPoint> points = new ArrayList<>();
        for (JsonNode reading : readingsNode) {
            if (!reading.has("value") || reading.get("value").isNull()) {
                throw new BadRequestException("Each reading requires a numeric value");
            }
            if (!reading.has("channelId") && !reading.has("nodeId") && !reading.has("sensorType")) {
                throw new BadRequestException("Each reading needs channelId or nodeId");
            }
            points.add(IngestPoint.builder()
                    .channelId(reading.has("channelId") ? reading.get("channelId").asText() : null)
                    .nodeId(reading.has("nodeId") && !reading.get("nodeId").isNull()
                            ? reading.get("nodeId").asLong() : null)
                    .sensorType(parseSensorType(reading))
                    .unit(text(reading, "unit"))
                    .name(firstText(reading, "name", "instrumentTag", "tag"))
                    .value(reading.get("value").asDouble())
                    .build());
        }

        Long plantId = registeredPlantId();
        if (plantId == null) {
            plantId = topicCtx != null ? topicCtx.plantId()
                    : (root.has("plantId") ? root.get("plantId").asLong() : null);
        }
        String deviceUid = topicCtx != null ? topicCtx.deviceUid() : text(root, "deviceId");

        IngestEnvelope envelope = IngestEnvelope.builder()
                .transport(IngestTransport.MQTT)
                .schemaVersion(text(root, "schemaVersion") != null ? text(root, "schemaVersion") : "1.0")
                .messageId(text(root, "messageId"))
                .plantId(plantId)
                .deviceUid(deviceUid)
                .chipId(text(root, "chipId"))
                .firmwareVersion(text(root, "firmwareVersion"))
                .rssi(root.has("rssi") && !root.get("rssi").isNull() ? root.get("rssi").asInt() : null)
                .ip(text(root, "ip"))
                .sourceTimestamp(parseTimestamp(root.get("timestamp")))
                .readings(points)
                .topic(topic)
                .payloadExcerpt(excerpt)
                .build();
        telemetryIngestService.ingest(envelope);
    }

    private void ingestLegacy(TopicContext topicCtx, JsonNode root, String excerpt, String topic) {
        IngestPoint point = IngestPoint.builder()
                .nodeId(root.has("nodeId") ? root.get("nodeId").asLong() : null)
                .sensorType(SensorType.valueOf(root.get("sensorType").asText().toUpperCase()))
                .value(root.get("value").asDouble())
                .build();
        Long plantId = registeredPlantId();
        if (plantId == null) {
            plantId = topicCtx != null ? topicCtx.plantId() : root.get("plantId").asLong();
        }
        IngestEnvelope envelope = IngestEnvelope.builder()
                .transport(IngestTransport.MQTT)
                .schemaVersion("legacy-mqtt")
                .plantId(plantId)
                .deviceUid(topicCtx != null ? topicCtx.deviceUid() : text(root, "deviceId"))
                .sourceTimestamp(root.has("timestamp") ? parseTimestamp(root.get("timestamp")) : null)
                .readings(List.of(point))
                .topic(topic)
                .payloadExcerpt(excerpt)
                .build();
        telemetryIngestService.ingest(envelope);
    }

    private TopicContext parseTopic(String topic) {
        if (topic == null || topic.isBlank()) {
            return null;
        }
        Matcher m = SWARM_V1_TELEMETRY.matcher(topic);
        if (!m.matches()) {
            return null;
        }
        return new TopicContext(m.group(1), Long.parseLong(m.group(2)), m.group(3));
    }

    private Long registeredPlantId() {
        if (SecurityContextHolder.getContext().getAuthentication() instanceof DevicePrincipal principal) {
            return principal.getPlantId();
        }
        return null;
    }

    private LocalDateTime parseTimestamp(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        String text = node.asText();
        try {
            if (text.endsWith("Z") || text.contains("+")) {
                return LocalDateTime.ofInstant(Instant.parse(text), ZoneOffset.UTC);
            }
            return LocalDateTime.parse(text);
        } catch (DateTimeParseException ex) {
            throw new BadRequestException("Invalid timestamp");
        }
    }

    private String text(JsonNode root, String field) {
        return root.has(field) && !root.get(field).isNull() ? root.get(field).asText() : null;
    }

    private String firstText(JsonNode root, String... fields) {
        for (String field : fields) {
            String value = text(root, field);
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }

    private SensorType parseSensorType(JsonNode reading) {
        String raw = text(reading, "sensorType");
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return SensorType.valueOf(raw.trim().toUpperCase());
        } catch (IllegalArgumentException unknown) {
            return SensorType.GENERIC;
        }
    }

    public record TopicContext(String tenantId, Long plantId, String deviceUid) {
    }
}
