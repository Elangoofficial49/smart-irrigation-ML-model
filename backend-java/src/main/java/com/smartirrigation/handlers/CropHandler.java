package com.smartirrigation.handlers;

import com.smartirrigation.Database;
import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import java.io.IOException;
import java.sql.*;
import java.util.Map;

public class CropHandler extends BaseHandler {

    /** Handles GET (list) and POST (create) on /api/crops */
    public HttpHandler collection() {
        return this::handleCollection;
    }

    /** Handles PUT (update) and DELETE on /api/crops/{id} */
    public HttpHandler item() {
        return this::handleItem;
    }

    private void handleCollection(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        String user = currentUser(exchange);
        if (user == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }

        String method = exchange.getRequestMethod();
        if (method.equalsIgnoreCase("GET")) {
            listCrops(exchange, user);
        } else if (method.equalsIgnoreCase("POST")) {
            createCrop(exchange, user);
        } else {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
        }
    }

    private void listCrops(HttpExchange exchange, String user) throws IOException {
        StringBuilder arr = new StringBuilder("[");
        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "SELECT * FROM crops WHERE username = ? OR username IS NULL ORDER BY id DESC")) {
            ps.setString(1, user);
            try (ResultSet rs = ps.executeQuery()) {
                boolean first = true;
                while (rs.next()) {
                    if (!first) arr.append(",");
                    arr.append(cropRowToJson(rs));
                    first = false;
                }
            }
            arr.append("]");
            sendJson(exchange, 200, arr.toString());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private void createCrop(HttpExchange exchange, String user) throws IOException {
        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String cropName = body.getOrDefault("crop_name", "").trim();
        String variety = body.getOrDefault("variety", "").trim();
        String fieldPlot = body.getOrDefault("field_plot", "").trim();
        String area = body.getOrDefault("area_acres", "0");
        String plantingDate = body.getOrDefault("planting_date", "").trim();
        String growthStage = body.getOrDefault("growth_stage", "").trim();
        String irrigationStatus = body.getOrDefault("irrigation_status", "").trim();
        String notes = body.getOrDefault("notes", "").trim();

        if (cropName.isEmpty()) {
            sendJson(exchange, 400, Json.obj().put("error", "Crop name is required").build());
            return;
        }
        double areaVal = parseDouble(area, 0);
        if (areaVal <= 0) {
            sendJson(exchange, 400, Json.obj().put("error", "Planted area must be greater than 0 acres").build());
            return;
        }
        if (fieldPlot.isEmpty()) fieldPlot = "Plot A-1";
        if (variety.isEmpty()) variety = "Standard";
        if (growthStage.isEmpty()) growthStage = "Vegetative";
        if (irrigationStatus.isEmpty()) irrigationStatus = "Optimal";

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO crops (username, crop_name, variety, field_plot, area_acres, planting_date, growth_stage, irrigation_status, notes) "
                             + "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, user);
            ps.setString(2, cropName);
            ps.setString(3, variety);
            ps.setString(4, fieldPlot);
            ps.setDouble(5, areaVal);
            ps.setString(6, plantingDate);
            ps.setString(7, growthStage);
            ps.setString(8, irrigationStatus);
            ps.setString(9, notes);
            ps.executeUpdate();

            int newId = 0;
            try (ResultSet keys = ps.getGeneratedKeys()) {
                if (keys.next()) newId = keys.getInt(1);
            }
            sendJson(exchange, 201, Json.obj()
                    .put("id", newId)
                    .put("message", "Crop registered")
                    .build());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private void handleItem(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        String user = currentUser(exchange);
        if (user == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }

        String path = exchange.getRequestURI().getPath();
        String idStr = path.substring(path.lastIndexOf('/') + 1);
        int id;
        try {
            id = Integer.parseInt(idStr);
        } catch (NumberFormatException e) {
            sendJson(exchange, 400, Json.obj().put("error", "Invalid crop id").build());
            return;
        }

        String method = exchange.getRequestMethod();
        if (method.equalsIgnoreCase("PUT")) {
            updateCrop(exchange, user, id);
        } else if (method.equalsIgnoreCase("DELETE")) {
            deleteCrop(exchange, user, id);
        } else {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
        }
    }

    private void updateCrop(HttpExchange exchange, String user, int id) throws IOException {
        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String cropName = body.getOrDefault("crop_name", "").trim();
        String variety = body.getOrDefault("variety", "").trim();
        String fieldPlot = body.getOrDefault("field_plot", "").trim();
        String area = body.getOrDefault("area_acres", "0");
        String plantingDate = body.getOrDefault("planting_date", "").trim();
        String growthStage = body.getOrDefault("growth_stage", "").trim();
        String irrigationStatus = body.getOrDefault("irrigation_status", "").trim();
        String notes = body.getOrDefault("notes", "").trim();

        if (cropName.isEmpty()) {
            sendJson(exchange, 400, Json.obj().put("error", "Crop name is required").build());
            return;
        }
        double areaVal = parseDouble(area, 0);
        if (areaVal <= 0) {
            sendJson(exchange, 400, Json.obj().put("error", "Planted area must be greater than 0 acres").build());
            return;
        }
        if (fieldPlot.isEmpty()) fieldPlot = "Plot A-1";
        if (variety.isEmpty()) variety = "Standard";
        if (growthStage.isEmpty()) growthStage = "Vegetative";
        if (irrigationStatus.isEmpty()) irrigationStatus = "Optimal";

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "UPDATE crops SET crop_name = ?, variety = ?, field_plot = ?, area_acres = ?, "
                             + "planting_date = ?, growth_stage = ?, irrigation_status = ?, notes = ? "
                             + "WHERE id = ? AND (username = ? OR username IS NULL)")) {
            ps.setString(1, cropName);
            ps.setString(2, variety);
            ps.setString(3, fieldPlot);
            ps.setDouble(4, areaVal);
            ps.setString(5, plantingDate);
            ps.setString(6, growthStage);
            ps.setString(7, irrigationStatus);
            ps.setString(8, notes);
            ps.setInt(9, id);
            ps.setString(10, user);

            int rows = ps.executeUpdate();
            if (rows == 0) {
                sendJson(exchange, 404, Json.obj().put("error", "Crop record not found").build());
            } else {
                sendJson(exchange, 200, Json.obj().put("message", "Crop updated").build());
            }
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private void deleteCrop(HttpExchange exchange, String user, int id) throws IOException {
        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "DELETE FROM crops WHERE id = ? AND (username = ? OR username IS NULL)")) {
            ps.setInt(1, id);
            ps.setString(2, user);
            int rows = ps.executeUpdate();
            if (rows == 0) {
                sendJson(exchange, 404, Json.obj().put("error", "Crop not found").build());
            } else {
                sendJson(exchange, 200, Json.obj().put("message", "Crop deleted").build());
            }
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private String cropRowToJson(ResultSet rs) throws SQLException {
        return Json.obj()
                .put("id", rs.getInt("id"))
                .put("crop_name", rs.getString("crop_name"))
                .put("variety", safeStr(rs, "variety", "Standard"))
                .put("field_plot", safeStr(rs, "field_plot", "Plot A-1"))
                .put("area_acres", rs.getDouble("area_acres"))
                .put("planting_date", rs.getString("planting_date"))
                .put("growth_stage", safeStr(rs, "growth_stage", "Vegetative"))
                .put("irrigation_status", safeStr(rs, "irrigation_status", "Optimal"))
                .put("notes", rs.getString("notes"))
                .put("created_at", rs.getString("created_at"))
                .build();
    }

    private String safeStr(ResultSet rs, String col, String fallback) {
        try {
            String v = rs.getString(col);
            return (v == null || v.isBlank()) ? fallback : v;
        } catch (SQLException e) {
            return fallback;
        }
    }
}
