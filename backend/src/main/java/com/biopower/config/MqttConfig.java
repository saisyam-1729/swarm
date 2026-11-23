// PURPOSE: Spring Boot configuration/startup component for SWARM.
package com.biopower.config;

import com.biopower.mqtt.MqttConnectionHealth;
import com.biopower.mqtt.MqttIngestRetry;
import com.biopower.mqtt.MqttTelemetryHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.channel.DirectChannel;
import org.springframework.integration.core.MessageProducer;
import org.springframework.integration.mqtt.core.DefaultMqttPahoClientFactory;
import org.springframework.integration.mqtt.core.MqttPahoClientFactory;
import org.springframework.integration.mqtt.event.MqttConnectionFailedEvent;
import org.springframework.integration.mqtt.event.MqttSubscribedEvent;
import org.springframework.integration.mqtt.inbound.MqttPahoMessageDrivenChannelAdapter;
import org.springframework.integration.mqtt.support.DefaultPahoMessageConverter;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.context.event.EventListener;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessageHandler;

/**
 * Replaceable MQTT broker integration (Mosquitto / EMQX via URL).
 * Subscribes to SWARM v1 topics and optional legacy wildcard.
 */
@Configuration
@ConditionalOnProperty(name = "mqtt.enabled", havingValue = "true", matchIfMissing = false)
@RequiredArgsConstructor
@Slf4j
public class MqttConfig {

    @Value("${mqtt.broker-url}")
    private String brokerUrl;

    @Value("${mqtt.client-id}")
    private String clientId;

    @Value("${mqtt.topic}")
    private String legacyTopic;

    @Value("${mqtt.swarm-topic:swarm/v1/+/+/+/telemetry}")
    private String swarmTopic;

    @Value("${mqtt.username:}")
    private String username;

    @Value("${mqtt.password:}")
    private String password;

    private final MqttTelemetryHandler mqttTelemetryHandler;
    private final MqttConnectionHealth mqttConnectionHealth;
    private final MqttIngestRetry mqttIngestRetry;

    @Bean
    public MqttPahoClientFactory mqttClientFactory() {
        DefaultMqttPahoClientFactory factory = new DefaultMqttPahoClientFactory();
        MqttConnectOptions options = new MqttConnectOptions();
        options.setServerURIs(new String[]{brokerUrl});
        options.setAutomaticReconnect(true);
        options.setConnectionTimeout(10);
        options.setKeepAliveInterval(30);
        options.setMaxReconnectDelay(60_000);
        if (!username.isBlank()) {
            options.setUserName(username);
            options.setPassword(password.toCharArray());
        }
        factory.setConnectionOptions(options);
        return factory;
    }

    @Bean
    public MessageChannel mqttInputChannel() {
        return new DirectChannel();
    }

    @Bean
    public MessageProducer inbound() {
        String[] topics = distinctTopics(swarmTopic, legacyTopic);
        MqttPahoMessageDrivenChannelAdapter adapter =
                new MqttPahoMessageDrivenChannelAdapter(clientId + "-inbound", mqttClientFactory(), topics);
        adapter.setCompletionTimeout(5000);
        adapter.setConverter(new DefaultPahoMessageConverter());
        adapter.setQos(1);
        adapter.setOutputChannel(mqttInputChannel());
        mqttConnectionHealth.markConfigured(brokerUrl, topics);
        return adapter;
    }

    @Bean
    @ServiceActivator(inputChannel = "mqttInputChannel")
    public MessageHandler handler() {
        return message -> {
            Object topicHeader = message.getHeaders().get(MqttHeaders.RECEIVED_TOPIC);
            String topic = topicHeader != null ? topicHeader.toString() : "unknown";
            try {
                mqttConnectionHealth.markMessageReceived();
                String payload = message.getPayload() == null ? "" : message.getPayload().toString();
                // Subscriber path: publisher username is not visible. Device identity is
                // taken from the topic and checked against the registry. Broker ACLs must
                // restrict swarm/v1/{tenant}/{plant}/{deviceUid}/telemetry to that UID.
                // QoS 1 can deliver duplicates; TelemetryIngestService dedupes by messageId.
                mqttIngestRetry.run(() -> mqttTelemetryHandler.handle(topic, payload, null, null));
            } catch (Exception e) {
                mqttConnectionHealth.markFailure(e.getMessage());
                log.warn("MQTT ingest failed topic={}: {}", topic, e.getMessage());
            }
        };
    }

    @EventListener
    public void onMqttSubscribed(MqttSubscribedEvent event) {
        mqttConnectionHealth.markConnected();
        log.info("MQTT subscribed to {}", String.join(", ", mqttConnectionHealth.getTopics()));
    }

    @EventListener
    public void onMqttConnectionFailed(MqttConnectionFailedEvent event) {
        Throwable cause = event.getCause();
        String detail = cause != null && cause.getMessage() != null ? cause.getMessage() : "MQTT connection failed";
        mqttConnectionHealth.markDisconnected(detail);
        log.warn("MQTT connection failed: {}", detail);
    }

    private static String[] distinctTopics(String... topics) {
        return java.util.Arrays.stream(topics)
                .filter(t -> t != null && !t.isBlank())
                .distinct()
                .toArray(String[]::new);
    }
}
