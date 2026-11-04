package com.smartirrigation.handlers;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;

import com.smartirrigation.Database;
import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

/**
 * Administrative Controller strictly protected behind login and admin role authorization.
 * Handles access audit trail inspection, user management, and system-wide metric overviews.
 */
public class AdminHandler extends BaseHandler {

    public HttpHandler auditLogs() {
        return this::handleAuditLogs;
    }

    public HttpHandler users() {
        return this::handleUsers;
    }

    public HttpHandler stats() {
        return this::handleStats;
    }

    private void handleAuditLogs(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        String user = currentUser(exchange);
        if (user == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Authentication required").build());
            return;
        }
        if (!isAdmin(exchange)) {
            sendJson(exchange, 403, Json.obj().put("error", "Access denied: Administrator privileges required").build());
            return;
        }

        int limit = (int) parseDouble(queryParams(exchange).getOrDefault("limit", "50"), 50);
        StringBuilder arr = new StringBuilder("[");

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT * FROM access_audit_logs ORDER BY id DESC LIMIT ?")) {
            ps.setInt(1, limit);
            try (ResultSet rs = ps.executeQuery()) {
                boolean first = true;
                while (rs.next()) {
                    if (!first) arr.append(",");
                    arr.append(Json.obj()
                            .put("id", rs.getInt("id"))
                            .put("username", rs.getString("username"))
                            .put("entity_type", rs.getString("entity_type"))
                            .put("entity_id", rs.getString("entity_id"))
                            .put("action", rs.getString("action"))
                            .put("ip_address", rs.getString("ip_address"))
                            .put("created_at", rs.getString("created_at"))
                            .build());
                    first = false;
                }
            }
            arr.append("]");
            sendJson(exchange, 200, arr.toString());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private void handleUsers(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        String user = currentUser(exchange);
        if (user == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Authentication required").build());
            return;
        }
        if (!isAdmin(exchange)) {
            sendJson(exchange, 403, Json.obj().put("error", "Access denied: Administrator privileges required").build());
            return;
        }

        StringBuilder arr = new StringBuilder("[");
        try (Connection conn = Database.connect();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT id, username, email, role, created_at FROM users ORDER BY id ASC")) {
            boolean first = true;
            while (rs.next()) {
                if (!first) arr.append(",");
                arr.append(Json.obj()
                        .put("id", rs.getInt("id"))
                        .put("username", rs.getString("username"))
                        .put("email", rs.getString("email"))
                        .put("role", rs.getString("role") != null ? rs.getString("role") : "operator")
                        .put("created_at", rs.getString("created_at"))
                        .build());
                first = false;
            }
            arr.append("]");
            sendJson(exchange, 200, arr.toString());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private void handleStats(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        String user = currentUser(exchange);
        if (user == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Authentication required").build());
            return;
        }
        if (!isAdmin(exchange)) {
            sendJson(exchange, 403, Json.obj().put("error", "Access denied: Administrator privileges required").build());
            return;
        }

        try (Connection conn = Database.connect();
             Statement st = conn.createStatement()) {

            int userCount = 0;
            try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM users")) {
                if (rs.next()) userCount = rs.getInt(1);
            }

            int cropCount = 0;
            try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM crops")) {
                if (rs.next()) cropCount = rs.getInt(1);
            }

            int sensorCount = 0;
            try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM sensors")) {
                if (rs.next()) sensorCount = rs.getInt(1);
            }

            int logCount = 0;
            try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM irrigation_logs")) {
                if (rs.next()) logCount = rs.getInt(1);
            }

            int auditCount = 0;
            try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM access_audit_logs")) {
                if (rs.next()) auditCount = rs.getInt(1);
            }

            sendJson(exchange, 200, Json.obj()
                    .put("total_users", userCount)
                    .put("total_crops", cropCount)
                    .put("total_sensor_readings", sensorCount)
                    .put("total_irrigation_logs", logCount)
                    .put("total_audit_events", auditCount)
                    .build());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }
}
