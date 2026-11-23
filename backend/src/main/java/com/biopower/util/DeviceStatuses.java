// PURPOSE: Derived device operational status from lifecycle + last-seen telemetry.
package com.biopower.util;

import com.biopower.model.entity.Device;
import com.biopower.model.enums.DeviceLifecycle;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/**
 * Administrative lifecycle stays on {@link DeviceLifecycle}.
 * Operational status is computed from credentials and last-seen telemetry so we do not
 * store ONLINE/OFFLINE as conflicting lifecycle values.
 */
public final class DeviceStatuses {

    public static final String REGISTERED = "REGISTERED";
    public static final String PROVISIONED = "PROVISIONED";
    public static final String AWAITING_TELEMETRY = "AWAITING_TELEMETRY";
    public static final String ONLINE = "ONLINE";
    public static final String OFFLINE = "OFFLINE";
    public static final String SUSPENDED = "SUSPENDED";
    public static final String RETIRED = "RETIRED";

    private DeviceStatuses() {
    }

    public static boolean credentialsIssued(Device device) {
        return device != null && device.getSecretHash() != null && !device.getSecretHash().isBlank();
    }

    public static boolean canPublish(Device device) {
        if (device == null) {
            return false;
        }
        DeviceLifecycle lifecycle = device.getLifecycle();
        return lifecycle != DeviceLifecycle.SUSPENDED && lifecycle != DeviceLifecycle.RETIRED;
    }

    public static String provisioningStatus(Device device) {
        if (device == null) {
            return REGISTERED;
        }
        if (device.getLifecycle() == DeviceLifecycle.SUSPENDED) {
            return SUSPENDED;
        }
        if (device.getLifecycle() == DeviceLifecycle.RETIRED) {
            return RETIRED;
        }
        return credentialsIssued(device) ? PROVISIONED : REGISTERED;
    }

    public static String operationalStatus(Device device, int timeoutMinutes) {
        if (device == null) {
            return REGISTERED;
        }
        if (device.getLifecycle() == DeviceLifecycle.SUSPENDED) {
            return SUSPENDED;
        }
        if (device.getLifecycle() == DeviceLifecycle.RETIRED) {
            return RETIRED;
        }
        Instant lastSeen = device.getLastSeenAt();
        if (lastSeen == null) {
            return credentialsIssued(device) ? AWAITING_TELEMETRY : REGISTERED;
        }
        int timeout = Math.max(timeoutMinutes, 1);
        if (lastSeen.isBefore(Instant.now().minus(timeout, ChronoUnit.MINUTES))) {
            return OFFLINE;
        }
        return ONLINE;
    }
}
