package com.smartirrigation;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Base64;

import io.github.cdimascio.dotenv.Dotenv;

/**
 * Robust Database layer supporting PostgreSQL (Supabase) with seamless
 * embedded fallback (H2 in PostgreSQL-compatibility mode) for 100% offline & paused-cloud resilience.
 */
public class Database {

    private static final Dotenv dotenv = Dotenv.configure()
            .directory(System.getProperty("user.dir"))
            .ignoreIfMissing()
            .load();

    private static final String REMOTE_URL = dotenv.get("DB_URL");
    private static final String REMOTE_USER = dotenv.get("DB_USER");
    private static final String REMOTE_PASSWORD = dotenv.get("DB_PASSWORD");

    private static final String LOCAL_URL = "jdbc:h2:./smart_irrigation_local;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;AUTO_SERVER=TRUE";
    private static final String LOCAL_USER = "sa";
    private static final String LOCAL_PASSWORD = "";

    private static boolean useLocalFallback = false;
    private static String activeUrl = REMOTE_URL;

    static {
        System.out.println("[DEBUG] Working dir: " + System.getProperty("user.dir"));
        System.out.println("[DEBUG] DB_URL loaded: " + (REMOTE_URL != null ? "YES -> " + REMOTE_URL : "NULL"));
        System.out.println("[DEBUG] DB_USER loaded: " + (REMOTE_USER != null ? "YES" : "NULL"));
        System.out.println("[DEBUG] DB_PASSWORD loaded: " + (REMOTE_PASSWORD != null ? "YES (hidden)" : "NULL"));

        try {
            Class.forName("org.postgresql.Driver");
        } catch (ClassNotFoundException ignored) {}

        try {
            Class.forName("org.h2.Driver");
        } catch (ClassNotFoundException ignored) {}
    }

