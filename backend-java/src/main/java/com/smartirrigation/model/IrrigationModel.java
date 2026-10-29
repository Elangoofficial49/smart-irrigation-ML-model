package com.smartirrigation.model;

import java.util.Locale;

import com.smartirrigation.util.Json;

/**
 * Irrigation decision model used by the API.
 *
 * Pipeline (runs once at server start):
 *   1. Build a labelled dataset (10,000 samples, see {@link TrainingData}).
 *   2. Shuffle and split 80% train / 20% test.
 *   3. Train a Logistic Regression baseline and a Random Forest.
 *   4. Evaluate both on the unseen test set (accuracy, precision, recall, F1, ROC-AUC).
 *   5. Serve predictions from the Random Forest, with agronomic safety limits on top.
 *
 * Inputs: soil moisture (%), temperature (°C), humidity (%), rain probability (%),
 * plus two engineered features (evapotranspiration stress, drought flag).
 * Output: 1 = irrigate (pump ON), 0 = hold (pump OFF).
 */
public class IrrigationModel {

    private static final int N_SAMPLES = 10000;
    private static final double TEST_FRACTION = 0.2;
    private static final long SEED = 2026L;

    // Random Forest hyperparameters
    private static final int RF_TREES = 60;
    private static final int RF_MAX_DEPTH = 12;
    private static final int RF_MIN_SAMPLES_LEAF = 5;
    private static final int RF_MTRY = 3; // features tried per split (about half of 6)

    private final LogisticRegressionModel baseline = new LogisticRegressionModel();
    private final RandomForestModel forest =
            new RandomForestModel(RF_TREES, RF_MAX_DEPTH, RF_MIN_SAMPLES_LEAF, RF_MTRY, SEED);

    private Classifier active;
    private ModelMetrics baselineMetrics;
    private ModelMetrics forestMetrics;
    private int trainSize;
    private int testSize;

    public void train() {
        TrainingData data = TrainingData.synthetic(N_SAMPLES, SEED);
        TrainingData[] parts = data.split(TEST_FRACTION, SEED);
        TrainingData train = parts[0];
        TrainingData test = parts[1];
        trainSize = train.size();
        testSize = test.size();

        TrainingData.exportCsv(new java.io.File("../database/training_dataset.csv"), train, test);
        TrainingData.exportCsv(new java.io.File("public/training_dataset.csv"), train, test);

        baselineMetrics = fitAndEvaluate(baseline, train, test);
        forestMetrics = fitAndEvaluate(forest, train, test);
        active = forest;

        printReport(data, train, test);
    }

    private static ModelMetrics fitAndEvaluate(Classifier classifier, TrainingData train, TrainingData test) {
        long start = System.nanoTime();
        classifier.fit(train.x, train.y);
        long millis = (System.nanoTime() - start) / 1_000_000;
        return ModelMetrics.evaluate(classifier, test, millis);
    }

    /**
     * Predicts whether automated irrigation should run.
     * @return double[]{ predictedClass (0 = HOLD, 1 = IRRIGATE), confidence (0.0 - 1.0), evapotranspirationStress }
     */
    public double[] predict(double soilMoisture, double temperature, double humidity, double rainfallProb) {
        double[] x = TrainingData.features(soilMoisture, temperature, humidity, rainfallProb);
        double probability = active.predictProba(x);

        // Agronomic safety limits always override the model
        if (soilMoisture >= 65.0 || rainfallProb >= 65.0) {
            probability = Math.min(probability, 0.08);
        } else if (soilMoisture <= 20.0 && rainfallProb < 50.0) {
            probability = Math.max(probability, 0.94);
        }

        int predictedClass = probability >= 0.5 ? 1 : 0;
        double confidence = predictedClass == 1 ? probability : 1.0 - probability;
        confidence = Math.round(confidence * 1000.0) / 1000.0;

        return new double[]{predictedClass, confidence, x[4]};
    }

    public String getActiveModelName() {
        return active == null ? "untrained" : active.name();
    }

    /** Test-set accuracy (%) of the model currently serving predictions. */
    public double getTestAccuracy() {
        ModelMetrics m = active == forest ? forestMetrics : baselineMetrics;
        return m == null ? 0 : m.accuracy * 100.0;
    }

    /** Full model card as JSON for the /api/irrigation/model endpoint. */
    public String modelInfoJson() {
        double[] importance = forest.getFeatureImportance();
        Json.Obj importanceJson = Json.obj();
        for (int j = 0; j < importance.length; j++) {
            importanceJson.put(TrainingData.FEATURE_NAMES[j], Math.round(importance[j] * 10000.0) / 10000.0);
        }

        String datasetJson = Json.obj()
                .put("source", "synthetic (FAO-56-inspired labels with simulated sensor noise)")
                .put("total_samples", trainSize + testSize)
                .put("train_samples", trainSize)
                .put("test_samples", testSize)
                .put("split", "shuffled 80/20 hold-out")
                .build();

        String hyperparamsJson = Json.obj()
                .put("trees", RF_TREES)
                .put("max_depth", RF_MAX_DEPTH)
                .put("min_samples_leaf", RF_MIN_SAMPLES_LEAF)
                .put("features_per_split", RF_MTRY)
                .build();

        String modelsJson = "[" + forestMetrics.toJson() + "," + baselineMetrics.toJson() + "]";

        return Json.obj()
                .put("active_model", getActiveModelName())
                .putRaw("dataset", datasetJson)
                .putRaw("hyperparameters", hyperparamsJson)
                .putRaw("models", modelsJson)
                .putRaw("feature_importance", importanceJson.build())
                .build();
    }

    private void printReport(TrainingData data, TrainingData train, TrainingData test) {
        System.out.println("[IrrigationModel] ------------------------------------------------------------");
        System.out.printf(Locale.ROOT, "[IrrigationModel] Dataset: %d samples (%.1f%% irrigate) -> train %d / test %d%n",
                data.size(), 100.0 * data.positives() / data.size(), train.size(), test.size());
        System.out.println("[IrrigationModel] Hold-out test results:");
        System.out.println("  Model                Accuracy Precision  Recall     F1  ROC-AUC    Train");
        System.out.println(forestMetrics.toTableRow());
        System.out.println(baselineMetrics.toTableRow());

        double[] importance = forest.getFeatureImportance();
        StringBuilder sb = new StringBuilder("[IrrigationModel] Random Forest feature importance:");
        for (int j = 0; j < importance.length; j++) {
            sb.append(String.format(Locale.ROOT, " %s=%.1f%%", TrainingData.FEATURE_NAMES[j], importance[j] * 100));
        }
        System.out.println(sb);
        System.out.println("[IrrigationModel] Active model: " + getActiveModelName());
        System.out.println("[IrrigationModel] ------------------------------------------------------------");
    }
}
