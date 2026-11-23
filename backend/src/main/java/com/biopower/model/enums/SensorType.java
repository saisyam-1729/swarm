// PURPOSE: Enumerated value used by SWARM SensorType domain logic.
package com.biopower.model.enums;

public enum SensorType {
    PH,
    TEMPERATURE,
    PRESSURE,
    GAS_FLOW,
    METHANE,
    CARBON_DIOXIDE,
    HYDROGEN_SULFIDE,
    AMMONIA,
    HUMIDITY,
    LIQUID_LEVEL,
    PRESSURE_TRANSMITTER,
    FLOW_TRANSMITTER,
    TEMPERATURE_TRANSMITTER,
    /** Fallback when telemetry reports an unknown measurement. */
    GENERIC
}
