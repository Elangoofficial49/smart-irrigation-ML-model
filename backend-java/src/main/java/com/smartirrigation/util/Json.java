package com.smartirrigation.util;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Tiny hand-written JSON helper (object building + flat parsing).
 * Kept dependency-free on purpose so the project only needs sqlite-jdbc.
 * It supports flat JSON objects of strings/numbers/booleans, which is all
 * this project's API needs (no nested objects/arrays in request bodies).
 */
public final class Json {

    private Json() {}

    public static String escape(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) {
            switch (c) {
                case '"': sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default: sb.append(c);
            }
        }
        return sb.toString();
    }

    /** Builder for a flat JSON object: put(...).put(...).build() */
    public static class Obj {
        private final StringBuilder sb = new StringBuilder("{");
        private boolean first = true;

        private void sep() {
            if (!first) sb.append(",");
            first = false;
        }

        public Obj put(String key, String value) {
            sep();
            sb.append("\"").append(escape(key)).append("\":");
            sb.append(value == null ? "null" : "\"" + escape(value) + "\"");
            return this;
        }

        public Obj put(String key, Number value) {
            sep();
            sb.append("\"").append(escape(key)).append("\":").append(value == null ? "null" : value.toString());
            return this;
        }

        public Obj put(String key, boolean value) {
            sep();
            sb.append("\"").append(escape(key)).append("\":").append(value);
            return this;
        }

        /** Insert a raw pre-built JSON fragment (object/array/literal) under this key */
        public Obj putRaw(String key, String rawJson) {
            sep();
            sb.append("\"").append(escape(key)).append("\":").append(rawJson == null ? "null" : rawJson);
            return this;
        }

        public String build() {
            return sb.append("}").toString();
        }
    }

    public static Obj obj() {
        return new Obj();
    }

    /**
     * Very small flat-object parser: turns {"a":"b","c":1} into a Map<String,String>.
     * Good enough for this project's simple request bodies (no nested JSON).
     */
    public static Map<String, String> parseFlat(String json) {
        Map<String, String> map = new LinkedHashMap<>();
        if (json == null || json.isBlank()) return map;
        String s = json.trim();
        if (s.startsWith("{")) s = s.substring(1);
        if (s.endsWith("}")) s = s.substring(0, s.length() - 1);

        int i = 0;
        int n = s.length();
        while (i < n) {
            // skip whitespace/commas
            while (i < n && (Character.isWhitespace(s.charAt(i)) || s.charAt(i) == ',')) i++;
            if (i >= n) break;
            if (s.charAt(i) != '"') break;
            i++;
            StringBuilder key = new StringBuilder();
            while (i < n && s.charAt(i) != '"') {
                key.append(s.charAt(i));
                i++;
            }
            i++; // closing quote
            while (i < n && (s.charAt(i) == ':' || Character.isWhitespace(s.charAt(i)))) i++;

            StringBuilder val = new StringBuilder();
            if (i < n && s.charAt(i) == '"') {
                i++;
                while (i < n && s.charAt(i) != '"') {
                    char c = s.charAt(i);
                    if (c == '\\' && i + 1 < n) {
                        i++;
                        char esc = s.charAt(i);
                        switch (esc) {
                            case 'n': val.append('\n'); break;
                            case 't': val.append('\t'); break;
                            case 'r': val.append('\r'); break;
                            default: val.append(esc);
                        }
                    } else {
                        val.append(c);
                    }
                    i++;
                }
                i++; // closing quote
            } else {
                while (i < n && s.charAt(i) != ',' ) {
                    val.append(s.charAt(i));
                    i++;
                }
            }
            map.put(key.toString(), val.toString().trim());
        }
        return map;
    }
}
