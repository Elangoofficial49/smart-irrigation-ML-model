package com.smartirrigation.model;

import java.util.Random;

/**
 * A small, self-contained Machine Learning model: logistic regression,
 * trained with batch gradient descent, written in plain Java (no
 * scikit-learn/Weka/etc). It is trained once, at server startup, on a
 * synthetically generated but agronomically reasonable dataset, then used
 * to serve real-time predictions for the /api/irrigation/predict endpoint.
 *
 * Features (normalized before training/inference):
 *   x0 = soil_moisture (%)
 *   x1 = temperature (C)
 *   x2 = humidity (%)
 *   x3 = rainfall_probability (%)
 *
 * Label: 1 = irrigation needed, 0 = not needed
 */
public class IrrigationModel {

    private double[] weights = new double[4];
    private double bias = 0.0;

    // Feature scaling ranges, used to normalize inputs the same way training data was normalized
    private static final double[] FEATURE_MIN = {0, 5, 5, 0};
    private static final double[] FEATURE_MAX = {100, 50, 100, 100};

    public void train() {
        int nSamples = 3000;
        double[][] X = new double[nSamples][4];
        int[] y = new int[nSamples];

        Random rng = new Random(42);

        for (int i = 0; i < nSamples; i++) {
            double soilMoisture = 5 + rng.nextDouble() * 85;      // 5 - 90
            double temperature = 10 + rng.nextDouble() * 35;      // 10 - 45
            double humidity = 10 + rng.nextDouble() * 85;         // 10 - 95
            double rainfallProb = rng.nextDouble() * 100;         // 0 - 100

            int score = 0;
            if (soilMoisture < 30) score += 2;
            else if (soilMoisture < 45) score += 1;

            if (temperature > 32) score += 1;
            if (humidity < 40) score += 1;

            if (rainfallProb > 60) score -= 2;
            else if (rainfallProb > 35) score -= 1;

            y[i] = (score >= 2) ? 1 : 0;

            X[i][0] = normalize(soilMoisture, 0);
            X[i][1] = normalize(temperature, 1);
            X[i][2] = normalize(humidity, 2);
            X[i][3] = normalize(rainfallProb, 3);
        }

        gradientDescent(X, y, 0.5, 800);
        System.out.println("[IrrigationModel] Logistic regression trained on " + nSamples + " synthetic samples.");
    }

    private void gradientDescent(double[][] X, int[] y, double learningRate, int epochs) {
        int n = X.length;
        int nFeatures = weights.length;

        for (int epoch = 0; epoch < epochs; epoch++) {
            double[] gradW = new double[nFeatures];
            double gradB = 0.0;

            for (int i = 0; i < n; i++) {
                double z = bias;
                for (int j = 0; j < nFeatures; j++) z += weights[j] * X[i][j];
                double pred = sigmoid(z);
                double error = pred - y[i];

                for (int j = 0; j < nFeatures; j++) gradW[j] += error * X[i][j];
                gradB += error;
            }

            for (int j = 0; j < nFeatures; j++) weights[j] -= learningRate * gradW[j] / n;
            bias -= learningRate * gradB / n;
        }
    }

    private double normalize(double value, int featureIndex) {
        double min = FEATURE_MIN[featureIndex];
        double max = FEATURE_MAX[featureIndex];
        return (value - min) / (max - min);
    }

    private double sigmoid(double z) {
        return 1.0 / (1.0 + Math.exp(-z));
    }

    /**
     * @return double[]{ predictedClass (0 or 1), confidence (0-1) }
     */
    public double[] predict(double soilMoisture, double temperature, double humidity, double rainfallProb) {
        double[] x = {
                normalize(soilMoisture, 0),
                normalize(temperature, 1),
                normalize(humidity, 2),
                normalize(rainfallProb, 3)
        };

        double z = bias;
        for (int j = 0; j < weights.length; j++) z += weights[j] * x[j];
        double probability = sigmoid(z);

        int predictedClass = probability >= 0.5 ? 1 : 0;
        double confidence = predictedClass == 1 ? probability : (1 - probability);

        return new double[]{predictedClass, confidence};
    }
}
