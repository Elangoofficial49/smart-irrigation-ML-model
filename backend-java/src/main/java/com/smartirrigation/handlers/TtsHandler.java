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

import com.smartirrigation.util.Json;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

/**
 * Server-side High-Clarity Audio TTS Proxy for Tamil & English.
 * Streams crystal-clear native speech without CORS or browser speech pack limitations.
 */
public class TtsHandler extends BaseHandler {

    private final HttpClient client = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(6))
            .build();

    public HttpHandler get() {
        return this::handleTts;
    }

    private void handleTts(HttpExchange exchange) throws IOException {
        if (handlePreflight(exchange)) return;
        Map<String, String> params = queryParams(exchange);
        String text = params.getOrDefault("text", "வணக்கம்").trim();
        String lang = params.getOrDefault("lang", "ta").trim();

        if (text.length() > 200) {
            text = text.substring(0, 200);
        }

        try {
            String url = "https://translate.google.com/translate_tts?ie=UTF-8&tl="
                    + URLEncoder.encode(lang, StandardCharsets.UTF_8)
                    + "&client=tw-ob&q="
                    + URLEncoder.encode(text, StandardCharsets.UTF_8);

            HttpRequest req = HttpRequest.newBuilder(URI.create(url))
                    .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0")
                    .header("Accept", "audio/mpeg, audio/*; q=0.9")
                    .GET()
                    .build();

            HttpResponse<byte[]> res = client.send(req, HttpResponse.BodyHandlers.ofByteArray());
            if (res.statusCode() == 200 && res.body() != null && res.body().length > 0) {
                exchange.getResponseHeaders().set("Content-Type", "audio/mpeg");
                exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
                exchange.getResponseHeaders().set("Cache-Control", "public, max-age=86400");
                exchange.sendResponseHeaders(200, res.body().length);
                exchange.getResponseBody().write(res.body());
                exchange.getResponseBody().close();
                return;
            }
        } catch (Exception ignored) {
        }
        sendJson(exchange, 500, Json.obj().put("error", "TTS audio stream unavailable").build());
    }
}
