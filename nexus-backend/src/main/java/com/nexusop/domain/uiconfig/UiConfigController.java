package com.nexusop.domain.uiconfig;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/ui-config")
@RequiredArgsConstructor
public class UiConfigController {

    private final UiConfigService uiConfigService;

    /** GET /api/ui-config/all — React loads this once on app start */
    @GetMapping("/all")
    public ResponseEntity<Map<String, Map<String, Object>>> getAll() {
        return ResponseEntity.ok(uiConfigService.getAllActive());
    }

    /** GET /api/ui-config/module/{module} — React loads per-page */
    @GetMapping("/module/{module}")
    public ResponseEntity<Map<String, Object>> getByModule(@PathVariable String module) {
        return ResponseEntity.ok(uiConfigService.getByModule(module));
    }

    /** GET /api/ui-config/{configKey} — fetch single updated key after WebSocket event */
    @GetMapping("/{configKey}")
    public ResponseEntity<Map<String, Object>> getByKey(@PathVariable String configKey) {
        return ResponseEntity.ok(uiConfigService.getByKey(configKey));
    }

    /** PATCH /api/ui-config/{configKey} — update via API (Admin only) */
    @PatchMapping("/{configKey}")
    @PreAuthorize("hasAnyRole('ADMIN', 'SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> updateConfig(
            @PathVariable String configKey,
            @RequestBody Map<String, Object> body,
            Authentication auth) {
        String updatedBy = auth.getName();
        return ResponseEntity.ok(uiConfigService.updateValue(configKey, body.get("value"), updatedBy));
    }

    /** POST /api/ui-config/script — bulk upsert (Super Admin only) */
    @PostMapping("/script")
    @PreAuthorize("hasRole('SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> runScript(@RequestBody List<Map<String, Object>> items) {
        uiConfigService.runScript(items);
        return ResponseEntity.ok(Map.of("status", "ok", "applied", items.size()));
    }
}
