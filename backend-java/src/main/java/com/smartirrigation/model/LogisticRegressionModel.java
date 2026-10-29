package com.smartirrigation.model;

/**
 * Baseline: logistic regression trained with full-batch gradient descent,
 * a decaying learning rate and L2 regularisation. Features are min-max scaled.
 */
public final class LogisticRegressionModel implements Classifier {

    private static final double[] FEATURE_MIN = {0, 0, 0, 0, 0, 0};
    private static final double[] FEATURE_MAX = {100, 50, 100, 100, 5.0, 1.0};

    private static final double LEARNING_RATE = 0.45;
    private static final int EPOCHS = 1200;
    private static final double L2_LAMBDA = 0.0001;

    private final double[] weights = new double[TrainingData.N_FEATURES];
    private double bias = 0.0;

    @Override
    public String name() {
        return "Logistic Regression";
    }

    @Override
    public void fit(double[][] rawX, int[] y) {
        int n = rawX.length;
        int d = TrainingData.N_FEATURES;
        double[][] x = new double[n][];
        for (int i = 0; i < n; i++) x[i] = scale(rawX[i]);

        for (int epoch = 0; epoch < EPOCHS; epoch++) {
            double[] gradW = new double[d];
            double gradB = 0.0;

            for (int i = 0; i < n; i++) {
                double error = sigmoid(linear(x[i])) - y[i];
                for (int j = 0; j < d; j++) gradW[j] += error * x[i][j];
                gradB += error;
            }

            double lr = LEARNING_RATE / (1.0 + 0.0005 * epoch);
            for (int j = 0; j < d; j++) {
                weights[j] -= lr * (gradW[j] / n + L2_LAMBDA * weights[j]);
            }
            bias -= lr * gradB / n;
        }
    }

    @Override
    public double predictProba(double[] rawX) {
        return sigmoid(linear(scale(rawX)));
    }

    private double linear(double[] x) {
        double z = bias;
        for (int j = 0; j < weights.length; j++) z += weights[j] * x[j];
        return z;
    }

    private static double[] scale(double[] raw) {
        double[] s = new double[raw.length];
        for (int j = 0; j < raw.length; j++) {
            double clamped = Math.max(FEATURE_MIN[j], Math.min(FEATURE_MAX[j], raw[j]));
            s[j] = (clamped - FEATURE_MIN[j]) / (FEATURE_MAX[j] - FEATURE_MIN[j]);
        }
        return s;
    }

    private static double sigmoid(double z) {
        if (z < -45.0) return 0.0;
        if (z > 45.0) return 1.0;
        return 1.0 / (1.0 + Math.exp(-z));
    }
}

