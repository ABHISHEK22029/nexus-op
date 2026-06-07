package com.nexusop.shared.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;

/**
 * Activity log service — every state-changing operation must call this.
 * Logs who did what, when, and on which module/entity.
 * 
 * Used for audit trail and the Activity Log page in the frontend.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ActivityLogService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    /**
     * Log an activity asynchronously.
     *
     * @param projectId  Project context (nullable for org-level activities)
     * @param userId     Who performed the action
     * @param module     Module name: vendor, po, grn, indent, wo, boq, mb, bill, milestone, etc.
     * @param type       Activity type: PO_CREATED, PO_APPROVED, VENDOR_BLACKLISTED, etc.
     * @param description Human-readable description
     * @param metadata   Additional JSON data (entity IDs, amounts, etc.)
     */
    @Async
    public void log(Long projectId, Long userId, String module, String type,
                    String description, Map<String, Object> metadata) {
        try {
            String metadataJson = metadata != null ? objectMapper.writeValueAsString(metadata) : "{}";

            jdbc.update("""
                INSERT INTO activities ("projectId", "userId", type, description, module, metadata, timestamp)
                VALUES (?, ?, ?, ?, ?, ?::jsonb, NOW())
                """,
                projectId, userId, type, description, module, metadataJson
            );

            log.debug("Activity logged: [{}] {} — {}", module, type, description);
        } catch (Exception e) {
            // Don't let activity logging failures break the main operation
            log.error("Failed to log activity: {} — {}", type, e.getMessage());
        }
    }

    /**
     * Convenience overload without metadata.
     */
    public void log(Long projectId, Long userId, String module, String type, String description) {
        log(projectId, userId, module, type, description, null);
    }

    // --- Pre-defined activity type constants ---

    // Auth
    public static final String USER_LOGIN = "USER_LOGIN";
    public static final String USER_INVITED = "USER_INVITED";
    public static final String USER_ROLE_CHANGED = "USER_ROLE_CHANGED";

    // Vendor
    public static final String VENDOR_CREATED = "VENDOR_CREATED";
    public static final String VENDOR_UPDATED = "VENDOR_UPDATED";
    public static final String VENDOR_BLACKLISTED = "VENDOR_BLACKLISTED";

    // CSQ
    public static final String CSQ_CREATED = "CSQ_CREATED";
    public static final String CSQ_SUBMITTED = "CSQ_SUBMITTED";
    public static final String CSQ_APPROVED = "CSQ_APPROVED";
    public static final String CSQ_PO_RAISED = "CSQ_PO_RAISED";

    // PO
    public static final String PO_CREATED = "PO_CREATED";
    public static final String PO_SUBMITTED = "PO_SUBMITTED";
    public static final String PO_APPROVED = "PO_APPROVED";
    public static final String PO_DISPATCHED = "PO_DISPATCHED";
    public static final String PO_DELIVERED = "PO_DELIVERED";
    public static final String PO_CANCELLED = "PO_CANCELLED";

    // GRN
    public static final String GRN_RECEIVED = "GRN_RECEIVED";
    public static final String GRN_REJECTED = "GRN_REJECTED";

    // Indent
    public static final String INDENT_RAISED = "INDENT_RAISED";
    public static final String INDENT_APPROVED = "INDENT_APPROVED";
    public static final String INDENT_REJECTED = "INDENT_REJECTED";

    // Work Order
    public static final String WO_CREATED = "WO_CREATED";
    public static final String WO_ACTIVATED = "WO_ACTIVATED";
    public static final String WO_COMPLETED = "WO_COMPLETED";

    // MB
    public static final String MB_CREATED = "MB_CREATED";
    public static final String MB_SUBMITTED = "MB_SUBMITTED";
    public static final String MB_APPROVED = "MB_APPROVED";

    // Bill
    public static final String BILL_GENERATED = "BILL_GENERATED";
    public static final String BILL_SUBMITTED = "BILL_SUBMITTED";
    public static final String BILL_APPROVED = "BILL_APPROVED";
    public static final String BILL_PAID = "BILL_PAID";

    // Milestone
    public static final String MILESTONE_UPDATED = "MILESTONE_UPDATED";
    public static final String MILESTONE_COMPLETED = "MILESTONE_COMPLETED";

    // SCM
    public static final String SCM_PAYMENT_RECORDED = "SCM_PAYMENT_RECORDED";

    // Material
    public static final String MATERIAL_BATCH_RECORDED = "MATERIAL_BATCH_RECORDED";
    public static final String INVENTORY_ADJUSTED = "INVENTORY_ADJUSTED";

    // BBS
    public static final String BBS_CREATED = "BBS_CREATED";

    // Estimation
    public static final String ESTIMATION_CREATED = "ESTIMATION_CREATED";
}
