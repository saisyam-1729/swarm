// PURPOSE: JPA entity mapping for SWARM table/fields used by SensorReading.
package com.biopower.model.entity;

import com.biopower.model.enums.DataQuality;
import com.biopower.model.enums.SensorType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.JsonNodeFactory;
import com.fasterxml.jackson.databind.node.ObjectNode;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.UUID;

/**
 * Timescale hypertable {@code sensor_readings} keeps physical PK {@code (id, recorded_at)}
 * because unique constraints must include the partition column. Hibernate 6 rejects
 * {@code GenerationType.IDENTITY} on composite {@code @IdClass} identifiers, so JPA
 * identity is the generated {@code id} only. {@code recorded_at} remains a required
 * mapped column and is still written on insert.
 */
@Entity
@Table(name = "sensor_readings")
@Access(AccessType.FIELD)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SensorReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Getter(AccessLevel.NONE)
    @Setter(AccessLevel.NONE)
    @Column(name = "recorded_at", nullable = false)
    private Instant recordedAt;

    @Column(name = "message_id", nullable = false)
    private String messageId;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "device_id", nullable = false)
    private String deviceUid;

    @Column(name = "channel_id")
    private String channelId;

    @Column(name = "sensor_type")
    private String sensorTypeCode;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "value", columnDefinition = "jsonb")
    private JsonNode valueJson;

    @Column(name = "unit")
    private String unit;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(columnDefinition = "jsonb")
    @Builder.Default
    private JsonNode metadata = JsonNodeFactory.instance.objectNode();

    @Transient
    private Long plantId;

    @Transient
    private Long nodeId;

    @Transient
    private DataQuality quality;

    @Transient
    private Double rawValue;

    @Transient
    private Integer configVersion;

    @PrePersist
    @PreUpdate
    void writeMetadata() {
        ObjectNode meta = metadata == null || !metadata.isObject()
                ? JsonNodeFactory.instance.objectNode()
                : (ObjectNode) metadata.deepCopy();
        if (plantId != null) {
            meta.put("plant_id", plantId);
        }
        if (nodeId != null) {
            meta.put("node_id", nodeId);
        }
        if (quality != null) {
            meta.put("quality", quality.name());
        }
        if (rawValue != null) {
            meta.put("raw_value", rawValue);
        }
        if (configVersion != null) {
            meta.put("config_version", configVersion);
        }
        this.metadata = meta;
    }

    @PostLoad
    public void readMetadata() {
        if (metadata != null && metadata.isObject()) {
            if (metadata.hasNonNull("plant_id")) {
                plantId = metadata.get("plant_id").asLong();
            }
            if (metadata.hasNonNull("node_id")) {
                nodeId = metadata.get("node_id").asLong();
            }
            if (metadata.hasNonNull("quality")) {
                try {
                    quality = DataQuality.valueOf(metadata.get("quality").asText());
                } catch (IllegalArgumentException ignored) {
                    quality = null;
                }
            }
            if (metadata.hasNonNull("raw_value")) {
                rawValue = metadata.get("raw_value").asDouble();
            }
            if (metadata.hasNonNull("config_version")) {
                configVersion = metadata.get("config_version").asInt();
            }
        }
    }

    public SensorType getSensorType() {
        return fromDb(sensorTypeCode);
    }

    public void setSensorType(SensorType type) {
        this.sensorTypeCode = type == null ? null : type.name().toLowerCase(Locale.ROOT);
    }

    public Double getValue() {
        return numericValue(valueJson);
    }

    public void setValue(Double number) {
        this.valueJson = number == null ? null : JsonNodeFactory.instance.numberNode(number);
    }

    public Instant getRecordedAtInstant() {
        return recordedAt;
    }

    public void setRecordedAt(Instant instant) {
        this.recordedAt = instant;
    }

    public LocalDateTime getRecordedAt() {
        return recordedAt == null ? null : LocalDateTime.ofInstant(recordedAt, ZoneId.systemDefault());
    }

    public void setRecordedAt(LocalDateTime localDateTime) {
        this.recordedAt = localDateTime == null ? null : localDateTime.atZone(ZoneId.systemDefault()).toInstant();
    }

    public static SensorType fromDb(String code) {
        if (code == null || code.isBlank()) {
            return null;
        }
        try {
            return SensorType.valueOf(code.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            return null;
        }
    }

    public static Double numericValue(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        if (node.isNumber()) {
            return node.asDouble();
        }
        if (node.isObject()) {
            if (node.has("value") && node.get("value").isNumber()) {
                return node.get("value").asDouble();
            }
            if (node.has("v") && node.get("v").isNumber()) {
                return node.get("v").asDouble();
            }
        }
        if (node.isTextual()) {
            try {
                return Double.parseDouble(node.asText());
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }
}
