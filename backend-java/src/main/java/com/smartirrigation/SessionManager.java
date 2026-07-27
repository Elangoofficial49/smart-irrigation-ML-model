package com.smartirrigation;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Simple in-memory session store. On login we issue a random token mapped to
 * the username; the frontend sends it back as an "Authorization: Bearer <token>"
 * header on every protected request. Tokens are cleared on logout or server restart.
 */
public class SessionManager {

    private static final Map<String, String> tokenToUsername = new ConcurrentHashMap<>();
    private static final SecureRandom RANDOM = new SecureRandom();

    public static String createSession(String username) {
        byte[] bytes = new byte[24];
        RANDOM.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        tokenToUsername.put(token, username);
        return token;
    }

    public static String usernameForToken(String token) {
        if (token == null) return null;
        return tokenToUsername.get(token);
    }

    public static void invalidate(String token) {
        if (token != null) tokenToUsername.remove(token);
    }

    public static String extractToken(String authorizationHeader) {
        if (authorizationHeader == null) return null;
        if (authorizationHeader.startsWith("Bearer ")) {
            return authorizationHeader.substring("Bearer ".length()).trim();
        }
        return authorizationHeader.trim();
    }
}
