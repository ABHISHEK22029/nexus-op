package com.nexusop.shared.util;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Map;

/**
 * GST Calculation Engine for Purchase Orders and Bills.
 * Handles intra-state (SGST + CGST) and inter-state (IGST) scenarios.
 * Based on company's real PO data: SGST 9% + CGST 9% = 18% for Telangana intra-state.
 */
public class GstCalculator {

    // First 2 digits of GSTIN identify the state
    private static final Map<String, String> GSTIN_STATE_CODES = Map.ofEntries(
        Map.entry("01", "Jammu & Kashmir"), Map.entry("02", "Himachal Pradesh"),
        Map.entry("03", "Punjab"), Map.entry("04", "Chandigarh"),
        Map.entry("05", "Uttarakhand"), Map.entry("06", "Haryana"),
        Map.entry("07", "Delhi"), Map.entry("08", "Rajasthan"),
        Map.entry("09", "Uttar Pradesh"), Map.entry("10", "Bihar"),
        Map.entry("11", "Sikkim"), Map.entry("12", "Arunachal Pradesh"),
        Map.entry("13", "Nagaland"), Map.entry("14", "Manipur"),
        Map.entry("15", "Mizoram"), Map.entry("16", "Tripura"),
        Map.entry("17", "Meghalaya"), Map.entry("18", "Assam"),
        Map.entry("19", "West Bengal"), Map.entry("20", "Jharkhand"),
        Map.entry("21", "Odisha"), Map.entry("22", "Chhattisgarh"),
        Map.entry("23", "Madhya Pradesh"), Map.entry("24", "Gujarat"),
        Map.entry("27", "Maharashtra"), Map.entry("29", "Karnataka"),
        Map.entry("30", "Goa"), Map.entry("32", "Kerala"),
        Map.entry("33", "Tamil Nadu"), Map.entry("34", "Puducherry"),
        Map.entry("36", "Telangana"), Map.entry("37", "Andhra Pradesh")
    );

    public static String getStateFromGstin(String gstin) {
        if (gstin == null || gstin.length() < 2) return "Unknown";
        return GSTIN_STATE_CODES.getOrDefault(gstin.substring(0, 2), "Unknown");
    }

    public static boolean isInterState(String vendorGstin, String orgGstin) {
        if (vendorGstin == null || orgGstin == null) return false;
        return !vendorGstin.substring(0, 2).equals(orgGstin.substring(0, 2));
    }

    /**
     * Calculate taxes for a list of PO line items.
     */
    public static TaxResult calculate(List<LineItemInput> items, String vendorGstin, String orgGstin) {
        boolean interState = isInterState(vendorGstin, orgGstin);
        BigDecimal subtotal = BigDecimal.ZERO;
        BigDecimal totalSgst = BigDecimal.ZERO;
        BigDecimal totalCgst = BigDecimal.ZERO;
        BigDecimal totalIgst = BigDecimal.ZERO;

        for (LineItemInput item : items) {
            BigDecimal taxable = item.quantity()
                .multiply(item.unitPrice())
                .multiply(BigDecimal.ONE.subtract(item.discountPct().divide(BigDecimal.valueOf(100), 6, RoundingMode.HALF_UP)))
                .setScale(2, RoundingMode.HALF_UP);

            subtotal = subtotal.add(taxable);
            BigDecimal gstRate = item.gstRate() != null ? item.gstRate() : BigDecimal.valueOf(18);

            if (interState) {
                totalIgst = totalIgst.add(taxable.multiply(gstRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
            } else {
                BigDecimal halfRate = gstRate.divide(BigDecimal.valueOf(2), 6, RoundingMode.HALF_UP);
                totalSgst = totalSgst.add(taxable.multiply(halfRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
                totalCgst = totalCgst.add(taxable.multiply(halfRate).divide(BigDecimal.valueOf(100), 2, RoundingMode.HALF_UP));
            }
        }

        BigDecimal totalTax = totalSgst.add(totalCgst).add(totalIgst);
        BigDecimal grandTotal = subtotal.add(totalTax);

        return new TaxResult(subtotal, totalSgst, totalCgst, totalIgst, totalTax, grandTotal, interState);
    }

    // --- Input/Output records ---

    public record LineItemInput(
        BigDecimal quantity,
        BigDecimal unitPrice,
        BigDecimal discountPct,
        BigDecimal gstRate
    ) {
        public LineItemInput {
            if (discountPct == null) discountPct = BigDecimal.ZERO;
            if (gstRate == null) gstRate = BigDecimal.valueOf(18);
        }
    }

    public record TaxResult(
        BigDecimal subtotal,
        BigDecimal sgst,
        BigDecimal cgst,
        BigDecimal igst,
        BigDecimal totalTax,
        BigDecimal grandTotal,
        boolean isInterState
    ) {}
}
