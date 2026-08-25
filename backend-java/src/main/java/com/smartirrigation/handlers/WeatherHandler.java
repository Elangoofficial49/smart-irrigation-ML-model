package com.smartirrigation.handlers;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

/**
 * High-precision Meteorological Engine supporting Live GPS Coordinates (lat/lon)
 * and city queries. Integrates Open-Meteo with reverse geocoding, UV index,
 * apparent temperature, wind direction, 7-day daily forecasts, and bilingual
 * agricultural advisories in English & Tamil.
 */
public class WeatherHandler extends BaseHandler {

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(6))
            .build();

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
        String latParam = params.get("lat");
        String lonParam = params.get("lon");
        String cityParam = params.getOrDefault("city", "Madurai").trim();

        Double lat = null;
        Double lon = null;
        String resolvedCity = null;
        String country = null;

        try {
            // Case 1: GPS coordinates provided directly
            if (latParam != null && !latParam.isBlank() && lonParam != null && !lonParam.isBlank()) {
                lat = parseDouble(latParam, 0.0);
                lon = parseDouble(lonParam, 0.0);

                // Reverse geocode to resolve locality/village name
                try {
                    String revGeoUrl = "https://api.bigdatacloud.net/data/reverse-geocode-client?latitude="
                            + lat + "&longitude=" + lon + "&localityLanguage=en";
                    String revGeoJson = fetch(revGeoUrl);
                    String locality = extractString(revGeoJson, "\"locality\":\"([^\"]+)\"");
                    String city = extractString(revGeoJson, "\"city\":\"([^\"]+)\"");
                    String principalSubdiv = extractString(revGeoJson, "\"principalSubdivision\":\"([^\"]+)\"");
                    String countryName = extractString(revGeoJson, "\"countryName\":\"([^\"]+)\"");

                    if (locality != null && !locality.isBlank()) {
                        resolvedCity = locality;
                    } else if (city != null && !city.isBlank()) {
                        resolvedCity = city;
                    } else if (principalSubdiv != null && !principalSubdiv.isBlank()) {
                        resolvedCity = principalSubdiv;
                    } else {
                        resolvedCity = "GPS Farm Location (" + round2(lat) + ", " + round2(lon) + ")";
                    }

                    if (principalSubdiv != null && !principalSubdiv.equals(resolvedCity)) {
                        country = principalSubdiv + (countryName != null ? ", " + countryName : "");
                    } else {
                        country = countryName != null ? countryName : "India";
                    }
                } catch (Exception ignored) {
                    resolvedCity = "Live GPS Location";
                    country = "Coordinates: " + round2(lat) + ", " + round2(lon);
                }
            } else {
                // Case 2: Geocode city name
                String geoUrl = "https://geocoding-api.open-meteo.com/v1/search?name="
                        + URLEncoder.encode(cityParam, StandardCharsets.UTF_8) + "&count=1";
                String geoJson = fetch(geoUrl);

                lat = extractDouble(geoJson, "\"latitude\":([\\-0-9.]+)");
                lon = extractDouble(geoJson, "\"longitude\":([\\-0-9.]+)");
                resolvedCity = extractString(geoJson, "\"name\":\"([^\"]+)\"");
                country = extractString(geoJson, "\"country\":\"([^\"]+)\"");

                if (lat == null || lon == null) {
                    sendJson(exchange, 404, Json.obj().put("error", "Location not found: " + cityParam).build());
                    return;
                }
            }

            // Fetch comprehensive meteorological forecast for lat/lon
            String forecastUrl = "https://api.open-meteo.com/v1/forecast?latitude=" + lat
                    + "&longitude=" + lon
                    + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,precipitation_probability,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,cloud_cover,uv_index"
                    + "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max"
                    + "&timezone=auto&forecast_days=7";

            String forecastJson = fetch(forecastUrl);

            Double temp = extractDouble(forecastJson, "\"temperature_2m\":([\\-0-9.]+)");
            Double apparentTemp = extractDouble(forecastJson, "\"apparent_temperature\":([\\-0-9.]+)");
            Double humidity = extractDouble(forecastJson, "\"relative_humidity_2m\":([\\-0-9.]+)");
            Double rainProb = extractDouble(forecastJson, "\"precipitation_probability\":([\\-0-9.]+)");
            Double precipMm = extractDouble(forecastJson, "\"precipitation\":([\\-0-9.]+)");
            Double windSpeed = extractDouble(forecastJson, "\"wind_speed_10m\":([\\-0-9.]+)");
            Double windDir = extractDouble(forecastJson, "\"wind_direction_10m\":([\\-0-9.]+)");
            Double pressure = extractDouble(forecastJson, "\"surface_pressure\":([\\-0-9.]+)");
            Double cloudCover = extractDouble(forecastJson, "\"cloud_cover\":([\\-0-9.]+)");
            Double uvIndex = extractDouble(forecastJson, "\"uv_index\":([\\-0-9.]+)");
            Double weatherCodeDbl = extractDouble(forecastJson, "\"weather_code\":([\\-0-9.]+)");
            int weatherCode = weatherCodeDbl != null ? weatherCodeDbl.intValue() : 0;

            String conditionEn = getWeatherDescription(weatherCode, false);
            String conditionTa = getWeatherDescription(weatherCode, true);
            String windCardinal = getWindCardinal(windDir != null ? windDir : 0.0);
            String uvLevel = getUvLevel(uvIndex != null ? uvIndex : 0.0);

            // Compute Agricultural Advisory in English and Tamil
            double curRain = rainProb != null ? rainProb : 0.0;
            double curTemp = temp != null ? temp : 28.0;

            String advisoryEn;
            String advisoryTa;

            if (curRain >= 60 || weatherCode >= 61 && weatherCode <= 99) {
                advisoryEn = "High probability of rainfall (" + Math.round(curRain) + "%). Postpone automated irrigation cycles to prevent soil waterlogging and nutrient leaching.";
                advisoryTa = "அதிக மழை பெய்ய வாய்ப்புள்ளது (" + Math.round(curRain) + "%). பயிர்களில் நீர் தேங்குவதைத் தவிர்க்க தானியங்கி நீர்ப்பாசனத்தை நிறுத்தி வைக்கவும்.";
            } else if (curTemp >= 35) {
                advisoryEn = "High ambient heat (" + curTemp + "°C) with elevated evapotranspiration rate. Maintain soil moisture levels with morning or evening drip irrigation.";
                advisoryTa = "அதிக வெப்பநிலை (" + curTemp + "°C) மற்றும் நீர் ஆவியாதல் அதிகமாக உள்ளது. காலை அல்லது மாலை வேளையில் சொட்டு நீர்ப்பாசனம் செய்யவும்.";
            } else if (curRain <= 20 && curTemp >= 28) {
                advisoryEn = "Dry weather conditions. Recommended to run ML decision or provide standard irrigation according to crop stage.";
                advisoryTa = "வறண்ட வானிலை நிலவுகிறது. பயிரின் வளர்ச்சி நிலைக்கு ஏற்ப ML பரிந்துரைப்படி தண்ணீர் பாய்ச்சவும்.";
            } else {
                advisoryEn = "Favorable agricultural conditions. Automated precision irrigation is active.";
                advisoryTa = "விவசாயத்திற்கு உகந்த மிதமான வானிலை. தானியங்கி துல்லிய நீர்ப்பாசனம் செயல்படுத்தப்படுகிறது.";
            }

            // Extract 7-day daily forecast summary
            String dailyJson = extractDailyForecast(forecastJson);

            Json.Obj res = Json.obj()
                    .put("city", resolvedCity != null ? resolvedCity : cityParam)
                    .put("country", country != null ? country : "")
                    .put("latitude", lat)
                    .put("longitude", lon)
                    .put("temperature_c", temp)
                    .put("apparent_temperature_c", apparentTemp != null ? apparentTemp : temp)
                    .put("humidity_percent", humidity)
                    .put("rainfall_probability_percent", rainProb)
                    .put("precipitation_mm", precipMm != null ? precipMm : 0.0)
                    .put("wind_speed_kmh", windSpeed)
                    .put("wind_direction_deg", windDir != null ? windDir : 0.0)
                    .put("wind_direction_cardinal", windCardinal)
                    .put("uv_index", uvIndex != null ? uvIndex : 0.0)
                    .put("uv_level", uvLevel)
                    .put("pressure_hpa", pressure != null ? pressure : 1013.0)
                    .put("cloud_cover_percent", cloudCover != null ? cloudCover : 0.0)
                    .put("weather_code", weatherCode)
                    .put("weather_description", conditionEn)
                    .put("weather_description_ta", conditionTa)
                    .put("advisory_en", advisoryEn)
                    .put("advisory_ta", advisoryTa);

            if (dailyJson != null) {
                res.putRaw("daily_forecast", dailyJson);
            }

            sendJson(exchange, 200, res.build());

        } catch (Exception e) {
            sendJson(exchange, 502, Json.obj()
                    .put("error", "Could not fetch meteorological data: " + e.getMessage())
                    .build());
        }
    }

    private String fetch(String url) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .header("Accept", "application/json")
                .timeout(Duration.ofSeconds(6))
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

    private String getWindCardinal(double deg) {
        String[] directions = {"N", "NE", "E", "SE", "S", "SW", "W", "NW", "N"};
        return directions[(int) Math.round(((deg % 360) / 45))];
    }

    private String getUvLevel(double uv) {
        if (uv <= 2) return "Low";
        if (uv <= 5) return "Moderate";
        if (uv <= 7) return "High";
        if (uv <= 10) return "Very High";
        return "Extreme";
    }

    private String getWeatherDescription(int code, boolean tamil) {
        switch (code) {
            case 0:
                return tamil ? "தெளிவான வானம் / வெயில்" : "Clear Sky ☀️";
            case 1:
                return tamil ? "பெரும்பாலும் தெளிவான வானம்" : "Mainly Clear 🌤️";
            case 2:
                return tamil ? "பகுதி மேகமூட்டம்" : "Partly Cloudy ⛅";
            case 3:
                return tamil ? "முழு மேகமூட்டம்" : "Overcast ☁️";
            case 45:
            case 48:
                return tamil ? "பனிமூட்டம்" : "Foggy 🌫️";
            case 51:
            case 53:
            case 55:
                return tamil ? "லேசான தூறல்" : "Drizzle 🌦️";
            case 61:
            case 63:
            case 65:
                return tamil ? "மிதமான மழை" : "Rain 🌧️";
            case 71:
            case 73:
            case 75:
                return tamil ? "பனிப்பொழிவு" : "Snow Fall ❄️";
            case 80:
            case 81:
            case 82:
                return tamil ? "கனமழை தூறல்" : "Rain Showers 🌧️";
            case 95:
            case 96:
            case 99:
                return tamil ? "இடி மின்னலுடன் மழை" : "Thunderstorm ⛈️";
            default:
                return tamil ? "இயல்பான வானிலை" : "Fair Weather 🌤️";
        }
    }

    private String extractDailyForecast(String json) {
        try {
            Matcher timeMatcher = Pattern.compile("\"time\":\\[([^\\]]+)\\]").matcher(json);
            Matcher maxMatcher = Pattern.compile("\"temperature_2m_max\":\\[([^\\]]+)\\]").matcher(json);
            Matcher minMatcher = Pattern.compile("\"temperature_2m_min\":\\[([^\\]]+)\\]").matcher(json);
            Matcher rainMatcher = Pattern.compile("\"precipitation_probability_max\":\\[([^\\]]+)\\]").matcher(json);
            Matcher codeMatcher = Pattern.compile("\"weather_code\":\\[([^\\]]+)\\]").matcher(json);

            if (timeMatcher.find() && maxMatcher.find() && minMatcher.find() && rainMatcher.find() && codeMatcher.find()) {
                String[] times = timeMatcher.group(1).replace("\"", "").split(",");
                String[] maxs = maxMatcher.group(1).split(",");
                String[] mins = minMatcher.group(1).split(",");
                String[] rains = rainMatcher.group(1).split(",");
                String[] codes = codeMatcher.group(1).split(",");

                int len = Math.min(times.length, Math.min(maxs.length, 7));
                StringBuilder arr = new StringBuilder("[");
                for (int i = 0; i < len; i++) {
                    if (i > 0) arr.append(",");
                    int code = (int) parseDouble(codes[i].trim(), 0.0);
                    arr.append(Json.obj()
                            .put("date", times[i].trim())
                            .put("temp_max", parseDouble(maxs[i].trim(), 0.0))
                            .put("temp_min", parseDouble(mins[i].trim(), 0.0))
                            .put("rain_prob", parseDouble(rains[i].trim(), 0.0))
                            .put("weather_code", code)
                            .put("description", getWeatherDescription(code, false))
                            .put("description_ta", getWeatherDescription(code, true))
                            .build());
                }
                arr.append("]");
                return arr.toString();
            }
        } catch (Exception ignored) {
        }
        return "[]";
    }

    private double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
