// PURPOSE: Unit tests for derived device operational status.
package com.biopower.util;

import com.biopower.model.entity.Device;
import com.biopower.model.enums.DeviceLifecycle;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.junit.jupiter.api.Assertions.*;

class DeviceStatusesTest {

    @Test
    void provisionedDeviceWithoutTelemetryAwaitsReadings() {
        Device device = Device.builder()
                .lifecycle(DeviceLifecycle.COMMISSIONING)
                .secretHash("hash")
                .build();
        assertEquals(DeviceStatuses.AWAITING_TELEMETRY, DeviceStatuses.operationalStatus(device, 10));
        assertEquals(DeviceStatuses.PROVISIONED, DeviceStatuses.provisioningStatus(device));
        assertTrue(DeviceStatuses.canPublish(device));
    }

    @Test
    void recentTelemetryIsOnline() {
        Device device = Device.builder()
                .lifecycle(DeviceLifecycle.ACTIVE)
                .secretHash("hash")
                .lastSeenAt(Instant.now())
                .build();
        assertEquals(DeviceStatuses.ONLINE, DeviceStatuses.operationalStatus(device, 10));
    }

    @Test
    void staleTelemetryIsOffline() {
        Device device = Device.builder()
                .lifecycle(DeviceLifecycle.ACTIVE)
                .secretHash("hash")
                .lastSeenAt(Instant.now().minus(30, ChronoUnit.MINUTES))
                .build();
        assertEquals(DeviceStatuses.OFFLINE, DeviceStatuses.operationalStatus(device, 10));
    }

    @Test
    void suspendedCannotPublish() {
        Device device = Device.builder()
                .lifecycle(DeviceLifecycle.SUSPENDED)
                .secretHash("hash")
                .lastSeenAt(Instant.now())
                .build();
        assertEquals(DeviceStatuses.SUSPENDED, DeviceStatuses.operationalStatus(device, 10));
        assertFalse(DeviceStatuses.canPublish(device));
    }
}
