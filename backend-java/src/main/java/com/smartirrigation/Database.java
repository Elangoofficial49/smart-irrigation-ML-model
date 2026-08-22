package com.smartirrigation;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Base64;

import io.github.cdimascio.dotenv.Dotenv;

/**
 * Database layer using PostgreSQL (Supabase) through the postgresql JDBC driver.
 * Connects to a Supabase-hosted Postgres instance.
 */
public class Database {

    // ---- Loaded from .env (never hardcoded) ----
    private static final Dotenv dotenv = Dotenv.configure()
            .directory(System.getProperty("user.dir"))
            .ignoreIfMissing()
            .load();

    private static final String URL = dotenv.get("DB_URL");
    private static final String USER = dotenv.get("DB_USER");
    private static final String PASSWORD = dotenv.get("DB_PASSWORD");

    static {
        System.out.println("[DEBUG] Working dir: " + System.getProperty("user.dir"));
        System.out.println("[DEBUG] DB_URL loaded: " + (URL != null ? "YES -> " + URL : "NULL"));
        System.out.println("[DEBUG] DB_USER loaded: " + (USER != null ? "YES" : "NULL"));
        System.out.println("[DEBUG] DB_PASSWORD loaded: " + (PASSWORD != null ? "YES (hidden)" : "NULL"));

        try {
            Class.forName("org.postgresql.Driver");
        } catch (ClassNotFoundException e) {
            throw new RuntimeException("PostgreSQL JDBC driver not found. Add postgresql dependency to pom.xml.", e);
        }
    }

    public static Connection getConnection() throws SQLException {
        return DriverManager.getConnection(URL, USER, PASSWORD);
    }

    public static Connection connect() throws SQLException {
        return getConnection();
    }

    public static void init() {
        try (Connection conn = connect(); Statement st = conn.createStatement()) {

            st.execute("""
                CREATE TABLE IF NOT EXISTS users (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) UNIQUE NOT NULL,
                    email VARCHAR(255) UNIQUE,
                    password_hash VARCHAR(255) NOT NULL,
                    salt VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);

            try {
                st.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS email VARCHAR(255);");
                // Deduplicate any older test rows with same email before enforcing unique index
                st.execute("DELETE FROM users a USING users b WHERE a.id < b.id AND a.email IS NOT NULL AND LOWER(a.email) = LOWER(b.email);");
                st.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email));");
            } catch (SQLException ignored) {
                // Column or index might already exist or SQLite fallback
            }

            st.execute("""
                CREATE TABLE IF NOT EXISTS password_resets (
                    id SERIAL PRIMARY KEY,
                    email VARCHAR(255) NOT NULL,
                    otp_code VARCHAR(10) NOT NULL,
                    expires_at TIMESTAMP NOT NULL,
                    used BOOLEAN DEFAULT FALSE,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);

            st.execute("""
                CREATE TABLE IF NOT EXISTS sensors (
                    id SERIAL PRIMARY KEY,
                    soil_moisture DOUBLE PRECISION NOT NULL,
                    temperature DOUBLE PRECISION NOT NULL,
                    humidity DOUBLE PRECISION NOT NULL,
                    rainfall_prob DOUBLE PRECISION NOT NULL,
                    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);

            st.execute("""
                CREATE TABLE IF NOT EXISTS crops (
                    id SERIAL PRIMARY KEY,
                    username VARCHAR(255) NOT NULL,
                    crop_name VARCHAR(255) NOT NULL,
                    area_acres DOUBLE PRECISION,
                    planting_date VARCHAR(50),
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);

            st.execute("""
                CREATE TABLE IF NOT EXISTS irrigation_logs (
                    id SERIAL PRIMARY KEY,
                    status VARCHAR(50) NOT NULL,
                    mode VARCHAR(50) NOT NULL,
                    triggered_by VARCHAR(255),
                    confidence DOUBLE PRECISION,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);

            System.out.println("[Database] PostgreSQL (Supabase) initialized at " + URL);
        } catch (SQLException e) {
            throw new RuntimeException("Failed to initialize database", e);
        }
    }

    // ---------- Password hashing (SHA-256 + random salt, no external libs) ----------

    public static String randomSalt() {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        return Base64.getEncoder().encodeToString(salt);
    }

    public static String hashPassword(String password, String salt) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            digest.update(Base64.getDecoder().decode(salt));
            byte[] hashed = digest.digest(password.getBytes("UTF-8"));
            return Base64.getEncoder().encodeToString(hashed);
        } catch (NoSuchAlgorithmException | java.io.UnsupportedEncodingException e) {
            throw new RuntimeException(e);
        }
    }
}