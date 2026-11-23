// PURPOSE: Automated test covering SWARM MqttIngestRetry.
package com.biopower.mqtt;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.TransactionSystemException;

import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.*;

class MqttIngestRetryTest {

    MqttIngestRetry retry;

    @BeforeEach
    void setUp() {
        retry = new MqttIngestRetry();
        ReflectionTestUtils.setField(retry, "maxAttempts", 3);
        ReflectionTestUtils.setField(retry, "retryDelayMs", 1L);
    }

    @Test
    void succeedsWithoutRetry() {
        AtomicInteger calls = new AtomicInteger();
        retry.run(calls::incrementAndGet);
        assertEquals(1, calls.get());
    }

    @Test
    void retriesTransientDbFailureThenSucceeds() {
        AtomicInteger calls = new AtomicInteger();
        retry.run(() -> {
            if (calls.incrementAndGet() < 3) {
                throw new QueryTimeoutException("timeout");
            }
        });
        assertEquals(3, calls.get());
    }

    @Test
    void exhaustsAttemptsOnPersistentTransientFailure() {
        AtomicInteger calls = new AtomicInteger();
        assertThrows(TransactionSystemException.class, () -> retry.run(() -> {
            calls.incrementAndGet();
            throw new TransactionSystemException("db down");
        }));
        assertEquals(3, calls.get());
    }

    @Test
    void validationErrorsAreNotRetried() {
        AtomicInteger calls = new AtomicInteger();
        assertThrows(IllegalArgumentException.class, () -> retry.run(() -> {
            calls.incrementAndGet();
            throw new IllegalArgumentException("bad payload");
        }));
        assertEquals(1, calls.get());
    }
}
