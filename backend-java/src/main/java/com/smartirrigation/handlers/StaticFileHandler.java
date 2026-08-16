    package com.smartirrigation.handlers;

    import java.io.File;
    import java.io.IOException;
    import java.nio.file.Files;

    import com.sun.net.httpserver.HttpExchange;
    import com.sun.net.httpserver.HttpHandler;

    /**
     * Serves the static frontend (HTML/CSS/JS) from the public/ folder so the
     * whole project - API + UI - runs from a single Java process. Point your
     * browser at http://localhost:5000/ once the server is running.
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

            String contentType = guessContentType(file.getName());
            byte[] bytes = Files.readAllBytes(file.toPath());
            exchange.getResponseHeaders().set("Content-Type", contentType);
            exchange.sendResponseHeaders(200, bytes.length);
            exchange.getResponseBody().write(bytes);
            exchange.getResponseBody().close();
        }

        private String guessContentType(String fileName) {
            if (fileName.endsWith(".html")) return "text/html; charset=utf-8";
            if (fileName.endsWith(".css")) return "text/css; charset=utf-8";
            if (fileName.endsWith(".js")) return "application/javascript; charset=utf-8";
            if (fileName.endsWith(".png")) return "image/png";
            if (fileName.endsWith(".svg")) return "image/svg+xml";
            return "application/octet-stream";
        }
    }
