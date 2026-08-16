package com.smartirrigation.handlers;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

/**
 * Fetches live weather using Open-Meteo (https://open-meteo.com) - it's free
 * and requires no API key, which keeps this project runnable out of the box.
 * A small regex-based extractor is used instead of a full JSON library since
 * we only need a handful of known fields from the response.
 */
public class WeatherHandler extends BaseHandler {

    private final HttpClient client = HttpClient.newHttpClient();

    public HttpHandler get() {
        return this::handleWeather;
    }

    private void handleWeather(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (currentUser(exchange) == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }

        Map<String, String> params = queryParams(exchange);
        String city = params.getOrDefault("city", "Madurai");

        try {
            // 1) Geocode the city name to lat/lon
            String geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name="
                    + URLEncoder.encode(city, StandardCharsets.UTF_8) + "&count=1";
            String geoJson = fetch(geoUrl);

            Double lat = extractDouble(geoJson, "\"latitude\":([\\-0-9.]+)");
            Double lon = extractDouble(geoJson, "\"longitude\":([\\-0-9.]+)");
            String resolvedName = extractString(geoJson, "\"name\":\"([^\"]+)\"");
            String country = extractString(geoJson, "\"country\":\"([^\"]+)\"");

            if (lat == null || lon == null) {
                sendJson(exchange, 404, Json.obj().put("error", "City not found: " + city).build());
                return;
            }

            // 2) Fetch current weather for that location
            String forecastUrl = "https://api.open-meteo.com/v1/forecast?latitude=" + lat
                    + "&longitude=" + lon
                    + "&current=temperature_2m,relative_humidity_2m,precipitation_probability,wind_speed_10m"
                    + "&timezone=auto";
            String forecastJson = fetch(forecastUrl);

            Double temperature = extractDouble(forecastJson, "\"temperature_2m\":([\\-0-9.]+)");
            Double humidity = extractDouble(forecastJson, "\"relative_humidity_2m\":([\\-0-9.]+)");
            Double precipitationProb = extractDouble(forecastJson, "\"precipitation_probability\":([\\-0-9.]+)");
            Double windSpeed = extractDouble(forecastJson, "\"wind_speed_10m\":([\\-0-9.]+)");

            sendJson(exchange, 200, Json.obj()
                    .put("city", resolvedName != null ? resolvedName : city)
                    .put("country", country)
                    .put("temperature_c", temperature)
                    .put("humidity_percent", humidity)
                    .put("rainfall_probability_percent", precipitationProb)
                    .put("wind_speed_kmh", windSpeed)
                    .build());

        } catch (Exception e) {
            sendJson(exchange, 502, Json.obj()
                    .put("error", "Could not reach weather service: " + e.getMessage())
                    .build());
        }
    }

    private String fetch(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        return response.body();
    }

    private Double extractDouble(String json, String regex) {
        Matcher m = Pattern.compile(regex).matcher(json);
        if (m.find()) {
            try {
                return Double.parseDouble(m.group(1));
            } catch (NumberFormatException ignored) {
            }
        }
        return null;
    }

    private String extractString(String json, String regex) {
        Matcher m = Pattern.compile(regex).matcher(json);
        return m.find() ? m.group(1) : null;
    }
}
