package com.nexusop.domain.uiconfig;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;
import java.util.Map;

@Component
@RequiredArgsConstructor
@Slf4j
public class PgNotifyListener {

    private final DataSource dataSource;
    private final SimpMessagingTemplate messagingTemplate;
    private final UiConfigService uiConfigService;
    private final ObjectMapper objectMapper;

    private Connection listenerConnection;

    @PostConstruct
    public void init() {
        try {
            listenerConnection = dataSource.getConnection();
            PGConnection pgConn = listenerConnection.unwrap(PGConnection.class);
            try (Statement stmt = listenerConnection.createStatement()) {
                stmt.execute("LISTEN ui_config_changed");
            }
            log.info("PostgreSQL LISTEN registered on channel: ui_config_changed");
        } catch (Exception e) {
            log.error("Failed to register pg_notify listener: {}", e.getMessage());
        }
    }

    // Poll every 500ms for PostgreSQL notifications
    @Scheduled(fixedDelayString = "${nexusop.pg-notify.poll-interval-ms:500}")
    public void pollNotifications() {
        if (listenerConnection == null) return;
        try {
            PGConnection pgConn = listenerConnection.unwrap(PGConnection.class);
            PGNotification[] notifications = pgConn.getNotifications(0);
            if (notifications == null || notifications.length == 0) return;

            for (PGNotification notification : notifications) {
                log.info("UI config change received: {}", notification.getParameter());
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> payload = objectMapper.readValue(
                        notification.getParameter(), Map.class);
                    String configKey = (String) payload.get("config_key");

                    // Fetch the updated value from DB
                    Map<String, Object> updated = uiConfigService.getByKey(configKey);

                    // Broadcast to all connected React clients via WebSocket
                    messagingTemplate.convertAndSend(
                        "/topic/ui-config",
                        Map.of(
                            "configKey", configKey,
                            "module",    payload.get("module"),
                            "newValue",  updated.getOrDefault("value", Map.of()),
                            "updatedAt", payload.get("updated_at")
                        )
                    );
                    log.info("Broadcasted UI config change for key: {}", configKey);
                } catch (Exception e) {
                    log.error("Error processing notification payload: {}", e.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("Error polling pg_notify: {}", e.getMessage());
            reconnect();
        }
    }

    private void reconnect() {
        try {
            if (listenerConnection != null && !listenerConnection.isClosed()) {
                listenerConnection.close();
            }
            init();
        } catch (Exception e) {
            log.error("Failed to reconnect pg_notify listener: {}", e.getMessage());
        }
    }
}
