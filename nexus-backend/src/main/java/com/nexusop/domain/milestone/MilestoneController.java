package com.nexusop.domain.milestone;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/milestones")
@RequiredArgsConstructor
public class MilestoneController {

    private final JdbcTemplate jdbc;

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAll(
            @RequestParam(required = false) Integer projectId,
            @RequestParam(required = false) Integer workOrderId) {

        StringBuilder sql = new StringBuilder(
            "SELECT m.*, wo.name AS work_order_name " +
            "FROM milestones m LEFT JOIN work_orders wo ON wo.id = m.\"workOrderId\" WHERE 1=1"
        );
        if (projectId != null) sql.append(" AND m.\"projectId\" = ").append(projectId);
        if (workOrderId != null) sql.append(" AND m.\"workOrderId\" = ").append(workOrderId);
        sql.append(" ORDER BY m.planned_start ASC NULLS LAST");

        return ResponseEntity.ok(jdbc.queryForList(sql.toString()));
    }

    /**
     * CRITICAL FIX: This endpoint replaces Math.random() in Dashboard.jsx
     * Engineers call this to update actual progress — drives the real S-curve
     */
    @PatchMapping("/{id}/progress")
    @PreAuthorize("hasAnyRole('ADMIN','PROJECT_MANAGER','SITE_ENGINEER','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> updateProgress(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body,
            Authentication auth) {

        Object actualPct     = body.get("actualPct");
        Object progressRemarks = body.get("progressRemarks");
        Object status        = body.get("status");
        Object actualStart   = body.get("actualStart");
        Object actualEnd     = body.get("actualEnd");

        Long userId = getUserId(auth);

        jdbc.update(
            "UPDATE milestones SET " +
            "actual_pct = COALESCE(?, actual_pct), " +
            "progress_remarks = COALESCE(?, progress_remarks), " +
            "status = COALESCE(?, status), " +
            "actual_start = COALESCE(?::date, actual_start), " +
            "actual_end = COALESCE(?::date, actual_end), " +
            "updated_by = ?, updated_at = ? " +
            "WHERE id = ?",
            actualPct, progressRemarks, status,
            actualStart, actualEnd,
            userId, Instant.now(), id
        );

        // Log activity
        try {
            Map<String, Object> milestone = jdbc.queryForMap(
                "SELECT * FROM milestones WHERE id = ?", id);
            Integer projectId = (Integer) milestone.get("projectId");
            String name = (String) milestone.getOrDefault("name", "Milestone #" + id);
            jdbc.update(
                "INSERT INTO activities (\"projectId\", description, type, \"userId\") VALUES (?, ?, ?, ?)",
                projectId, "Milestone '" + name + "' updated to " + actualPct + "%",
                "MILESTONE_UPDATED", userId
            );
        } catch (Exception e) { /* non-fatal */ }

        return ResponseEntity.ok(
            jdbc.queryForMap("SELECT * FROM milestones WHERE id = ?", id)
        );
    }

    @GetMapping("/s-curve/{projectId}")
    public ResponseEntity<Map<String, Object>> getsCurveData(@PathVariable Integer projectId) {
        // Returns planned vs actual data for the S-curve chart in Dashboard.jsx
        List<Map<String, Object>> milestones = jdbc.queryForList(
            "SELECT name, planned_pct, actual_pct, planned_start, planned_end, " +
            "actual_start, actual_end, status, cumulative_planned, cumulative_actual " +
            "FROM milestones WHERE \"projectId\" = ? " +
            "ORDER BY planned_start ASC NULLS LAST",
            projectId
        );

        // Compute project-level aggregates
        double avgPlanned = milestones.stream()
            .mapToDouble(m -> ((Number) m.getOrDefault("planned_pct", 0)).doubleValue())
            .average().orElse(0);
        double avgActual = milestones.stream()
            .mapToDouble(m -> ((Number) m.getOrDefault("actual_pct", 0)).doubleValue())
            .average().orElse(0);

        return ResponseEntity.ok(Map.of(
            "milestones",   milestones,
            "projectPlannedPct", Math.round(avgPlanned * 10.0) / 10.0,
            "projectActualPct",  Math.round(avgActual * 10.0) / 10.0
        ));
    }

    private Long getUserId(Authentication auth) {
        Object details = ((org.springframework.security.authentication.UsernamePasswordAuthenticationToken) auth).getDetails();
        return details instanceof Long ? (Long) details : 0L;
    }
}
