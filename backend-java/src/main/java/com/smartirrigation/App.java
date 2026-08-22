package com.smartirrigation;

import java.io.File;
import java.net.InetSocketAddress;
import java.util.concurrent.Executors;

import com.smartirrigation.handlers.AuthHandler;
import com.smartirrigation.handlers.CropHandler;
import com.smartirrigation.handlers.IrrigationHandler;
import com.smartirrigation.handlers.SensorHandler;
import com.smartirrigation.handlers.StaticFileHandler;
import com.smartirrigation.handlers.WeatherHandler;
import com.smartirrigation.model.IrrigationModel;
import com.sun.net.httpserver.HttpServer;


public class App {

    private static final int PORT = 5000;

    public static void main(String[] args) throws Exception {
        System.out.println("Working directory: " + new File(".").getAbsolutePath());

        new File("database").mkdirs();
        Database.init();

        IrrigationModel model = new IrrigationModel();
        model.train();

        HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);
        server.setExecutor(Executors.newFixedThreadPool(8));

        AuthHandler auth = new AuthHandler();
        SensorHandler sensors = new SensorHandler();
        IrrigationHandler irrigation = new IrrigationHandler(model);
        CropHandler crops = new CropHandler();
        WeatherHandler weather = new WeatherHandler();

        // ---- Auth ----
        server.createContext("/api/signup", auth.signup());
        server.createContext("/api/login", auth.login());
        server.createContext("/api/logout", auth.logout());
        server.createContext("/api/auth/forgot-password/request", auth.forgotPasswordRequest());
        server.createContext("/api/auth/forgot-password/verify", auth.forgotPasswordVerify());
        server.createContext("/api/auth/forgot-password/reset", auth.forgotPasswordReset());

        // ---- Sensor monitoring ----
        server.createContext("/api/sensors/latest", sensors.latest());
        server.createContext("/api/sensors/history", sensors.history());
        server.createContext("/api/sensors/simulate", sensors.simulate());

        // ---- Irrigation control (ML-driven + manual) ----
        server.createContext("/api/irrigation/predict", irrigation.predict());
        server.createContext("/api/irrigation/toggle", irrigation.toggle());
        server.createContext("/api/irrigation/status", irrigation.status());
        server.createContext("/api/irrigation/history", irrigation.history());

        // ---- Crops ----
        server.createContext("/api/crops/", crops.item());   // /api/crops/{id}  (DELETE)
        server.createContext("/api/crops", crops.collection()); // /api/crops      (GET, POST)

        // ---- Weather ----
        server.createContext("/api/weather", weather.get());

        // ---- Static frontend (HTML/CSS/JS) ----
        server.createContext("/", new StaticFileHandler("public"));

        server.start();
        System.out.println("=================================================");
        System.out.println(" Smart Irrigation System backend running");
        System.out.println(" Open: http://localhost:" + PORT + "/");
        System.out.println("=================================================");
    }
}