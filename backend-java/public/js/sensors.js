/**
 * ==========================================================================
 * AgroPulse Sensor Monitoring - Specialized Controller
 * ==========================================================================
 */

(function () {
  "use strict";

  // State Management
  let chartInstance = null;
  let livePollingActive = true;
  let pollTimerId = null;
  let activePollLock = false;
  let backoffSequence = [5000, 10000, 30000];
  let backoffIndex = 0;
  let cachedReadings = []; // Capped at 200 items in memory
  let previousReading = null;
  let currentReading = null;
  let isStale = false;
  let chartLimit = 25;
  let seriesVisibility = { moisture: true, temp: true, humidity: true };
  let currentThresholds = {
    soilCritical: 35,
    tempMin: 20,
    tempMax: 34,
    humMin: 40,
    humMax: 75
  };

  // Table Filter and Pagination State
  let tableState = {
    searchStatus: "all",
    startDate: "",
    endDate: "",
    sortCol: "recorded_at",
    sortAsc: false,
    page: 1,
    pageSize: 10
  };

  /**
   * Initialize on Document Ready
   */
  document.addEventListener("DOMContentLoaded", async () => {
    if (typeof AgroPulse.requireAuth === "function") {
      AgroPulse.requireAuth();
    }

    // 1. Initialize Shell & Navigation
    AgroPulse.initShell(
      "sensors",
      "Sensor Monitoring",
      "Field probe health, real-time volumetric soil moisture readings, and historical telemetry."
    );

    // 2. Load Thresholds
    currentThresholds = await AgroPulse.api.getAlertThresholds();
    populateThresholdInputs(currentThresholds);

    // 3. Bind UI Event Listeners
    bindControls();

    // 4. Initial Fetch
    await fetchTelemetryCycle();

    // 5. Start Polling
    startPollingLoop();

    // 6. Handle Tab Visibility Change (Rule 6: Pause when hidden)
    AgroPulse.onTabVisibilityChange(
      () => {
        // Tab visible again: resume polling if live was active
        if (livePollingActive) {
          AgroPulse.updateLiveChip("live");
          fetchTelemetryCycle();
          startPollingLoop();
        }
      },
      () => {
        // Tab hidden: pause timer to save network & compute
        stopPollingLoop();
        AgroPulse.updateLiveChip("paused", "(Tab hidden)");
      }
    );
  });

  /**
   * Bind DOM Events (No inline onclick handlers, Rule 6)
   */
  function bindControls() {
    // Live Toggle Switch
    const liveToggle = document.getElementById("liveToggleBtn");
    if (liveToggle) {
      liveToggle.addEventListener("click", () => {
        livePollingActive = !livePollingActive;
        liveToggle.classList.toggle("active", livePollingActive);
        liveToggle.setAttribute("aria-checked", livePollingActive ? "true" : "false");
        const statusText = document.getElementById("liveStatusText");
        if (statusText) statusText.textContent = livePollingActive ? "Live" : "Paused";

        if (livePollingActive) {
          AgroPulse.updateLiveChip("live");
          backoffIndex = 0;
          fetchTelemetryCycle();
          startPollingLoop();
        } else {
          stopPollingLoop();
          AgroPulse.updateLiveChip("paused");
        }
      });
    }

    // Poll Now Button
    const pollNowBtn = document.getElementById("pollNowBtn");
    if (pollNowBtn) {
      pollNowBtn.addEventListener("click", handlePollNow);
    }

    // Chart Range Segmented Buttons (10 / 25 / 50)
    document.querySelectorAll(".chart-seg-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".chart-seg-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        chartLimit = parseInt(btn.dataset.limit, 10) || 25;
        updateChartAndSummary();
      });
    });

    // Series Toggle Pills (Moisture, Temp, Humidity)
    document.querySelectorAll(".series-pill-btn").forEach((pill) => {
      pill.addEventListener("click", () => {
        const seriesKey = pill.dataset.series;
        if (!seriesKey) return;
        seriesVisibility[seriesKey] = !seriesVisibility[seriesKey];
        pill.classList.toggle("active", seriesVisibility[seriesKey]);
        updateChartAndSummary();
      });
    });

    // History Table Filters
    const statusSelect = document.getElementById("tableStatusFilter");
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => {
        tableState.searchStatus = e.target.value;
        tableState.page = 1;
        renderHistoryTable();
      });
    }

    const startDateInput = document.getElementById("tableStartDate");
    const endDateInput = document.getElementById("tableEndDate");
    if (startDateInput) {
      startDateInput.addEventListener("change", (e) => {
        tableState.startDate = e.target.value;
        tableState.page = 1;
        renderHistoryTable();
      });
    }
    if (endDateInput) {
      endDateInput.addEventListener("change", (e) => {
        tableState.endDate = e.target.value;
        tableState.page = 1;
        renderHistoryTable();
      });
    }

    // Export CSV Button
    const exportBtn = document.getElementById("exportCsvBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", handleExportCsv);
    }

    // Table Pagination
    const prevBtn = document.getElementById("pagePrevBtn");
    const nextBtn = document.getElementById("pageNextBtn");
    if (prevBtn) {
      prevBtn.addEventListener("click", () => {
        if (tableState.page > 1) {
          tableState.page--;
          renderHistoryTable();
        }
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", () => {
        const total = getFilteredRecords().length;
        const maxPage = Math.ceil(total / tableState.pageSize) || 1;
        if (tableState.page < maxPage) {
          tableState.page++;
          renderHistoryTable();
        }
      });
    }

    // Table Sort Headers
    document.querySelectorAll(".data-table th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.col;
        if (tableState.sortCol === col) {
          tableState.sortAsc = !tableState.sortAsc;
        } else {
          tableState.sortCol = col;
          tableState.sortAsc = true;
        }
        renderHistoryTable();
      });
    });

    // Thresholds Form
    const thresholdForm = document.getElementById("thresholdsForm");
    if (thresholdForm) {
      thresholdForm.addEventListener("submit", handleSaveThresholds);
    }

    // Error Retry Button
    const retryBtn = document.getElementById("errorRetryBtn");
    if (retryBtn) {
      retryBtn.addEventListener("click", () => {
        document.getElementById("sensorsErrorState").style.display = "none";
        fetchTelemetryCycle();
      });
    }
  }

  /**
   * Polling Loop Engine with Exponential Backoff
   */
  function startPollingLoop() {
    stopPollingLoop();
    if (!livePollingActive || !AgroPulse.isTabVisible()) return;

    const delay = backoffSequence[backoffIndex] || 30000;
    pollTimerId = setTimeout(async () => {
      await fetchTelemetryCycle();
      startPollingLoop();
    }, delay);
  }

  function stopPollingLoop() {
    if (pollTimerId) {
      clearTimeout(pollTimerId);
      pollTimerId = null;
    }
  }

  /**
   * Main Telemetry Fetch Cycle
   */
  async function fetchTelemetryCycle() {
    if (activePollLock) return; // Prevent overlapping requests
    activePollLock = true;

    try {
      // 1. Fetch Latest Reading
      const latest = await AgroPulse.api.getLatestSensorReading();

      // Track previous reading for trend arrow calculations
      if (currentReading && latest && currentReading.id !== latest.id) {
        previousReading = currentReading;
      }
      currentReading = latest;
      isStale = false;

      // 2. Fetch Historical Records
      const history = await AgroPulse.api.getSensorHistory(200);
      if (Array.isArray(history) && history.length > 0) {
        cachedReadings = history.slice(0, 200); // Cap points at 200 items in memory
      } else if (latest) {
        cachedReadings = [latest];
      }

      // Reset backoff on success
      backoffIndex = 0;

      // Render UI Components
      renderKpis(currentReading, previousReading);
      updateChartAndSummary();
      renderHistoryTable();
      renderProbeStatus(currentReading);

      // Update Live Chip in Header
      const tsNice = AgroPulse.formatDate(currentReading.recorded_at).slice(12, 17);
      AgroPulse.updateLiveChip("live", tsNice);

      document.getElementById("sensorsErrorState").style.display = "none";
    } catch (err) {
      console.warn("Telemetry fetch error:", err);
      isStale = true;

      // Exponential backoff
      backoffIndex = Math.min(backoffSequence.length - 1, backoffIndex + 1);

      AgroPulse.updateLiveChip("offline");
      AgroPulse.showToast("Sensor connection interrupted. Showing cached telemetry.", "warning");

      if (currentReading) {
        renderKpis(currentReading, previousReading);
      } else {
        document.getElementById("sensorsErrorState").style.display = "flex";
      }
    } finally {
      activePollLock = false;
    }
  }

  /**
   * Handle "Poll Now" Manual Trigger
   */
  async function handlePollNow() {
    const btn = document.getElementById("pollNowBtn");
    if (!btn || btn.disabled) return;

    btn.disabled = true;
    const oldHtml = btn.innerHTML;
    btn.innerHTML = `
      <svg class="spin-animation" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
      </svg>
      <span>Polling...</span>
    `;

    try {
      await AgroPulse.api.simulateSensorReading();
      AgroPulse.showToast("Captured fresh field telemetry reading.", "success");
      await fetchTelemetryCycle();
    } catch (e) {
      AgroPulse.showToast("Failed to poll field probe: " + e.message, "error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = oldHtml;
    }
  }

  /**
   * Render Row 1: KPI Cards with Trends and Optimal Bands
   */
  function renderKpis(latest, prev) {
    if (!latest) return;

    const sm = Number(latest.soil_moisture);
    const temp = Number(latest.temperature);
    const hum = Number(latest.humidity);
    const updatedTime = AgroPulse.formatDate(latest.recorded_at);

    // 1. Soil Moisture KPI
    const moistValEl = document.getElementById("kpiMoistVal");
    const moistStatusEl = document.getElementById("kpiMoistStatus");
    const moistBarEl = document.getElementById("kpiMoistBar");
    const moistTrendEl = document.getElementById("kpiMoistTrend");
    const moistTimeEl = document.getElementById("kpiMoistTime");

    if (moistValEl) moistValEl.textContent = AgroPulse.formatNumber(sm, 1);
    if (moistTimeEl) moistTimeEl.textContent = isStale ? `${updatedTime} (stale)` : updatedTime;

    // Status logic: Optimal (35-75%), Low (<35%), High (>75%)
    let moistClass = "success";
    let moistLabel = "Optimal";
    if (sm < currentThresholds.soilCritical) {
      moistClass = "warning";
      moistLabel = "Low (Irrigation Advised)";
    } else if (sm > 75) {
      moistClass = "info";
      moistLabel = "High (Hold Irrigation)";
    }

    if (moistStatusEl) {
      moistStatusEl.className = `status-pill ${moistClass}`;
      moistStatusEl.innerHTML = `<span class="dot"></span><span>${moistLabel}</span>`;
    }

    if (moistBarEl) {
      moistBarEl.style.width = Math.max(0, Math.min(100, sm)) + "%";
      moistBarEl.style.background = moistClass === "warning" ? "var(--amber)" : (moistClass === "info" ? "var(--blue)" : "var(--green)");
    }

    if (moistTrendEl && prev && prev.soil_moisture != null) {
      const diff = sm - Number(prev.soil_moisture);
      renderTrendArrow(moistTrendEl, diff, "%");
    }

    // 2. Temperature KPI
    const tempValEl = document.getElementById("kpiTempVal");
    const tempStatusEl = document.getElementById("kpiTempStatus");
    const tempBarEl = document.getElementById("kpiTempBar");
    const tempTrendEl = document.getElementById("kpiTempTrend");
    const tempTimeEl = document.getElementById("kpiTempTime");

    if (tempValEl) tempValEl.textContent = AgroPulse.formatNumber(temp, 1);
    if (tempTimeEl) tempTimeEl.textContent = updatedTime;

    let tempClass = "success";
    let tempLabel = "Within Target (20-34°C)";
    if (temp < currentThresholds.tempMin) {
      tempClass = "info";
      tempLabel = "Cool (<20°C)";
    } else if (temp > currentThresholds.tempMax) {
      tempClass = "warning";
      tempLabel = "Warm (>34°C)";
    }

    if (tempStatusEl) {
      tempStatusEl.className = `status-pill ${tempClass}`;
      tempStatusEl.innerHTML = `<span class="dot"></span><span>${tempLabel}</span>`;
    }

    if (tempBarEl) {
      const pct = Math.max(0, Math.min(100, (temp / 50) * 100));
      tempBarEl.style.width = pct + "%";
      tempBarEl.style.background = tempClass === "warning" ? "var(--amber)" : "var(--green)";
    }

    if (tempTrendEl && prev && prev.temperature != null) {
      const diff = temp - Number(prev.temperature);
      renderTrendArrow(tempTrendEl, diff, "°C");
    }

    // 3. Humidity KPI
    const humValEl = document.getElementById("kpiHumVal");
    const humStatusEl = document.getElementById("kpiHumStatus");
    const humBarEl = document.getElementById("kpiHumBar");
    const humTrendEl = document.getElementById("kpiHumTrend");
    const humTimeEl = document.getElementById("kpiHumTime");

    if (humValEl) humValEl.textContent = Math.round(hum);
    if (humTimeEl) humTimeEl.textContent = updatedTime;

    let humClass = "info";
    let humLabel = "Atmospheric Balance";
    if (hum < currentThresholds.humMin) {
      humClass = "warning";
      humLabel = "Dry Air (<40%)";
    }

    if (humStatusEl) {
      humStatusEl.className = `status-pill ${humClass}`;
      humStatusEl.innerHTML = `<span class="dot"></span><span>${humLabel}</span>`;
    }

    if (humBarEl) {
      humBarEl.style.width = Math.max(0, Math.min(100, hum)) + "%";
      humBarEl.style.background = "var(--blue)";
    }

    if (humTrendEl && prev && prev.humidity != null) {
      const diff = hum - Number(prev.humidity);
      renderTrendArrow(humTrendEl, diff, "%");
    }
  }

  function renderTrendArrow(element, diff, unit) {
    if (Math.abs(diff) < 0.1) {
      element.className = "kpi-trend neutral";
      element.textContent = "→ 0.0" + unit;
    } else if (diff > 0) {
      element.className = "kpi-trend up";
      element.textContent = `↑ +${diff.toFixed(1)}${unit}`;
    } else {
      element.className = "kpi-trend down";
      element.textContent = `↓ ${diff.toFixed(1)}${unit}`;
    }
  }

  /**
   * Update Chart and Summary Pill Row
   */
  function updateChartAndSummary() {
    const rawSlice = cachedReadings.slice(0, chartLimit);
    // Sort chronologically (oldest to newest) for line chart
    const chronological = [...rawSlice].reverse();

    updateSummaryPills(rawSlice);
    renderTelemetryChart(chronological);
  }

  function updateSummaryPills(samples) {
    const summaryEl = document.getElementById("chartSummaryRow");
    if (!summaryEl) return;

    if (!samples || samples.length === 0) {
      summaryEl.textContent = "No telemetry samples loaded yet.";
      return;
    }

    const moistures = samples.map(s => Number(s.soil_moisture)).filter(v => !isNaN(v));
    if (moistures.length === 0) {
      summaryEl.textContent = "Awaiting field probe samples...";
      return;
    }

    const avg = moistures.reduce((a, b) => a + b, 0) / moistures.length;
    const min = Math.min(...moistures);
    const max = Math.max(...moistures);
    const belowCount = moistures.filter(m => m < currentThresholds.soilCritical).length;

    const statusNote = belowCount > 0
      ? `<span style="color:var(--amber); font-weight:600;">${belowCount} of ${moistures.length} readings below ${currentThresholds.soilCritical}% trigger</span>`
      : `<span style="color:var(--green); font-weight:600;">All ${moistures.length} samples in safe hydration horizon</span>`;

    summaryEl.innerHTML = `
      <span>Avg Moisture: <strong>${avg.toFixed(1)}%</strong></span>
      <span>&middot;</span>
      <span>Range: <strong>${min.toFixed(1)}% - ${max.toFixed(1)}%</strong></span>
      <span>&middot;</span>
      <span>${statusNote}</span>
    `;
  }

  function renderTelemetryChart(sortedSamples) {
    const canvas = document.getElementById("realtimeChartCanvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");

    if (chartInstance) chartInstance.destroy();

    const labels = sortedSamples.map((r, i) => {
      if (r.recorded_at && r.recorded_at.length >= 16) {
        return r.recorded_at.slice(11, 16);
      }
      return `T-${sortedSamples.length - i}`;
    });

    const moistData = sortedSamples.map(r => Number(r.soil_moisture));
    const tempData = sortedSamples.map(r => Number(r.temperature));
    const humData = sortedSamples.map(r => Number(r.humidity));

    // Gradients
    const moistGrad = ctx.createLinearGradient(0, 0, 0, 240);
    moistGrad.addColorStop(0, "rgba(15, 138, 75, 0.16)");
    moistGrad.addColorStop(1, "rgba(15, 138, 75, 0.01)");

    const tempGrad = ctx.createLinearGradient(0, 0, 0, 240);
    tempGrad.addColorStop(0, "rgba(224, 160, 48, 0.14)");
    tempGrad.addColorStop(1, "rgba(224, 160, 48, 0.01)");

    const humGrad = ctx.createLinearGradient(0, 0, 0, 240);
    humGrad.addColorStop(0, "rgba(47, 107, 255, 0.12)");
    humGrad.addColorStop(1, "rgba(47, 107, 255, 0.01)");

    const datasets = [];

    // 1. Soil Moisture
    if (seriesVisibility.moisture) {
      datasets.push({
        label: "Soil Moisture (%)",
        data: moistData,
        borderColor: "#0F8A4B",
        backgroundColor: moistGrad,
        tension: 0.4,
        fill: true,
        borderWidth: 2,
        pointRadius: 2.5,
        pointHoverRadius: 5,
        pointBackgroundColor: "#0F8A4B"
      });

      // 35% Trigger Line shows when soil moisture is enabled
      datasets.push({
        label: "35% Irrigation Trigger",
        data: labels.map(() => currentThresholds.soilCritical),
        borderColor: "#E0A030",
        borderDash: [5, 4],
        borderWidth: 1.5,
        pointRadius: 0,
        fill: false
      });
    }

    // 2. Temperature
    if (seriesVisibility.temp) {
      datasets.push({
        label: "Temperature (°C)",
        data: tempData,
        borderColor: "#E0A030",
        backgroundColor: tempGrad,
        tension: 0.4,
        fill: true,
        borderWidth: 1.75,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: "#E0A030"
      });
    }

    // 3. Humidity
    if (seriesVisibility.humidity) {
      datasets.push({
        label: "Humidity (% RH)",
        data: humData,
        borderColor: "#2F6BFF",
        backgroundColor: humGrad,
        tension: 0.4,
        fill: true,
        borderWidth: 1.75,
        pointRadius: 2,
        pointHoverRadius: 4,
        pointBackgroundColor: "#2F6BFF"
      });
    }

    chartInstance = new Chart(ctx, {
      type: "line",
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: {
          duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350
        },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false }, // Controlled via our series pill buttons
          tooltip: {
            backgroundColor: "rgba(26, 26, 26, 0.9)",
            titleFont: { family: "Inter", size: 12 },
            bodyFont: { family: "Inter", size: 11.5 },
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: "#ECECEC" },
            ticks: { font: { family: "Inter", size: 11 }, color: "#8A8A8A" }
          },
          x: {
            grid: { display: false },
            ticks: { font: { family: "Inter", size: 11 }, color: "#8A8A8A" }
          }
        }
      }
    });
  }

  /**
   * Filter and Sort Sensor History Records
   */
  function getFilteredRecords() {
    let list = [...cachedReadings];

    // Status filter
    if (tableState.searchStatus !== "all") {
      list = list.filter((r) => {
        const sm = Number(r.soil_moisture);
        if (tableState.searchStatus === "optimal") return sm >= 35 && sm <= 75;
        if (tableState.searchStatus === "low") return sm < 35;
        if (tableState.searchStatus === "high") return sm > 75;
        return true;
      });
    }

    // Date range filter
    if (tableState.startDate) {
      list = list.filter(r => r.recorded_at && r.recorded_at.slice(0, 10) >= tableState.startDate);
    }
    if (tableState.endDate) {
      list = list.filter(r => r.recorded_at && r.recorded_at.slice(0, 10) <= tableState.endDate);
    }

    // Sorting
    list.sort((a, b) => {
      let valA = a[tableState.sortCol];
      let valB = b[tableState.sortCol];

      if (typeof valA === "string") {
        const cmp = valA.localeCompare(valB || "");
        return tableState.sortAsc ? cmp : -cmp;
      }
      valA = Number(valA || 0);
      valB = Number(valB || 0);
      return tableState.sortAsc ? valA - valB : valB - valA;
    });

    return list;
  }

  /**
   * Render Row 3: Sensor History Table with Pagination
   */
  function renderHistoryTable() {
    const tbody = document.querySelector("#historyTable tbody");
    const emptyState = document.getElementById("tableEmptyState");
    const countSummary = document.getElementById("tableCountSummary");
    const pageNumEl = document.getElementById("pageCurrentNum");

    if (!tbody) return;

    const filtered = getFilteredRecords();
    const totalCount = filtered.length;

    if (totalCount === 0) {
      tbody.innerHTML = "";
      if (emptyState) emptyState.style.display = "flex";
      if (countSummary) countSummary.textContent = "Showing 0 records";
      if (pageNumEl) pageNumEl.textContent = "Page 1 of 1";
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    const totalPages = Math.ceil(totalCount / tableState.pageSize) || 1;
    if (tableState.page > totalPages) tableState.page = totalPages;

    const startIdx = (tableState.page - 1) * tableState.pageSize;
    const endIdx = Math.min(startIdx + tableState.pageSize, totalCount);
    const pageRows = filtered.slice(startIdx, endIdx);

    tbody.innerHTML = pageRows.map((r) => {
      const sm = Number(r.soil_moisture);
      const temp = Number(r.temperature);
      const hum = Number(r.humidity);

      let badgeClass = "success";
      let badgeLabel = "Optimal";
      if (sm < currentThresholds.soilCritical) {
        badgeClass = "warning";
        badgeLabel = "Low";
      } else if (sm > 75) {
        badgeClass = "info";
        badgeLabel = "High";
      }

      return `
        <tr>
          <td>${AgroPulse.formatDate(r.recorded_at)}</td>
          <td class="num">${AgroPulse.formatNumber(sm, 1, "%")}</td>
          <td class="num">${AgroPulse.formatNumber(temp, 1, "°C")}</td>
          <td class="num">${AgroPulse.formatNumber(hum, 0, "% RH")}</td>
          <td><span class="status-pill ${badgeClass}"><span class="dot"></span>${badgeLabel}</span></td>
        </tr>
      `;
    }).join("");

    if (countSummary) {
      countSummary.textContent = `Showing ${startIdx + 1}-${endIdx} of ${totalCount}`;
    }
    if (pageNumEl) {
      pageNumEl.textContent = `Page ${tableState.page} of ${totalPages}`;
    }
  }

  /**
   * Render Probe Status Card
   */
  function renderProbeStatus(latest) {
    const statusVal = document.getElementById("probeStatusState");
    const lastTimeVal = document.getElementById("probeLastReadingTime");
    const sourceVal = document.getElementById("probeDataSource");

    if (statusVal) {
      statusVal.innerHTML = isStale
        ? `<span class="stale-badge">Stale Connection</span>`
        : `<span class="status-pill success"><span class="dot"></span>Online</span>`;
    }

    if (lastTimeVal) {
      lastTimeVal.textContent = latest ? AgroPulse.formatDate(latest.recorded_at) : "--";
    }

    if (sourceVal) {
      sourceVal.textContent = "Capacitive Probe #1 (Plot A-1)";
    }
  }

  /**
   * Populate Threshold Input Form
   */
  function populateThresholdInputs(t) {
    const soilCrit = document.getElementById("threshSoilCrit");
    const tempMin = document.getElementById("threshTempMin");
    const tempMax = document.getElementById("threshTempMax");
    const humMin = document.getElementById("threshHumMin");
    const humMax = document.getElementById("threshHumMax");

    if (soilCrit) soilCrit.value = t.soilCritical || 35;
    if (tempMin) tempMin.value = t.tempMin || 20;
    if (tempMax) tempMax.value = t.tempMax || 34;
    if (humMin) humMin.value = t.humMin || 40;
    if (humMax) humMax.value = t.humMax || 75;
  }

  /**
   * Save Thresholds Handler with Validation
   */
  async function handleSaveThresholds(e) {
    e.preventDefault();

    const soilCrit = Number(document.getElementById("threshSoilCrit").value);
    const tempMin = Number(document.getElementById("threshTempMin").value);
    const tempMax = Number(document.getElementById("threshTempMax").value);
    const humMin = Number(document.getElementById("threshHumMin").value);
    const humMax = Number(document.getElementById("threshHumMax").value);
    const errBox = document.getElementById("thresholdsError");

    // Validation
    if (isNaN(soilCrit) || soilCrit < 5 || soilCrit > 90) {
      showError("Critical moisture must be between 5% and 90%.");
      return;
    }
    if (tempMin >= tempMax) {
      showError("Minimum temperature must be strictly less than maximum temperature.");
      return;
    }
    if (humMin >= humMax) {
      showError("Minimum humidity must be strictly less than maximum humidity.");
      return;
    }

    if (errBox) errBox.classList.remove("show");

    currentThresholds = {
      soilCritical: soilCrit,
      tempMin: tempMin,
      tempMax: tempMax,
      humMin: humMin,
      humMax: humMax
    };

    await AgroPulse.api.saveAlertThresholds(currentThresholds);
    AgroPulse.showToast("Alert thresholds updated successfully.", "success");

    // Re-render KPI cards, chart, and table with updated thresholds
    if (currentReading) renderKpis(currentReading, previousReading);
    updateChartAndSummary();
    renderHistoryTable();

    function showError(msg) {
      if (errBox) {
        errBox.textContent = msg;
        errBox.classList.add("show");
      } else {
        AgroPulse.showToast(msg, "error");
      }
    }
  }

  /**
   * Handle CSV Export of Filtered Records
   */
  function handleExportCsv() {
    const filtered = getFilteredRecords();
    if (!filtered || filtered.length === 0) {
      AgroPulse.showToast("No records to export.", "warning");
      return;
    }

    const headers = [
      "Measurement Timestamp",
      "Soil Moisture (%)",
      "Temperature (°C)",
      "Relative Humidity (% RH)",
      "Rainfall Probability (%)",
      "Moisture Status"
    ];

    const rows = filtered.map((r) => {
      const sm = Number(r.soil_moisture);
      let status = "Optimal";
      if (sm < currentThresholds.soilCritical) status = "Low";
      else if (sm > 75) status = "High";

      return [
        r.recorded_at || "",
        sm.toFixed(1),
        Number(r.temperature || 0).toFixed(1),
        Math.round(Number(r.humidity || 0)),
        Math.round(Number(r.rainfall_prob || 0)),
        status
      ];
    });

    const dateStr = new Date().toISOString().slice(0, 10);
    AgroPulse.downloadCsv(`agropulse-sensor-history-${dateStr}.csv`, headers, rows);
    AgroPulse.showToast(`Exported ${filtered.length} rows to CSV.`, "success");
  }

  // Inject CSS Keyframe for Spinners
  (function injectSpinner() {
    const s = document.createElement("style");
    s.textContent = `@keyframes spin{100%{transform:rotate(360deg)}} .spin-animation{animation:spin 1s linear infinite;}`;
    document.head.appendChild(s);
  })();
})();

