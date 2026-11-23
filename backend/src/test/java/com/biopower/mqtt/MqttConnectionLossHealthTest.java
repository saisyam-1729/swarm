// PURPOSE: Connection loss / reconnect status surface for MQTT health.
package com.biopower.mqtt;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class MqttConnectionLossHealthTest {

    @Test
    void reconnectClearsErrorAndMarksConnected() {
        MqttConnectionHealth health = new MqttConnectionHealth();
        health.markConfigured("tcp://localhost:1883", new String[]{"swarm/v1/+/+/+/telemetry"});
        health.markConnected();
        health.markDisconnected("Connection lost");
        assertFalse(health.isConnected());
        assertEquals("Connection lost", health.getLastError());

        health.markConnected();
        assertTrue(health.isConnected());
        assertNull(health.getLastError());
        assertNotNull(health.getLastConnectedAt());
    }
}
