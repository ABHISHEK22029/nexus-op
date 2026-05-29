package com.nexusop.domain.bill;

import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/bills")
@RequiredArgsConstructor
public class BillController {

    private final JdbcTemplate jdbc;

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> getAll(@RequestParam(required = false) Integer projectId) {
        String sql = projectId != null
            ? "SELECT b.*, wo.name AS work_order_name, p.name AS project_name FROM bills b " +
              "LEFT JOIN work_orders wo ON wo.id = b.\"workOrderId\" " +
              "LEFT JOIN projects p ON p.id = b.\"projectId\" " +
              "WHERE b.\"projectId\" = ? ORDER BY b.created_at DESC"
            : "SELECT b.*, wo.name AS work_order_name, p.name AS project_name FROM bills b " +
              "LEFT JOIN work_orders wo ON wo.id = b.\"workOrderId\" " +
              "LEFT JOIN projects p ON p.id = b.\"projectId\" " +
              "ORDER BY b.created_at DESC";
        List<Map<String, Object>> bills = projectId != null
            ? jdbc.queryForList(sql, projectId) : jdbc.queryForList(sql);
        return ResponseEntity.ok(bills);
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> getById(@PathVariable Long id) {
        try {
            return ResponseEntity.ok(jdbc.queryForMap(
                "SELECT b.*, wo.name AS work_order_name FROM bills b " +
                "LEFT JOIN work_orders wo ON wo.id = b.\"workOrderId\" WHERE b.id = ?", id));
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill not found");
        }
    }

    // ─────────────────────────────────────────────────────────────
    // STATE MACHINE: Draft → Submitted → Finance Approved → Paid
    //                             ↓ (any) → Rejected
    // ─────────────────────────────────────────────────────────────

    @PatchMapping("/{id}/submit")
    @PreAuthorize("hasAnyRole('PROJECT_MANAGER','ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> submit(@PathVariable Long id, Authentication auth) {
        validateStatus(id, "Draft", "Only Draft bills can be submitted");
        Long userId = getUserId(auth);
        jdbc.update(
            "UPDATE bills SET status = 'Submitted', submitted_by = ?, submitted_at = ? WHERE id = ?",
            userId, Instant.now(), id
        );
        logActivity(id, userId, "BILL_SUBMITTED");
        return ResponseEntity.ok(getById(id).getBody());
    }

    @PatchMapping("/{id}/approve")
    @PreAuthorize("hasAnyRole('FINANCE','ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> approve(@PathVariable Long id, Authentication auth) {
        validateStatus(id, "Submitted", "Only Submitted bills can be approved");
        Long userId = getUserId(auth);
        jdbc.update(
            "UPDATE bills SET status = 'Finance Approved', approved_by = ?, approved_at = ? WHERE id = ?",
            userId, Instant.now(), id
        );
        logActivity(id, userId, "BILL_APPROVED");
        return ResponseEntity.ok(getById(id).getBody());
    }

    @PatchMapping("/{id}/pay")
    @PreAuthorize("hasAnyRole('FINANCE','ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> pay(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            Authentication auth) {
        validateStatus(id, "Finance Approved", "Only Finance Approved bills can be marked paid");
        Long userId = getUserId(auth);
        jdbc.update(
            "UPDATE bills SET status = 'Paid', payment_mode = ?, payment_reference = ?, paid_at = ? WHERE id = ?",
            body.get("paymentMode"), body.get("paymentReference"), Instant.now(), id
        );
        logActivity(id, userId, "BILL_PAID");
        return ResponseEntity.ok(getById(id).getBody());
    }

    @PatchMapping("/{id}/reject")
    @PreAuthorize("hasAnyRole('FINANCE','ADMIN','SUPER_ADMIN')")
    public ResponseEntity<Map<String, Object>> reject(
            @PathVariable Long id,
            @RequestBody Map<String, String> body,
            Authentication auth) {
        String reason = body.get("reason");
        if (reason == null || reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Rejection reason is required");
        }
        Long userId = getUserId(auth);
        jdbc.update(
            "UPDATE bills SET status = 'Rejected', rejection_reason = ? WHERE id = ?",
            reason, id
        );
        logActivity(id, userId, "BILL_REJECTED");
        return ResponseEntity.ok(getById(id).getBody());
    }

    // ─────────────────────────────────────────────────────────────

    private void validateStatus(Long id, String expectedStatus, String errorMsg) {
        try {
            String currentStatus = jdbc.queryForObject(
                "SELECT status FROM bills WHERE id = ?", String.class, id);
            if (!expectedStatus.equals(currentStatus)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, errorMsg);
            }
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill not found");
        }
    }

    private Long getUserId(Authentication auth) {
        Object details = ((org.springframework.security.authentication.UsernamePasswordAuthenticationToken) auth).getDetails();
        return details instanceof Long ? (Long) details : 0L;
    }

    private void logActivity(Long billId, Long userId, String type) {
        try {
            Integer projectId = jdbc.queryForObject(
                "SELECT \"projectId\" FROM bills WHERE id = ?", Integer.class, billId);
            jdbc.update(
                "INSERT INTO activities (\"projectId\", description, type, \"userId\") VALUES (?, ?, ?, ?)",
                projectId, "RA Bill #" + billId + " status changed to " + type.replace("BILL_", ""), type, userId
            );
        } catch (Exception e) { /* non-fatal */ }
    }
}
