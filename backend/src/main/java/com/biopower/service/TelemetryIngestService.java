// PURPOSE: Application service implementing SWARM telemetryingest business rules.
package com.biopower.service;

import com.biopower.dto.response.SensorReadingResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.UnauthorizedException;
import com.biopower.model.entity.Device;
import com.biopower.model.entity.DeviceChannel;
import com.biopower.model.entity.IngestRejected;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorMessage;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.entity.SensorReading;
import com.biopower.model.enums.DataQuality;
import com.biopower.model.enums.DeviceLifecycle;
import com.biopower.model.enums.IngestTransport;
import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.SensorType;
import com.biopower.repository.DeviceChannelRepository;
import com.biopower.repository.DeviceRepository;
import com.biopower.repository.IngestRejectedRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorMessageRepository;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.repository.SensorReadingRepository;
import com.biopower.util.DeviceStatuses;
import com.biopower.util.SensorCatalog;
import com.biopower.security.DevicePrincipal;
import com.biopower.telemetry.IngestEnvelope;
import com.biopower.telemetry.IngestPoint;
import com.biopower.telemetry.IngestResult;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Single validated telemetry pipeline for HTTP and MQTT adapters.
 * Device identity comes from authentication (or legacy-compat gate), never from payload trust alone.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class TelemetryIngestService {

    private static final int MAX_READINGS = 64;
    private static final int MAX_FUTURE_MINUTES = 10;
    private static final int MAX_PAST_DAYS = 30;

    private final DeviceRepository deviceRepository;
    private final DeviceChannelRepository deviceChannelRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final PlantRepository plantRepository;
    private final SensorReadingRepository sensorReadingRepository;
    private final SensorMessageRepository sensorMessageRepository;
    private final IngestRejectedRepository ingestRejectedRepository;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final AlertService alertService;
    private final AiHealthService aiHealthService;

    @Value("${biopower.iot.compat-legacy:true}")
    private boolean compatLegacy;

    @Value("${biopower.iot.max-payload-readings:64}")
    private int maxPayloadReadings;

    @Transactional
    public IngestResult ingest(IngestEnvelope envelope) {
        LocalDateTime receivedAt = LocalDateTime.now();
        try {
            return ingestInternal(envelope, receivedAt);
        } catch (UnauthorizedException | BadRequestException ex) {
            reject(envelope, envelope.getTransport(), ex.getClass().getSimpleName(), ex.getMessage(), receivedAt);
            throw ex;
        }
    }

    private IngestResult ingestInternal(IngestEnvelope envelope, LocalDateTime receivedAt) {
        if (envelope == null || envelope.getReadings() == null || envelope.getReadings().isEmpty()) {
            throw new BadRequestException("No readings in telemetry envelope");
        }
        int limit = Math.min(maxPayloadReadings, MAX_READINGS);
        if (envelope.getReadings().size() > limit) {
            throw new BadRequestException("Too many readings in one message (max " + limit + ")");
        }

        DevicePrincipal authenticated = currentDevicePrincipal();
        Device device = resolveDevice(envelope, authenticated);

        if (!DeviceStatuses.canPublish(device)) {
            throw new UnauthorizedException("Device is " + device.getLifecycle());
        }
        if (envelope.getPlantId() != null && !envelope.getPlantId().equals(device.getPlantId())) {
            throw new UnauthorizedException("Plant does not match authenticated device");
        }
        if (envelope.getDeviceUid() != null && !envelope.getDeviceUid().isBlank()
                && !envelope.getDeviceUid().equalsIgnoreCase(device.getDeviceUid())) {
            throw new UnauthorizedException("deviceId does not match authenticated device");
        }
        if (envelope.getChipId() != null && !envelope.getChipId().isBlank()
                && device.getChipId() != null
                && !device.getChipId().equalsIgnoreCase(envelope.getChipId().trim())) {
            throw new UnauthorizedException("chipId does not match registered device");
        }

        String messageId = normalizeMessageId(envelope.getMessageId(), device.getId(), receivedAt);
        if (sensorMessageRepository.existsByMessageId(messageId)) {
            return IngestResult.builder()
                    .duplicate(true)
                    .deviceId(device.getId())
                    .deviceUid(device.getDeviceUid())
                    .warnings(List.of("Duplicate messageId; readings not re-applied"))
                    .build();
        }

        LocalDateTime sourceTs = resolveTimestamp(envelope.getSourceTimestamp(), receivedAt);
        DataQuality clockQuality = envelope.getSourceTimestamp() == null
                ? DataQuality.CLOCK_INFERRED
                : DataQuality.MEASURED;

        List<SensorReadingResponse> responses = new ArrayList<>();
        List<String> warnings = new ArrayList<>();

        for (IngestPoint point : envelope.getReadings()) {
            if (point.getValue() == null || point.getValue().isNaN() || point.getValue().isInfinite()) {
                warnings.add("Skipped invalid numeric value");
                continue;
            }
            DeviceChannel channel = resolveChannel(device, point);
            if (!channel.isActive()) {
                throw new BadRequestException("Channel " + channel.getChannelId() + " is inactive");
            }
            SensorNode node = requireNodeOnDevicePlant(device, channel, point);
            if (!node.getPlant().getPlantId().equals(device.getPlantId())) {
                throw new UnauthorizedException("Cross-plant channel mapping rejected");
            }
            if (point.getSensorType() != null && point.getSensorType() != channel.getMeasurementType()) {
                throw new BadRequestException("sensorType does not match channel mapping");
            }

            double raw = point.getValue();
            double engineering = channel.getSlope() * raw + channel.getIntercept();
            DataQuality quality = clockQuality;
            if (outsideHardRange(channel, engineering)) {
                throw new BadRequestException("Value outside hard validity range for channel "
                        + channel.getChannelId());
            }
            if (outsideSoftRange(channel, engineering)) {
                quality = DataQuality.BAD;
                warnings.add("Channel " + channel.getChannelId() + " outside soft validity range");
            }

            SensorReading reading = SensorReading.builder()
                    .plantId(device.getPlantId())
                    .nodeId(node.getNodeId())
                    .sensorTypeCode(channel.getMeasurementType() == null
                            ? null : channel.getMeasurementType().name().toLowerCase(Locale.ROOT))
                    .valueJson(objectMapper.getNodeFactory().numberNode(engineering))
                    .rawValue(raw)
                    .recordedAt(sourceTs.atZone(ZoneId.systemDefault()).toInstant())
                    .quality(quality)
                    .tenantId(device.getTenantId())
                    .deviceUid(device.getDeviceUid())
                    .channelId(channel.getChannelId())
                    .messageId(messageId)
                    .configVersion(device.getConfigVersion())
                    .unit(channel.getEngineeringUnit())
                    .build();
            reading = sensorReadingRepository.save(reading);

            node.setLastReadingAt(sourceTs);
            if (node.getStatus() == NodeStatus.OFFLINE) {
                node.setStatus(NodeStatus.ACTIVE);
            }
            if (envelope.getRssi() != null) {
                node.setSignalStrength(rssiToPercent(envelope.getRssi()));
            }
            if (envelope.getIp() != null && !envelope.getIp().isBlank()) {
                node.setDeviceIp(envelope.getIp().trim());
            }
            // Firmware only when genuinely reported — never invent.
            if (envelope.getFirmwareVersion() != null && !envelope.getFirmwareVersion().isBlank()) {
                node.setFirmwareVersion(envelope.getFirmwareVersion().trim());
            }
            sensorNodeRepository.save(node);

            if (quality == DataQuality.MEASURED || quality == DataQuality.CLOCK_INFERRED) {
                alertService.evaluateReading(reading);
            }

            responses.add(SensorReadingResponse.builder()
                    .id(reading.getId())
                    .plantId(reading.getPlantId())
                    .nodeId(reading.getNodeId())
                    .sensorType(reading.getSensorType())
                    .value(reading.getValue())
                    .recordedAt(reading.getRecordedAt())
                    .build());
        }

        try {
            ObjectNode payload = objectMapper.createObjectNode();
            payload.put("transport", (envelope.getTransport() != null ? envelope.getTransport() : IngestTransport.HTTP).name());
            payload.put("reading_count", responses.size());
            if (envelope.getPayloadExcerpt() != null) {
                payload.put("excerpt", envelope.getPayloadExcerpt());
            }
            sensorMessageRepository.save(SensorMessage.builder()
                    .messageId(messageId)
                    .tenantId(device.getTenantId())
                    .deviceId(device.getDeviceUid())
                    .recordedAt(sourceTs.atZone(ZoneId.systemDefault()).toInstant())
                    .receivedAt(receivedAt.atZone(ZoneId.systemDefault()).toInstant())
                    .payload(payload)
                    .build());
        } catch (DataIntegrityViolationException dup) {
            return IngestResult.builder()
                    .duplicate(true)
                    .deviceId(device.getId())
                    .deviceUid(device.getDeviceUid())
                    .warnings(List.of("Duplicate messageId; concurrent ingest ignored"))
                    .build();
        }

        device.setLastSeenAt(Instant.now());
        if (envelope.getIp() != null && !envelope.getIp().isBlank()) {
            device.setLastIp(envelope.getIp().trim());
        }
        if (envelope.getRssi() != null) {
            device.setLastRssi(envelope.getRssi());
        }
        if (envelope.getFirmwareVersion() != null && !envelope.getFirmwareVersion().isBlank()) {
            device.setFirmwareVersion(envelope.getFirmwareVersion().trim());
        }
        if (device.getLifecycle() == DeviceLifecycle.COMMISSIONING) {
            device.setLifecycle(DeviceLifecycle.ACTIVE);
        }
        deviceRepository.save(device);

        if (!responses.isEmpty()) {
            aiHealthService.analyzePlant(device.getPlantId());
        }

        return IngestResult.builder()
                .duplicate(false)
                .deviceId(device.getId())
                .deviceUid(device.getDeviceUid())
                .readings(responses)
                .warnings(warnings)
                .build();
    }

    private Device resolveDevice(IngestEnvelope envelope, DevicePrincipal authenticated) {
        if (authenticated != null) {
            return deviceRepository.findById(authenticated.getDeviceId())
                    .orElseThrow(() -> new UnauthorizedException("Authenticated device no longer exists"));
        }

        if (!compatLegacy) {
            throw new UnauthorizedException("Device credentials required");
        }

        // Legacy path: only when global compat is on AND device is flagged (or not yet provisioned).
        if (envelope.getPlantId() == null) {
            throw new BadRequestException("plantId is required");
        }

        Optional<Device> byUid = envelope.getDeviceUid() != null && !envelope.getDeviceUid().isBlank()
                ? deviceRepository.findFirstByDeviceUid(envelope.getDeviceUid().trim())
                : Optional.empty();
        Optional<Device> byChip = envelope.getChipId() != null && !envelope.getChipId().isBlank()
                ? deviceRepository.findByPlantIdAndChipId(
                envelope.getPlantId(), envelope.getChipId().trim().toLowerCase(Locale.ROOT))
                : Optional.empty();

        Device device = byUid.or(() -> byChip).orElse(null);
        if (device != null) {
            if (!device.isLegacyCompat()) {
                throw new UnauthorizedException("Device requires credentials; legacy ingest disabled for this device");
            }
            if (!device.getPlantId().equals(envelope.getPlantId())) {
                throw new UnauthorizedException("Cross-plant legacy ingest rejected");
            }
            log.debug("Legacy-compat ingest for device {}", device.getDeviceUid());
            return device;
        }

        // Pre-registry nodes: resolve first reading's node to synthesize temporary binding via chip-less path.
        // Prefer requiring chipId so we do not accept arbitrary plant/node floods without device identity.
        if (envelope.getChipId() == null || envelope.getChipId().isBlank()) {
            // Allow node-scoped single ingest only when every point has nodeId (firmware batch always has chip).
            Long nodeId = envelope.getReadings().get(0).getNodeId();
            if (nodeId == null) {
                throw new UnauthorizedException("Device credentials or chipId required");
            }
            SensorNode node = sensorNodeRepository.findByNodeIdAndPlantPlantId(nodeId, envelope.getPlantId())
                    .orElseThrow(() -> new BadRequestException("Invalid plant/node combination"));
            if (node.getDeviceChipId() != null && !node.getDeviceChipId().isBlank()) {
                throw new UnauthorizedException("Paired hub requires chipId or device credentials");
            }
            // Standalone instrument (no hub): create ephemeral REST gateway device on the fly? Too heavy.
            // Persist via synthetic device lookup failure → use node-only compat device record.
            return ensureManualInstrumentDevice(envelope.getPlantId(), node);
        }

        throw new UnauthorizedException("Unknown device; pair the hub before ingest");
    }

    private Device ensureManualInstrumentDevice(Long plantId, SensorNode node) {
        String uid = "SWARM-NODE-" + node.getNodeId();
        return deviceRepository.findFirstByDeviceUid(uid).orElseGet(() -> {
            Device created = Device.builder()
                    .plantId(plantId)
                    .tenantId(node.getPlant() != null && node.getPlant().getCompany() != null
                            ? node.getPlant().getCompany().getId() : null)
                    .deviceUid(uid)
                    .deviceName(node.getNodeName())
                    .deviceKind(com.biopower.model.enums.DeviceKind.MANUAL)
                    .lifecycle(DeviceLifecycle.ACTIVE)
                    .legacyCompat(true)
                    .configVersion(1)
                    .build();
            created = deviceRepository.save(created);
            deviceChannelRepository.save(DeviceChannel.builder()
                    .deviceId(created.getId())
                    .channelId("1")
                    .sensorNodeId(node.getNodeId())
                    .measurementType(node.getSensorType())
                    .slope(1.0)
                    .intercept(0.0)
                    .active(true)
                    .build());
            return created;
        });
    }

    private DeviceChannel resolveChannel(Device device, IngestPoint point) {
        if (point.getChannelId() != null && !point.getChannelId().isBlank()) {
            String channelId = point.getChannelId().trim();
            return deviceChannelRepository.findByDeviceIdAndChannelId(device.getId(), channelId)
                    .map(existing -> applyDiscoveryMetadata(existing, point))
                    .orElseGet(() -> discoverChannel(device, channelId, point));
        }
        if (point.getNodeId() != null) {
            return deviceChannelRepository.findByDeviceIdAndSensorNodeId(device.getId(), point.getNodeId())
                    .or(() -> {
                        SensorNode node = sensorNodeRepository
                                .findByNodeIdAndPlantPlantId(point.getNodeId(), device.getPlantId())
                                .orElseThrow(() -> new BadRequestException("Invalid plant/node combination"));
                        if (device.getChipId() != null && node.getDeviceChipId() != null
                                && !device.getChipId().equalsIgnoreCase(node.getDeviceChipId())) {
                            throw new UnauthorizedException("Node does not belong to this device");
                        }
                        DeviceChannel created = DeviceChannel.builder()
                                .deviceId(device.getId())
                                .channelId(nextChannelId(device.getId()))
                                .sensorNodeId(node.getNodeId())
                                .measurementType(node.getSensorType())
                                .engineeringUnit(SensorCatalog.defaultUnit(node.getSensorType()))
                                .slope(1.0)
                                .intercept(0.0)
                                .active(true)
                                .build();
                        return Optional.of(deviceChannelRepository.save(created));
                    })
                    .orElseThrow(() -> new BadRequestException("Unable to resolve channel for node"));
        }
        if (point.getSensorType() != null) {
            return deviceChannelRepository.findByDeviceIdAndMeasurementType(device.getId(), point.getSensorType())
                    .orElseGet(() -> discoverChannel(device, nextChannelId(device.getId()), point));
        }
        throw new BadRequestException("Each reading needs channelId or nodeId");
    }

    /**
     * Authenticated telemetry may introduce a previously unseen channel. The physical
     * device is the node; each channel is one logical sensor. Concurrent MQTT messages
     * are collapsed by {@code uq_device_channel (device_id, channel_id)}.
     */
    private DeviceChannel discoverChannel(Device device, String channelId, IngestPoint point) {
        try {
            SensorType type = point.getSensorType() != null ? point.getSensorType() : SensorType.GENERIC;
            String unit = blankToNull(point.getUnit());
            if (unit == null) {
                unit = SensorCatalog.defaultUnit(type);
            }
            String tag = blankToNull(point.getName());
            SensorNode node = createDiscoveredNode(device, channelId, type, tag);
            DeviceChannel created = DeviceChannel.builder()
                    .deviceId(device.getId())
                    .channelId(channelId)
                    .sensorNodeId(node.getNodeId())
                    .measurementType(type)
                    .engineeringUnit(unit)
                    .instrumentTag(tag)
                    .slope(1.0)
                    .intercept(0.0)
                    .hardMin(SensorCatalog.hardMin(type))
                    .hardMax(SensorCatalog.hardMax(type))
                    .active(true)
                    .build();
            return deviceChannelRepository.save(created);
        } catch (DataIntegrityViolationException dup) {
            return deviceChannelRepository.findByDeviceIdAndChannelId(device.getId(), channelId)
                    .orElseThrow(() -> new BadRequestException("Unknown channelId " + channelId));
        }
    }

    private DeviceChannel applyDiscoveryMetadata(DeviceChannel channel, IngestPoint point) {
        boolean dirty = false;
        if (channel.getMeasurementType() == SensorType.GENERIC && point.getSensorType() != null) {
            channel.setMeasurementType(point.getSensorType());
            dirty = true;
        }
        if ((channel.getEngineeringUnit() == null || channel.getEngineeringUnit().isBlank())
                && blankToNull(point.getUnit()) != null) {
            channel.setEngineeringUnit(point.getUnit().trim());
            dirty = true;
        }
        if ((channel.getInstrumentTag() == null || channel.getInstrumentTag().isBlank())
                && blankToNull(point.getName()) != null) {
            channel.setInstrumentTag(point.getName().trim());
            dirty = true;
        }
        return dirty ? deviceChannelRepository.save(channel) : channel;
    }

    private SensorNode requireNodeOnDevicePlant(Device device, DeviceChannel channel, IngestPoint point) {
        if (channel.getSensorNodeId() != null) {
            SensorNode node = sensorNodeRepository.findById(channel.getSensorNodeId()).orElse(null);
            if (node != null && node.getPlant() != null
                    && node.getPlant().getPlantId().equals(device.getPlantId())) {
                return node;
            }
        }
        SensorType type = channel.getMeasurementType() != null ? channel.getMeasurementType()
                : (point.getSensorType() != null ? point.getSensorType() : SensorType.GENERIC);
        SensorNode node = createDiscoveredNode(device, channel.getChannelId(), type, channel.getInstrumentTag());
        channel.setSensorNodeId(node.getNodeId());
        deviceChannelRepository.save(channel);
        return node;
    }

    private SensorNode createDiscoveredNode(Device device, String channelId, SensorType type, String tag) {
        Plant plant = plantRepository.findById(device.getPlantId())
                .orElseThrow(() -> new BadRequestException("Registered device plant is missing"));
        String nodeName = blankToNull(tag) != null ? tag.trim() : type.name() + "-" + channelId;
        SensorNode node = SensorNode.builder()
                .plant(plant)
                .nodeName(nodeName)
                .sensorType(type)
                .deviceChipId(device.getChipId())
                .status(NodeStatus.ACTIVE)
                .build();
        return sensorNodeRepository.save(node);
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value;
    }

    private String nextChannelId(Long deviceId) {
        int max = 0;
        for (DeviceChannel channel : deviceChannelRepository.findByDeviceIdOrderByChannelIdAsc(deviceId)) {
            try {
                max = Math.max(max, Integer.parseInt(channel.getChannelId()));
            } catch (NumberFormatException ignored) {
                // text channel ids from Pi are not in the numeric sequence
            }
        }
        return String.valueOf(max + 1);
    }

    private LocalDateTime resolveTimestamp(LocalDateTime source, LocalDateTime receivedAt) {
        if (source == null) {
            return receivedAt;
        }
        if (source.isAfter(receivedAt.plusMinutes(MAX_FUTURE_MINUTES))) {
            throw new BadRequestException("Timestamp too far in the future");
        }
        if (source.isBefore(receivedAt.minus(MAX_PAST_DAYS, ChronoUnit.DAYS))) {
            throw new BadRequestException("Timestamp older than retention window");
        }
        return source;
    }

    private String normalizeMessageId(String messageId, Long deviceId, LocalDateTime receivedAt) {
        if (messageId != null && !messageId.isBlank()) {
            String id = messageId.trim();
            if (id.length() > 128) {
                throw new BadRequestException("messageId too long");
            }
            return id;
        }
        // No client id: per-second bucket still collapses exact duplicate floods weakly.
        return "auto-" + deviceId + "-" + receivedAt.truncatedTo(ChronoUnit.SECONDS);
    }

    private boolean outsideHardRange(DeviceChannel channel, double value) {
        if (channel.getHardMin() != null && value < channel.getHardMin()) {
            return true;
        }
        return channel.getHardMax() != null && value > channel.getHardMax();
    }

    private boolean outsideSoftRange(DeviceChannel channel, double value) {
        if (channel.getValidityMin() != null && value < channel.getValidityMin()) {
            return true;
        }
        return channel.getValidityMax() != null && value > channel.getValidityMax();
    }

    private void reject(IngestEnvelope envelope, IngestTransport transport, String code, String detail,
                        LocalDateTime receivedAt) {
        try {
            ingestRejectedRepository.save(IngestRejected.builder()
                    .deviceUid(envelope != null ? envelope.getDeviceUid() : null)
                    .plantId(envelope != null ? envelope.getPlantId() : null)
                    .transport(transport != null ? transport : IngestTransport.HTTP)
                    .reasonCode(code)
                    .reasonDetail(trim(detail, 512))
                    .payloadExcerpt(envelope != null ? trim(envelope.getPayloadExcerpt(), 1024) : null)
                    .receivedAt(receivedAt)
                    .build());
        } catch (Exception e) {
            log.warn("Failed to persist ingest rejection: {}", e.getMessage());
        }
    }

    private DevicePrincipal currentDevicePrincipal() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof DevicePrincipal devicePrincipal) {
            return devicePrincipal;
        }
        return null;
    }

    private int rssiToPercent(int rssi) {
        int percent = (int) ((rssi + 100) * 100.0 / 50.0);
        return Math.max(0, Math.min(100, percent));
    }

    private static String trim(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
