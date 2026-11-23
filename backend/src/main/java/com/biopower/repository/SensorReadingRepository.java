// PURPOSE: Spring Data access for SWARM SensorReading persistence.
package com.biopower.repository;

import com.biopower.model.entity.SensorReading;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface SensorReadingRepository extends JpaRepository<SensorReading, Long>,
        SensorReadingRepositoryCustom {
}
