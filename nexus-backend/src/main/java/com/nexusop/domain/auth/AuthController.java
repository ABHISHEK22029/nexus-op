package com.nexusop.domain.auth;

import com.nexusop.security.JwtUtil;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Map;

@RestController
@RequestMapping("/auth")
@RequiredArgsConstructor
public class AuthController {

    private final JdbcTemplate jdbc;
    private final JwtUtil jwtUtil;
    private final PasswordEncoder passwordEncoder;

    @PostMapping("/login")
    public ResponseEntity<?> login(@RequestBody LoginRequest req) {
        try {
            // Fetch user with role
            var user = jdbc.queryForMap(
                """
                SELECT u.id, u.full_name, u.email, u.password_hash,
                       u.status, r.name AS role, u.avatar_url, u.designation
                FROM users u
                JOIN roles r ON r.id = u.role_id
                WHERE u.email = ?
                """,
                req.email()
            );

            if (!"Active".equals(user.get("status"))) {
                return ResponseEntity.status(HttpStatus.FORBIDDEN)
                    .body(Map.of("error", "Account is " + user.get("status")));
            }

            if (!passwordEncoder.matches(req.password(), (String) user.get("password_hash"))) {
                return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                    .body(Map.of("error", "Invalid email or password"));
            }

            Long userId = ((Number) user.get("id")).longValue();
            String role = (String) user.get("role");
            String token = jwtUtil.generateToken(req.email(), role, userId);

            // Update last login
            jdbc.update("UPDATE users SET last_login_at = ? WHERE id = ?", Instant.now(), userId);

            return ResponseEntity.ok(Map.of(
                "token", token,
                "user", Map.of(
                    "id",          userId,
                    "email",       user.get("email"),
                    "fullName",    user.get("full_name"),
                    "role",        role,
                    "designation", user.getOrDefault("designation", ""),
                    "avatarUrl",   user.getOrDefault("avatar_url", "")
                )
            ));
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Invalid email or password"));
        }
    }

    @GetMapping("/me")
    public ResponseEntity<?> me(@RequestHeader("Authorization") String authHeader) {
        String token = authHeader.replace("Bearer ", "");
        if (!jwtUtil.validateToken(token)) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "Invalid token"));
        }
        String email = jwtUtil.extractEmail(token);
        try {
            var user = jdbc.queryForMap(
                """
                SELECT u.id, u.full_name, u.email, u.status,
                       r.name AS role, u.avatar_url, u.designation
                FROM users u
                JOIN roles r ON r.id = u.role_id
                WHERE u.email = ?
                """,
                email
            );
            return ResponseEntity.ok(user);
        } catch (Exception e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
                .body(Map.of("error", "User not found"));
        }
    }

    @GetMapping("/health")
    public ResponseEntity<?> health() {
        return ResponseEntity.ok(Map.of("status", "UP", "service", "nexus-backend"));
    }

    public record LoginRequest(String email, String password) {}
}
