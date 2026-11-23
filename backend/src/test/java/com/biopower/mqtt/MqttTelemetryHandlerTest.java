// PURPOSE: Automated test covering SWARM MqttTelemetryHandlerTest.
package com.biopower.mqtt;

import com.biopower.exception.UnauthorizedException;
import com.biopower.model.entity.Device;
import com.biopower.model.enums.DeviceKind;
import com.biopower.model.enums.DeviceLifecycle;
import com.biopower.repository.DeviceRepository;
import com.biopower.service.TelemetryIngestService;
import com.biopower.telemetry.IngestEnvelope;
import com.biopower.telemetry.IngestResult;
import com.biopower.util.DeviceSecretHasher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class MqttTelemetryHandlerTest {

    @Mock TelemetryIngestService telemetryIngestService;
    @Mock DeviceRepository deviceRepository;

    MqttTelemetryHandler handler;

    Device device;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.clearContext();
        handler = new MqttTelemetryHandler(telemetryIngestService, deviceRepository, new ObjectMapper());
        org.springframework.test.util.ReflectionTestUtils.setField(handler, "trustBrokerAcls", false);
        device = Device.builder()
                .id(11L)
                .plantId(7L)
                .tenantId(java.util.UUID.fromString("00000000-0000-4000-8000-000000000003"))
                .deviceUid("SWARM-HUB-ABCD")
                .chipId("abcd")
                .deviceName("Hub")
                .deviceKind(DeviceKind.ESP_HUB)
                .lifecycle(DeviceLifecycle.ACTIVE)
                .secretHash(DeviceSecretHasher.hash("swd_secret"))
                .legacyCompat(false)
                .configVersion(1)
                .build();
    }

    @Test
    void v1PayloadOnMatchingTopicIsIngested() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        when(telemetryIngestService.ingest(any())).thenReturn(IngestResult.builder().build());

        String topic = "swarm/v1/3/7/SWARM-HUB-ABCD/telemetry";
        String payload = """
                {
                  "schemaVersion": "1.0",
                  "deviceId": "SWARM-HUB-ABCD",
                  "messageId": "m-100",
                  "timestamp": "2026-11-07T10:30:00Z",
                  "readings": [{"channelId": 1, "value": 38.5}, {"channelId": 2, "value": 7.2}]
                }
                """;

        handler.handle(topic, payload, "SWARM-HUB-ABCD", "swd_secret");

        ArgumentCaptor<IngestEnvelope> captor = ArgumentCaptor.forClass(IngestEnvelope.class);
        verify(telemetryIngestService).ingest(captor.capture());
        IngestEnvelope env = captor.getValue();
        assertEquals(7L, env.getPlantId());
        assertEquals("SWARM-HUB-ABCD", env.getDeviceUid());
        assertEquals("m-100", env.getMessageId());
        assertEquals(2, env.getReadings().size());
        assertEquals("1", env.getReadings().get(0).getChannelId());
    }

    @Test
    void crossPlantTopicIsRejected() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        String topic = "swarm/v1/3/99/SWARM-HUB-ABCD/telemetry";
        String payload = """
                {"schemaVersion":"1.0","deviceId":"SWARM-HUB-ABCD","messageId":"x",
                 "readings":[{"channelId":1,"value":1}]}
                """;

        assertThrows(UnauthorizedException.class,
                () -> handler.handle(topic, payload, "SWARM-HUB-ABCD", "swd_secret"));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void badPasswordRejected() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        assertThrows(UnauthorizedException.class,
                () -> handler.handle("swarm/v1/3/7/SWARM-HUB-ABCD/telemetry",
                        "{\"readings\":[{\"channelId\":1,\"value\":1}]}",
                        "SWARM-HUB-ABCD", "wrong"));
    }

    @Test
    void uuidTenantMismatchIsRejected() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        String otherTenant = "22222222-2222-4222-8222-222222222222";
        String topic = "swarm/v1/" + otherTenant + "/7/SWARM-HUB-ABCD/telemetry";
        String payload = """
                {"schemaVersion":"1.0","deviceId":"SWARM-HUB-ABCD","messageId":"x",
                 "readings":[{"channelId":1,"value":1}]}
                """;
        assertThrows(UnauthorizedException.class,
                () -> handler.handle(topic, payload, "SWARM-HUB-ABCD", "swd_secret"));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void uuidTenantMatchIsIngested() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        when(telemetryIngestService.ingest(any())).thenReturn(IngestResult.builder().build());
        String topic = "swarm/v1/" + device.getTenantId() + "/7/SWARM-HUB-ABCD/telemetry";
        String payload = """
                {"schemaVersion":"1.0","deviceId":"SWARM-HUB-ABCD","messageId":"m-ok",
                 "readings":[{"channelId":1,"value":38.5}]}
                """;
        handler.handle(topic, payload, "SWARM-HUB-ABCD", "swd_secret");
        verify(telemetryIngestService).ingest(any());
    }

    @Test
    void unauthenticatedPublisherIsRejected() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        assertThrows(UnauthorizedException.class,
                () -> handler.handle("swarm/v1/" + device.getTenantId() + "/7/SWARM-HUB-ABCD/telemetry",
                        "{\"readings\":[{\"channelId\":1,\"value\":1}]}",
                        null, null));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void suspendedDeviceIsRejected() {
        device.setLifecycle(DeviceLifecycle.SUSPENDED);
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        assertThrows(UnauthorizedException.class,
                () -> handler.handle("swarm/v1/" + device.getTenantId() + "/7/SWARM-HUB-ABCD/telemetry",
                        "{\"readings\":[{\"channelId\":1,\"value\":1}]}",
                        "SWARM-HUB-ABCD", "swd_secret"));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void unknownDeviceIsRejected() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.empty());
        assertThrows(UnauthorizedException.class,
                () -> handler.handle("swarm/v1/_/7/SWARM-HUB-ABCD/telemetry",
                        "{\"readings\":[{\"channelId\":1,\"value\":1}]}",
                        "SWARM-HUB-ABCD", "swd_secret"));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void invalidJsonIsRejected() {
        assertThrows(com.biopower.exception.BadRequestException.class,
                () -> handler.handle("swarm/v1/_/7/SWARM-HUB-ABCD/telemetry", "{not-json", null, null));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void payloadDeviceIdMismatchWithTopicIsRejected() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        String topic = "swarm/v1/" + device.getTenantId() + "/7/SWARM-HUB-ABCD/telemetry";
        String payload = """
                {"schemaVersion":"1.0","deviceId":"SWARM-HUB-OTHER","messageId":"x",
                 "readings":[{"channelId":1,"value":1}]}
                """;
        assertThrows(UnauthorizedException.class,
                () -> handler.handle(topic, payload, "SWARM-HUB-ABCD", "swd_secret"));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void missingReadingsValueIsRejected() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        String topic = "swarm/v1/" + device.getTenantId() + "/7/SWARM-HUB-ABCD/telemetry";
        String payload = """
                {"schemaVersion":"1.0","deviceId":"SWARM-HUB-ABCD","messageId":"x",
                 "readings":[{"channelId":1}]}
                """;
        assertThrows(com.biopower.exception.BadRequestException.class,
                () -> handler.handle(topic, payload, "SWARM-HUB-ABCD", "swd_secret"));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void emptyReadingsArrayIsRejected() {
        when(deviceRepository.findFirstByDeviceUid("SWARM-HUB-ABCD")).thenReturn(Optional.of(device));
        String topic = "swarm/v1/" + device.getTenantId() + "/7/SWARM-HUB-ABCD/telemetry";
        String payload = """
                {"schemaVersion":"1.0","deviceId":"SWARM-HUB-ABCD","messageId":"x","readings":[]}
                """;
        assertThrows(com.biopower.exception.BadRequestException.class,
                () -> handler.handle(topic, payload, "SWARM-HUB-ABCD", "swd_secret"));
        verify(telemetryIngestService, never()).ingest(any());
    }

    @Test
    void topicDevicePatternParses() {
        var matcher = MqttTelemetryHandler.SWARM_V1_TELEMETRY.matcher(
                "swarm/v1/_/42/SWARM-HUB-ZZ/telemetry");
        assertTrue(matcher.matches());
        assertEquals("42", matcher.group(2));
        assertEquals("SWARM-HUB-ZZ", matcher.group(3));
    }
}
