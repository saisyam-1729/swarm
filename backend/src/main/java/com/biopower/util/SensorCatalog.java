// PURPOSE: Shared SWARM sensor-type metadata (labels, units, validity ranges).
package com.biopower.util;

import com.biopower.dto.response.SensorTypeInfo;
import com.biopower.model.enums.SensorType;

import java.util.Arrays;
import java.util.List;

/**
 * Backend source of truth for supported measurement types.
 * Dashboard and Control Center load this via {@code GET /catalog/sensor-types}.
 */
public final class SensorCatalog {

    private SensorCatalog() {
    }

    public static List<SensorTypeInfo> all() {
        return Arrays.stream(SensorType.values()).map(SensorCatalog::info).toList();
    }

    public static SensorTypeInfo info(SensorType type) {
        return SensorTypeInfo.builder()
                .code(type.name())
                .label(label(type))
                .defaultUnit(defaultUnit(type))
                .hardMin(hardMin(type))
                .hardMax(hardMax(type))
                .build();
    }

    public static String label(SensorType type) {
        return switch (type) {
            case PH -> "pH Level";
            case TEMPERATURE -> "Temperature";
            case PRESSURE -> "Pressure";
            case GAS_FLOW -> "Gas Flow";
            case METHANE -> "Methane";
            case CARBON_DIOXIDE -> "CO₂";
            case HYDROGEN_SULFIDE -> "H₂S";
            case AMMONIA -> "NH₃";
            case HUMIDITY -> "Humidity";
            case LIQUID_LEVEL -> "Liquid Level";
            case PRESSURE_TRANSMITTER -> "Pressure Indicator Transmitter";
            case FLOW_TRANSMITTER -> "Flow Indicator Transmitter";
            case TEMPERATURE_TRANSMITTER -> "Temperature Transmitter";
            case GENERIC -> "Generic";
        };
    }

    public static String defaultUnit(SensorType type) {
        return switch (type) {
            case TEMPERATURE, TEMPERATURE_TRANSMITTER -> "°C";
            case HUMIDITY -> "%";
            case METHANE -> "%";
            case PH -> "pH";
            case PRESSURE, PRESSURE_TRANSMITTER -> "bar";
            case GAS_FLOW, FLOW_TRANSMITTER -> "m³/h";
            case LIQUID_LEVEL -> "%";
            case CARBON_DIOXIDE -> "%";
            case HYDROGEN_SULFIDE, AMMONIA -> "ppm";
            case GENERIC -> "";
        };
    }

    public static Double hardMin(SensorType type) {
        return switch (type) {
            case TEMPERATURE, TEMPERATURE_TRANSMITTER -> -40.0;
            case HUMIDITY, LIQUID_LEVEL, CARBON_DIOXIDE -> 0.0;
            case PH -> 0.0;
            case METHANE -> 0.0;
            case PRESSURE, PRESSURE_TRANSMITTER, GAS_FLOW, FLOW_TRANSMITTER -> 0.0;
            default -> null;
        };
    }

    public static Double hardMax(SensorType type) {
        return switch (type) {
            case TEMPERATURE, TEMPERATURE_TRANSMITTER -> 200.0;
            case HUMIDITY, LIQUID_LEVEL, CARBON_DIOXIDE -> 100.0;
            case PH -> 14.0;
            case METHANE -> 100.0;
            default -> null;
        };
    }
}
