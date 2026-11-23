// PURPOSE: Hibernate 6 identity mapping for Timescale sensor_readings.
package com.biopower.model.entity;

import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;
import java.util.Arrays;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SensorReadingMappingTest {

    @Test
    void identityIsSingleLongIdNotComposite() throws Exception {
        assertNull(SensorReading.class.getAnnotation(IdClass.class));

        List<Field> idFields = Arrays.stream(SensorReading.class.getDeclaredFields())
                .filter(field -> field.isAnnotationPresent(Id.class))
                .toList();
        assertEquals(1, idFields.size());
        Field id = idFields.get(0);
        assertEquals("id", id.getName());
        assertEquals(Long.class, id.getType());

        GeneratedValue generated = id.getAnnotation(GeneratedValue.class);
        assertNotNull(generated);
        assertEquals(GenerationType.IDENTITY, generated.strategy());

        Field recordedAt = SensorReading.class.getDeclaredField("recordedAt");
        assertFalse(recordedAt.isAnnotationPresent(Id.class));
        assertTrue(recordedAt.getAnnotation(jakarta.persistence.Column.class).nullable() == false);
    }
}
