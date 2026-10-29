package com.smartirrigation.model;

import java.util.Arrays;
import java.util.Locale;

import com.smartirrigation.util.Json;

/**
 * Hold-out evaluation metrics for a binary irrigation classifier.
 * Positive class (1) = irrigation needed.
 */
public final class ModelMetrics {

    public final String model;
    public final int truePositives;
    public final int falsePositives;
    public final int trueNegatives;
    public final int falseNegatives;
    public final double accuracy;
    public final double precision;
    public final double recall;
    public final double f1;
    public final double rocAuc;
    public final long trainMillis;

    private ModelMetrics(String model, int tp, int fp, int tn, int fn, double rocAuc, long trainMillis) {
        this.model = model;
        this.truePositives = tp;
        this.falsePositives = fp;
        this.trueNegatives = tn;
        this.falseNegatives = fn;
        int total = tp + fp + tn + fn;
        this.accuracy = total == 0 ? 0 : (double) (tp + tn) / total;
        this.precision = tp + fp == 0 ? 0 : (double) tp / (tp + fp);
        this.recall = tp + fn == 0 ? 0 : (double) tp / (tp + fn);
        this.f1 = precision + recall == 0 ? 0 : 2 * precision * recall / (precision + recall);
        this.rocAuc = rocAuc;
        this.trainMillis = trainMillis;
    }

    public static ModelMetrics evaluate(Classifier classifier, TrainingData test, long trainMillis) {
        int n = test.size();
        double[] scores = new double[n];
        int tp = 0, fp = 0, tn = 0, fn = 0;

        for (int i = 0; i < n; i++) {
            scores[i] = classifier.predictProba(test.x[i]);
            boolean predicted = scores[i] >= 0.5;
            boolean actual = test.y[i] == 1;
            if (predicted && actual) tp++;
            else if (predicted) fp++;
            else if (actual) fn++;
            else tn++;
        }
        return new ModelMetrics(classifier.name(), tp, fp, tn, fn, rocAuc(scores, test.y), trainMillis);
    }

    /** ROC-AUC via the Mann-Whitney U statistic, with average ranks for ties. */
    private static double rocAuc(double[] scores, int[] labels) {
        int n = scores.length;
        Integer[] order = new Integer[n];
        for (int i = 0; i < n; i++) order[i] = i;
        Arrays.sort(order, (a, b) -> Double.compare(scores[a], scores[b]));

        double[] ranks = new double[n];
        int i = 0;
        while (i < n) {
            int j = i;
            while (j + 1 < n && scores[order[j + 1]] == scores[order[i]]) j++;
            double averageRank = (i + j) / 2.0 + 1.0;
            for (int k = i; k <= j; k++) ranks[order[k]] = averageRank;
            i = j + 1;
        }

        long nPos = 0;
        double positiveRankSum = 0;
        for (int k = 0; k < n; k++) {
            if (labels[k] == 1) {
                nPos++;
                positiveRankSum += ranks[k];
            }
        }
        long nNeg = n - nPos;
        if (nPos == 0 || nNeg == 0) return 0.5;
        return (positiveRankSum - nPos * (nPos + 1) / 2.0) / ((double) nPos * nNeg);
    }

    public String toJson() {
        return Json.obj()
                .put("model", model)
                .put("accuracy", round(accuracy))
                .put("precision", round(precision))
                .put("recall", round(recall))
                .put("f1", round(f1))
                .put("roc_auc", round(rocAuc))
                .put("true_positives", truePositives)
                .put("false_positives", falsePositives)
                .put("true_negatives", trueNegatives)
                .put("false_negatives", falseNegatives)
                .put("train_ms", trainMillis)
                .build();
    }

    public String toTableRow() {
        return String.format(Locale.ROOT, "  %-20s %8.2f%% %9.3f %7.3f %6.3f %8.3f %8d ms",
                model, accuracy * 100, precision, recall, f1, rocAuc, trainMillis);
    }

    private static double round(double v) {
        return Math.round(v * 10000.0) / 10000.0;
    }
}

