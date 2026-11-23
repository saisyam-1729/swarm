// PURPOSE: Native SQL fragments must not concatenate into WHERECOALESCE.
package com.biopower.repository;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Field;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SensorReadingSqlAssemblyTest {

    @Test
    void plantMatchLeavesSpaceAfterWhere() throws Exception {
        Field field = SensorReadingRepositoryImpl.class.getDeclaredField("PLANT_MATCH");
        field.setAccessible(true);
        String plantMatch = (String) field.get(null);

        String history = "WHERE" + plantMatch + "AND LOWER(r.sensor_type) = LOWER(:type)";
        assertFalse(history.contains("WHERECOALESCE"));
        assertTrue(history.contains("WHERE COALESCE") || history.contains("WHERE  COALESCE"));

        String latest = "WHERE" + plantMatch + "ORDER BY LOWER(COALESCE(r.sensor_type, ''))";
        assertFalse(latest.contains("WHERECOALESCE"));
        assertTrue(plantMatch.contains("jsonb_extract_path_text(r.metadata, 'plant_id')"));
    }
}
