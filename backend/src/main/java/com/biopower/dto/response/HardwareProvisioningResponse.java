// PURPOSE: Request/response DTO for SWARM API payloads (HardwareProvisioningResponse).
package com.biopower.dto.response;

import com.biopower.model.enums.DeviceKind;
import com.biopower.model.enums.DeviceLifecycle;
import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Shareable hardware configuration. Never includes stored secret hashes.
 * {@code deviceSecret} is present only immediately after register/rotate.
 */
@Data
@Builder
public class HardwareProvisioningResponse {
    private UUID tenantId;
    private String tenantName;
    private Long plantId;
    private String plantName;
    private Long devicePk;
    private String deviceUid;
    private String chipId;
    private String deviceName;
    private DeviceKind deviceKind;
    private DeviceLifecycle lifecycle;
    private String status;
    private String provisioningStatus;
    private boolean credentialsIssued;
    private boolean secretShownOnce;
    /** One-time plaintext. Null on later GET. */
    private String deviceSecret;
    private String mqttBrokerHost;
    private Integer mqttBrokerPort;
    private String mqttInternalHost;
    private Integer mqttInternalPort;
    private String mqttTelemetryTopic;
    private String mqttLegacyTopic;
    private Integer mqttQos;
    private String mqttAuthUsername;
    private String mqttAuthHint;
    private String protocolVersion;
    private String schemaVersion;
    private Map<String, Object> payloadExample;
    private List<FieldDeviceChannelResponse> channels;
    private List<String> notes;
}
