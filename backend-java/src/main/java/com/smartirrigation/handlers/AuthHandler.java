package com.smartirrigation.handlers;

import java.io.IOException;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.regex.Pattern;

import com.smartirrigation.Database;
import com.smartirrigation.SessionManager;
import com.smartirrigation.util.EmailService;
import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

public class AuthHandler extends BaseHandler {

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final Pattern EMAIL_PATTERN = Pattern.compile("^[A-Za-z0-9+_.-]+@(.+)$");

    public HttpHandler signup() {
        return this::handleSignup;
    }

    public HttpHandler login() {
        return this::handleLogin;
    }

    public HttpHandler logout() {
        return this::handleLogout;
    }

    public HttpHandler forgotPasswordRequest() {
        return this::handleForgotPasswordRequest;
    }

    public HttpHandler forgotPasswordVerify() {
        return this::handleForgotPasswordVerify;
    }

    public HttpHandler forgotPasswordReset() {
        return this::handleForgotPasswordReset;
    }

    private void handleSignup(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String username = body.getOrDefault("username", "").trim();
        String email = body.getOrDefault("email", "").trim().toLowerCase();
        String password = body.getOrDefault("password", "");

        if (username.isEmpty() || password.isEmpty()) {
            sendJson(exchange, 400, Json.obj().put("error", "Username and password are required").build());
            return;
        }
        if (email.isEmpty() || !EMAIL_PATTERN.matcher(email).matches()) {
            sendJson(exchange, 400, Json.obj().put("error", "A valid email address is required").build());
            return;
        }
        if (password.length() < 4) {
            sendJson(exchange, 400, Json.obj().put("error", "Password must be at least 4 characters").build());
            return;
        }

        try (Connection conn = Database.connect()) {
            // 1. Check if username already exists
            try (PreparedStatement checkUser = conn.prepareStatement("SELECT id FROM users WHERE LOWER(username) = LOWER(?)")) {
                checkUser.setString(1, username);
                try (ResultSet rs = checkUser.executeQuery()) {
                    if (rs.next()) {
                        sendJson(exchange, 409, Json.obj().put("error", "Username is already taken. Please choose another.").build());
                        return;
                    }
                }
            }

            // 2. Check if email already exists
            try (PreparedStatement checkEmail = conn.prepareStatement("SELECT id FROM users WHERE LOWER(email) = LOWER(?)")) {
                checkEmail.setString(1, email);
                try (ResultSet rs = checkEmail.executeQuery()) {
                    if (rs.next()) {
                        sendJson(exchange, 409, Json.obj().put("error", "An account with this email address already exists. Please log in or use Forgot Password.").build());
                        return;
                    }
                }
            }

            String salt = Database.randomSalt();
            String hash = Database.hashPassword(password, salt);

            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)")) {
                ps.setString(1, username);
                ps.setString(2, email);
                ps.setString(3, hash);
                ps.setString(4, salt);
                ps.executeUpdate();
                sendJson(exchange, 201, Json.obj().put("message", "Account created successfully").build());
            }
        } catch (SQLException e) {
            String msg = e.getMessage() != null ? e.getMessage() : "";
            if (msg.toLowerCase().contains("unique") || msg.contains("idx_users_email")) {
                sendJson(exchange, 409, Json.obj().put("error", "Username or email already exists").build());
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
        String identifier = body.getOrDefault("username", "").trim();
        String password = body.getOrDefault("password", "");

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT username, password_hash, salt FROM users WHERE username = ? OR email = ?")) {
            ps.setString(1, identifier);
            ps.setString(2, identifier.toLowerCase());
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    sendJson(exchange, 401, Json.obj().put("error", "Invalid credentials").build());
                    return;
                }
                String resolvedUsername = rs.getString("username");
                String storedHash = rs.getString("password_hash");
                String salt = rs.getString("salt");
                String attemptHash = Database.hashPassword(password, salt);

                if (!attemptHash.equals(storedHash)) {
                    sendJson(exchange, 401, Json.obj().put("error", "Invalid credentials").build());
                    return;
                }

                String token = SessionManager.createSession(resolvedUsername);
                sendJson(exchange, 200, Json.obj()
                        .put("message", "Login successful")
                        .put("token", token)
                        .put("username", resolvedUsername)
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

    private void handleForgotPasswordRequest(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String email = body.getOrDefault("email", "").trim().toLowerCase();

        if (email.isEmpty() || !EMAIL_PATTERN.matcher(email).matches()) {
            sendJson(exchange, 400, Json.obj().put("error", "Please provide a valid registered email address").build());
            return;
        }

        try (Connection conn = Database.connect()) {
            // 1. Check if user with this email exists
            boolean userExists;
            try (PreparedStatement ps = conn.prepareStatement("SELECT id FROM users WHERE email = ?")) {
                ps.setString(1, email);
                try (ResultSet rs = ps.executeQuery()) {
                    userExists = rs.next();
                }
            }

            if (!userExists) {
                sendJson(exchange, 404, Json.obj().put("error", "No user account registered with this email address").build());
                return;
            }

            // 2. Invalidate older unused OTPs for this email
            try (PreparedStatement ps = conn.prepareStatement("UPDATE password_resets SET used = TRUE WHERE email = ? AND used = FALSE")) {
                ps.setString(1, email);
                ps.executeUpdate();
            }

            // 3. Generate 6-digit OTP code
            int code = 100000 + RANDOM.nextInt(900000);
            String otpCode = String.valueOf(code);
            Instant expiresAt = Instant.now().plus(10, ChronoUnit.MINUTES);

            // 4. Save to password_resets table
            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO password_resets (email, otp_code, expires_at, used) VALUES (?, ?, ?, FALSE)")) {
                ps.setString(1, email);
                ps.setString(2, otpCode);
                ps.setTimestamp(3, Timestamp.from(expiresAt));
                ps.executeUpdate();
            }

            // 5. Dispatch email via EmailService
            EmailService.EmailResult emailResult = EmailService.sendOtpEmail(email, otpCode);

            Json.Obj resObj = Json.obj().put("email", maskEmail(email));

            if (emailResult.isDevMode) {
                resObj.put("message", "OTP Code generated! (Dev Mode: SMTP not configured in .env)")
                      .put("dev_otp", otpCode)
                      .put("is_dev", true);
            } else if (emailResult.success) {
                resObj.put("message", "A 6-digit verification code has been dispatched to your email inbox.")
                      .put("is_dev", false);
            } else {
                resObj.put("message", "SMTP connection issue. (Testing OTP code: " + otpCode + ")")
                      .put("dev_otp", otpCode)
                      .put("smtp_error", emailResult.message)
                      .put("is_dev", true);
            }

            sendJson(exchange, 200, resObj.build());

        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", "Database error: " + e.getMessage()).build());
        }
    }

    private void handleForgotPasswordVerify(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String email = body.getOrDefault("email", "").trim().toLowerCase();
        String otp = body.getOrDefault("otp", "").trim();

        if (email.isEmpty() || otp.isEmpty()) {
            sendJson(exchange, 400, Json.obj().put("error", "Email and OTP code are required").build());
            return;
        }

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT id FROM password_resets WHERE email = ? AND otp_code = ? AND used = FALSE AND expires_at > ? ORDER BY id DESC LIMIT 1")) {
            ps.setString(1, email);
            ps.setString(2, otp);
            ps.setTimestamp(3, Timestamp.from(Instant.now()));

            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) {
                    sendJson(exchange, 400, Json.obj().put("error", "Invalid or expired OTP verification code").build());
                    return;
                }
                sendJson(exchange, 200, Json.obj()
                        .put("message", "OTP verified successfully")
                        .put("valid", true)
                        .build());
            }
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", "Database error: " + e.getMessage()).build());
        }
    }

    private void handleForgotPasswordReset(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String email = body.getOrDefault("email", "").trim().toLowerCase();
        String otp = body.getOrDefault("otp", "").trim();
        String newPassword = body.getOrDefault("new_password", "");

        if (email.isEmpty() || otp.isEmpty() || newPassword.isEmpty()) {
            sendJson(exchange, 400, Json.obj().put("error", "Email, OTP, and new password are required").build());
            return;
        }
        if (newPassword.length() < 4) {
            sendJson(exchange, 400, Json.obj().put("error", "Password must be at least 4 characters").build());
            return;
        }

        try (Connection conn = Database.connect()) {
            int resetId;
            // 1. Verify OTP
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT id FROM password_resets WHERE email = ? AND otp_code = ? AND used = FALSE AND expires_at > ? ORDER BY id DESC LIMIT 1")) {
                ps.setString(1, email);
                ps.setString(2, otp);
                ps.setTimestamp(3, Timestamp.from(Instant.now()));
                try (ResultSet rs = ps.executeQuery()) {
                    if (!rs.next()) {
                        sendJson(exchange, 400, Json.obj().put("error", "Invalid or expired OTP verification code").build());
                        return;
                    }
                    resetId = rs.getInt("id");
                }
            }

            // 2. Hash new password
            String salt = Database.randomSalt();
            String hash = Database.hashPassword(newPassword, salt);

            // 3. Update user password
            try (PreparedStatement ps = conn.prepareStatement(
                    "UPDATE users SET password_hash = ?, salt = ? WHERE email = ?")) {
                ps.setString(1, hash);
                ps.setString(2, salt);
                ps.setString(3, email);
                int updated = ps.executeUpdate();
                if (updated == 0) {
                    sendJson(exchange, 404, Json.obj().put("error", "User account not found").build());
                    return;
                }
            }

            // 4. Mark OTP as used
            if (resetId != -1) {
                try (PreparedStatement ps = conn.prepareStatement(
                        "UPDATE password_resets SET used = TRUE WHERE id = ?")) {
                    ps.setInt(1, resetId);
                    ps.executeUpdate();
                }
            }

            sendJson(exchange, 200, Json.obj()
                    .put("message", "Password has been successfully updated. You can now log in.")
                    .build());

        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", "Database error: " + e.getMessage()).build());
        }
    }

    private String maskEmail(String email) {
        int at = email.indexOf('@');
        if (at <= 2) return email;
        String name = email.substring(0, at);
        String domain = email.substring(at);
        return name.charAt(0) + "***" + name.charAt(name.length() - 1) + domain;
    }
}
