package com.smartirrigation.handlers;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.util.Map;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

import com.smartirrigation.Database;
import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import io.github.cdimascio.dotenv.Dotenv;

/**
 * Verified Webhook Receiver.
 * Validates cryptographically signed payloads from field IoT probes / gateways using HMAC-SHA256,
 * or via custom Authorization webhook tokens. Rejects unverified, forged or tampered payloads.
 */
public class WebhookHandler extends BaseHandler {

    private static final Dotenv dotenv = Dotenv.configure()
            .directory(System.getProperty("user.dir"))
            .ignoreIfMissing()
            .load();

    private static final String WEBHOOK_SECRET = dotenv.get("WEBHOOK_SECRET");

    public HttpHandler receiveTelemetry() {
        return this::handleTelemetryWebhook;
    }

    private void handleTelemetryWebhook(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        String rawBody = readBody(exchange);
        String signatureHeader = exchange.getRequestHeaders().getFirst("X-AgroPulse-Signature");
        String secretTokenHeader = exchange.getRequestHeaders().getFirst("X-Webhook-Secret");

        // Verify webhook authenticity
        boolean verified = verifyWebhook(rawBody, signatureHeader, secretTokenHeader);
        if (!verified) {
            String ip = clientIp(exchange);
            System.err.println("[Webhook] Unauthorized webhook rejected from IP " + ip);
            sendJson(exchange, 401, Json.obj().put("error", "Unauthorized: Invalid or missing webhook signature/secret").build());
            return;
        }

        // Process verified telemetry payload
        Map<String, String> body = Json.parseFlat(rawBody);
        double moisture = parseDouble(body.get("soil_moisture"), -1);
        double temperature = parseDouble(body.get("temperature"), -999);
        double humidity = parseDouble(body.get("humidity"), -1);
        double rainProb = parseDouble(body.get("rainfall_prob"), -1);
        String probeId = body.getOrDefault("probe_id", "Probe-Gateway").trim();

        if (moisture < 0 || temperature == -999 || humidity < 0 || rainProb < 0) {
            sendJson(exchange, 400, Json.obj().put("error", "Invalid telemetry data values in payload").build());
            return;
        }

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO sensors (soil_moisture, temperature, humidity, rainfall_prob) VALUES (?, ?, ?, ?)")) {
            ps.setDouble(1, moisture);
            ps.setDouble(2, temperature);
            ps.setDouble(3, humidity);
            ps.setDouble(4, rainProb);
            ps.executeUpdate();

            logAccess("webhook:" + probeId, "sensor_telemetry", probeId, "VERIFIED_WEBHOOK_INGEST", exchange);

            sendJson(exchange, 201, Json.obj()
                    .put("status", "success")
                    .put("verified", true)
                    .put("message", "Telemetry received and verified via HMAC signature")
                    .put("probe_id", probeId)
                    .build());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", "Database error: " + e.getMessage()).build());
        }
    }

    private boolean verifyWebhook(String payload, String signatureHeader, String secretTokenHeader) {
        String configuredSecret = WEBHOOK_SECRET;
        if (configuredSecret == null || configuredSecret.isBlank()) {
            System.err.println("[Webhook] Warning: WEBHOOK_SECRET is not configured on the server. Rejecting incoming webhook.");
            return false;
        }

        // 1. Direct Secret Token matching (constant-time comparison)
        if (secretTokenHeader != null && MessageDigest.isEqual(
                secretTokenHeader.trim().getBytes(StandardCharsets.UTF_8),
                configuredSecret.trim().getBytes(StandardCharsets.UTF_8))) {
            return true;
        }

        // 2. HMAC-SHA256 Signature verification (header format: sha256=<hex_hash> or <hex_hash>)
        if (signatureHeader != null && !signatureHeader.isBlank()) {
            String expectedHash = computeHmacSha256(payload, configuredSecret);
            String providedHash = signatureHeader.trim();
            if (providedHash.startsWith("sha256=")) {
                providedHash = providedHash.substring("sha256=".length()).trim();
            }
            if (expectedHash != null && MessageDigest.isEqual(
                    providedHash.toLowerCase().getBytes(StandardCharsets.UTF_8),
                    expectedHash.toLowerCase().getBytes(StandardCharsets.UTF_8))) {
                return true;
            }
        }

        return false;
    }

    private String computeHmacSha256(String data, String key) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            SecretKeySpec secretKey = new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
            mac.init(secretKey);
            byte[] hash = mac.doFinal(data.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            System.err.println("[Webhook] Error computing HMAC-SHA256: " + e.getMessage());
            return null;
        }
    }
}
