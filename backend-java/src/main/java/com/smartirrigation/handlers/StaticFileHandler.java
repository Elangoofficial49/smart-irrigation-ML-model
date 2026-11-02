package com.smartirrigation.handlers;

import java.io.File;
import java.io.IOException;
import java.nio.file.Files;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;

/**
 * Serves the static frontend (HTML/CSS/JS/PWA assets) from the public/ folder.
 * Supports 1-to-1 clean route resolution and custom 404.html fallback.
 */
public class StaticFileHandler implements HttpHandler {

    private final File publicDir;

    public StaticFileHandler(String publicDirPath) {
        this.publicDir = new File(publicDirPath);
    }

    @Override
    public void handle(HttpExchange exchange) throws IOException {
        String path = exchange.getRequestURI().getPath();
        if (path == null || path.equals("/") || path.equals("/index.html")) {
            path = "/login.html";
        } else if (!path.contains(".")) {
            // Support clean 1-to-1 extensionless paths (e.g., /dashboard -> /dashboard.html)
            File candidate = new File(publicDir, path + ".html").getCanonicalFile();
            if (candidate.exists() && candidate.isFile() && candidate.getPath().startsWith(publicDir.getCanonicalPath())) {
                path = path + ".html";
            }
        }

        File file = new File(publicDir, path).getCanonicalFile();

        // Prevent path traversal outside the public directory
        if (!file.getPath().startsWith(publicDir.getCanonicalPath())) {
            exchange.sendResponseHeaders(403, -1);
            return;
        }

        if (!file.exists() || file.isDirectory()) {
            File notFoundPage = new File(publicDir, "404.html").getCanonicalFile();
            if (notFoundPage.exists() && notFoundPage.isFile()) {
                byte[] errBytes = Files.readAllBytes(notFoundPage.toPath());
                exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
                exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
                exchange.sendResponseHeaders(404, errBytes.length);
                exchange.getResponseBody().write(errBytes);
                exchange.getResponseBody().close();
            } else {
                exchange.sendResponseHeaders(404, -1);
                exchange.getResponseBody().close();
            }
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
