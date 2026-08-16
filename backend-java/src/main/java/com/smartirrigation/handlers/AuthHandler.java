package com.smartirrigation.handlers;

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.Map;

import com.smartirrigation.Database;
import com.smartirrigation.SessionManager;
import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

public class AuthHandler extends BaseHandler {

    public HttpHandler signup() {
        return this::handleSignup;
    }

    public HttpHandler login() {
        return this::handleLogin;
    }

    public HttpHandler logout() {
        return this::handleLogout;
    }

    private void handleSignup(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String username = body.getOrDefault("username", "").trim();
        String password = body.getOrDefault("password", "");

        if (username.isEmpty() || password.isEmpty()) {
            sendJson(exchange, 400, Json.obj().put("error", "Username and password are required").build());
            return;
        }
        if (password.length() < 4) {
            sendJson(exchange, 400, Json.obj().put("error", "Password must be at least 4 characters").build());
            return;
        }

        String salt = Database.randomSalt();
        String hash = Database.hashPassword(password, salt);

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO users (username, password_hash, salt) VALUES (?, ?, ?)")) {
            ps.setString(1, username);
            ps.setString(2, hash);
            ps.setString(3, salt);
            ps.executeUpdate();
            sendJson(exchange, 201, Json.obj().put("message", "Account created successfully").build());
        } catch (SQLException e) {
            if (e.getMessage() != null && e.getMessage().contains("UNIQUE")) {
                sendJson(exchange, 409, Json.obj().put("error", "Username already exists").build());
            } else {
                sendJson(exchange, 500, Json.obj().put("error", "Server error: " + e.getMessage()).build());
            }
        }
    }

    private void handleLogin(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String username = body.getOrDefault("username", "").trim();
        String password = body.getOrDefault("password", "");

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT password_hash, salt FROM users WHERE username = ?")) {
            ps.setString(1, username);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    sendJson(exchange, 401, Json.obj().put("error", "Invalid username or password").build());
                    return;
                }
                String storedHash = rs.getString("password_hash");
                String salt = rs.getString("salt");
                String attemptHash = Database.hashPassword(password, salt);

                if (!attemptHash.equals(storedHash)) {
                    sendJson(exchange, 401, Json.obj().put("error", "Invalid username or password").build());
                    return;
                }

                String token = SessionManager.createSession(username);
                sendJson(exchange, 200, Json.obj()
                        .put("message", "Login successful")
                        .put("token", token)
                        .put("username", username)
                        .build());
            }
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", "Server error: " + e.getMessage()).build());
        }
    }

    private void handleLogout(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
        String token = SessionManager.extractToken(authHeader);
        SessionManager.invalidate(token);
        sendJson(exchange, 200, Json.obj().put("message", "Logged out").build());
    }
}
