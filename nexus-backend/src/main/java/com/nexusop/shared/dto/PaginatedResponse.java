package com.nexusop.shared.dto;

import lombok.AllArgsConstructor;
import lombok.Data;

import java.util.List;

/**
 * Generic paginated response wrapper.
 * Used by all list endpoints.
 */
@Data
@AllArgsConstructor
public class PaginatedResponse<T> {
    private List<T> data;
    private long total;
    private int page;
    private int pageSize;
    private int totalPages;

    public static <T> PaginatedResponse<T> of(List<T> data, long total, int page, int pageSize) {
        int totalPages = (int) Math.ceil((double) total / pageSize);
        return new PaginatedResponse<>(data, total, page, pageSize, totalPages);
    }
}
