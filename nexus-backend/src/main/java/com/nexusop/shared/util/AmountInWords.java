package com.nexusop.shared.util;

import java.math.BigDecimal;

/**
 * Converts numeric amounts to Indian English words.
 * Uses Indian number system: Crore, Lakh, Thousand.
 * 
 * Example: 873200 → "Eight Lakh Seventy Three Thousand Two Hundred Rupees Only"
 * Example: 15234567.50 → "One Crore Fifty Two Lakh Thirty Four Thousand Five Hundred Sixty Seven Rupees and Fifty Paise Only"
 */
public class AmountInWords {

    private static final String[] ONES = {
        "", "One", "Two", "Three", "Four", "Five", "Six", "Seven",
        "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen",
        "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"
    };

    private static final String[] TENS = {
        "", "", "Twenty", "Thirty", "Forty", "Fifty",
        "Sixty", "Seventy", "Eighty", "Ninety"
    };

    private static String twoDigits(int n) {
        if (n < 20) return ONES[n];
        String result = TENS[n / 10];
        if (n % 10 != 0) result += " " + ONES[n % 10];
        return result;
    }

    private static String threeDigits(int n) {
        if (n >= 100) {
            String result = ONES[n / 100] + " Hundred";
            if (n % 100 != 0) result += " " + twoDigits(n % 100);
            return result;
        }
        return twoDigits(n);
    }

    /**
     * Convert a BigDecimal amount to Indian English words.
     * @param amount The monetary amount (e.g., 873200.00)
     * @return "Eight Lakh Seventy Three Thousand Two Hundred Rupees Only"
     */
    public static String convert(BigDecimal amount) {
        if (amount == null || amount.compareTo(BigDecimal.ZERO) == 0) {
            return "Zero Rupees Only";
        }

        boolean negative = amount.compareTo(BigDecimal.ZERO) < 0;
        if (negative) amount = amount.abs();

        long rupees = amount.longValue();
        int paise = amount.subtract(BigDecimal.valueOf(rupees))
                         .multiply(BigDecimal.valueOf(100))
                         .intValue();

        StringBuilder result = new StringBuilder();
        if (negative) result.append("Minus ");

        // Indian number system: Crore → Lakh → Thousand → Hundred
        int crore = (int) (rupees / 10_000_000);
        int lakh  = (int) ((rupees % 10_000_000) / 100_000);
        int thou  = (int) ((rupees % 100_000) / 1_000);
        int rem   = (int) (rupees % 1_000);

        if (crore > 0) result.append(threeDigits(crore)).append(" Crore ");
        if (lakh > 0)  result.append(threeDigits(lakh)).append(" Lakh ");
        if (thou > 0)  result.append(threeDigits(thou)).append(" Thousand ");
        if (rem > 0)   result.append(threeDigits(rem));

        String rupeePart = result.toString().trim();
        if (rupeePart.isEmpty()) rupeePart = "Zero";
        rupeePart += " Rupees";

        if (paise > 0) {
            rupeePart += " and " + twoDigits(paise) + " Paise";
        }

        return rupeePart + " Only";
    }

    /**
     * Convenience method for double values.
     */
    public static String convert(double amount) {
        return convert(BigDecimal.valueOf(amount));
    }
}
