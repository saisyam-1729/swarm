// PURPOSE: Telemetry ingest DTO/helper used by SWARM HTTP and MQTT pipelines.
package com.biopower.telemetry;

import com.biopower.model.enums.SensorType;
import lombok.Builder;
import lombok.Data;

@Data
@Builder
public class IngestPoint {
    /** Preferred: logical channel on the authenticated device. */
    private String channelId;
    /** Compat: legacy sensor node id from ESP batch firmware. */
    private Long nodeId;
    /** Compat: must match registered node/channel measurement when provided. */
    private SensorType sensorType;
    /** Optional engineering unit supplied by the publisher. */
    private String unit;
    /** Optional instrument/channel name supplied by the publisher. */
    private String name;
    private Double value;
}
