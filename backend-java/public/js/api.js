/**
 * ==========================================================================
 * AgroPulse Unified API & Data Access Layer
 * ==========================================================================
 * Connects to live Java backend endpoints with graceful offline mock fallbacks.
 * Documented with expected URLs, methods, request bodies, and response JSON shapes.
 */

(function (window) {
  "use strict";

  const AgroPulse = window.AgroPulse || {};
  window.AgroPulse = AgroPulse;

  // Toggle for testing offline mock state
  let USE_MOCK = false;

  const API_BASE = (window.location.protocol.startsWith("http") && !window.location.host.includes("github.io"))
    ? ""
    : "https://smart-irrigation-ml-model-1.onrender.com";

  /**
   * Generic Authenticated API Fetch Wrapper
   */
  async function request(path, options = {}) {
    if (USE_MOCK) {
      throw new Error("USE_MOCK_ACTIVE");
    }

    const headers = options.headers || {};
    if (!headers["Content-Type"] && !(options.body instanceof FormData)) {
      headers["Content-Type"] = "application/json";
    }

    const token = AgroPulse.getToken ? AgroPulse.getToken() : localStorage.getItem("token");
    if (token) {
      headers["Authorization"] = "Bearer " + token;
    }

    const response = await fetch(API_BASE + path, {
      ...options,
      headers,
      credentials: "same-origin"
    });

    if (response.status === 401) {
      if (typeof AgroPulse.logout === "function") {
        AgroPulse.logout();
      }
      throw new Error("Session expired. Please sign in again.");
    }

    let data = {};
    try {
      data = await response.json();
    } catch (e) {
      data = {};
    }

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}: Request failed`);
    }

    return data;
  }

  // ==========================================================================
  // 1. SENSOR TELEMETRY API
  // ==========================================================================

  /**
   * Fetch Latest Capacitive Field Probe #1 Reading
   * Endpoint: GET /api/sensors/latest
   * Expected Response: {
   *   "id": 105,
   *   "soil_moisture": 42.5,
   *   "temperature": 28.0,
   *   "humidity": 60.0,
   *   "rainfall_prob": 10.0,
   *   "recorded_at": "2026-11-04 09:44:00"
   * }
   */
  async function getLatestSensorReading() {
    try {
      return await request("/api/sensors/latest");
    } catch (err) {
      return mockLatestSensor();
    }
  }

  /**
   * Fetch Historical Sensor Telemetry
   * Endpoint: GET /api/sensors/history?limit={limit}
   * Expected Response: Array of sensor objects sorted newest first
   */
  async function getSensorHistory(limit = 50) {
    try {
      const data = await request(`/api/sensors/history?limit=${limit}`);
      return Array.isArray(data) ? data : (data.records || []);
    } catch (err) {
      return mockSensorHistory(limit);
    }
  }

  /**
   * Trigger Simulated Probe Reading
   * Endpoint: POST /api/sensors/simulate
   * Expected Response: { "message": "Reading recorded", "reading": { ... } }
   */
  async function simulateSensorReading() {
    try {
      return await request("/api/sensors/simulate", { method: "POST" });
    } catch (err) {
      return { message: "Simulated mock reading recorded", reading: mockLatestSensor() };
    }
  }

  /**
   * Save / Get User Alert Thresholds
   * TODO (Backend):
   * URL: POST /api/sensors/thresholds
   * Method: POST
   * Request Body: { soilCritical: 35, tempMin: 20, tempMax: 34, humMin: 40, humMax: 75 }
   * Response JSON: { success: true, thresholds: { ... } }
   */
  async function getAlertThresholds() {
    try {
      const stored = localStorage.getItem("agropulse_thresholds");
      if (stored) return JSON.parse(stored);
    } catch (e) {}
    return {
      soilCritical: 35,
      tempMin: 20,
      tempMax: 34,
      humMin: 40,
      humMax: 75
    };
  }

  async function saveAlertThresholds(thresholds) {
    try {
      localStorage.setItem("agropulse_thresholds", JSON.stringify(thresholds));
      // Attempt live endpoint if available
      await request("/api/sensors/thresholds", {
        method: "POST",
        body: JSON.stringify(thresholds)
      }).catch(() => {});
      return { success: true, thresholds };
    } catch (e) {
      return { success: true, thresholds };
    }
  }

  // ==========================================================================
  // 2. IRRIGATION CONTROL API
  // ==========================================================================

  /**
   * Fetch Irrigation Pump State
   * Endpoint: GET /api/irrigation/status
   * Expected Response: {
   *   "status": "OFF",
   *   "mode": "auto",
   *   "confidence": 0.97,
   *   "triggered_by": "system",
   *   "started_at": null
   * }
   */
  async function getIrrigationStatus() {
    try {
      return await request("/api/irrigation/status");
    } catch (err) {
      return {
        status: "OFF",
        mode: "auto",
        confidence: 0.97,
        triggered_by: "system",
        started_at: null
      };
    }
  }

  /**
   * Actuate Pump State (ON / OFF)
   * Endpoint: POST /api/irrigation/toggle
   * Request Body: { "status": "ON" | "OFF", "duration_minutes": 15, "mode": "manual" | "auto" }
   * Expected Response: { "status": "ON", "message": "Pump activated" }
   */
  async function toggleIrrigation(status, durationMins = 15, mode = "manual") {
    try {
      const state = String(status).toUpperCase();
      return await request("/api/irrigation/toggle", {
        method: "POST",
        body: JSON.stringify({
          state: state,
          status: state,
          duration_minutes: durationMins,
          mode: mode
        })
      });
    } catch (err) {
      return { status, mode: "manual", message: `Mock pump switched ${status}` };
    }
  }

  /**
   * Fetch Irrigation History Log
   * Endpoint: GET /api/irrigation/history
   * Expected Response: Array of irrigation log records
   */
  async function getIrrigationHistory() {
    try {
      const data = await request("/api/irrigation/history");
      return Array.isArray(data) ? data : [];
    } catch (err) {
      return mockIrrigationHistory();
    }
  }

  // ==========================================================================
  // 3. ML PREDICTION API
  // ==========================================================================

  /**
   * Run Random Forest Irrigation Decision Model
   * Endpoint: POST /api/irrigation/predict
   * Optional Body: { soil_moisture: 42.5, temperature: 28.0, humidity: 60.0, rainfall_prob: 10.0 }
   * Expected Response: {
   *   "status": "OFF",
   *   "confidence": 0.9625,
   *   "model": "Random Forest",
   *   "water_quantity_liters": 0,
   *   "feature_importance": { "soil_moisture": 0.546, "rainfall_prob": 0.24, "drought_flag": 0.153 }
   * }
   */
  async function predictIrrigation(inputs = null) {
    try {
      const options = { method: "POST" };
      if (inputs) options.body = JSON.stringify(inputs);
      return await request("/api/irrigation/predict", options);
    } catch (err) {
      const sm = inputs ? Number(inputs.soil_moisture) : 42.5;
      const isON = sm < 35;
      return {
        status: isON ? "ON" : "OFF",
        confidence: 0.94,
        model: "Random Forest",
        water_quantity_liters: isON ? 450 : 0,
        feature_importance: {
          soil_moisture: 0.55,
          rainfall_prob: 0.22,
          drought_flag: 0.15,
          temperature: 0.04,
          humidity: 0.04
        }
      };
    }
  }

  // ==========================================================================
  // 4. CROP MANAGEMENT API (CropHandler.java)
  // ==========================================================================

  /**
   * Fetch Registered Crop Plots
   * Endpoint: GET /api/crops
   */
  async function getCropPlots() {
    try {
      const data = await request("/api/crops");
      const list = Array.isArray(data) ? data : (data.crops || []);
      if (list.length > 0) return list;
      return getStoredCropPlots();
    } catch (err) {
      return getStoredCropPlots();
    }
  }

  function getStoredCropPlots() {
    try {
      const saved = localStorage.getItem("agropulse_crop_plots");
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return [
      {
        id: 1,
        crop_name: "Tomato",
        variety: "Roma VF",
        field_plot: "Plot A-1",
        area_acres: 2.5,
        planting_date: "2026-09-15",
        growth_stage: "Vegetative",
        irrigation_status: "Optimal",
        notes: "Target moisture band 40-70%. Drip fertigation on alternating days."
      },
      {
        id: 2,
        crop_name: "Chilli",
        variety: "Guntur Sannam",
        field_plot: "Plot B-2",
        area_acres: 1.8,
        planting_date: "2026-08-20",
        growth_stage: "Flowering",
        irrigation_status: "Requires Irrigation",
        notes: "Flowering stage critical for soil moisture. Sensitive to thermal stress."
      },
      {
        id: 3,
        crop_name: "Cotton",
        variety: "Bt Hybrid",
        field_plot: "Plot C-1",
        area_acres: 4.2,
        planting_date: "2026-07-10",
        growth_stage: "Boll Development",
        irrigation_status: "Optimal",
        notes: "Deep root zone. Scheduled cycle every 48 hours."
      }
    ];
  }

  /**
   * Create New Crop Plot
   * Endpoint: POST /api/crops
   */
  async function createCropPlot(plotData) {
    try {
      const res = await request("/api/crops", {
        method: "POST",
        body: JSON.stringify(plotData)
      });
      return res;
    } catch (err) {
      const list = getStoredCropPlots();
      plotData.id = Date.now();
      list.unshift(plotData);
      localStorage.setItem("agropulse_crop_plots", JSON.stringify(list));
      return { id: plotData.id, message: "Crop registered locally" };
    }
  }

  /**
   * Update Existing Crop Plot
   * Endpoint: PUT /api/crops/{id}
   */
  async function updateCropPlot(id, plotData) {
    try {
      const res = await request(`/api/crops/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(plotData)
      });
      return res;
    } catch (err) {
      const list = getStoredCropPlots();
      const idx = list.findIndex(p => String(p.id) === String(id));
      if (idx >= 0) {
        list[idx] = { ...list[idx], ...plotData, id: id };
        localStorage.setItem("agropulse_crop_plots", JSON.stringify(list));
      }
      return { message: "Crop updated locally" };
    }
  }

  /**
   * Save Crop Plot (handles either Create or Update)
   */
  async function saveCropPlot(plotData) {
    if (plotData.id && String(plotData.id).trim() !== "") {
      return await updateCropPlot(plotData.id, plotData);
    } else {
      return await createCropPlot(plotData);
    }
  }

  /**
   * Delete Crop Plot
   * Endpoint: DELETE /api/crops/{id}
   */
  async function deleteCropPlot(id) {
    try {
      const res = await request(`/api/crops/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      return res;
    } catch (err) {
      let list = getStoredCropPlots();
      list = list.filter(p => String(p.id) !== String(id));
      localStorage.setItem("agropulse_crop_plots", JSON.stringify(list));
      return { message: "Crop deleted locally" };
    }
  }

  async function setCurrentCropPlot(id) {
    const list = getStoredCropPlots();
    list.forEach(p => { p.is_current = (String(p.id) === String(id)); });
    localStorage.setItem("agropulse_crop_plots", JSON.stringify(list));
    return { success: true, plots: list };
  }

  /**
   * Model Info Card
   * Endpoint: GET /api/irrigation/model
   */
  async function getModelInfo() {
    try {
      return await request("/api/irrigation/model");
    } catch (err) {
      return {
        model_name: "Random Forest Classifier",
        trees: 60,
        accuracy: 0.974,
        precision: 0.968,
        recall: 0.981,
        f1: 0.974,
        features: ["soil_moisture", "temperature", "humidity", "rainfall_prob"]
      };
    }
  }

  // ==========================================================================
  // REALISTIC MOCK DATA GENERATORS (Rule 1 & 2 fallback)
  // ==========================================================================

  function mockLatestSensor() {
    const now = new Date();
    const iso = now.toISOString().replace("T", " ").slice(0, 19);
    return {
      id: 9999,
      soil_moisture: 42.5,
      temperature: 28.2,
      humidity: 58.0,
      rainfall_prob: 12.0,
      recorded_at: iso
    };
  }

  function mockSensorHistory(count = 50) {
    const records = [];
    const now = new Date();
    for (let i = 0; i < count; i++) {
      const d = new Date(now.getTime() - i * 15 * 60 * 1000);
      const iso = d.toISOString().replace("T", " ").slice(0, 19);
      // Realistic sine variation
      const angle = (i / 10) * Math.PI;
      const moisture = Math.max(22, Math.min(68, 44 + Math.sin(angle) * 14 - (i * 0.15)));
      const temp = Math.max(18, Math.min(36, 28 + Math.cos(angle) * 4));
      const humidity = Math.max(40, Math.min(85, 62 - Math.sin(angle) * 12));
      const rain = i % 8 === 0 ? 35 : 10;

      records.push({
        id: 10000 - i,
        soil_moisture: Number(moisture.toFixed(1)),
        temperature: Number(temp.toFixed(1)),
        humidity: Number(humidity.toFixed(0)),
        rainfall_prob: rain,
        recorded_at: iso
      });
    }
    return records;
  }

  function mockIrrigationHistory() {
    const now = new Date();
    return [
      {
        id: 1,
        status: "OFF",
        mode: "auto",
        triggered_by: "system",
        confidence: 0.97,
        runtime_minutes: 15,
        created_at: new Date(now.getTime() - 2 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19)
      },
      {
        id: 2,
        status: "ON",
        mode: "auto",
        triggered_by: "Random Forest ML",
        confidence: 0.95,
        runtime_minutes: 20,
        created_at: new Date(now.getTime() - 14 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19)
      },
      {
        id: 3,
        status: "OFF",
        mode: "manual",
        triggered_by: "Operator",
        confidence: 1.0,
        runtime_minutes: 10,
        created_at: new Date(now.getTime() - 28 * 3600 * 1000).toISOString().replace("T", " ").slice(0, 19)
      }
    ];
  }

  // Expose API module
  AgroPulse.api = {
    setUseMock: (val) => { USE_MOCK = !!val; },
    getUseMock: () => USE_MOCK,
    getLatestSensorReading,
    getSensorHistory,
    simulateSensorReading,
    getAlertThresholds,
    saveAlertThresholds,
    getIrrigationStatus,
    toggleIrrigation,
    getIrrigationHistory,
    predictIrrigation,
    getCropPlots,
    createCropPlot,
    updateCropPlot,
    saveCropPlot,
    deleteCropPlot,
    setCurrentCropPlot,
    getModelInfo
  };

  // Compatibility alias
  AgroPulse.apiFetch = request;
})(window);

