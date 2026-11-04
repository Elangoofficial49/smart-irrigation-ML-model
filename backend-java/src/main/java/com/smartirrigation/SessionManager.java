package com.smartirrigation;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Session store supporting role-based access control (RBAC).
 * Maps random session tokens to user identity and assigned role (e.g. 'operator', 'admin').
 */
public class SessionManager {

    public static class UserSession {
        public final String username;
        public final String role;

        public UserSession(String username, String role) {
            this.username = username;
            this.role = (role != null && !role.isBlank()) ? role : "operator";
        }
    }

    private static final Map<String, UserSession> tokenToSession = new ConcurrentHashMap<>();
    private static final SecureRandom RANDOM = new SecureRandom();

    public static String createSession(String username) {
        return createSession(username, "operator");
    }

    public static String createSession(String username, String role) {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokenToSession.put(token, new UserSession(username, role));
        return token;
    }

    public static UserSession sessionForToken(String token) {
        if (token == null) return null;
        return tokenToSession.get(token);
    }

    public static String usernameForToken(String token) {
        UserSession s = sessionForToken(token);
        return s != null ? s.username : null;
    }

    public static String roleForToken(String token) {
        UserSession s = sessionForToken(token);
        return s != null ? s.role : null;
    }

    public static void invalidate(String token) {
        if (token != null) tokenToSession.remove(token);
    }

    public static String extractToken(String authorizationHeader) {
        if (authorizationHeader == null) return null;
        if (authorizationHeader.startsWith("Bearer ")) {
            return authorizationHeader.substring("Bearer ".length()).trim();
        }
        return authorizationHeader.trim();
    }
}

