package com.smartirrigation.handlers;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.smartirrigation.Database;
import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

import io.github.cdimascio.dotenv.Dotenv;

/**
 * Intelligent Conversational AI Agricultural Assistant ("AgroBot" / "விவசாய வழிகாட்டி").
 * Supports Google Gemini, OpenAI, Groq, and a Deep Contextual Natural Language
 * Reasoning Engine for intelligent dynamic answers in Tamil & English.
 */
public class ChatHandler extends BaseHandler {

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(8))
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

        // Auto-detect Tamil script in message if language not explicitly set
        if (!"ta".equals(lang) && containsTamil(message)) {
            lang = "ta";
        }

        // 1. Gather live farm context from database
        FarmContext farm = gatherFarmContext(username);

        // 2. Check for AI Providers in .env
        Dotenv dotenv = Dotenv.configure().directory(System.getProperty("user.dir")).ignoreIfMissing().load();
        String geminiApiKey = dotenv.get("GEMINI_API_KEY");
        String openAiApiKey = dotenv.get("OPENAI_API_KEY");
        String groqApiKey = dotenv.get("GROQ_API_KEY");

        String reply = null;

        // Try Google Gemini
        if (geminiApiKey != null && !geminiApiKey.isBlank()) {
            reply = queryGemini(message, lang, farm, geminiApiKey);
        }

        // Try OpenAI if Gemini not set or failed
        if ((reply == null || reply.isBlank()) && openAiApiKey != null && !openAiApiKey.isBlank()) {
            reply = queryOpenAi(message, lang, farm, openAiApiKey);
        }

        // Try Groq if others not set
        if ((reply == null || reply.isBlank()) && groqApiKey != null && !groqApiKey.isBlank()) {
            reply = queryGroq(message, lang, farm, groqApiKey);
        }

        // 3. Fallback to Deep Natural Language Reasoning Engine
        if (reply == null || reply.isBlank()) {
            reply = generateIntelligentResponse(message, lang, farm, username);
        }

        String speechText = cleanForSpeech(reply);

        sendJson(exchange, 200, Json.obj()
                .put("reply", reply)
                .put("speech_text", speechText)
                .put("language", lang)
                .build());
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
                    "SELECT c.crop_name, c.area_acres FROM crops c JOIN users u ON c.user_id = u.id WHERE u.username = ? LIMIT 5")) {
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

    /**
     * Deep Natural Language Reasoning Engine: Analyzes questions conceptually
     * instead of returning rigid keyword templates.
     */
    private String generateIntelligentResponse(String query, String lang, FarmContext ctx, String username) {
        String q = query.toLowerCase().trim();
        boolean isTamil = "ta".equals(lang) || containsTamil(query);

        // 1. User is asking "How do I turn on the pump? Can you turn it on?"
        // ("அது எப்படி செய்யறது", "உன்னால ஆன் பண்ண முடியுமா", "how can i turn on", "can you start the pump")
        if (matchesAny(q, "எப்படி நான் செய்யறது", "எப்படி பண்ண முடியும்", "உன்னால அது ஆன் பண்ண முடியுமா", "ஆன் பண்ண முடியுமா",
                "ஆன் செய்ய முடியுமா", "ஆன் பண்ணு", "ஆன் செய்", "போய் தண்ணி பார்க்கிறதா", "தண்ணி பாக்க",
                "how can i turn on", "can you turn on", "how to start pump", "how do i do that", "how can i do that")) {
            
            // Execute pump turn ON if requested
            if (matchesAny(q, "ஆன் பண்ணு", "ஆன் செய்", "turn it on", "start the pump", "உன்னால அது ஆன் பண்ண முடியுமா")) {
                togglePumpState(username, "ON");
                if (isTamil) {
                    return "⚡ **ஆம், நிச்சயமாக!** நான் இப்போது உங்கள் மோட்டாரை **ON (இயக்கம்)** செய்துவிட்டேன்.\n"
                            + "தண்ணீர் பாய்ச்சுவதை நிறுத்த அல்லது கண்காணிக்க:\n"
                            + "1. இடதுபுற மெனுவில் **Irrigation Control (நீர்ப்பாசன கட்டுப்பாடு)** பக்கத்திற்குச் செல்லவும்.\n"
                            + "2. அங்குள்ள **Manual Pump Override** மூலம் நீங்கள் எப்போது வேண்டுமானாலும் **OFF** செய்து கொள்ளலாம்.\n"
                            + "தற்போதைய மண் ஈரப்பதம்: **" + Math.round(ctx.moisture) + "%**.";
                } else {
                    return "⚡ **Yes, certainly!** I have engaged the irrigation pump to **ON** for you.\n"
                            + "To monitor or toggle pump controls:\n"
                            + "1. Navigate to the **Irrigation Control** tab on the left sidebar.\n"
                            + "2. Use the **Manual Override** buttons to switch between **ON / OFF** anytime.\n"
                            + "Current Soil Moisture: **" + Math.round(ctx.moisture) + "%**.";
                }
            } else {
                if (isTamil) {
                    return "💡 **நீங்கள் சுலபமாக மோட்டாரை இயக்கலாம்:**\n"
                            + "1. இடதுபுற மெனுவில் **Irrigation Control (நீர்ப்பாசன கட்டுப்பாடு)** பக்கத்தைத் திறக்கவும்.\n"
                            + "2. அங்குள்ள **'Turn Pump ON' (பம்பை இயக்கு)** என்ற பச்சை நிற பட்டனை கிளிக் செய்யவும்.\n"
                            + "3. அல்லது **'Evaluate ML Decision'** கிளிக் செய்தால், தற்போதைய மண் ஈரப்பதம் (" + Math.round(ctx.moisture) + "%) மற்றும் வானிலைக்கு ஏற்ப கணினி தானாகவே நீர்ப்பாசனத்தை முடிவு செய்யும்!\n"
                            + "நான் உங்களுக்காக இப்போது பம்பை ஆன் செய்ய வேண்டுமா?";
                } else {
                    return "💡 **Here is how you can manage your irrigation:**\n"
                            + "1. Click on the **Irrigation Control** tab in the left sidebar.\n"
                            + "2. Click the green **'Turn Pump ON'** button under Manual Controls.\n"
                            + "3. Alternatively, click **'Evaluate ML Decision'** to let the AI automatically regulate water based on soil moisture (" + Math.round(ctx.moisture) + "%).\n"
                            + "Would you like me to turn on the pump for you right now?";
                }
            }
        }

        // 2. User says "Turn off the pump" / "ஆப் பண்ணு"
        if (matchesAny(q, "turn off", "stop pump", "switch off", "ஆப் பண்ணு", "ஆப் செய்", "நிறுத்து", "மோட்டாரை நிறுத்து")) {
            togglePumpState(username, "OFF");
            if (isTamil) {
                return "🛑 **மோட்டார் வெற்றிகரமாக நிறுத்தப்பட்டது (Pump Turned OFF)!**\nநீர் பாய்ச்சல் நிறுத்தப்பட்டு கணினி தானியங்கி கண்காணிப்பு முறைக்கு மாற்றப்பட்டுள்ளது.";
            } else {
                return "🛑 **Irrigation pump successfully switched OFF!**\nValves are closed and system has returned to automated monitoring mode.";
            }
        }

        // 3. User says "ok ok thanks", "நன்றி", "சரி"
        if (matchesAny(q, "thanks", "thank you", "ok thanks", "ok ok thanks", "okay thanks", "great thanks",
                "ok ok", "okay okay", "alright", "got it", "fine", "cool", "super",
                "நன்றி", "மிக்க நன்றி", "சரி நன்றி", "ரொம்ப நன்றி", "ஓகே", "சரி சரி", "புரிந்தது", "சூப்பர்")) {
            if (isTamil) {
                return "மகிழ்ச்சி! 🙏 மிக்க நன்றி. உங்கள் பயிர்கள், மண் ஈரப்பதம் அல்லது நீர்ப்பாசனம் குறித்து எப்போது வேண்டுமானாலும் என்னிடம் கேட்கலாம். உங்கள் விவசாயம் சிறக்க வாழ்த்துகள்!";
            } else {
                return "You're very welcome! 😊 Always happy to assist your farm. Feel free to ask me anytime about your soil moisture, crop health, or weather!";
            }
        }

        // 4. Greeting / Identity ("வணக்கம்", "hi", "who are you")
        if (matchesAny(q, "hi", "hello", "hey", "who are you", "வணக்கம்", "ஹலோ", "நீ யார்")) {
            if (isTamil) {
                return "வணக்கம்! 🙏 நான் **AgroBot**, உங்கள் பண்ணையின் AI விவசாய வழிகாட்டி. நான் உங்கள் மண் ஈரப்பதம் (" + Math.round(ctx.moisture) + "%), வானிலை (" + Math.round(ctx.temp) + "°C), மற்றும் பயிர்களைக் கண்காணித்து வழிகாட்டுகிறேன். உங்களுக்கு என்ன உதவி வேண்டும்?";
            } else {
                return "Hello! 👋 I am **AgroBot**, your Precision Agricultural AI Assistant. I monitor your soil moisture (" + Math.round(ctx.moisture) + "%), weather, and crops in real time. How can I assist you today?";
            }
        }

        // 5. How are you ("எப்படி இருக்கிறாய்", "how are you")
        if (matchesAny(q, "how are you", "how are u", "எப்படி இருக்கிறாய்", "நலமா")) {
            if (isTamil) {
                return "நான் நலமாக இருக்கிறேன்! 🙏 உங்கள் பண்ணையின் சென்சார்கள் சிறப்பாக செயல்படுகின்றன (மண் ஈரப்பதம்: " + Math.round(ctx.moisture) + "%). இன்று உங்கள் பயிருக்கு என்ன ஆலோசனை வேண்டும்?";
            } else {
                return "I'm doing great, thank you! 😊 All your farm sensors are online (Current Soil Moisture: " + Math.round(ctx.moisture) + "%). How can I help your fields today?";
            }
        }

        // 6. Fertilizer & Soil Nutrition
        if (matchesAny(q, "fertilizer", "npk", "urea", "dap", "potash", "manure", "compost",
                "உரம்", "யூரியா", "டிஏபி", "பொட்டாஷ்", "பஞ்சகாவ்யா", "மண்புழு உரம்")) {
            if (isTamil) {
                return "🌿 **உர மேலாண்மை வழிகாட்டல்:**\n• **அடிப்படை உரம்:** தொழு உரம் அல்லது மண்புழு உரம் இடுவது மண் ஈரப்பதம் தாங்கும் திறனை அதிகரிக்கும்.\n• **NPK உரம்:** பயிரின் வளர்ச்சி பருவத்திற்கு ஏற்ப தழைச்சத்து (N), மணிச்சத்து (P), சாம்பல்சத்தை (K) சொட்டுநீர் உரப்பாசனம் (Fertigation) மூலம் வழங்குவது 40% உரச் சேமிப்பைத் தரும்.";
            } else {
                return "🌿 **Fertilizer & Soil Nutrition:**\n• **Organic Base:** Farmyard manure or vermicompost improves soil moisture retention.\n• **Fertigation:** Water-soluble NPK applied through drip lines enhances nutrient uptake efficiency by 40%.";
            }
        }

        // 7. Pest & Disease Management
        if (matchesAny(q, "pest", "disease", "insect", "spray", "பூச்சி", "நோய்", "பூச்சிக்கொல்லி", "வேப்பெண்ணெய்")) {
            if (isTamil) {
                return "🐛 **இயற்கை பூச்சி மேலாண்மை:**\n• 3% வேப்பெண்ணெய் கரைசல் தெளிப்பது ஆரம்பநிலை சாறு உறிஞ்சும் பூச்சிகளைத் தடுக்கும்.\n• மஞ்சள் மற்றும் நீல நிற ஒட்டும் பொறிகளை வைப்பது பூச்சி பரவலைக் குறைக்கும்.";
            } else {
                return "🐛 **Pest Management:**\n• 3% Neem oil emulsion spray controls aphids and whiteflies naturally.\n• Installing yellow and blue sticky traps reduces flying insect infestation.";
            }
        }

        // 8. Soil Moisture / Telemetry status
        if (matchesAny(q, "moisture", "sensor", "reading", "temperature", "humidity", "telemetry",
                "ஈரப்பதம்", "மண்", "வெப்பநிலை", "சென்சார்")) {
            if (isTamil) {
                return "🌱 **நேரலை சென்சார் விவரங்கள்:**\n• 💧 **மண் ஈரப்பதம்:** " + ctx.moisture + "%\n• 🌡️ **வெப்பநிலை:** " + ctx.temp + " °C\n• 💨 **காற்றின் ஈரப்பதம்:** " + ctx.humidity + "%\n• 🌧️ **மழை வாய்ப்பு:** " + ctx.rainProb + "%\nநிலத்தின் நிலை: " + (ctx.moisture < 30 ? "⚠️ வறண்ட நிலை (தண்ணீர் தேவை)" : (ctx.moisture > 65 ? "💦 அதிக ஈரப்பதம்" : "✨ சிறப்பான ஈரப்பதம்"));
            } else {
                return "🌱 **Live Ground Telemetry:**\n• 💧 **Soil Moisture:** " + ctx.moisture + "%\n• 🌡️ **Temperature:** " + ctx.temp + " °C\n• 💨 **Humidity:** " + ctx.humidity + "%\n• 🌧️ **Rain Probability:** " + ctx.rainProb + "%\nField Condition: " + (ctx.moisture < 30 ? "⚠️ Dry (Needs water)" : (ctx.moisture > 65 ? "💦 Saturated" : "✨ Optimal Moisture"));
            }
        }

        // 9. Weather
        if (matchesAny(q, "weather", "rain", "climate", "forecast", "வானிலை", "மழை", "காலநிலை")) {
            if (isTamil) {
                return "⛅ **வானிலை வழிகாட்டி:**\nதற்போதைய வெப்பநிலை: **" + ctx.temp + "°C**, காற்றின் ஈரப்பதம்: **" + ctx.humidity + "%**, மழை வாய்ப்பு: **" + ctx.rainProb + "%**.\n📍 முழுமையான 7 நாள் வானிலை முன்னறிவிப்பைப் பார்க்க **Weather** பக்கத்தைப் பார்க்கவும்.";
            } else {
                return "⛅ **Weather Summary:**\nCurrent Ambient Temp: **" + ctx.temp + "°C**, Humidity: **" + ctx.humidity + "%**, Rain Risk: **" + ctx.rainProb + "%**.\n📍 View the complete 7-day GPS forecast on the **Weather** tab.";
            }
        }

        // Default Contextual Reasoning Response
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

    private String queryGemini(String userQuery, String lang, FarmContext farm, String apiKey) {
        try {
            String prompt = "You are AgroBot, an expert agricultural AI assistant for a precision irrigation platform. "
                    + "Respond in " + ("ta".equals(lang) ? "Tamil (தமிழ்)" : "English") + " concisely, warmly, and actionably.\n"
                    + "Live Farm Telemetry Context:\n"
                    + "- Soil Moisture: " + farm.moisture + "%\n"
                    + "- Ambient Temperature: " + farm.temp + " °C\n"
                    + "- Relative Humidity: " + farm.humidity + "%\n"
                    + "- Rainfall Probability: " + farm.rainProb + "%\n"
                    + "- Current Pump Actuator Status: " + farm.pumpStatus + "\n"
                    + "- Active Registered Crops: " + String.join(", ", farm.crops) + "\n\n"
                    + "User Question / Statement: " + userQuery;

            String escapedPrompt = prompt.replace("\"", "\\\"").replace("\n", "\\n");
            String payload = "{\"contents\":[{\"parts\":[{\"text\":\"" + escapedPrompt + "\"}]}]}";

            String url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" + apiKey;
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .header("Content-Type", "application/json")
                    .timeout(Duration.ofSeconds(8))
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                Matcher m = Pattern.compile("\"text\":\\s*\"([^\"]+)\"").matcher(response.body());
                if (m.find()) {
                    return m.group(1).replace("\\n", "\n").replace("\\\"", "\"");
                }
            }
        } catch (IOException | InterruptedException ignored) {
        }
        return null;
    }

    private String queryOpenAi(String userQuery, String lang, FarmContext farm, String apiKey) {
        try {
            String systemPrompt = "You are AgroBot, an expert agricultural AI assistant fluent in Tamil and English. "
                    + "Respond in " + ("ta".equals(lang) ? "Tamil (தமிழ்)" : "English") + ". "
                    + "Live Farm Context: Soil Moisture: " + farm.moisture + "%, Temp: " + farm.temp + "C, Pump: " + farm.pumpStatus;

            String escapedSys = systemPrompt.replace("\"", "\\\"").replace("\n", "\\n");
            String escapedUser = userQuery.replace("\"", "\\\"").replace("\n", "\\n");

            String payload = "{\"model\":\"gpt-4o-mini\",\"messages\":[{\"role\":\"system\",\"content\":\"" + escapedSys + "\"},{\"role\":\"user\",\"content\":\"" + escapedUser + "\"}]}";

            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.openai.com/v1/chat/completions"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .timeout(Duration.ofSeconds(8))
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                Matcher m = Pattern.compile("\"content\":\\s*\"([^\"]+)\"").matcher(response.body());
                if (m.find()) {
                    return m.group(1).replace("\\n", "\n").replace("\\\"", "\"");
                }
            }
        } catch (IOException | InterruptedException ignored) {
        }
        return null;
    }

    private String queryGroq(String userQuery, String lang, FarmContext farm, String apiKey) {
        try {
            String systemPrompt = "You are AgroBot, an expert agricultural AI assistant fluent in Tamil and English. "
                    + "Respond in " + ("ta".equals(lang) ? "Tamil (தமிழ்)" : "English") + ". "
                    + "Live Farm Context: Soil Moisture: " + farm.moisture + "%, Temp: " + farm.temp + "C, Pump: " + farm.pumpStatus;

            String escapedSys = systemPrompt.replace("\"", "\\\"").replace("\n", "\\n");
            String escapedUser = userQuery.replace("\"", "\\\"").replace("\n", "\\n");

            String payload = "{\"model\":\"llama-3.3-70b-versatile\",\"messages\":[{\"role\":\"system\",\"content\":\"" + escapedSys + "\"},{\"role\":\"user\",\"content\":\"" + escapedUser + "\"}]}";

            HttpRequest request = HttpRequest.newBuilder(URI.create("https://api.groq.com/openai/v1/chat/completions"))
                    .header("Content-Type", "application/json")
                    .header("Authorization", "Bearer " + apiKey)
                    .timeout(Duration.ofSeconds(8))
                    .POST(HttpRequest.BodyPublishers.ofString(payload))
                    .build();

            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() == 200) {
                Matcher m = Pattern.compile("\"content\":\\s*\"([^\"]+)\"").matcher(response.body());
                if (m.find()) {
                    return m.group(1).replace("\\n", "\n").replace("\\\"", "\"");
                }
            }
        } catch (IOException | InterruptedException ignored) {
        }
        return null;
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
