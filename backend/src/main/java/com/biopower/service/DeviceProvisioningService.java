// PURPOSE: Application service implementing SWARM device provisioning and hardware export.
package com.biopower.service;

import com.biopower.dto.request.DeviceChannelRequest;
import com.biopower.dto.request.DeviceLifecycleRequest;
import com.biopower.dto.request.DeviceReassignRequest;
import com.biopower.dto.request.DeviceRegisterRequest;
import com.biopower.dto.response.ControlCenterIotStatusResponse;
import com.biopower.dto.response.FieldDeviceChannelResponse;
import com.biopower.dto.response.FieldDeviceResponse;
import com.biopower.dto.response.HardwareProvisioningResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.exception.ResourceNotFoundException;
import com.biopower.model.entity.Company;
import com.biopower.model.entity.Device;
import com.biopower.model.entity.DeviceAuditEvent;
import com.biopower.model.entity.DeviceChannel;
import com.biopower.model.entity.IngestRejected;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.enums.DeviceKind;
import com.biopower.model.enums.DeviceLifecycle;
import com.biopower.model.enums.NodeStatus;
import com.biopower.model.enums.SensorType;
import com.biopower.mqtt.MqttConnectionHealth;
import com.biopower.repository.DeviceAuditEventRepository;
import com.biopower.repository.DeviceChannelRepository;
import com.biopower.repository.DeviceRepository;
import com.biopower.repository.IngestRejectedRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import com.biopower.util.DeviceSecretHasher;
import com.biopower.util.DeviceStatuses;
import com.biopower.util.SensorCatalog;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class DeviceProvisioningService {

    private static final String PROTOCOL = "swarm/v1";
    private static final String SCHEMA = "1.0";

    private final PlantRepository plantRepository;
    private final DeviceRepository deviceRepository;
    private final DeviceChannelRepository deviceChannelRepository;
    private final SensorNodeRepository sensorNodeRepository;
    private final DeviceRegistryService deviceRegistryService;
    private final FieldDeviceQueryService fieldDeviceQueryService;
    private final MqttConnectionHealth mqttConnectionHealth;
    private final IngestRejectedRepository ingestRejectedRepository;
    private final DeviceAuditEventRepository deviceAuditEventRepository;

    @Value("${mqtt.enabled:false}")
    private boolean mqttEnabled;

    @Value("${mqtt.swarm-topic:swarm/v1/+/+/+/telemetry}")
    private String swarmTopic;

    @Value("${mqtt.topic:biopower/sensors/#}")
    private String legacyTopic;

    @Value("${biopower.swarm.mqtt-public-host:127.0.0.1}")
    private String mqttPublicHost;

    @Value("${biopower.swarm.mqtt-public-port:1884}")
    private int mqttPublicPort;

    @Value("${biopower.swarm.mqtt-internal-host:mosquitto}")
    private String mqttInternalHost;

    @Value("${biopower.swarm.mqtt-internal-port:1883}")
    private int mqttInternalPort;

    @Value("${biopower.alert.sensor-timeout-minutes:10}")
    private int sensorTimeoutMinutes;

    @Transactional
    public HardwareProvisioningResponse register(DeviceRegisterRequest request) {
        Plant plant = requirePlant(request.getPlantId());
        Company tenant = plant.getCompany();
        if (tenant == null) {
            throw new BadRequestException("Assign the plant to a tenant before registering devices");
        }
        if (request.getTenantId() != null && !request.getTenantId().equals(tenant.getId())) {
            throw new BadRequestException("Plant does not belong to the requested tenant");
        }

        String uid = allocateUid(request.getDeviceUid(), request.getChipId());
        String chipId = request.getChipId() == null || request.getChipId().isBlank()
                ? null
                : request.getChipId().trim().toLowerCase(Locale.ROOT);
        if (chipId != null && deviceRepository.findByPlantIdAndChipId(plant.getPlantId(), chipId).isPresent()) {
            throw new BadRequestException("A device with this chip ID is already registered on the plant");
        }

        String rawSecret = DeviceSecretHasher.generateRawSecret();
        DeviceKind kind = request.getDeviceKind() != null ? request.getDeviceKind() : DeviceKind.MQTT_GATEWAY;
        DeviceLifecycle lifecycle = request.getLifecycle() != null
                ? request.getLifecycle()
                : DeviceLifecycle.COMMISSIONING;
        if (lifecycle == DeviceLifecycle.SUSPENDED || lifecycle == DeviceLifecycle.RETIRED) {
            throw new BadRequestException("Register the device first, then suspend or retire it");
        }
        String name = request.getDeviceName() == null || request.getDeviceName().isBlank()
                ? uid
                : request.getDeviceName().trim();

        Device device = Device.builder()
                .tenantId(tenant.getId())
                .plantId(plant.getPlantId())
                .deviceUid(uid)
                .chipId(chipId)
                .deviceName(name)
                .deviceKind(kind)
                .lifecycle(lifecycle)
                .secretHash(DeviceSecretHasher.hash(rawSecret))
                .legacyCompat(false)
                .configVersion(1)
                .build();
        device = deviceRepository.save(device);

        List<DeviceChannelRequest> channels = request.getChannels() == null ? List.of() : request.getChannels();
        int autoChannel = 1;
        for (DeviceChannelRequest spec : channels) {
            if (spec.getMeasurementType() == null) {
                throw new BadRequestException("Each channel requires measurementType");
            }
            String channelId = spec.getChannelId() == null || spec.getChannelId().isBlank()
                    ? String.valueOf(autoChannel++)
                    : spec.getChannelId().trim();
            SensorNode node = createSensorNode(plant, device, spec, channelId);
            upsertChannel(device.getId(), spec, channelId, node.getNodeId());
        }

        HardwareProvisioningResponse response =
                toProvisioning(deviceRepository.findById(device.getId()).orElse(device), rawSecret, true);
        audit(device, "REGISTERED", "Assigned to tenant " + tenant.getId() + " plant " + plant.getPlantId());
        return response;
    }

    @Transactional(readOnly = true)
    public List<FieldDeviceResponse> listDevices(UUID tenantId, Long plantId) {
        List<Device> devices;
        if (plantId != null) {
            Plant plant = requirePlant(plantId);
            if (tenantId != null && plant.getCompany() != null && !plant.getCompany().getId().equals(tenantId)) {
                throw new BadRequestException("Plant does not belong to the selected tenant");
            }
            if (tenantId != null && plant.getCompany() == null) {
                throw new BadRequestException("Plant is not assigned to a tenant");
            }
            devices = deviceRepository.findByPlantId(plantId);
        } else if (tenantId != null) {
            devices = deviceRepository.findByTenantId(tenantId);
        } else {
            devices = deviceRepository.findAll();
        }
        return devices.stream().map(fieldDeviceQueryService::describe).toList();
    }

    @Transactional(readOnly = true)
    public FieldDeviceResponse getDevice(Long id) {
        return fieldDeviceQueryService.describe(requireDevice(id));
    }

    @Transactional(readOnly = true)
    public HardwareProvisioningResponse getProvisioning(Long id) {
        return toProvisioning(requireDevice(id), null, false);
    }

    @Transactional
    public HardwareProvisioningResponse rotateSecret(Long id) {
        Device device = requireDevice(id);
        String raw = deviceRegistryService.rotateSecret(id);
        device.setLegacyCompat(false);
        device.setConfigVersion(device.getConfigVersion() + 1);
        deviceRepository.save(device);
        audit(device, "SECRET_ROTATED", "Previous secret revoked; new secret issued once");
        return toProvisioning(deviceRepository.findById(device.getId()).orElse(device), raw, true);
    }

    @Transactional
    public HardwareProvisioningResponse revokeSecret(Long id) {
        Device device = requireDevice(id);
        device.setSecretHash(null);
        device.setLegacyCompat(false);
        device.setConfigVersion(device.getConfigVersion() + 1);
        deviceRepository.save(device);
        audit(device, "SECRET_REVOKED", "Publishing credentials removed");
        return toProvisioning(device, null, false);
    }

    @Transactional
    public FieldDeviceResponse reassign(Long id, DeviceReassignRequest request) {
        Device device = requireDevice(id);
        Plant plant = requirePlant(request.getPlantId());
        Company tenant = plant.getCompany();
        if (tenant == null) {
            throw new BadRequestException("Assign the destination plant to a tenant before reassignment");
        }
        if (request.getTenantId() != null && !request.getTenantId().equals(tenant.getId())) {
            throw new BadRequestException("Plant does not belong to the requested tenant");
        }
        UUID previousTenant = device.getTenantId();
        Long previousPlant = device.getPlantId();
        if (tenant.getId().equals(previousTenant) && plant.getPlantId().equals(previousPlant)) {
            return fieldDeviceQueryService.describe(device);
        }

        for (DeviceChannel channel : deviceChannelRepository.findByDeviceIdOrderByChannelIdAsc(device.getId())) {
            channel.setSensorNodeId(null);
            deviceChannelRepository.save(channel);
        }
        device.setTenantId(tenant.getId());
        device.setPlantId(plant.getPlantId());
        device.setConfigVersion(device.getConfigVersion() + 1);
        if (device.getLifecycle() == DeviceLifecycle.ACTIVE) {
            device.setLifecycle(DeviceLifecycle.COMMISSIONING);
        }
        deviceRepository.save(device);
        audit(device, "REASSIGNED",
                "From tenant " + previousTenant + " plant " + previousPlant
                        + " to tenant " + tenant.getId() + " plant " + plant.getPlantId()
                        + ". Historical telemetry stays on the previous plant.");
        return fieldDeviceQueryService.describe(device);
    }

    @Transactional
    public FieldDeviceResponse setLifecycle(Long id, DeviceLifecycleRequest request) {
        Device device = requireDevice(id);
        DeviceLifecycle next = request.getLifecycle();
        if (next == null) {
            throw new BadRequestException("lifecycle is required");
        }
        if (next != DeviceLifecycle.SUSPENDED && next != DeviceLifecycle.ACTIVE
                && next != DeviceLifecycle.RETIRED && next != DeviceLifecycle.COMMISSIONING
                && next != DeviceLifecycle.MAINTENANCE) {
            throw new BadRequestException("Unsupported lifecycle transition");
        }
        DeviceLifecycle previous = device.getLifecycle();
        if (next == DeviceLifecycle.ACTIVE && device.getLastSeenAt() == null) {
            next = DeviceLifecycle.COMMISSIONING;
        }
        device.setLifecycle(next);
        deviceRepository.save(device);
        String action = next == DeviceLifecycle.SUSPENDED ? "SUSPENDED"
                : (next == DeviceLifecycle.RETIRED ? "RETIRED" : "REACTIVATED");
        audit(device, action, "Lifecycle " + previous + " → " + next);
        return fieldDeviceQueryService.describe(device);
    }

    @Transactional(readOnly = true)
    public List<DeviceAuditEvent> listAudit(Long id) {
        requireDevice(id);
        return deviceAuditEventRepository.findByDeviceIdOrderByCreatedAtDesc(id);
    }

    @Transactional
    public FieldDeviceChannelResponse upsertChannel(Long deviceId, DeviceChannelRequest request) {
        Device device = requireDevice(deviceId);
        Long nodeId = request.getSensorNodeId();
        if (nodeId == null && request.getMeasurementType() != null) {
            Plant plant = requirePlant(device.getPlantId());
            SensorNode node = createSensorNode(plant, device, request,
                    request.getChannelId() == null ? "1" : request.getChannelId());
            nodeId = node.getNodeId();
        }
        DeviceChannel channel = upsertChannel(deviceId, request, request.getChannelId(), nodeId);
        return fieldDeviceQueryService.describeChannel(channel);
    }

    @Transactional(readOnly = true)
    public ControlCenterIotStatusResponse iotStatus() {
        List<Device> devices = deviceRepository.findAll();
        int seen = 0;
        for (Device device : devices) {
            if (device.getLastSeenAt() != null) {
                seen++;
            }
        }
        List<ControlCenterIotStatusResponse.IngestRejectionSummary> rejections =
                ingestRejectedRepository.findTop20ByOrderByReceivedAtDesc().stream()
                        .map(this::toRejection)
                        .toList();
        return ControlCenterIotStatusResponse.builder()
                .enabled(mqttEnabled)
                .configured(mqttConnectionHealth.isConfigured())
                .connected(mqttEnabled && mqttConnectionHealth.isConnected())
                .brokerUrl(mqttEnabled ? mqttConnectionHealth.getBrokerUrl() : null)
                .topics(mqttEnabled ? mqttConnectionHealth.getTopics() : new String[0])
                .messagesReceived(mqttConnectionHealth.getMessagesReceived())
                .failures(mqttConnectionHealth.getFailures())
                .lastConnectedAt(mqttConnectionHealth.getLastConnectedAt())
                .lastMessageAt(mqttConnectionHealth.getLastMessageAt())
                .lastError(mqttConnectionHealth.getLastError())
                .swarmTopicPattern(swarmTopic)
                .legacyTopicPattern(legacyTopic)
                .protocolVersion(PROTOCOL)
                .registeredDevices(devices.size())
                .devicesSeen(seen)
                .recentRejections(rejections)
                .build();
    }

    private DeviceChannel upsertChannel(Long deviceId, DeviceChannelRequest spec, String channelId, Long nodeId) {
        SensorType type = spec.getMeasurementType();
        String unit = spec.getEngineeringUnit() == null || spec.getEngineeringUnit().isBlank()
                ? (type == null ? null : SensorCatalog.defaultUnit(type))
                : spec.getEngineeringUnit();
        return deviceRegistryService.upsertChannel(deviceId, new DeviceRegistryService.DeviceChannelUpdate(
                channelId,
                type,
                unit,
                spec.getInstrumentTag(),
                nodeId,
                spec.getEquipmentId(),
                spec.getProcessAreaId(),
                spec.getSlope(),
                spec.getIntercept(),
                spec.getValidityMin(),
                spec.getValidityMax(),
                spec.getHardMin() != null ? spec.getHardMin() : (type == null ? null : SensorCatalog.hardMin(type)),
                spec.getHardMax() != null ? spec.getHardMax() : (type == null ? null : SensorCatalog.hardMax(type)),
                spec.getSamplingIntervalSec() != null ? spec.getSamplingIntervalSec() : 30,
                spec.getActive() == null || spec.getActive()
        ));
    }

    private SensorNode createSensorNode(Plant plant, Device device, DeviceChannelRequest spec, String channelId) {
        SensorType type = spec.getMeasurementType();
        String nodeName = spec.getInstrumentTag() == null || spec.getInstrumentTag().isBlank()
                ? type.name() + "-" + channelId
                : spec.getInstrumentTag().trim();
        SensorNode node = SensorNode.builder()
                .plant(plant)
                .nodeName(nodeName)
                .sensorType(type)
                .deviceChipId(device.getChipId())
                .status(NodeStatus.ACTIVE)
                .build();
        return sensorNodeRepository.save(node);
    }

    private HardwareProvisioningResponse toProvisioning(Device device, String plaintextSecret, boolean shownOnce) {
        Plant plant = plantRepository.findById(device.getPlantId()).orElse(null);
        String tenantName = plant != null && plant.getCompany() != null ? plant.getCompany().getName() : null;
        UUID tenantId = device.getTenantId();
        String topic = PROTOCOL + "/" + tenantId + "/" + device.getPlantId() + "/" + device.getDeviceUid()
                + "/telemetry";
        List<DeviceChannel> channels = deviceChannelRepository.findByDeviceIdOrderByChannelIdAsc(device.getId());
        List<Map<String, Object>> readingExamples = new ArrayList<>();
        for (DeviceChannel channel : channels) {
            if (!channel.isActive()) {
                continue;
            }
            Map<String, Object> reading = new LinkedHashMap<>();
            reading.put("channelId", parseChannelNumber(channel.getChannelId()));
            reading.put("value", exampleValue(channel.getMeasurementType()));
            readingExamples.add(reading);
        }
        if (readingExamples.isEmpty()) {
            readingExamples.add(Map.of("channelId", 1, "value", 0));
        }
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("schemaVersion", SCHEMA);
        payload.put("deviceId", device.getDeviceUid());
        payload.put("messageId", "unique-message-id");
        payload.put("timestamp", "2026-01-01T00:00:00Z");
        payload.put("readings", readingExamples);

        List<String> notes = new ArrayList<>();
        notes.add("Topic tenant, plant and device UID must match this registered device.");
        notes.add("Unseen channelId values are discovered automatically; pre-creating sensors is optional.");
        notes.add("Measurement type and unit come from device_channels, or from the payload when a new channel is discovered.");
        notes.add("Historical telemetry stays on the plant where it was recorded if this device is later reassigned.");
        notes.add("Broker ACLs should restrict this topic to MQTT username = device UID. SWARM also verifies credentials when the publisher session is visible.");
        notes.add("Legacy topic biopower/sensors/# remains accepted for existing firmware.");
        if (shownOnce) {
            notes.add("Store the device secret now. It is shown once and never stored in plaintext.");
        } else {
            notes.add("Rotate credentials in Control Center if the hardware engineer needs a new secret.");
        }

        return HardwareProvisioningResponse.builder()
                .tenantId(tenantId)
                .tenantName(tenantName)
                .plantId(device.getPlantId())
                .plantName(plant != null ? plant.getPlantName() : null)
                .devicePk(device.getId())
                .deviceUid(device.getDeviceUid())
                .chipId(device.getChipId())
                .deviceName(device.getDeviceName())
                .deviceKind(device.getDeviceKind())
                .lifecycle(device.getLifecycle())
                .status(DeviceStatuses.operationalStatus(device, sensorTimeoutMinutes))
                .provisioningStatus(DeviceStatuses.provisioningStatus(device))
                .credentialsIssued(DeviceStatuses.credentialsIssued(device))
                .secretShownOnce(shownOnce)
                .deviceSecret(plaintextSecret)
                .mqttBrokerHost(mqttPublicHost)
                .mqttBrokerPort(mqttPublicPort)
                .mqttInternalHost(mqttInternalHost)
                .mqttInternalPort(mqttInternalPort)
                .mqttTelemetryTopic(topic)
                .mqttLegacyTopic(legacyTopic)
                .mqttQos(1)
                .mqttAuthUsername(device.getDeviceUid())
                .mqttAuthHint(shownOnce
                        ? "MQTT username is the device UID; password is the one-time device secret."
                        : "MQTT username is the device UID. Rotate the secret to issue a new password.")
                .protocolVersion(PROTOCOL)
                .schemaVersion(SCHEMA)
                .payloadExample(payload)
                .channels(channels.stream().map(fieldDeviceQueryService::describeChannel).toList())
                .notes(notes)
                .build();
    }

    private ControlCenterIotStatusResponse.IngestRejectionSummary toRejection(IngestRejected row) {
        return ControlCenterIotStatusResponse.IngestRejectionSummary.builder()
                .deviceUid(row.getDeviceUid())
                .plantId(row.getPlantId())
                .transport(row.getTransport() == null ? null : row.getTransport().name())
                .reasonCode(row.getReasonCode())
                .reasonDetail(row.getReasonDetail())
                .receivedAt(row.getReceivedAt() == null ? null : row.getReceivedAt().toInstant(ZoneOffset.UTC))
                .build();
    }

    private String allocateUid(String requested, String chipId) {
        if (requested != null && !requested.isBlank()) {
            String uid = requested.trim();
            if (deviceRepository.existsByDeviceUid(uid)) {
                throw new BadRequestException("Device UID already exists");
            }
            return uid;
        }
        return deviceRegistryService.allocateDeviceUid(chipId);
    }

    private Plant requirePlant(Long plantId) {
        return plantRepository.findById(plantId)
                .orElseThrow(() -> new ResourceNotFoundException("Plant not found: " + plantId));
    }

    private Device requireDevice(Long id) {
        return deviceRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException("Device not found: " + id));
    }

    private static Object parseChannelNumber(String channelId) {
        try {
            return Integer.parseInt(channelId);
        } catch (NumberFormatException ex) {
            return channelId;
        }
    }

    private static double exampleValue(SensorType type) {
        if (type == null) {
            return 0;
        }
        return switch (type) {
            case TEMPERATURE, TEMPERATURE_TRANSMITTER -> 38.5;
            case PH -> 7.2;
            case HUMIDITY, LIQUID_LEVEL -> 65.0;
            case METHANE -> 55.0;
            case PRESSURE, PRESSURE_TRANSMITTER -> 1.2;
            case GAS_FLOW, FLOW_TRANSMITTER -> 12.5;
            case CARBON_DIOXIDE -> 30.0;
            case HYDROGEN_SULFIDE, AMMONIA -> 5.0;
            case GENERIC -> 0;
        };
    }

    private void audit(Device device, String action, String detail) {
        try {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            String actor = auth != null && auth.getName() != null ? auth.getName() : "control-center";
            deviceAuditEventRepository.save(DeviceAuditEvent.builder()
                    .deviceId(device.getId())
                    .deviceUid(device.getDeviceUid())
                    .tenantId(device.getTenantId())
                    .plantId(device.getPlantId())
                    .action(action)
                    .actor(actor)
                    .detail(trimAudit(detail))
                    .build());
        } catch (Exception ex) {
            // Audit must never fail registration or ingest.
        }
    }

    private static String trimAudit(String detail) {
        if (detail == null) {
            return null;
        }
        return detail.length() <= 1024 ? detail : detail.substring(0, 1024);
    }
}
