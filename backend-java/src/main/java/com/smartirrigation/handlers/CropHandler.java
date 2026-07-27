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

    /** Handles DELETE on /api/crops/{id} */
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
                     "SELECT * FROM crops WHERE username = ? ORDER BY id DESC")) {
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
        String area = body.getOrDefault("area_acres", "0");
        String plantingDate = body.getOrDefault("planting_date", "");
        String notes = body.getOrDefault("notes", "");

        if (cropName.isEmpty()) {
            sendJson(exchange, 400, Json.obj().put("error", "crop_name is required").build());
            return;
        }

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO crops (username, crop_name, area_acres, planting_date, notes) VALUES (?, ?, ?, ?, ?)")) {
            ps.setString(1, user);
            ps.setString(2, cropName);
            ps.setDouble(3, parseDouble(area, 0));
            ps.setString(4, plantingDate);
            ps.setString(5, notes);
            ps.executeUpdate();
            sendJson(exchange, 201, Json.obj().put("message", "Crop added").build());
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
        if (!exchange.getRequestMethod().equalsIgnoreCase("DELETE")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        String path = exchange.getRequestURI().getPath();
        String idStr = path.substring(path.lastIndexOf('/') + 1);

        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "DELETE FROM crops WHERE id = ? AND username = ?")) {
            ps.setInt(1, Integer.parseInt(idStr));
            ps.setString(2, user);
            int rows = ps.executeUpdate();
            if (rows == 0) {
                sendJson(exchange, 404, Json.obj().put("error", "Crop not found").build());
            } else {
                sendJson(exchange, 200, Json.obj().put("message", "Crop deleted").build());
            }
        } catch (NumberFormatException e) {
            sendJson(exchange, 400, Json.obj().put("error", "Invalid crop id").build());
        } catch (SQLException e) {
            sendJson(exchange, 500, Json.obj().put("error", e.getMessage()).build());
        }
    }

    private String cropRowToJson(ResultSet rs) throws SQLException {
        return Json.obj()
                .put("id", rs.getInt("id"))
                .put("crop_name", rs.getString("crop_name"))
                .put("area_acres", rs.getDouble("area_acres"))
                .put("planting_date", rs.getString("planting_date"))
                .put("notes", rs.getString("notes"))
                .put("created_at", rs.getString("created_at"))
                .build();
    }
}