    public static Connection getConnection() throws SQLException {
        if (useLocalFallback) {
            return DriverManager.getConnection(LOCAL_URL, LOCAL_USER, LOCAL_PASSWORD);
        }
        try {
            if (REMOTE_URL == null || REMOTE_URL.isBlank()) {
                throw new SQLException("No remote DB_URL configured in .env");
            }
            return DriverManager.getConnection(REMOTE_URL, REMOTE_USER, REMOTE_PASSWORD);
        } catch (SQLException e) {
            System.err.println("[Database] Remote database unreachable (" + e.getMessage() + "). Falling back to local embedded database.");
            useLocalFallback = true;
            activeUrl = LOCAL_URL;
            return DriverManager.getConnection(LOCAL_URL, LOCAL_USER, LOCAL_PASSWORD);
        }
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
                st.execute("DELETE FROM users a USING users b WHERE a.id < b.id AND a.email IS NOT NULL AND LOWER(a.email) = LOWER(b.email);");
                st.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (LOWER(email));");
            } catch (SQLException ignored) {
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
                    user_id INT,
                    username VARCHAR(255),
                    crop_name VARCHAR(255) NOT NULL,
                    variety VARCHAR(255),
                    field_plot VARCHAR(100),
                    area_acres DOUBLE PRECISION,
                    planting_date VARCHAR(50),
                    growth_stage VARCHAR(100),
                    irrigation_status VARCHAR(100),
                    notes TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """);

            for (String column : new String[]{
                    "username VARCHAR(255)",
                    "variety VARCHAR(255)",
                    "field_plot VARCHAR(100)",
                    "growth_stage VARCHAR(100)",
                    "irrigation_status VARCHAR(100)"}) {
                try {
                    st.execute("ALTER TABLE crops ADD COLUMN IF NOT EXISTS " + column);
                } catch (SQLException ignored) {
                }
            }
            try {
                st.execute("UPDATE crops SET username = 'elango_admin' WHERE username IS NULL");
                st.execute("UPDATE crops SET field_plot = 'Plot A-1' WHERE field_plot IS NULL OR field_plot = ''");
                st.execute("UPDATE crops SET variety = 'Standard Cultivar' WHERE variety IS NULL OR variety = ''");
            } catch (SQLException ignored) {
            }

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

            // Record the sensor inputs and model behind each decision, so logged
            // decisions can later be used as real training data.
            for (String column : new String[]{
                    "soil_moisture DOUBLE PRECISION",
                    "temperature DOUBLE PRECISION",
                    "humidity DOUBLE PRECISION",
                    "rainfall_prob DOUBLE PRECISION",
                    "model_name VARCHAR(100)"}) {
                try {
                    st.execute("ALTER TABLE irrigation_logs ADD COLUMN IF NOT EXISTS " + column);
                } catch (SQLException e) {
                    System.err.println("[Database] Could not add irrigation_logs column (" + column + "): " + e.getMessage());
                }
            }

            // Seed default admin and sensor simulation if empty
            seedDefaultsIfEmpty(conn);

            System.out.println("[Database] Database initialized successfully (" + (useLocalFallback ? "Local Embedded H2" : "Remote PostgreSQL") + ") at " + activeUrl);
        } catch (SQLException e) {
            throw new RuntimeException("Failed to initialize database", e);
        }
    }

    private static void seedDefaultsIfEmpty(Connection conn) {
        try {
            // Seed admin user
            try (PreparedStatement ps = conn.prepareStatement("SELECT COUNT(*) FROM users WHERE username = ?")) {
                ps.setString(1, "elango_admin");
                try (ResultSet rs = ps.executeQuery()) {
                    if (rs.next() && rs.getInt(1) == 0) {
                        String salt = randomSalt();
                        String hash = hashPassword("Password123", salt);
                        try (PreparedStatement ins = conn.prepareStatement(
                                "INSERT INTO users (username, email, password_hash, salt) VALUES (?, ?, ?, ?)")) {
                            ins.setString(1, "elango_admin");
                            ins.setString(2, "elangoofficial8@gmail.com");
                            ins.setString(3, hash);
                            ins.setString(4, salt);
                            ins.executeUpdate();
                        }
                    }
                }
            }

            // Seed initial sensor telemetry if empty
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM sensors")) {
                if (rs.next() && rs.getInt(1) == 0) {
                    st.execute("INSERT INTO sensors (soil_moisture, temperature, humidity, rainfall_prob) VALUES (48.5, 30.2, 55.0, 15.0)");
                }
            }

            // Seed initial crop if empty
            try (Statement st = conn.createStatement();
                 ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM crops")) {
                if (rs.next() && rs.getInt(1) == 0) {
                    st.execute("INSERT INTO crops (user_id, username, crop_name, variety, field_plot, area_acres, planting_date, growth_stage, irrigation_status, notes) "
                            + "VALUES (1, 'elango_admin', 'Sugarcane', 'Co 86032', 'Plot A-1 (North)', 5.0, '2026-06-15', 'Vegetative', 'Optimal', 'Precision subsurface drip line installed')");
                    st.execute("INSERT INTO crops (user_id, username, crop_name, variety, field_plot, area_acres, planting_date, growth_stage, irrigation_status, notes) "
                            + "VALUES (1, 'elango_admin', 'Rice / Paddy', 'ADT 43', 'Plot B-2 (East)', 3.5, '2026-08-10', 'Tillering', 'Requires Irrigation', 'AWD alternate wetting and drying regime')");
                    st.execute("INSERT INTO crops (user_id, username, crop_name, variety, field_plot, area_acres, planting_date, growth_stage, irrigation_status, notes) "
                            + "VALUES (1, 'elango_admin', 'Cotton', 'MCU 5', 'Plot C-1 (West)', 4.0, '2026-07-22', 'Flowering', 'Optimal', 'Deep root zone moisture probe #3')");
                }
            }
        } catch (SQLException ignored) {
        }
    }

    // ---------- Password hashing (SHA-256 + random salt) ----------

    public static String randomSalt() {
        byte[] salt = new byte[16];
        new SecureRandom().nextBytes(salt);
        return Base64.getEncoder().encodeToString(salt);
    }

    public static String hashPassword(String password, String salt) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            md.update(Base64.getDecoder().decode(salt));
            byte[] hashed = md.digest(password.getBytes());
            return Base64.getEncoder().encodeToString(hashed);
        } catch (NoSuchAlgorithmException e) {
            throw new RuntimeException("SHA-256 not supported", e);
        }
    }

    public static boolean verifyPassword(String password, String salt, String expectedHash) {
        return hashPassword(password, salt).equals(expectedHash);
    }
}
