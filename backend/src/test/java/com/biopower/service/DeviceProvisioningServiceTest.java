// PURPOSE: Automated test covering SWARM DeviceProvisioningServiceTest.
package com.biopower.service;

import com.biopower.dto.request.DeviceChannelRequest;
import com.biopower.dto.request.DeviceLifecycleRequest;
import com.biopower.dto.request.DeviceReassignRequest;
import com.biopower.dto.request.DeviceRegisterRequest;
import com.biopower.dto.response.FieldDeviceChannelResponse;
import com.biopower.dto.response.HardwareProvisioningResponse;
import com.biopower.exception.BadRequestException;
import com.biopower.model.entity.Company;
import com.biopower.model.entity.Device;
import com.biopower.model.entity.DeviceChannel;
import com.biopower.model.entity.Plant;
import com.biopower.model.entity.SensorNode;
import com.biopower.model.enums.DeviceKind;
import com.biopower.model.enums.DeviceLifecycle;
import com.biopower.model.enums.SensorType;
import com.biopower.mqtt.MqttConnectionHealth;
import com.biopower.repository.DeviceAuditEventRepository;
import com.biopower.repository.DeviceChannelRepository;
import com.biopower.repository.DeviceRepository;
import com.biopower.repository.IngestRejectedRepository;
import com.biopower.repository.PlantRepository;
import com.biopower.repository.SensorNodeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DeviceProvisioningServiceTest {

    @Mock PlantRepository plantRepository;
    @Mock DeviceRepository deviceRepository;
    @Mock DeviceChannelRepository deviceChannelRepository;
    @Mock SensorNodeRepository sensorNodeRepository;
    @Mock DeviceRegistryService deviceRegistryService;
    @Mock FieldDeviceQueryService fieldDeviceQueryService;
    @Mock MqttConnectionHealth mqttConnectionHealth;
    @Mock IngestRejectedRepository ingestRejectedRepository;
    @Mock DeviceAuditEventRepository deviceAuditEventRepository;

    @InjectMocks
    DeviceProvisioningService service;

    UUID tenantId;
    Company tenant;
    Plant plant;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(service, "mqttPublicHost", "127.0.0.1");
        ReflectionTestUtils.setField(service, "mqttPublicPort", 1884);
        ReflectionTestUtils.setField(service, "mqttInternalHost", "mosquitto");
        ReflectionTestUtils.setField(service, "mqttInternalPort", 1883);
        ReflectionTestUtils.setField(service, "legacyTopic", "biopower/sensors/#");
        ReflectionTestUtils.setField(service, "sensorTimeoutMinutes", 10);
        tenantId = UUID.fromString("11111111-1111-4111-8111-111111111111");
        tenant = Company.builder().id(tenantId).name("Tenant A").build();
        plant = Plant.builder().plantId(7L).plantName("Plant A1").company(tenant).build();
    }

    @Test
    void registerRejectsPlantWithoutTenant() {
        Plant unassigned = Plant.builder().plantId(8L).plantName("Pool").company(null).build();
        when(plantRepository.findById(8L)).thenReturn(Optional.of(unassigned));
        DeviceRegisterRequest request = new DeviceRegisterRequest();
        request.setPlantId(8L);
        assertThrows(BadRequestException.class, () -> service.register(request));
    }

    @Test
    void registerRejectsTenantPlantMismatch() {
        when(plantRepository.findById(7L)).thenReturn(Optional.of(plant));
        DeviceRegisterRequest request = new DeviceRegisterRequest();
        request.setPlantId(7L);
        request.setTenantId(UUID.fromString("22222222-2222-4222-8222-222222222222"));
        assertThrows(BadRequestException.class, () -> service.register(request));
    }

    @Test
    void registerUsesPlantTenantAndReturnsOneTimeSecretWithoutHash() {
        when(plantRepository.findById(7L)).thenReturn(Optional.of(plant));
        when(deviceRepository.existsByDeviceUid("SWARM-HUB-A1")).thenReturn(false);
        AtomicLong ids = new AtomicLong(11);
        when(deviceRepository.save(any(Device.class))).thenAnswer(inv -> {
            Device device = inv.getArgument(0);
            if (device.getId() == null) {
                device.setId(ids.getAndIncrement());
            }
            return device;
        });
        when(deviceRepository.findById(11L)).thenAnswer(inv -> Optional.of(savedDevice()));
        DeviceChannel savedChannel = DeviceChannel.builder()
                .id(1L)
                .deviceId(11L)
                .channelId("1")
                .measurementType(SensorType.TEMPERATURE)
                .engineeringUnit("°C")
                .active(true)
                .build();
        when(deviceChannelRepository.findByDeviceIdOrderByChannelIdAsc(11L)).thenReturn(List.of(savedChannel));
        when(sensorNodeRepository.save(any(SensorNode.class))).thenAnswer(inv -> {
            SensorNode node = inv.getArgument(0);
            node.setNodeId(101L);
            return node;
        });
        when(deviceRegistryService.upsertChannel(eq(11L), any())).thenReturn(savedChannel);
        when(fieldDeviceQueryService.describeChannel(any())).thenReturn(FieldDeviceChannelResponse.builder()
                .channelId("1")
                .measurementType(SensorType.TEMPERATURE)
                .engineeringUnit("°C")
                .active(true)
                .build());

        DeviceRegisterRequest request = new DeviceRegisterRequest();
        request.setPlantId(7L);
        request.setDeviceUid("SWARM-HUB-A1");
        DeviceChannelRequest channel = new DeviceChannelRequest();
        channel.setMeasurementType(SensorType.TEMPERATURE);
        request.setChannels(List.of(channel));

        HardwareProvisioningResponse response = service.register(request);

        assertEquals(tenantId, response.getTenantId());
        assertEquals(7L, response.getPlantId());
        assertEquals("SWARM-HUB-A1", response.getDeviceUid());
        assertTrue(response.getMqttTelemetryTopic().contains(tenantId.toString()));
        assertTrue(response.getMqttTelemetryTopic().contains("/7/SWARM-HUB-A1/telemetry"));
        assertNotNull(response.getDeviceSecret());
        assertTrue(response.getDeviceSecret().startsWith("swd_"));
        assertFalse(String.valueOf(response).toLowerCase().contains("hash"));
        assertEquals("1.0", response.getSchemaVersion());
        assertEquals(1, response.getChannels().size());
        verify(sensorNodeRepository).save(any(SensorNode.class));
    }

    @Test
    void listDevicesRejectsPlantOnWrongTenant() {
        when(plantRepository.findById(7L)).thenReturn(Optional.of(plant));
        assertThrows(BadRequestException.class,
                () -> service.listDevices(UUID.fromString("22222222-2222-4222-8222-222222222222"), 7L));
    }

    @Test
    void getProvisioningOmitsSecret() {
        Device device = savedDevice();
        when(deviceRepository.findById(11L)).thenReturn(Optional.of(device));
        when(plantRepository.findById(7L)).thenReturn(Optional.of(plant));
        when(deviceChannelRepository.findByDeviceIdOrderByChannelIdAsc(11L)).thenReturn(List.of());

        HardwareProvisioningResponse response = service.getProvisioning(11L);

        assertNull(response.getDeviceSecret());
        assertFalse(response.isSecretShownOnce());
        assertEquals(DeviceKind.MQTT_GATEWAY, response.getDeviceKind());
        assertEquals(DeviceLifecycle.COMMISSIONING, response.getLifecycle());
        assertEquals("AWAITING_TELEMETRY", response.getStatus());
        assertEquals("PROVISIONED", response.getProvisioningStatus());
    }

    @Test
    void reassignMovesDeviceAndUnlinksLiveChannelsWithoutMovingHistory() {
        Device device = savedDevice();
        Company other = Company.builder()
                .id(UUID.fromString("22222222-2222-4222-8222-222222222222"))
                .name("Tenant B")
                .build();
        Plant destination = Plant.builder().plantId(9L).plantName("Plant B").company(other).build();
        DeviceChannel live = DeviceChannel.builder()
                .id(1L)
                .deviceId(11L)
                .channelId("1")
                .sensorNodeId(101L)
                .measurementType(SensorType.TEMPERATURE)
                .active(true)
                .build();
        when(deviceRepository.findById(11L)).thenReturn(Optional.of(device));
        when(plantRepository.findById(9L)).thenReturn(Optional.of(destination));
        when(deviceChannelRepository.findByDeviceIdOrderByChannelIdAsc(11L)).thenReturn(List.of(live));
        when(fieldDeviceQueryService.describe(any())).thenAnswer(inv -> null);

        DeviceReassignRequest request = new DeviceReassignRequest();
        request.setPlantId(9L);
        service.reassign(11L, request);

        assertEquals(other.getId(), device.getTenantId());
        assertEquals(9L, device.getPlantId());
        assertNull(live.getSensorNodeId());
        verify(deviceAuditEventRepository).save(any());
    }

    @Test
    void registerGeneratesUniqueUidWhenBlank() {
        when(plantRepository.findById(7L)).thenReturn(Optional.of(plant));
        when(deviceRegistryService.allocateDeviceUid(null)).thenReturn("SWARM-DEV-UNIQUE");
        AtomicLong ids = new AtomicLong(11);
        when(deviceRepository.save(any(Device.class))).thenAnswer(inv -> {
            Device device = inv.getArgument(0);
            if (device.getId() == null) {
                device.setId(ids.getAndIncrement());
            }
            return device;
        });
        when(deviceRepository.findById(11L)).thenAnswer(inv -> Optional.of(Device.builder()
                .id(11L)
                .tenantId(tenantId)
                .plantId(7L)
                .deviceUid("SWARM-DEV-UNIQUE")
                .deviceName("SWARM-DEV-UNIQUE")
                .deviceKind(DeviceKind.MQTT_GATEWAY)
                .lifecycle(DeviceLifecycle.COMMISSIONING)
                .secretHash("hashed")
                .legacyCompat(false)
                .configVersion(1)
                .build()));
        when(deviceChannelRepository.findByDeviceIdOrderByChannelIdAsc(11L)).thenReturn(List.of());

        DeviceRegisterRequest request = new DeviceRegisterRequest();
        request.setPlantId(7L);
        request.setTenantId(tenantId);

        HardwareProvisioningResponse response = service.register(request);

        assertEquals("SWARM-DEV-UNIQUE", response.getDeviceUid());
        assertEquals(tenantId, response.getTenantId());
        assertEquals(7L, response.getPlantId());
        assertNotNull(response.getDeviceSecret());
        assertTrue(response.getDeviceSecret().startsWith("swd_"));
        verify(deviceAuditEventRepository).save(any());
    }

    @Test
    void revokeSecretClearsCredentials() {
        Device device = savedDevice();
        when(deviceRepository.findById(11L)).thenReturn(Optional.of(device));
        when(plantRepository.findById(7L)).thenReturn(Optional.of(plant));
        when(deviceChannelRepository.findByDeviceIdOrderByChannelIdAsc(11L)).thenReturn(List.of());

        HardwareProvisioningResponse response = service.revokeSecret(11L);

        assertNull(device.getSecretHash());
        assertFalse(device.isLegacyCompat());
        assertNull(response.getDeviceSecret());
        verify(deviceAuditEventRepository).save(any());
    }

    @Test
    void suspendBlocksPublishingLifecycle() {
        Device device = savedDevice();
        when(deviceRepository.findById(11L)).thenReturn(Optional.of(device));
        when(fieldDeviceQueryService.describe(any())).thenReturn(null);
        DeviceLifecycleRequest request = new DeviceLifecycleRequest();
        request.setLifecycle(DeviceLifecycle.SUSPENDED);
        service.setLifecycle(11L, request);
        assertEquals(DeviceLifecycle.SUSPENDED, device.getLifecycle());
        verify(deviceAuditEventRepository).save(any());
    }

    private Device savedDevice() {
        return Device.builder()
                .id(11L)
                .tenantId(tenantId)
                .plantId(7L)
                .deviceUid("SWARM-HUB-A1")
                .deviceName("SWARM-HUB-A1")
                .deviceKind(DeviceKind.MQTT_GATEWAY)
                .lifecycle(DeviceLifecycle.COMMISSIONING)
                .secretHash("not-a-plaintext-secret")
                .legacyCompat(false)
                .configVersion(1)
                .build();
    }
}
