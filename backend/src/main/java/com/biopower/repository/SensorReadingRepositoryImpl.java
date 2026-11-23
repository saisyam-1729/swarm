// PURPOSE: Spring Data access for SWARM SensorReading persistence.
package com.biopower.repository;

import com.biopower.model.entity.SensorReading;
import com.biopower.model.enums.SensorType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import jakarta.persistence.Query;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Repository
public class SensorReadingRepositoryImpl implements SensorReadingRepositoryCustom {

    private static final int HISTORY_LIMIT = 5000;

    private static final String SELECT_JOIN = """
            SELECT r.id, r.recorded_at, r.message_id, r.tenant_id, r.device_id, r.channel_id,
                   r.sensor_type, r.value, r.unit, r.metadata,
                   COALESCE(dr.plant_id, CAST(jsonb_extract_path_text(r.metadata, 'plant_id') AS bigint)) AS plant_id,
                   COALESCE(dc.sensor_node_id, CAST(jsonb_extract_path_text(r.metadata, 'node_id') AS bigint)) AS node_id
            FROM sensor_readings r
            LEFT JOIN devices d ON d.tenant_id = r.tenant_id AND d.device_id = r.device_id
            LEFT JOIN device_registry dr ON dr.device_pk = d.id
            LEFT JOIN device_channels dc ON dc.device_id = d.id AND dc.channel_id = r.channel_id
            """;

    // Leading space is required: callers concatenate after "WHERE" with no trailing space
    // ("WHERE """ + PLANT_MATCH). Without it the SQL becomes WHERECOALESCE(...).
    private static final String PLANT_MATCH = " " + """
            COALESCE(dr.plant_id, CAST(jsonb_extract_path_text(r.metadata, 'plant_id') AS bigint)) = :plantId
            """;

    private static final String VALUE_NUM = """
            CASE
              WHEN jsonb_typeof(r.value) = 'number' THEN (r.value #>> '{}')::float8
              WHEN jsonb_typeof(r.value) = 'object' THEN COALESCE((r.value->>'value')::float8, (r.value->>'v')::float8)
              ELSE NULL
            END
            """;

