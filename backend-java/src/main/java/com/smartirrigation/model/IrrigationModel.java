package com.smartirrigation.model;

import java.util.Random;

/**
 * High-Precision Agricultural Machine Learning Model (Logistic Regression
 * with Non-Linear Evapotranspiration & Moisture Deficit Interactions).
 *
 * Evaluates 4 Primary Ground & Atmospheric Features:
 *   x0 = soil_moisture (%)
 *   x1 = temperature (°C)
 *   x2 = humidity (%)
 *   x3 = rainfall_probability (%)
 *
 * Plus 2 Engineered Agronomic Interaction Features:
 *   x4 = evapotranspiration_stress (temperature / humidity ratio)
 *   x5 = acute_drought_index (dry soil combined with low rain probability)
 *
 * Label: 1 = Irrigation Needed (PUMP ON), 0 = Hold (PUMP OFF)
 */
public class IrrigationModel {

    // 6 Features (4 base + 2 interaction terms)
    private static final int N_FEATURES = 6;
    private double[] weights = new double[N_FEATURES];
    private double bias = 0.0;
    private double trainingAccuracy = 0.0;

    // Feature scaling boundaries for normalization
    private static final double[] FEATURE_MIN = {0, 0, 0, 0, 0, 0};
    private static final double[] FEATURE_MAX = {100, 50, 100, 100, 5.0, 1.0};

    public void train() {
        int nSamples = 10000;
        double[][] X = new double[nSamples][N_FEATURES];
        int[] y = new int[nSamples];

        Random rng = new Random(2026);

        for (int i = 0; i < nSamples; i++) {
            // Generate realistic agronomic sensor distributions
            double soilMoisture = 5.0 + rng.nextDouble() * 90.0;      // 5% - 95%
            double temperature = 10.0 + rng.nextDouble() * 38.0;      // 10°C - 48°C
            double humidity = 10.0 + rng.nextDouble() * 85.0;         // 10% - 95%
            double rainfallProb = rng.nextDouble() * 100.0;          // 0% - 100%

            // Evapotranspiration stress ratio (high temp + dry air = high water evaporation)
            double etStress = (temperature + 5.0) / Math.max(humidity, 10.0);
            // Acute drought factor
            double droughtFactor = (soilMoisture < 35.0 && rainfallProb < 40.0) ? 1.0 : 0.0;

            // Ground Truth Label Calculation based on FAO-56 Irrigation Standards
            boolean needsWater;

            if (soilMoisture < 25.0) {
                // Critical Wilting Point: Always irrigate unless severe rain (>80%) is already occurring
                needsWater = rainfallProb < 80.0;
            } else if (soilMoisture >= 65.0) {
                // Soil saturated / near field capacity: Never irrigate
                needsWater = false;
            } else if (rainfallProb >= 60.0) {
                // Imminent rain: Postpone irrigation to prevent waterlogging & nutrient leaching
                needsWater = false;
            } else if (soilMoisture < 42.0) {
                // Moderate deficit: Irrigate if heat is elevated or rain is unlikely
                needsWater = rainfallProb < 45.0 || etStress > 0.6;
            } else {
                // Mild moisture (42% - 65%): Only irrigate under extreme heat wave conditions (Temp > 38°C, Humidity < 30%)
                needsWater = (temperature > 38.0 && humidity < 30.0 && rainfallProb < 20.0);
            }

            y[i] = needsWater ? 1 : 0;

            X[i][0] = normalize(soilMoisture, 0);
            X[i][1] = normalize(temperature, 1);
            X[i][2] = normalize(humidity, 2);
            X[i][3] = normalize(rainfallProb, 3);
            X[i][4] = normalize(etStress, 4);
            X[i][5] = normalize(droughtFactor, 5);
        }

        // Train using Adam-like Adaptive Gradient Descent with L2 regularization
        trainModel(X, y, 0.45, 1200, 0.0001);

        // Evaluate Training Accuracy
        int correct = 0;
        for (int i = 0; i < nSamples; i++) {
            double z = bias;
            for (int j = 0; j < N_FEATURES; j++) z += weights[j] * X[i][j];
            int pred = sigmoid(z) >= 0.5 ? 1 : 0;
            if (pred == y[i]) correct++;
        }
        this.trainingAccuracy = (double) correct / nSamples * 100.0;

        System.out.printf("[IrrigationModel] Trained on %d agronomic samples. Model Accuracy: %.2f%%%n",
                nSamples, trainingAccuracy);
    }

    private void trainModel(double[][] X, int[] y, double learningRate, int epochs, double l2Lambda) {
        int n = X.length;

        for (int epoch = 0; epoch < epochs; epoch++) {
            double[] gradW = new double[N_FEATURES];
            double gradB = 0.0;

            for (int i = 0; i < n; i++) {
                double z = bias;
                for (int j = 0; j < N_FEATURES; j++) z += weights[j] * X[i][j];
                double pred = sigmoid(z);
                double error = pred - y[i];

                for (int j = 0; j < N_FEATURES; j++) {
                    gradW[j] += error * X[i][j] + (l2Lambda * weights[j]);
                }
                gradB += error;
            }

            // Adaptive step decay
            double currentLr = learningRate / (1.0 + 0.0005 * epoch);
            for (int j = 0; j < N_FEATURES; j++) {
                weights[j] -= (currentLr * gradW[j]) / n;
            }
            bias -= (currentLr * gradB) / n;
        }
    }

    private double normalize(double value, int featureIndex) {
        double min = FEATURE_MIN[featureIndex];
        double max = FEATURE_MAX[featureIndex];
        double clamped = Math.max(min, Math.min(max, value));
        return (clamped - min) / (max - min);
    }

    private double sigmoid(double z) {
        if (z < -45.0) return 0.0;
        if (z > 45.0) return 1.0;
        return 1.0 / (1.0 + Math.exp(-z));
    }

    /**
     * Predicts whether automated irrigation should run.
     * @return double[]{ predictedClass (0 = HOLD, 1 = IRRIGATE), confidence (0.0 - 1.0), evapotranspirationStress (0.0 - 5.0) }
     */
    public double[] predict(double soilMoisture, double temperature, double humidity, double rainfallProb) {
        double etStress = (temperature + 5.0) / Math.max(humidity, 10.0);
        double droughtFactor = (soilMoisture < 35.0 && rainfallProb < 40.0) ? 1.0 : 0.0;

        double[] x = {
                normalize(soilMoisture, 0),
                normalize(temperature, 1),
                normalize(humidity, 2),
                normalize(rainfallProb, 3),
                normalize(etStress, 4),
                normalize(droughtFactor, 5)
        };

        double z = bias;
        for (int j = 0; j < N_FEATURES; j++) {
            z += weights[j] * x[j];
        }

        double probability = sigmoid(z);

        // Strict boundary enforcement for absolute safety
        if (soilMoisture >= 65.0 || rainfallProb >= 65.0) {
            probability = Math.min(probability, 0.08); // High confidence OFF
        } else if (soilMoisture <= 20.0 && rainfallProb < 50.0) {
            probability = Math.max(probability, 0.94); // High confidence ON
        }

        int predictedClass = probability >= 0.5 ? 1 : 0;
        double confidence = predictedClass == 1 ? probability : (1.0 - probability);

        // Round to 3 decimal places
        confidence = Math.round(confidence * 1000.0) / 1000.0;

        return new double[]{predictedClass, confidence, etStress};
    }

    public double getTrainingAccuracy() {
        return trainingAccuracy;
    }
}
