package com.smartirrigation.model;

import java.util.Random;

/**
 * Labelled dataset for the irrigation classifiers, plus the shared feature definition.
 *
 * Synthetic data: the true field state is sampled, labelled with FAO-56-inspired
 * agronomic rules, and then the model only sees a noisy sensor reading of that state.
 * The noise simulates real sensor error and forecast uncertainty, so test metrics
 * measure how well a model recovers the correct decision from imperfect inputs
 * instead of trivially reproducing the rules.
 *
 * Replace {@link #synthetic(int, long)} with logged field data once enough real
 * readings and outcomes have been collected (see irrigation_logs).
 */
public final class TrainingData {

    public static final String[] FEATURE_NAMES = {
            "soil_moisture", "temperature", "humidity", "rainfall_prob", "et_stress", "drought_flag"
    };
    public static final int N_FEATURES = FEATURE_NAMES.length;

    // Simulated measurement noise (standard deviations)
    private static final double NOISE_MOISTURE = 2.5;   // % volumetric water content
    private static final double NOISE_TEMP = 0.8;       // °C
    private static final double NOISE_HUMIDITY = 4.0;   // % RH
    private static final double NOISE_RAIN = 6.0;       // % forecast probability

    public final double[][] x;
    public final int[] y;

    private TrainingData(double[][] x, int[] y) {
        this.x = x;
        this.y = y;
    }

    public int size() {
        return y.length;
    }

    public int positives() {
        int p = 0;
        for (int label : y) p += label;
        return p;
    }

    /** Builds the 6-value feature vector from the 4 raw sensor readings. */
    public static double[] features(double soilMoisture, double temperature, double humidity, double rainfallProb) {
        double etStress = (temperature + 5.0) / Math.max(humidity, 10.0);
        double droughtFlag = (soilMoisture < 35.0 && rainfallProb < 40.0) ? 1.0 : 0.0;
        return new double[]{soilMoisture, temperature, humidity, rainfallProb, etStress, droughtFlag};
    }

    /** Ground-truth labelling rule based on FAO-56 irrigation guidance. */
    static boolean needsWater(double soilMoisture, double temperature, double humidity, double rainfallProb) {
        double etStress = (temperature + 5.0) / Math.max(humidity, 10.0);
        if (soilMoisture < 25.0) {
            // Near wilting point: irrigate unless heavy rain is almost certain
            return rainfallProb < 80.0;
        } else if (soilMoisture >= 65.0) {
            // Near field capacity: never irrigate
            return false;
        } else if (rainfallProb >= 60.0) {
            // Rain expected: postpone to avoid waterlogging and nutrient leaching
            return false;
        } else if (soilMoisture < 42.0) {
            // Moderate deficit: irrigate if rain is unlikely or evaporation demand is high
            return rainfallProb < 45.0 || etStress > 0.6;
        } else {
            // Mild deficit: only during extreme heat with dry air and no rain
            return temperature > 38.0 && humidity < 30.0 && rainfallProb < 20.0;
        }
    }

    public static TrainingData synthetic(int n, long seed) {
        Random rng = new Random(seed);
        double[][] x = new double[n][];
        int[] y = new int[n];

        for (int i = 0; i < n; i++) {
            double moisture = 5.0 + rng.nextDouble() * 90.0;
            double temp = 10.0 + rng.nextDouble() * 38.0;
            double humidity = 10.0 + rng.nextDouble() * 85.0;
            double rain = rng.nextDouble() * 100.0;

            y[i] = needsWater(moisture, temp, humidity, rain) ? 1 : 0;

            double obsMoisture = clamp(moisture + rng.nextGaussian() * NOISE_MOISTURE, 0, 100);
            double obsTemp = clamp(temp + rng.nextGaussian() * NOISE_TEMP, -10, 60);
            double obsHumidity = clamp(humidity + rng.nextGaussian() * NOISE_HUMIDITY, 0, 100);
            double obsRain = clamp(rain + rng.nextGaussian() * NOISE_RAIN, 0, 100);

            x[i] = features(obsMoisture, obsTemp, obsHumidity, obsRain);
        }
        return new TrainingData(x, y);
    }

    /** Shuffled hold-out split. Returns {train, test}. */
    public TrainingData[] split(double testFraction, long seed) {
        int n = size();
        int[] order = new int[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Random rng = new Random(seed);
        for (int i = n - 1; i > 0; i--) {
            int j = rng.nextInt(i + 1);
            int tmp = order[i];
            order[i] = order[j];
            order[j] = tmp;
        }

        int nTest = (int) Math.round(n * testFraction);
        int nTrain = n - nTest;
        double[][] trX = new double[nTrain][];
        int[] trY = new int[nTrain];
        double[][] teX = new double[nTest][];
        int[] teY = new int[nTest];

        for (int k = 0; k < n; k++) {
            int src = order[k];
            if (k < nTrain) {
                trX[k] = x[src];
                trY[k] = y[src];
            } else {
                teX[k - nTrain] = x[src];
                teY[k - nTrain] = y[src];
            }
        }
        return new TrainingData[]{new TrainingData(trX, trY), new TrainingData(teX, teY)};
    }

    public static void exportCsv(java.io.File file, TrainingData train, TrainingData test) {
        try {
            if (file.getParentFile() != null) file.getParentFile().mkdirs();
            try (java.io.PrintWriter out = new java.io.PrintWriter(file, java.nio.charset.StandardCharsets.UTF_8)) {
                out.println("id,split,soil_moisture,temperature,humidity,rainfall_prob,et_stress,drought_flag,label_irrigate");
                int id = 1;
                for (int i = 0; i < train.size(); i++) {
                    double[] row = train.x[i];
                    out.printf(java.util.Locale.ROOT, "%d,train,%.2f,%.2f,%.2f,%.2f,%.4f,%.0f,%d%n",
                            id++, row[0], row[1], row[2], row[3], row[4], row[5], train.y[i]);
                }
                for (int i = 0; i < test.size(); i++) {
                    double[] row = test.x[i];
                    out.printf(java.util.Locale.ROOT, "%d,test,%.2f,%.2f,%.2f,%.2f,%.4f,%.0f,%d%n",
                            id++, row[0], row[1], row[2], row[3], row[4], row[5], test.y[i]);
                }
            }
            System.out.println("[TrainingData] Exported 10,000 dataset samples to: " + file.getAbsolutePath());
        } catch (java.io.IOException e) {
            System.err.println("[TrainingData] Failed to export CSV: " + e.getMessage());
        }
    }

    private static double clamp(double v, double min, double max) {
        return Math.max(min, Math.min(max, v));
    }
}