    @PersistenceContext
    private EntityManager entityManager;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    @SuppressWarnings("unchecked")
    public List<SensorReading> findByPlantAndTypeAndDateRange(Long plantId, SensorType type,
                                                              LocalDateTime start, LocalDateTime end) {
        Query query = entityManager.createNativeQuery(SELECT_JOIN + """
                WHERE """ + PLANT_MATCH + """
                  AND LOWER(r.sensor_type) = LOWER(:type)
                  AND r.recorded_at BETWEEN :start AND :end
                ORDER BY r.recorded_at ASC
                """);
        query.setParameter("plantId", plantId);
        query.setParameter("type", type == null ? null : type.name());
        query.setParameter("start", toTimestamp(start));
        query.setParameter("end", toTimestamp(end));
        query.setMaxResults(HISTORY_LIMIT);
        return mapList(query.getResultList());
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<SensorReading> findByPlantAndDateRange(Long plantId, LocalDateTime start, LocalDateTime end) {
        Query query = entityManager.createNativeQuery(SELECT_JOIN + """
                WHERE """ + PLANT_MATCH + """
                  AND r.recorded_at BETWEEN :start AND :end
                ORDER BY r.recorded_at ASC
                """);
        query.setParameter("plantId", plantId);
        query.setParameter("start", toTimestamp(start));
        query.setParameter("end", toTimestamp(end));
        query.setMaxResults(HISTORY_LIMIT);
        return mapList(query.getResultList());
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<SensorReading> findFirstByPlantIdAndSensorTypeOrderByRecordedAtDesc(Long plantId,
                                                                                        SensorType sensorType) {
        Query query = entityManager.createNativeQuery(SELECT_JOIN + """
                WHERE """ + PLANT_MATCH + """
                  AND LOWER(r.sensor_type) = LOWER(:type)
                ORDER BY r.recorded_at DESC
                """);
        query.setParameter("plantId", plantId);
        query.setParameter("type", sensorType == null ? null : sensorType.name());
        query.setMaxResults(1);
        List<SensorReading> rows = mapList(query.getResultList());
        return rows.stream().findFirst();
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<SensorReading> findLatestByPlantId(Long plantId) {
        Query query = entityManager.createNativeQuery("""
                SELECT DISTINCT ON (LOWER(COALESCE(r.sensor_type, '')))
                       r.id, r.recorded_at, r.message_id, r.tenant_id, r.device_id, r.channel_id,
                       r.sensor_type, r.value, r.unit, r.metadata,
                       COALESCE(dr.plant_id, CAST(jsonb_extract_path_text(r.metadata, 'plant_id') AS bigint)) AS plant_id,
                       COALESCE(dc.sensor_node_id, CAST(jsonb_extract_path_text(r.metadata, 'node_id') AS bigint)) AS node_id
                FROM sensor_readings r
                LEFT JOIN devices d ON d.tenant_id = r.tenant_id AND d.device_id = r.device_id
                LEFT JOIN device_registry dr ON dr.device_pk = d.id
                LEFT JOIN device_channels dc ON dc.device_id = d.id AND dc.channel_id = r.channel_id
                WHERE """ + PLANT_MATCH + """
                ORDER BY LOWER(COALESCE(r.sensor_type, '')), r.recorded_at DESC
                """);
        query.setParameter("plantId", plantId);
        return mapList(query.getResultList());
    }

    @Override
    @SuppressWarnings("unchecked")
    public Optional<SensorReading> findFirstByNodeIdOrderByRecordedAtDesc(Long nodeId) {
        Query query = entityManager.createNativeQuery(SELECT_JOIN + """
                WHERE dc.sensor_node_id = :nodeId
                   OR CAST(jsonb_extract_path_text(r.metadata, 'node_id') AS bigint) = :nodeId
                ORDER BY r.recorded_at DESC
                """);
        query.setParameter("nodeId", nodeId);
        query.setMaxResults(1);
        List<SensorReading> rows = mapList(query.getResultList());
        return rows.stream().findFirst();
    }

    @Override
    public long countByNodeIdAndRecordedAtAfter(Long nodeId, LocalDateTime since) {
        Query query = entityManager.createNativeQuery("""
                SELECT COUNT(*) FROM sensor_readings r
                JOIN devices d ON d.tenant_id = r.tenant_id AND d.device_id = r.device_id
                LEFT JOIN device_channels dc ON dc.device_id = d.id AND dc.channel_id = r.channel_id
                WHERE (dc.sensor_node_id = :nodeId OR CAST(jsonb_extract_path_text(r.metadata, 'node_id') AS bigint) = :nodeId)
                  AND r.recorded_at > :since
                """);
        query.setParameter("nodeId", nodeId);
        query.setParameter("since", toTimestamp(since));
        Number count = (Number) query.getSingleResult();
        return count == null ? 0 : count.longValue();
    }

    @Override
    public Double averageValue(Long plantId, SensorType type, LocalDateTime start, LocalDateTime end) {
        Query query = entityManager.createNativeQuery(
                "SELECT AVG(" + VALUE_NUM + ") FROM sensor_readings r "
                        + "LEFT JOIN devices d ON d.tenant_id = r.tenant_id AND d.device_id = r.device_id "
                        + "LEFT JOIN device_registry dr ON dr.device_pk = d.id "
                        + "WHERE " + PLANT_MATCH + " AND LOWER(r.sensor_type) = LOWER(:type) "
                        + "AND r.recorded_at BETWEEN :start AND :end");
        query.setParameter("plantId", plantId);
        query.setParameter("type", type == null ? null : type.name());
        query.setParameter("start", toTimestamp(start));
        query.setParameter("end", toTimestamp(end));
        Object result = query.getSingleResult();
        return result == null ? null : ((Number) result).doubleValue();
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<SensorReading> findPartnerHistory(List<Long> plantIds, Long plantId, Long nodeId,
                                                  SensorType sensorType, LocalDateTime updatedSince,
                                                  LocalDateTime cursorTime, Long cursorId, Pageable pageable) {
        StringBuilder sql = new StringBuilder(SELECT_JOIN);
        sql.append(" WHERE COALESCE(dr.plant_id, CAST(jsonb_extract_path_text(r.metadata, 'plant_id') AS bigint)) IN (:plantIds) ");
        if (plantId != null) {
            sql.append(" AND ").append(PLANT_MATCH);
        }
        if (nodeId != null) {
            sql.append(" AND (dc.sensor_node_id = :nodeId OR CAST(jsonb_extract_path_text(r.metadata, 'node_id') AS bigint) = :nodeId) ");
        }
        if (sensorType != null) {
            sql.append(" AND LOWER(r.sensor_type) = LOWER(:sensorType) ");
        }
        if (updatedSince != null) {
            sql.append(" AND r.recorded_at >= :updatedSince ");
        }
        if (cursorTime != null && cursorId != null) {
            sql.append(" AND (r.recorded_at > :cursorTime OR (r.recorded_at = :cursorTime AND r.id > :cursorId)) ");
        }
        sql.append(" ORDER BY r.recorded_at ASC, r.id ASC ");
        Query query = entityManager.createNativeQuery(sql.toString());
        query.setParameter("plantIds", plantIds);
        if (plantId != null) {
            query.setParameter("plantId", plantId);
        }
        if (nodeId != null) {
            query.setParameter("nodeId", nodeId);
        }
        if (sensorType != null) {
            query.setParameter("sensorType", sensorType.name());
        }
        if (updatedSince != null) {
            query.setParameter("updatedSince", toTimestamp(updatedSince));
        }
        if (cursorTime != null && cursorId != null) {
            query.setParameter("cursorTime", toTimestamp(cursorTime));
            query.setParameter("cursorId", cursorId);
        }
        if (pageable != null && pageable.isPaged()) {
            query.setMaxResults(pageable.getPageSize());
        }
        return mapList(query.getResultList());
    }

    @Override
    @SuppressWarnings("unchecked")
    public List<SensorReading> findPartnerRange(List<Long> plantIds, Long plantId, Long nodeId,
                                                SensorType sensorType, LocalDateTime start, LocalDateTime end) {
        StringBuilder sql = new StringBuilder(SELECT_JOIN);
        sql.append(" WHERE COALESCE(dr.plant_id, CAST(jsonb_extract_path_text(r.metadata, 'plant_id') AS bigint)) IN (:plantIds) AND r.recorded_at BETWEEN :start AND :end ");
        if (plantId != null) {
            sql.append(" AND ").append(PLANT_MATCH);
        }
        if (nodeId != null) {
            sql.append(" AND (dc.sensor_node_id = :nodeId OR CAST(jsonb_extract_path_text(r.metadata, 'node_id') AS bigint) = :nodeId) ");
        }
        if (sensorType != null) {
            sql.append(" AND LOWER(r.sensor_type) = LOWER(:sensorType) ");
        }
        sql.append(" ORDER BY r.recorded_at ASC ");
        Query query = entityManager.createNativeQuery(sql.toString());
        query.setParameter("plantIds", plantIds);
        query.setParameter("start", toTimestamp(start));
        query.setParameter("end", toTimestamp(end));
        if (plantId != null) {
            query.setParameter("plantId", plantId);
        }
        if (nodeId != null) {
            query.setParameter("nodeId", nodeId);
        }
        if (sensorType != null) {
            query.setParameter("sensorType", sensorType.name());
        }
        return mapList(query.getResultList());
    }

    @Override
    @Transactional
    public void deleteByPlantId(Long plantId) {
        entityManager.createNativeQuery("""
                        DELETE FROM sensor_readings r
                        USING devices d, device_registry dr
                        WHERE d.tenant_id = r.tenant_id AND d.device_id = r.device_id
                          AND dr.device_pk = d.id AND dr.plant_id = :plantId
                        """)
                .setParameter("plantId", plantId)
                .executeUpdate();
    }

    @Override
    @Transactional
    public int deleteByRecordedAtBefore(LocalDateTime cutoff) {
        return entityManager.createNativeQuery("DELETE FROM sensor_readings WHERE recorded_at < :cutoff")
                .setParameter("cutoff", toTimestamp(cutoff))
                .executeUpdate();
    }

    private List<SensorReading> mapList(List<?> rows) {
        List<SensorReading> out = new ArrayList<>();
        for (Object row : rows) {
            out.add(mapRow((Object[]) row));
        }
        return out;
    }

    private SensorReading mapRow(Object[] row) {
        SensorReading reading = new SensorReading();
        reading.setId(toLong(row[0]));
        reading.setRecordedAt(toInstant(row[1]));
        reading.setMessageId(row[2] == null ? null : row[2].toString());
        reading.setTenantId(toUuid(row[3]));
        reading.setDeviceUid(row[4] == null ? null : row[4].toString());
        reading.setChannelId(row[5] == null ? null : row[5].toString());
        reading.setSensorTypeCode(row[6] == null ? null : row[6].toString());
        reading.setValueJson(toJson(row[7]));
        reading.setUnit(row[8] == null ? null : row[8].toString());
        reading.setMetadata(toJson(row[9]));
        reading.setPlantId(toLong(row[10]));
        reading.setNodeId(toLong(row[11]));
        reading.readMetadata();
        if (reading.getPlantId() == null) {
            reading.setPlantId(toLong(row[10]));
        }
        if (reading.getNodeId() == null) {
            reading.setNodeId(toLong(row[11]));
        }
        return reading;
    }

    private JsonNode toJson(Object value) {
        if (value == null) {
            return null;
        }
        try {
            return objectMapper.readTree(value.toString());
        } catch (Exception e) {
            return objectMapper.getNodeFactory().textNode(value.toString());
        }
    }

    private static Timestamp toTimestamp(LocalDateTime value) {
        return value == null ? null : Timestamp.from(value.toInstant(java.time.ZoneOffset.UTC));
    }

    private static Instant toInstant(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof Instant instant) {
            return instant;
        }
        if (value instanceof Timestamp timestamp) {
            return timestamp.toInstant();
        }
        if (value instanceof java.time.OffsetDateTime odt) {
            return odt.toInstant();
        }
        return Instant.parse(value.toString());
    }

    private static Long toLong(Object value) {
        return value == null ? null : ((Number) value).longValue();
    }

    private static UUID toUuid(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof UUID uuid) {
            return uuid;
        }
        return UUID.fromString(value.toString());
    }
}
