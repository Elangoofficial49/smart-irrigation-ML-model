package com.smartirrigation.handlers;

import com.smartirrigation.Database;
import com.smartirrigation.model.IrrigationModel;
import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.sql.*;
import java.util.Map;

public class IrrigationHandler extends BaseHandler {

    private final IrrigationModel model;

    public IrrigationHandler(IrrigationModel model) {
        this.model = model;
    }

    public HttpHandler predict() {
        return this::handlePredict;
    }

    public HttpHandler toggle() {
        return this::handleToggle;
    }

    public HttpHandler history() {
        return this::handleHistory;
    }

    public HttpHandler status() {
        return this::handleStatus;
    }

    /** Runs the ML model against the latest sensor reading and logs+returns the decision. */
    private void handlePredict(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        String user = currentUser(exchange);
        if (user == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }

        try (Connection conn = Database.connect();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT * FROM sensors ORDER BY id DESC LIMIT 1")) {

            if (!rs.next()) {
                sendJson(exchange, 400, Json.obj().put("error", "No sensor data available yet. Simulate a reading first.").build());
                return;
            }

            double soilMoisture = rs.getDouble("soil_moisture");
            double temperature = rs.getDouble("temperature");
            double humidity = rs.getDouble("humidity");
            double rainfallProb = rs.getDouble("rainfall_prob");

            double[] result = model.predict(soilMoisture, temperature, humidity, rainfallProb);
            int predictedClass = (int) result[0];
            double confidence = result[1];
            String status = predictedClass == 1 ? "ON" : "OFF";

            try (PreparedStatement ps = conn.prepareStatement(
                    "INSERT INTO irrigation_logs (status, mode, triggered_by, confidence) VALUES (?, 'auto', ?, ?)")) {
                ps.setString(1, status);
                ps.setString(2, user);
                ps.setDouble(3, confidence);
                ps.executeUpdate();
            }

            String basedOnJson = Json.obj()
                    .put("soil_moisture", soilMoisture)
                    .put("temperature", temperature)
                    .put("humidity", humidity)
                    .put("rainfall_prob", rainfallProb)
                    .build();

            sendJson(exchange, 200, Json.obj()
                    .put("status", status)
                    .put("confidence", Math.round(confidence * 1000.0) / 1000.0)
                    .putRaw("based_on", basedOnJson)
                    .build());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    /** Manual override: operator directly turns irrigation ON/OFF. */
    private void handleToggle(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        String user = currentUser(exchange);
        if (user == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String state = body.getOrDefault("state", "OFF").toUpperCase();
        if (!state.equals("ON") && !state.equals("OFF")) state = "OFF";

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO irrigation_logs (status, mode, triggered_by, confidence) VALUES (?, 'manual', ?, NULL)")) {
            ps.setString(1, state);
            ps.setString(2, user);
            ps.executeUpdate();
            sendJson(exchange, 200, Json.obj().put("status", state).put("mode", "manual").build());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private void handleStatus(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (currentUser(exchange) == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }

        try (Connection conn = Database.connect();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT * FROM irrigation_logs ORDER BY id DESC LIMIT 1")) {

            if (!rs.next()) {
                sendJson(exchange, 200, Json.obj().put("status", "OFF").put("mode", "none").build());
                return;
            }
            sendJson(exchange, 200, logRowToJson(rs));
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

        StringBuilder arr = new StringBuilder("[");
        try (Connection conn = Database.connect();
             Statement st = conn.createStatement();
             ResultSet rs = st.executeQuery("SELECT * FROM irrigation_logs ORDER BY id DESC LIMIT 30")) {
            boolean first = true;
            while (rs.next()) {
                if (!first) arr.append(",");
                arr.append(logRowToJson(rs));
                first = false;
            }
            arr.append("]");
            sendJson(exchange, 200, arr.toString());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private String logRowToJson(ResultSet rs) throws SQLException {
        double confidence = rs.getDouble("confidence");
        boolean hasConfidence = !rs.wasNull();
        Json.Obj obj = Json.obj()
                .put("id", rs.getInt("id"))
                .put("status", rs.getString("status"))
                .put("mode", rs.getString("mode"))
                .put("triggered_by", rs.getString("triggered_by"))
                .put("created_at", rs.getString("created_at"));
        if (hasConfidence) obj.put("confidence", Math.round(confidence * 1000.0) / 1000.0);
        return obj.build();
    }
}
