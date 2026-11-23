// PURPOSE: Bounded retries for transient DB failures during MQTT ingest.
package com.biopower.mqtt;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.TransactionException;

/**
 * QoS 1 may redeliver; this only retries temporary persistence failures, not validation errors.
 */
@Component
@Slf4j
public class MqttIngestRetry {

    @Value("${mqtt.ingest-max-attempts:3}")
    private int maxAttempts;

    @Value("${mqtt.ingest-retry-delay-ms:200}")
    private long retryDelayMs;

    public void run(Runnable action) {
        int attempts = Math.max(1, maxAttempts);
        for (int i = 1; i <= attempts; i++) {
            try {
                action.run();
                return;
            } catch (TransientDataAccessException | TransactionException ex) {
                if (i >= attempts) {
                    throw ex;
                }
                log.warn("MQTT ingest DB transient failure attempt {}/{}: {}", i, attempts, ex.getMessage());
                sleep(retryDelayMs * i);
            } catch (DataAccessException ex) {
                // Non-transient data access: do not retry forever; one bounded retry only.
                if (i >= attempts || i >= 2) {
                    throw ex;
                }
                log.warn("MQTT ingest DB failure attempt {}/{}: {}", i, attempts, ex.getMessage());
                sleep(retryDelayMs * i);
            }
        }
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(Math.max(0, ms));
        } catch (InterruptedException ie) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("MQTT ingest retry interrupted", ie);
        }
    }
}
