// PURPOSE: JPA entity mapping for SWARM device lifecycle audit events.
package com.biopower.model.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "device_audit_events")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class DeviceAuditEvent {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "device_id")
    private Long deviceId;

    @Column(name = "device_uid", nullable = false, length = 128)
    private String deviceUid;

    @Column(name = "tenant_id")
    private UUID tenantId;

    @Column(name = "plant_id")
    private Long plantId;

    @Column(nullable = false, length = 64)
    private String action;

    @Column(length = 255)
    private String actor;

    @Column(length = 1024)
    private String detail;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false)
    private Instant createdAt;
}
