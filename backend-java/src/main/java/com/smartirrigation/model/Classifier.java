package com.smartirrigation.model;

/**
 * Common contract for binary irrigation classifiers (1 = irrigate, 0 = hold).
 * Feature vectors are raw values in the order defined by {@link TrainingData#FEATURE_NAMES}.
 */
public interface Classifier {

    String name();

    void fit(double[][] x, int[] y);

    /** Probability that irrigation is needed (class 1), in [0, 1]. */
    double predictProba(double[] x);
}

