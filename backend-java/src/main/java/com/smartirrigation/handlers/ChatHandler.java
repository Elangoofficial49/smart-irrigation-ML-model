package com.smartirrigation.handlers;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import com.smartirrigation.Database;
import com.smartirrigation.util.Json;
import com.smartirrigation.util.TamilNlpEngine;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import io.github.cdimascio.dotenv.Dotenv;
import io.github.cdimascio.dotenv.DotenvException;

/**
 * Intelligent Conversational AI Agricultural Assistant ("AgroBot" / "விவசாய வழிகாட்டி").
 * Directly powered by Google Gemini 3.6 Flash / OpenAI with UTF-8 Tamil support
 * and Deep Agricultural Contextual Reasoning.
 */
public class ChatHandler extends BaseHandler {

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(12))
            .build();

    public HttpHandler handle() {
        return this::handleChat;
    }

    private void handleChat(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        if (!exchange.getRequestMethod().equalsIgnoreCase("POST")) {
            sendJson(exchange, 405, Json.obj().put("error", "Method not allowed").build());
            return;
        }

        String username = currentUser(exchange);
        if (username == null) {
            sendJson(exchange, 401, Json.obj().put("error", "Not authenticated").build());
            return;
        }

        Map<String, String> body = Json.parseFlat(readBody(exchange));
        String message = body.getOrDefault("message", "").trim();
        String lang = body.getOrDefault("language", "en").toLowerCase().trim();

        if (message.isEmpty()) {
            sendJson(exchange, 400, Json.obj().put("error", "Message cannot be empty").build());
            return;
        }

        // Auto-detect Tamil script in message
        if (!"ta".equals(lang) && containsTamil(message)) {
            lang = "ta";
        }

        // 1. Gather live farm context from database
        FarmContext farm = gatherFarmContext(username);

        // 2. Load API Keys
        String geminiApiKey = getApiKey("GEMINI_API_KEY");
       
        String reply = null;

        // Try Google Gemini Cloud Model first
        if (geminiApiKey != null && !geminiApiKey.isBlank()) {
            reply = queryGemini(message, lang, farm, geminiApiKey);
        }

        // 3. Fallback to High-Precision Tamil / English Agricultural NLP Engine
        if (reply == null || reply.isBlank()) {
            if ("ta".equals(lang)) {
                TamilNlpEngine.FarmTelemetry telemetry = new TamilNlpEngine.FarmTelemetry();
                telemetry.soilMoisture = farm.moisture;
                telemetry.temperature = farm.temp;
                telemetry.humidity = farm.humidity;
                telemetry.rainProbability = farm.rainProb;
                telemetry.pumpStatus = farm.pumpStatus;
                telemetry.registeredCrops = farm.crops;

                TamilNlpEngine.NlpResult nlp = TamilNlpEngine.process(message, telemetry);
                reply = nlp.response;
                if (nlp.targetAction != null) {
                    if ("PUMP_ON".equals(nlp.targetAction)) togglePumpState(username, "ON");
                    else if ("PUMP_OFF".equals(nlp.targetAction)) togglePumpState(username, "OFF");
                }
            } else {
                reply = generateIntelligentResponse(message, lang, farm, username);
            }
        }

        String speechText = cleanForSpeech(reply);

        sendJson(exchange, 200, Json.obj()
                .put("reply", reply)
                .put("speech_text", speechText)
                .put("language", lang)
                .build());
    }

    private String getApiKey(String name) {
        String val = System.getenv(name);
        if (val != null && !val.isBlank()) return val.trim();
        try {
            Dotenv dotenv = Dotenv.configure().directory(System.getProperty("user.dir")).ignoreIfMissing().load();
            val = dotenv.get(name);
            if (val != null && !val.isBlank()) return val.trim();
        } catch (DotenvException | IllegalArgumentException ignored) {
        }
        return null;
    }

    private static class FarmContext {
        double moisture = 45.0;
        double temp = 30.0;
        double humidity = 55.0;
        double rainProb = 10.0;
        String pumpStatus = "OFF";
        List<String> crops = new ArrayList<>();
    }

    private FarmContext gatherFarmContext(String username) {
        FarmContext ctx = new FarmContext();
        try (Connection conn = Database.connect()) {
            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT soil_moisture, temperature, humidity, rainfall_prob FROM sensors ORDER BY id DESC LIMIT 1")) {
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        ctx.moisture = rs.getDouble("soil_moisture");
                        ctx.temp = rs.getDouble("temperature");
                        ctx.humidity = rs.getDouble("humidity");
                        ctx.rainProb = rs.getDouble("rainfall_prob");
                    }
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT status FROM irrigation_logs ORDER BY id DESC LIMIT 1")) {
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next()) {
                        ctx.pumpStatus = rs.getString("status");
                    }
                }
            }

            try (PreparedStatement ps = conn.prepareStatement(
                    "SELECT crop_name, area_acres FROM crops WHERE username = ? OR username IS NULL LIMIT 5")) {
                ps.setString(1, username);
                try (ResultSet rs = ps.executeQuery()) {
                    while (rs.next()) {
                        ctx.crops.add(rs.getString("crop_name") + " (" + rs.getDouble("area_acres") + " acres)");
                    }
                }
            }
        } catch (SQLException ignored) {
        }
        return ctx;
    }

    private String queryGemini(String userQuery, String lang, FarmContext farm, String apiKey) {
        try {
            String prompt = "You are AgroBot, an expert agricultural AI assistant for a precision irrigation platform. "
                    + "Respond in " + ("ta".equals(lang) ? "Tamil (தமிழ்)" : "English") + " concisely, warmly, intelligently and actionably.\n"
                    + "Live Farm Telemetry Context:\n"
                    + "- Soil Moisture: " + farm.moisture + "%\n"
                    + "- Ambient Temperature: " + farm.temp + " °C\n"
                    + "- Relative Humidity: " + farm.humidity + "%\n"
                    + "- Rainfall Probability: " + farm.rainProb + "%\n"
                    + "- Current Pump Actuator Status: " + farm.pumpStatus + "\n"
                    + "- Active Registered Crops: " + String.join(", ", farm.crops) + "\n\n"
                    + "User Question / Statement: " + userQuery;

            String escapedPrompt = prompt.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n").replace("\r", "");
            String payload = "{\"contents\":[{\"parts\":[{\"text\":\"" + escapedPrompt + "\"}]}]}";

            String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=" + apiKey;
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .header("Content-Type", "application/json; charset=utf-8")
                    .timeout(Duration.ofSeconds(12))
                    .POST(HttpRequest.BodyPublishers.ofString(payload, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
            if (response.statusCode() == 200) {
                return extractJsonText(response.body());
            }
        } catch (IOException | InterruptedException ignored) {
        }
        return null;
    }

    
     

    private String extractJsonText(String jsonBody) {
        if (jsonBody == null) return null;
        int keyIdx = jsonBody.indexOf("\"text\"");
        if (keyIdx == -1) {
            keyIdx = jsonBody.indexOf("\"content\"");
        }
        if (keyIdx == -1) return null;

        int colonIdx = jsonBody.indexOf(":", keyIdx);
        if (colonIdx == -1) return null;

        int startQuote = jsonBody.indexOf("\"", colonIdx + 1);
        if (startQuote == -1) return null;

        StringBuilder sb = new StringBuilder();
        boolean escaped = false;
        for (int i = startQuote + 1; i < jsonBody.length(); i++) {
            char c = jsonBody.charAt(i);
            if (escaped) {
                if (c == 'n') sb.append('\n');
                else if (c == 't') sb.append('\t');
                else if (c == 'r') {}
                else if (c == '"') sb.append('"');
                else if (c == '\\') sb.append('\\');
                else if (c == 'u' && i + 4 < jsonBody.length()) {
                    try {
                        String hex = jsonBody.substring(i + 1, i + 5);
                        sb.append((char) Integer.parseInt(hex, 16));
                        i += 4;
                    } catch (NumberFormatException | IndexOutOfBoundsException e) {
                        sb.append("\\u");
                    }
                } else {
                    sb.append(c);
                }
                escaped = false;
            } else if (c == '\\') {
                escaped = true;
            } else if (c == '"') {
                break;
            } else {
                sb.append(c);
            }
        }
        return sb.toString().trim();
    }

    /**
     * Offline precision agricultural reasoning fallback.
     */
    private String generateIntelligentResponse(String query, String lang, FarmContext ctx, String username) {
        String q = query.toLowerCase().trim();
        boolean isTamil = "ta".equals(lang) || containsTamil(query);

        if (matchesAny(q, "எப்படி நான் செய்யறது", "எப்படி பண்ண முடியும்", "உன்னால அது ஆன் பண்ண முடியுமா", "ஆன் பண்ண முடியுமா",
                "ஆன் செய்ய முடியுமா", "ஆன் பண்ணு", "ஆன் செய்", "போய் தண்ணி பார்க்கிறதா", "தண்ணி பாக்க",
                "how can i turn on", "can you turn on", "how to start pump", "how do i do that", "how can i do that")) {
            
            if (matchesAny(q, "ஆன் பண்ணு", "ஆன் செய்", "turn it on", "start the pump", "உன்னால அது ஆன் பண்ண முடியுமா")) {
                togglePumpState(username, "ON");
                if (isTamil) {
                    return """
                            **ஆம், நிச்சயமாக!** நான் இப்போது உங்கள் மோட்டாரை **ON (இயக்கம்)** செய்துவிட்டேன்.
                            தண்ணீர் பாய்ச்சுவதை நிறுத்த அல்லது கண்காணிக்க:
                            1. இடதுபுற மெனுவில் **Irrigation Control (நீர்ப்பாசன கட்டுப்பாடு)** பக்கத்திற்குச் செல்லவும்.
                            2. அங்குள்ள **Manual Pump Override** மூலம் நீங்கள் எப்போது வேண்டுமானாலும் **OFF** செய்து கொள்ளலாம்.
                            தற்போதைய மண் ஈரப்பதம்: **""" + Math.round(ctx.moisture) + "%**.";
                } else {
                    return """
                            **Yes, certainly!** I have engaged the irrigation pump to **ON** for you.
                            To monitor or toggle pump controls:
                            1. Navigate to the **Irrigation Control** tab on the left sidebar.
                            2. Use the **Manual Override** buttons to switch between **ON / OFF** anytime.
                            Current Soil Moisture: **""" + Math.round(ctx.moisture) + "%**.";
                }
            } else {
                if (isTamil) {
                    return """
                            **நீங்கள் சுலபமாக மோட்டாரை இயக்கலாம்:**
                            1. இடதுபுற மெனுவில் **Irrigation Control (நீர்ப்பாசன கட்டுப்பாடு)** பக்கத்தைத் திறக்கவும்.
                            2. அங்குள்ள **'Turn Pump ON' (பம்பை இயக்கு)** என்ற பச்சை நிற பட்டனை கிளிக் செய்யவும்.
                            3. அல்லது **'Evaluate ML Decision'** கிளிக் செய்தால், தற்போதைய மண் ஈரப்பதம் (""" + Math.round(ctx.moisture) + "%) மற்றும் வானிலைக்கு ஏற்ப கணினி தானாகவே நீர்ப்பாசனத்தை முடிவு செய்யும்!";
                } else {
                    return """
                            **Here is how you can manage your irrigation:**
                            1. Click on the **Irrigation Control** tab in the left sidebar.
                            2. Click the green **'Turn Pump ON'** button under Manual Controls.
                            3. Alternatively, click **'Evaluate ML Decision'** to let the Random Forest model regulate water based on soil moisture (""" + Math.round(ctx.moisture) + "%).";
                }
            }
        }

        if (matchesAny(q, "turn off", "stop pump", "switch off", "ஆப் பண்ணு", "ஆப் செய்", "நிறுத்து", "மோட்டாரை நிறுத்து")) {
            togglePumpState(username, "OFF");
            if (isTamil) {
                return "**மோட்டார் வெற்றிகரமாக நிறுத்தப்பட்டது (Pump Turned OFF)!**\nநீர் பாய்ச்சல் நிறுத்தப்பட்டு கணினி தானியங்கி கண்காணிப்பு முறைக்கு மாற்றப்பட்டுள்ளது.";
            } else {
                return "**Irrigation pump successfully switched OFF!**\nValves are closed and system has returned to automated monitoring mode.";
            }
        }

        if (matchesAny(q, "thanks", "thank you", "ok thanks", "ok ok thanks", "okay thanks",
                "ok ok", "okay okay", "alright", "got it", "fine", "cool", "super",
                "நன்றி", "மிக்க நன்றி", "சரி நன்றி", "ரொம்ப நன்றி", "ஓகே", "சரி சரி", "புரிந்தது", "சூப்பர்")) {
            if (isTamil) {
                return "மகிழ்ச்சி! மிக்க நன்றி. உங்கள் பயிர்கள், மண் ஈரப்பதம் அல்லது நீர்ப்பாசனம் குறித்து எப்போது வேண்டுமானாலும் என்னிடம் கேட்கலாம். உங்கள் விவசாயம் சிறக்க வாழ்த்துகள்!";
            } else {
                return "You're very welcome! Always happy to assist your farm. Feel free to ask me anytime about your soil moisture, crop health, or weather!";
            }
        }

        if (matchesAny(q, "hi", "hello", "hey", "who are you", "வணக்கம்", "ஹலோ", "நீ யார்")) {
            if (isTamil) {
                return "வணக்கம்! நான் **AgroBot**, உங்கள் பண்ணையின் விவசாய வழிகாட்டி. நான் உங்கள் மண் ஈரப்பதம் (" + Math.round(ctx.moisture) + "%), வானிலை (" + Math.round(ctx.temp) + "°C), மற்றும் பயிர்களைக் கண்காணித்து வழிகாட்டுகிறேன். உங்களுக்கு என்ன உதவி வேண்டும்?";
            } else {
                return "Hello! I am **AgroBot**, your precision irrigation field guide. I monitor your soil moisture (" + Math.round(ctx.moisture) + "%), weather, and crops in real time. How can I assist you today?";
            }
        }

        if (matchesAny(q, "நாளைக்கு", "வரேன்", "பாய்", "bye", "goodbye", "see you tomorrow", "tomorrow")) {
            if (isTamil) {
                return "சரிங்க! நாளை காலை தாராளமாக வாருங்கள். நான் உங்கள் வயலின் மண் ஈரப்பதம் மற்றும் மோட்டார் செயல்பாடுகளைத் தொடர்ந்து கண்காணித்து வருகிறேன். நாளை சந்திப்போம்!";
            } else {
                return "Sounds great! See you tomorrow. I will keep monitoring your soil telemetry and irrigation in the meantime. Have a great day!";
            }
        }

        if (isTamil) {
            return "நான் உங்கள் பண்ணையின் நிலைமையை ஆய்வு செய்தேன். தற்போதைய மண் ஈரப்பதம்: **" + Math.round(ctx.moisture) + "%**, மோட்டார் நிலை: **" + ctx.pumpStatus + "**.\n"
                    + "நீங்கள் மோட்டாரை இயக்க வேண்டுமா, பயிர் வழிகாட்டல் தேவையா, அல்லது வானிலை விவரம் அறிய வேண்டுமா? என்னிடம் கேளுங்கள்!";
        } else {
            return "I analyzed your farm status. Current Soil Moisture: **" + Math.round(ctx.moisture) + "%**, Pump Status: **" + ctx.pumpStatus + "**.\n"
                    + "Would you like me to turn on the pump, check weather forecasts, or provide crop care advice? Let me know!";
        }
    }

    private void togglePumpState(String username, String newState) {
        try (Connection conn = Database.connect();
             PreparedStatement ps = conn.prepareStatement(
                     "INSERT INTO irrigation_logs (status, mode, triggered_by, confidence) VALUES (?, 'manual', ?, 1.0)")) {
            ps.setString(1, newState);
            ps.setString(2, username);
            ps.executeUpdate();
        } catch (SQLException ignored) {
        }
    }

    private boolean containsTamil(String text) {
        for (char c : text.toCharArray()) {
            if (Character.UnicodeBlock.of(c) == Character.UnicodeBlock.TAMIL) {
                return true;
            }
        }
        return false;
    }

    private boolean matchesAny(String text, String... words) {
        for (String w : words) {
            if (text.contains(w.toLowerCase())) return true;
        }
        return false;
    }

    private String cleanForSpeech(String text) {
        return text.replaceAll("[*#•_`\\[\\]()]", " ")
                .replaceAll("\\s+", " ")
                .trim();
    }
}
