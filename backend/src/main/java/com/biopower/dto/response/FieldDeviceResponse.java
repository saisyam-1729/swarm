// PURPOSE: Request/response DTO for SWARM API payloads (FieldDeviceResponse).
package com.biopower.dto.response;

import com.biopower.model.enums.DeviceKind;
import com.biopower.model.enums.DeviceLifecycle;
import lombok.Builder;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class FieldDeviceResponse {
    private Long id;
    private String deviceUid;
    private UUID tenantId;
    private String tenantName;
    private Long plantId;
    private String plantName;
    private String chipId;
    private String deviceName;
    private DeviceKind deviceKind;
    private DeviceLifecycle lifecycle;
    /** Derived: REGISTERED, PROVISIONED, AWAITING_TELEMETRY, ONLINE, OFFLINE, SUSPENDED, RETIRED. */
    private String status;
    private String provisioningStatus;
    private boolean legacyCompat;
    private boolean hasCredentials;
    private int nodeCount;
    private int sensorCount;
    private LocalDateTime lastSeenAt;
    private String lastIp;
    private Integer lastRssi;
    /** Null unless the device reported firmware. Never invented. */
    private String firmwareVersion;
    private int configVersion;
    private String connectionStatus;
    private List<FieldDeviceChannelResponse> channels;
}
