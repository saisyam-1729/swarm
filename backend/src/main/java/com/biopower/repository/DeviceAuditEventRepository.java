// PURPOSE: Spring Data access for SWARM device audit events.
package com.biopower.repository;

import com.biopower.model.entity.DeviceAuditEvent;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DeviceAuditEventRepository extends JpaRepository<DeviceAuditEvent, Long> {
    List<DeviceAuditEvent> findByDeviceIdOrderByCreatedAtDesc(Long deviceId);
}
