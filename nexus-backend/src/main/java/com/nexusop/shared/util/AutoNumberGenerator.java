package com.nexusop.shared.util;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import lombok.RequiredArgsConstructor;

import java.time.LocalDate;

/**
 * Auto-numbering service for all entities.
 * Format: ORG_CODE/FY-YEAR/SEQ (e.g., Kirashi/FY2026-27/007)
 * 
 * Used for: PO numbers, WO numbers, CSQ numbers, Bill numbers, etc.
 */
@Component
@RequiredArgsConstructor
public class AutoNumberGenerator {

    private final JdbcTemplate jdbc;

    /**
     * Get current Indian financial year string.
     * FY runs April to March. Example: "2026-27"
     */
    public static String getCurrentFY() {
        LocalDate now = LocalDate.now();
        int year = now.getYear();
        int month = now.getMonthValue();
        if (month >= 4) {
            return year + "-" + String.valueOf(year + 1).substring(2);
        } else {
            return (year - 1) + "-" + String.valueOf(year).substring(2);
        }
    }

    /**
     * Generate next sequential number for a given entity.
     * 
     * @param table     Table name (e.g., "purchase_orders")
     * @param column    Column name (e.g., "po_number")
     * @param prefix    Prefix (e.g., "Kirashi/FY2026-27/")
     * @param padLength Zero-pad length (e.g., 3 → "001")
     * @return Next number like "Kirashi/FY2026-27/007"
     */
    public String getNext(String table, String column, String prefix, int padLength) {
        String sql = String.format(
            "SELECT %s FROM %s WHERE %s LIKE ? ORDER BY %s DESC LIMIT 1",
            column, table, column, column
        );

        String last;
        try {
            last = jdbc.queryForObject(sql, String.class, prefix + "%");
        } catch (Exception e) {
            last = null;
        }

        int lastSeq = 0;
        if (last != null && last.startsWith(prefix)) {
            try {
                lastSeq = Integer.parseInt(last.substring(prefix.length()));
            } catch (NumberFormatException ignored) {}
        }

        String seqStr = String.format("%" + padLength + "s", lastSeq + 1).replace(' ', '0');
        return prefix + seqStr;
    }

    /**
     * Generate next PO number.
     * Format: ORG_CODE/FY2026-27/001
     */
    public String nextPO(String orgCode) {
        String prefix = orgCode + "/FY" + getCurrentFY() + "/";
        return getNext("purchase_orders", "po_number", prefix, 3);
    }

    /**
     * Generate next Work Order number.
     * Format: WO-FY2026-27-001
     */
    public String nextWO() {
        String prefix = "WO-FY" + getCurrentFY() + "-";
        return getNext("work_orders", "wo_number", prefix, 3);
    }

    /**
     * Generate next CSQ number.
     * Format: CSQ-FY2026-27-001
     */
    public String nextCSQ() {
        String prefix = "CSQ-FY" + getCurrentFY() + "-";
        return getNext("csq", "csq_number", prefix, 3);
    }

    /**
     * Generate next RA Bill number.
     * Format: BILL-FY2026-27-001
     */
    public String nextBill() {
        String prefix = "BILL-FY" + getCurrentFY() + "-";
        return getNext("bills", "bill_number", prefix, 3);
    }

    /**
     * Generate next GRN number.
     * Format: GRN-FY2026-27-001
     */
    public String nextGRN() {
        String prefix = "GRN-FY" + getCurrentFY() + "-";
        return getNext("grn", "grn_number", prefix, 3);
    }

    /**
     * Generate next Indent number.
     * Format: IND-FY2026-27-001
     */
    public String nextIndent() {
        String prefix = "IND-FY" + getCurrentFY() + "-";
        return getNext("indents", "indent_number", prefix, 3);
    }

    /**
     * Generate next BBS number.
     * Format: BBS-FY2026-27-001
     */
    public String nextBBS() {
        String prefix = "BBS-FY" + getCurrentFY() + "-";
        return getNext("bbs_schedules", "bbs_number", prefix, 3);
    }

    /**
     * Generate next Estimation number.
     * Format: EST-FY2026-27-001
     */
    public String nextEstimation() {
        String prefix = "EST-FY" + getCurrentFY() + "-";
        return getNext("estimations", "estimation_number", prefix, 3);
    }

    /**
     * Generate next Expense number.
     * Format: EXP-FY2026-27-001
     */
    public String nextExpense() {
        String prefix = "EXP-FY" + getCurrentFY() + "-";
        return getNext("expenses", "expense_number", prefix, 3);
    }
}
