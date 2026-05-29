package com.nexusop.domain.uiconfig;

import lombok.RequiredArgsConstructor;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class UiConfigService {

    private final JdbcTemplate jdbc;

    /** Get all active config (called once on React app load) */
    public Map<String, Map<String, Object>> getAllActive() {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT config_key, module, component, config_type, value " +
            "FROM ui_config WHERE is_active = TRUE ORDER BY module, config_key"
        );
        Map<String, Map<String, Object>> result = new HashMap<>();
        for (Map<String, Object> row : rows) {
            result.put((String) row.get("config_key"), row);
        }
        return result;
    }

    /** Get all config for a specific module */
    public Map<String, Object> getByModule(String module) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "SELECT config_key, value, config_type FROM ui_config " +
            "WHERE module = ? AND is_active = TRUE",
            module
        );
        Map<String, Object> result = new HashMap<>();
        for (Map<String, Object> row : rows) {
            result.put((String) row.get("config_key"), row.get("value"));
        }
        return result;
    }

    /** Get single config by key */
    public Map<String, Object> getByKey(String configKey) {
        try {
            return jdbc.queryForMap(
                "SELECT config_key, module, component, config_type, value, description " +
                "FROM ui_config WHERE config_key = ?",
                configKey
            );
        } catch (Exception e) {
            return Map.of("config_key", configKey, "value", Map.of());
        }
    }

    /** Update a config value — triggers pg_notify → WebSocket push to all clients */
    public Map<String, Object> updateValue(String configKey, Object newValue, String updatedBy) {
        jdbc.update(
            "UPDATE ui_config SET value = ?::jsonb, updated_by = ?, updated_at = NOW() " +
            "WHERE config_key = ?",
            newValue.toString(), updatedBy, configKey
        );
        return getByKey(configKey);
    }

    /** Bulk update (run a config script) */
    public void runScript(List<Map<String, Object>> items) {
        for (Map<String, Object> item : items) {
            jdbc.update(
                "INSERT INTO ui_config (config_key, module, component, config_type, value, description) " +
                "VALUES (?, ?, ?, ?, ?::jsonb, ?) " +
                "ON CONFLICT (config_key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
                item.get("configKey"), item.get("module"), item.get("component"),
                item.get("configType"), item.get("value"), item.get("description")
            );
        }
    }
}
