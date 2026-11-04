package com.smartirrigation.handlers;

import com.smartirrigation.SessionManager;
import com.sun.net.httpserver.HttpExchange;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;

public abstract class BaseHandler {

    protected String readBody(HttpExchange exchange) throws IOException {
        InputStream is = exchange.getRequestBody();
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] data = new byte[1024];
        int read;
        while ((read = is.read(data)) != -1) {
            buffer.write(data, 0, read);
        }
        return buffer.toString(StandardCharsets.UTF_8);
    }

    protected void sendJson(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        addCorsHeaders(exchange);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    protected void addCorsHeaders(HttpExchange exchange) {
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");
    }

    protected boolean handlePreflight(HttpExchange exchange) throws IOException {
        if (exchange.getRequestMethod().equalsIgnoreCase("OPTIONS")) {
            addCorsHeaders(exchange);
            exchange.sendResponseHeaders(204, -1);
            return true;
        }
        return false;
    }

    /** Returns the logged-in username for this request, or null if not authenticated. */
    protected String currentUser(HttpExchange exchange) {
        String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
        String token = SessionManager.extractToken(authHeader);
        return SessionManager.usernameForToken(token);
    }

    /** Returns the logged-in user's role (e.g. 'admin', 'operator'), or null if unauthenticated. */
    protected String currentUserRole(HttpExchange exchange) {
        String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
        String token = SessionManager.extractToken(authHeader);
        return SessionManager.roleForToken(token);
    }

    /** Checks whether the authenticated user has administrative privileges. */
    protected boolean isAdmin(HttpExchange exchange) {
        String role = currentUserRole(exchange);
        if ("admin".equalsIgnoreCase(role)) return true;
        String user = currentUser(exchange);
        return "elango_admin".equalsIgnoreCase(user);
    }

    /** Extracts client remote IP address (respecting X-Forwarded-For if behind a proxy). */
    protected String clientIp(HttpExchange exchange) {
        String xff = exchange.getRequestHeaders().getFirst("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        if (exchange.getRemoteAddress() != null && exchange.getRemoteAddress().getAddress() != null) {
            return exchange.getRemoteAddress().getAddress().getHostAddress();
        }
        return "127.0.0.1";
    }

    /** Logs an audit event recording who opened/accessed or modified each record. */
    protected void logAccess(String username, String entityType, String entityId, String action, HttpExchange exchange) {
        if (username == null || username.isBlank()) return;
        String ip = clientIp(exchange);
        try (java.sql.Connection conn = com.smartirrigation.Database.connect();
             java.sql.PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO access_audit_logs (username, entity_type, entity_id, action, ip_address) VALUES (?, ?, ?, ?, ?)")) {
            ps.setString(1, username);
            ps.setString(2, entityType);
            ps.setString(3, entityId);
            ps.setString(4, action);
            ps.setString(5, ip);
            ps.executeUpdate();
        } catch (Exception e) {
            System.err.println("[AuditLog] Failed to record access log: " + e.getMessage());
        }
    }

    protected Map<String, String> queryParams(HttpExchange exchange) {
        Map<String, String> params = new HashMap<>();
        String query = exchange.getRequestURI().getQuery();
        if (query == null) return params;
        for (String pair : query.split("&")) {
            String[] kv = pair.split("=", 2);
            if (kv.length == 2) {
                params.put(kv[0], java.net.URLDecoder.decode(kv[1], StandardCharsets.UTF_8));
            }
        }
        return params;
    }

    protected double parseDouble(String s, double fallback) {
        try {
            return Double.parseDouble(s);
        } catch (Exception e) {
            return fallback;
        }
    }
}
