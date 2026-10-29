package com.smartirrigation.model;

import java.util.Random;
import java.util.stream.IntStream;

/**
 * Random Forest classifier: an ensemble of CART decision trees.
 *
 * Each tree is grown on a bootstrap sample of the training data and, at every
 * split, only considers a random subset of features ("mtry"). Splits are chosen
 * by Gini impurity. The forest probability is the average leaf probability
 * across all trees. Feature importance is the total Gini decrease per feature.
 *
 * Trees handle threshold rules (e.g. "moisture below 25%") naturally, which is
 * why this model fits irrigation decisions better than a linear model.
 */
public final class RandomForestModel implements Classifier {

    private final int nTrees;
    private final int maxDepth;
    private final int minSamplesLeaf;
    private final int mtry;
    private final long seed;

    private Node[] trees;
    private double[] featureImportance;

    private static final class Node {
        int feature = -1;
        double threshold;
        double probability;
        Node left;
        Node right;

        boolean isLeaf() {
            return feature < 0;
        }
    }

    public RandomForestModel(int nTrees, int maxDepth, int minSamplesLeaf, int mtry, long seed) {
        this.nTrees = nTrees;
        this.maxDepth = maxDepth;
        this.minSamplesLeaf = minSamplesLeaf;
        this.mtry = mtry;
        this.seed = seed;
    }

    @Override
    public String name() {
        return "Random Forest";
    }

    public int getTreeCount() {
        return nTrees;
    }

    public int getMaxDepth() {
        return maxDepth;
    }

    @Override
    public void fit(double[][] x, int[] y) {
        int n = y.length;
        int d = x[0].length;
        Node[] built = new Node[nTrees];
        double[][] importancePerTree = new double[nTrees][d];

        // Each tree has its own seeded RNG, so results are reproducible even in parallel
        IntStream.range(0, nTrees).parallel().forEach(t -> {
            Random rng = new Random(seed + 7919L * t);
            int[] sample = new int[n];
            for (int i = 0; i < n; i++) sample[i] = rng.nextInt(n);
            built[t] = grow(x, y, sample, 0, rng, importancePerTree[t]);
        });

        double[] importance = new double[d];
        double total = 0;
        for (double[] treeImportance : importancePerTree) {
            for (int j = 0; j < d; j++) {
                importance[j] += treeImportance[j];
                total += treeImportance[j];
            }
        }
        if (total > 0) {
            for (int j = 0; j < d; j++) importance[j] /= total;
        }

        this.trees = built;
        this.featureImportance = importance;
    }

    @Override
    public double predictProba(double[] x) {
        double sum = 0;
        for (Node root : trees) {
            Node node = root;
            while (!node.isLeaf()) {
                node = x[node.feature] <= node.threshold ? node.left : node.right;
            }
            sum += node.probability;
        }
        return sum / trees.length;
    }

    /** Normalised Gini importance per feature (sums to 1). */
    public double[] getFeatureImportance() {
        return featureImportance.clone();
    }

    private Node grow(double[][] x, int[] y, int[] idx, int depth, Random rng, double[] importance) {
        int n = idx.length;
        int positives = 0;
        for (int i : idx) positives += y[i];

        Node node = new Node();
        node.probability = (double) positives / n;

        if (depth >= maxDepth || n < 2 * minSamplesLeaf || positives == 0 || positives == n) {
            return node;
        }

        double parentGini = gini(positives, n);
        int bestFeature = -1;
        double bestThreshold = 0;
        double bestGini = parentGini;

        double[] values = new double[n];
        int[] order = new int[n];

        for (int f : sampleFeatures(x[0].length, rng)) {
            for (int k = 0; k < n; k++) {
                order[k] = idx[k];
                values[k] = x[idx[k]][f];
            }
            sortByValue(values, order, 0, n - 1);

            int leftN = 0;
            int leftPos = 0;
            for (int k = 0; k < n - 1; k++) {
                leftN++;
                leftPos += y[order[k]];
                if (values[k] == values[k + 1]) continue;
                int rightN = n - leftN;
                if (leftN < minSamplesLeaf || rightN < minSamplesLeaf) continue;

                double weighted = (leftN * gini(leftPos, leftN) + rightN * gini(positives - leftPos, rightN)) / n;
                if (weighted < bestGini) {
                    bestGini = weighted;
                    bestFeature = f;
                    bestThreshold = (values[k] + values[k + 1]) / 2.0;
                }
            }
        }

        if (bestFeature < 0 || parentGini - bestGini < 1e-9) {
            return node;
        }

        importance[bestFeature] += (parentGini - bestGini) * n;

        int leftCount = 0;
        for (int i : idx) if (x[i][bestFeature] <= bestThreshold) leftCount++;
        int[] leftIdx = new int[leftCount];
        int[] rightIdx = new int[n - leftCount];
        int li = 0;
        int ri = 0;
        for (int i : idx) {
            if (x[i][bestFeature] <= bestThreshold) leftIdx[li++] = i;
            else rightIdx[ri++] = i;
        }

        node.feature = bestFeature;
        node.threshold = bestThreshold;
        node.left = grow(x, y, leftIdx, depth + 1, rng, importance);
        node.right = grow(x, y, rightIdx, depth + 1, rng, importance);
        return node;
    }

    private int[] sampleFeatures(int d, Random rng) {
        int[] all = new int[d];
        for (int j = 0; j < d; j++) all[j] = j;
        int k = Math.min(mtry, d);
        for (int j = 0; j < k; j++) {
            int swap = j + rng.nextInt(d - j);
            int tmp = all[j];
            all[j] = all[swap];
            all[swap] = tmp;
        }
        int[] chosen = new int[k];
        System.arraycopy(all, 0, chosen, 0, k);
        return chosen;
    }

    private static double gini(int positives, int n) {
        double p = (double) positives / n;
        return 2.0 * p * (1.0 - p);
    }

    /** In-place quicksort of values, applying the same swaps to order. */
    private static void sortByValue(double[] values, int[] order, int lo, int hi) {
        while (lo < hi) {
            double pivot = values[(lo + hi) >>> 1];
            int i = lo;
            int j = hi;
            while (i <= j) {
                while (values[i] < pivot) i++;
                while (values[j] > pivot) j--;
                if (i <= j) {
                    double tv = values[i];
                    values[i] = values[j];
                    values[j] = tv;
                    int to = order[i];
                    order[i] = order[j];
                    order[j] = to;
                    i++;
                    j--;
                }
            }
            // Recurse into the smaller half to keep stack depth logarithmic
            if (j - lo < hi - i) {
                sortByValue(values, order, lo, j);
                lo = i;
            } else {
                sortByValue(values, order, i, hi);
                hi = j;
            }
        }
    }
}

