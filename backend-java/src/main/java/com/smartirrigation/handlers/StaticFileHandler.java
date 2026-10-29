package com.smartirrigation.handlers;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

/**
 * Serves the static frontend (HTML/CSS/JS/PWA assets) from the public/ folder.
 * Includes PWA Service Worker caching headers and correct MIME types.
 */
public class StaticFileHandler implements HttpHandler {

    private final File publicDir;

    public StaticFileHandler(String publicDirPath) {
        this.publicDir = new File(publicDirPath);
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path.equals("/")) path = "/login.html";

        File file = new File(publicDir, path).getCanonicalFile();

        // Prevent path traversal outside the public directory
        if (!file.getPath().startsWith(publicDir.getCanonicalPath())) {
            exchange.sendResponseHeaders(403, -1);
            return;
        }

        if (!file.exists() || file.isDirectory()) {
            exchange.sendResponseHeaders(404, -1);
            exchange.getResponseBody().close();
            return;
        }

        String fileName = file.getName();
        String contentType = guessContentType(fileName);
        byte[] bytes = Files.readAllBytes(file.toPath());

        exchange.getResponseHeaders().set("Content-Type", contentType);

        // PWA Service Worker & Frontend Asset Cache Headers
        if (fileName.equals("sw.js")) {
            exchange.getResponseHeaders().set("Service-Worker-Allowed", "/");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (fileName.endsWith(".html") || fileName.endsWith(".css") || fileName.endsWith(".js")) {
            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
        } else if (fileName.endsWith(".json") || fileName.endsWith(".webmanifest")) {
            exchange.getResponseHeaders().set("Cache-Control", "public, max-age=86400");
        }

        exchange.sendResponseHeaders(200, bytes.length);
        exchange.getResponseBody().write(bytes);
        exchange.getResponseBody().close();
    }

    private String guessContentType(String fileName) {
        String lower = fileName.toLowerCase();
        if (lower.endsWith(".html")) return "text/html; charset=utf-8";
        if (lower.endsWith(".css")) return "text/css; charset=utf-8";
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript; charset=utf-8";
        if (lower.endsWith(".json") || lower.endsWith(".webmanifest")) return "application/manifest+json; charset=utf-8";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".ttf")) return "font/ttf";
        if (lower.endsWith(".csv")) return "text/csv; charset=utf-8";
        return "application/octet-stream";
    }
}
