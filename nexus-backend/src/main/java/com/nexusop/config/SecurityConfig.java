package com.nexusop.config;

import com.nexusop.security.JwtFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    private final JwtFilter jwtFilter;

    @Value("${nexusop.cors.allowed-origins}")
    private String allowedOrigins;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(csrf -> csrf.disable())
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .authorizeHttpRequests(auth -> auth
                // Public routes
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/health").permitAll()
                .requestMatchers("/ws/**").permitAll()

                // UI config — readable by all authenticated users
                .requestMatchers(HttpMethod.GET, "/api/ui-config/**").authenticated()
                // UI config — write only by ADMIN
                .requestMatchers(HttpMethod.PATCH, "/api/ui-config/**").hasAnyRole("ADMIN", "SUPER_ADMIN")
                .requestMatchers(HttpMethod.POST, "/api/ui-config/**").hasRole("SUPER_ADMIN")

                // Bills state machine — role-specific
                .requestMatchers(HttpMethod.PATCH, "/api/bills/*/approve").hasAnyRole("FINANCE", "ADMIN", "SUPER_ADMIN")
                .requestMatchers(HttpMethod.PATCH, "/api/bills/*/pay").hasAnyRole("FINANCE", "ADMIN", "SUPER_ADMIN")
                .requestMatchers(HttpMethod.PATCH, "/api/bills/*/submit").hasAnyRole("PROJECT_MANAGER", "ADMIN", "SUPER_ADMIN")
                .requestMatchers(HttpMethod.PATCH, "/api/bills/*/reject").hasAnyRole("FINANCE", "ADMIN", "SUPER_ADMIN")

                // Project creation
                .requestMatchers(HttpMethod.POST, "/api/projects").hasAnyRole("ADMIN", "SUPER_ADMIN")

                // Milestone progress updates
                .requestMatchers(HttpMethod.PATCH, "/api/milestones/*/progress")
                    .hasAnyRole("ADMIN", "PROJECT_MANAGER", "SITE_ENGINEER", "SUPER_ADMIN")

                // All other routes — just be authenticated
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of(allowedOrigins));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }

    @Bean
    public PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(12);
    }

    @Bean
    public AuthenticationManager authenticationManager(AuthenticationConfiguration config) throws Exception {
        return config.getAuthenticationManager();
    }
}
