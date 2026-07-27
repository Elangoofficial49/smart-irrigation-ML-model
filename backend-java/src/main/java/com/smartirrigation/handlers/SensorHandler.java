package com.smartirrigation.handlers;

import com.smartirrigation.Database;
import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.sql.*;
import java.util.Random;

public class SensorHandler extends BaseHandler {

    private final Random random = new Random();

    public HttpHandler latest() {
        return this::handleLatest;
    }

    public HttpHandler history() {
        return this::handleHistory;
    }

    public HttpHandler simulate() {
        return this::handleSimulate;
    }

    private void handleLatest(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (currentUser(exchange) == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }

        try (Connection conn = Database.connect();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery(
                     "SELECT * FROM sensors ORDER BY id DESC LIMIT 1")) {

            if (!rs.next()) {
                sendJson(exchange, 200, Json.obj().put("message", "No sensor data yet").build());
                return;
            }
            sendJson(exchange, 200, rowToJson(rs));
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private void handleHistory(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (currentUser(exchange) == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }

        int limit = (int) parseDouble(queryParams(exchange).getOrDefault("limit", "20"), 20);

        StringBuilder arr = new StringBuilder("[");
        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT * FROM sensors ORDER BY id DESC LIMIT ?")) {
            ps.setInt(1, limit);
            try (ResultSet rs = ps.executeQuery()) {
                boolean first = true;
                while (rs.next()) {
                    if (!first) arr.append(",");
                    arr.append(rowToJson(rs));
                    first = false;
                }
            }
            arr.append("]");
            sendJson(exchange, 200, arr.toString());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    /** Simulates a new sensor reading from "the field" (stand-in for real hardware) and stores it. */
    private void handleSimulate(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (currentUser(exchange) == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        double soilMoisture = round2(15 + random.nextDouble() * 70);
        double temperature = round2(20 + random.nextDouble() * 20);
        double humidity = round2(25 + random.nextDouble() * 65);
        double rainfallProb = round2(random.nextDouble() * 100);

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO sensors (soil_moisture, temperature, humidity, rainfall_prob) VALUES (?, ?, ?, ?)")) {
            ps.setDouble(1, soilMoisture);
            ps.setDouble(2, temperature);
            ps.setDouble(3, humidity);
            ps.setDouble(4, rainfallProb);
            ps.executeUpdate();

            sendJson(exchange, 201, Json.obj()
                    .put("soil_moisture", soilMoisture)
                    .put("temperature", temperature)
                    .put("humidity", humidity)
                    .put("rainfall_prob", rainfallProb)
                    .build());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }

    private String rowToJson(ResultSet rs) throws SQLException {
        return Json.obj()
                .put("id", rs.getInt("id"))
                .put("soil_moisture", rs.getDouble("soil_moisture"))
                .put("temperature", rs.getDouble("temperature"))
                .put("humidity", rs.getDouble("humidity"))
                .put("rainfall_prob", rs.getDouble("rainfall_prob"))
                .put("recorded_at", rs.getString("recorded_at"))
                .build();
    }
}
