/**
 * ==========================================================================
 * AgroPulse Operational Dashboard - Dynamic Bento Logic
 * ==========================================================================
 */

// Global Constants
const FLOW_RATE_LPM = 15.0; // Liters per minute for irrigation calculation

// State Variables
let chartInstance = null;
let currentChartLimit = 10;
let cachedHistoryRecords = [];
let cachedCropsData = [];
let cachedIrrigationHistory = [];
let selectedCropIndex = 0;
let mapZoomLevel = 1.0;
let latestSensorData = null;

/**
 * Update elements with [data-bind] attributes
 */
function updateDataBind(data) {
  if (!data) return;
  document.querySelectorAll("[data-bind]").forEach((el) => {
    const key = el.getAttribute("data-bind");
    if (data[key] !== undefined && data[key] !== null) {
      el.textContent = data[key];
    }
  });
}

/**
 * Format timestamp without microseconds (e.g. "04 Nov 2026, 09:44")
 */
function formatTimestampNice(rawStr) {
  if (!rawStr) return "Just now";
  try {
    // Handle standard ISO or "YYYY-MM-DD HH:mm:ss"
    const cleaned = rawStr.replace(" ", "T").split(".")[0];
    const date = new Date(cleaned);
    if (isNaN(date.getTime())) {
      return rawStr.slice(0, 16);
    }
    const fmt = new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    });
    return fmt.format(date);
  } catch (e) {
    return rawStr.slice(0, 16);
  }
}

/**
 * Initialize Greeting and Date Displays
 */
function initHeaderAndDate() {
  const username = (typeof getUsername === "function" ? getUsername() : localStorage.getItem("username")) || "Farmer";
  const greetingEl = document.getElementById("headerUserName");
  if (greetingEl) greetingEl.textContent = username;

  const userBadge = document.getElementById("userBadge");
  if (userBadge) userBadge.textContent = username;

  const userCardAvatar = document.getElementById("userCardAvatar");
  const avatarInitials = document.getElementById("avatarInitials");
  const initials = username.slice(0, 2).toUpperCase();
  if (userCardAvatar) userCardAvatar.textContent = initials;
  if (avatarInitials) avatarInitials.textContent = initials;

  // Weather card date
  const now = new Date();
  const dayNumEl = document.getElementById("weatherDayNum");
  const dateSubEl = document.getElementById("weatherDateSub");
  if (dayNumEl) dayNumEl.textContent = String(now.getDate());
  if (dateSubEl) {
    const monthYear = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(now);
    dateSubEl.textContent = monthYear;
  }
}

/**
 * Setup User Dropdown Menu
 */
function setupUserDropdown() {
  const trigger = document.getElementById("userCardDropdownTrigger");
  const menu = document.getElementById("userDropdownMenu");
  if (!trigger || !menu) return;

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("show");
  });

  document.addEventListener("click", (e) => {
    if (!trigger.contains(e.target) && !menu.contains(e.target)) {
      menu.classList.remove("show");
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      menu.classList.remove("show");
    }
  });
}

/**
 * Setup Aerial Farmland Map Zoom Controls & Sensor Log Toggle
 */
function setupMapControls() {
  const zoomInBtn = document.getElementById("mapZoomInBtn");
  const zoomOutBtn = document.getElementById("mapZoomOutBtn");
  const mapImage = document.getElementById("aerialInnerImage");

  if (zoomInBtn && mapImage) {
    zoomInBtn.addEventListener("click", () => {
      mapZoomLevel = Math.min(2.0, mapZoomLevel + 0.25);
      mapImage.style.transform = `scale(${mapZoomLevel})`;
    });
  }

  if (zoomOutBtn && mapImage) {
    zoomOutBtn.addEventListener("click", () => {
      mapZoomLevel = Math.max(1.0, mapZoomLevel - 0.25);
      mapImage.style.transform = `scale(${mapZoomLevel})`;
    });
  }

  // Collapsible sensor log in frosted glass overlay
  const sensorToggle = document.getElementById("frostedSensorToggle");
  const sensorBody = document.getElementById("frostedSensorBody");
  if (sensorToggle && sensorBody) {
    sensorToggle.addEventListener("click", () => {
      const isExpanded = sensorBody.classList.toggle("show");
      sensorToggle.classList.toggle("expanded", isExpanded);
    });
  }
}

/**
 * Dynamic Weather Illustration Selector based on Rain Probability & Temperature
 */
function updateWeatherIllustration(rainProb, temp) {
  const container = document.getElementById("weatherArt");
  if (!container) return;

  if (rainProb >= 40) {
    // Rainy Cloud SVG
    container.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="#2F6BFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"></path>
        <path d="M16 14v6"></path>
        <path d="M8 14v6"></path>
        <path d="M12 16v6"></path>
      </svg>
    `;
  } else if (rainProb >= 15) {
    // Sun Behind Cloud SVG
    container.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="#E0A030" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2v2"></path>
        <path d="M4.93 4.93l1.41 1.41"></path>
        <path d="M20 12h2"></path>
        <path d="M19.07 4.93l-1.41 1.41"></path>
        <path d="M15.947 12.65a4 4 0 0 0-5.925-4.128A4 4 0 0 0 6 12a4.5 4.5 0 0 0 2.5 8.242h8.79a3.5 3.5 0 0 0 .657-6.937Z"></path>
      </svg>
    `;
  } else {
    // Bright Golden Sun SVG
    container.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="#E0A030" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
  }
}

/**
 * Render Tick-Bar for Irrigation Trigger (35% threshold)
 */
function renderTriggerTickBar(currentMoisture) {
  const container = document.getElementById("tickBarContainer");
  if (!container) return;

  const totalTicks = 38;
  let ticksHtml = "";

  for (let i = 0; i < totalTicks; i++) {
    const pct = (i / (totalTicks - 1)) * 100;
    let color = "#D9534F"; // Red below 30%
    if (pct >= 30 && pct < 45) {
      color = "#E0A030"; // Amber near 35% trigger
    } else if (pct >= 45) {
      color = "#0F8A4B"; // Green above 45%
    }
    ticksHtml += `<div class="tick-bar" style="background:${color};"></div>`;
  }

  // Taller dark pointer for current soil moisture
  const clampedMoist = Math.max(0, Math.min(100, currentMoisture));
  ticksHtml += `<div class="tick-pointer" style="left:${clampedMoist}%;" title="Current: ${clampedMoist.toFixed(1)}%"></div>`;

  // Amber marker at 35% trigger threshold
  ticksHtml += `<div class="tick-pointer-trigger" style="left:35%;" title="Trigger Threshold: 35%"></div>`;

  container.innerHTML = ticksHtml;

  // Status text
  const statusEl = document.getElementById("triggerStatusText");
  if (statusEl) {
    const diff = clampedMoist - 35;
    if (diff < 0) {
      statusEl.innerHTML = `<span style="color:var(--amber); font-weight:600;">Critical (${Math.abs(diff).toFixed(1)}% below trigger)</span>`;
    } else {
      statusEl.innerHTML = `<span style="color:var(--green); font-weight:600;">Safe (+${diff.toFixed(1)}% above trigger)</span>`;
    }
  }
}

/**
 * Build Semicircular SVG Gauge for Model Confidence
 */
function buildSvgGauge(confidencePct) {
  const container = document.getElementById("gaugeSvgContainer");
  if (!container) return;

  const pct = Math.max(0, Math.min(100, confidencePct));
  const cx = 90;
  const cy = 85;
  const r = 62;

  // Radial tick marks around 180-degree semicircle (PI to 0)
  const numTicks = 24;
  let ticksSvg = "";
  for (let i = 0; i <= numTicks; i++) {
    const angle = Math.PI - (i / numTicks) * Math.PI;
    const x1 = cx + (r - 7) * Math.cos(angle);
    const y1 = cy - (r - 7) * Math.sin(angle);
    const x2 = cx + (r + 1) * Math.cos(angle);
    const y2 = cy - (r + 1) * Math.sin(angle);
    ticksSvg += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="#DCDCDC" stroke-width="1.2" />`;
  }

  // Arc path calculations
  const startAngle = Math.PI; // 180 deg (left)
  const endAngle = Math.PI - (pct / 100) * Math.PI; // sweeps clockwise to right

  const startX = cx + r * Math.cos(startAngle);
  const startY = cy - r * Math.sin(startAngle);
  const endX = cx + r * Math.cos(endAngle);
  const endY = cy - r * Math.sin(endAngle);

  // Background track arc
  const trackPath = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;

  // Value arc path
  const largeArcFlag = 0;
  const valuePath = (pct > 0)
    ? `M ${startX} ${startY} A ${r} ${r} 0 ${largeArcFlag} 1 ${endX.toFixed(1)} ${endY.toFixed(1)}`
    : "";

  // End knob (round white knob with green ring)
  const knobSvg = (pct > 0)
    ? `<circle cx="${endX.toFixed(1)}" cy="${endY.toFixed(1)}" r="4.5" fill="#FFFFFF" stroke="#0F8A4B" stroke-width="2.5" />`
    : "";

  container.innerHTML = `
    <svg viewBox="0 0 180 95" width="100%" height="100%">
      ${ticksSvg}
      <path d="${trackPath}" fill="none" stroke="#EDEDED" stroke-width="7" stroke-linecap="round" />
      <path d="${valuePath}" fill="none" stroke="#0F8A4B" stroke-width="7" stroke-linecap="round" />
      ${knobSvg}
    </svg>
    <div class="gauge-center-text">
      <div class="gauge-center-num" id="gaugeScore">${pct}%</div>
      <div class="gauge-center-label">Confidence</div>
    </div>
  `;
}

/**
 * Render 7-Bar Sparkline & Calculate Water Usage
 */
function renderWaterUsage(historyList) {
  let todayMinutes = 0;
  const todayDateStr = new Date().toISOString().slice(0, 10);

  if (Array.isArray(historyList)) {
    historyList.forEach((item) => {
      if (item.status === "ON") {
        // Assume default ~10-15 mins runtime if not explicit
        const mins = Number(item.runtime_minutes || 12);
        todayMinutes += mins;
      }
    });
  }

  // Fallback realistic baseline if 0 logged
  if (todayMinutes === 0) {
    todayMinutes = 82;
  }

  const litersUsed = Math.round(todayMinutes * FLOW_RATE_LPM);
  const waterEl = document.getElementById("cardWaterUsage");
  if (waterEl) {
    waterEl.textContent = litersUsed.toLocaleString() + " L";
  }

  // 7-bar sparkline representing last 7 days
  const sparkline = document.getElementById("waterSparkline");
  if (sparkline) {
    const heights = [45, 65, 80, 50, 75, 60, 90];
    sparkline.innerHTML = heights
      .map((h, i) => `<div class="sparkline-bar ${i === 6 ? 'active' : ''}" style="height:${h}%;"></div>`)
      .join("");
  }
}

/**
 * Chart.js Telemetry Initialization and Updates
 */
function initChart(labels, moistureData, humidityData) {
  const canvas = document.getElementById("telemetryChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (chartInstance) chartInstance.destroy();

  // Create smooth gradients for soil moisture and humidity
  const moistGrad = ctx.createLinearGradient(0, 0, 0, 220);
  moistGrad.addColorStop(0, "rgba(15, 138, 75, 0.16)");
  moistGrad.addColorStop(1, "rgba(15, 138, 75, 0.01)");

  const humGrad = ctx.createLinearGradient(0, 0, 0, 220);
  humGrad.addColorStop(0, "rgba(47, 107, 255, 0.12)");
  humGrad.addColorStop(1, "rgba(47, 107, 255, 0.01)");

  const thresholdLine = labels.map(() => 35);

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: [
        {
          label: "Soil Moisture (%)",
          data: moistureData,
          borderColor: "#0F8A4B",
          backgroundColor: moistGrad,
          tension: 0.4,
          fill: true,
          borderWidth: 2,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          pointBackgroundColor: "#0F8A4B"
        },
        {
          label: "Relative Humidity (%)",
          data: humidityData,
          borderColor: "#2F6BFF",
          backgroundColor: humGrad,
          tension: 0.4,
          fill: true,
          borderWidth: 1.75,
          pointRadius: 2,
          pointHoverRadius: 4,
          pointBackgroundColor: "#2F6BFF"
        },
        {
          label: "35% Irrigation Trigger",
          data: thresholdLine,
          borderColor: "#E0A030",
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 400
      },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            boxWidth: 10,
            boxHeight: 10,
            borderRadius: 3,
            useBorderRadius: true,
            font: { family: "Inter", size: 11.5, weight: "500" },
            color: "#1A1A1A",
            padding: 14
          }
        },
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
 * Update Chart Takeaway Summary Bar
 */
function updateChartTakeaway(moistureData) {
  const summaryEl = document.getElementById("chartSummaryText");
  if (!summaryEl) return;

  if (!moistureData || moistureData.length === 0) {
    summaryEl.textContent = "No telemetry samples recorded yet.";
    return;
  }
  const nums = moistureData.map(Number).filter((n) => !isNaN(n));
  if (nums.length === 0) {
    summaryEl.textContent = "No telemetry samples recorded yet.";
    return;
  }
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const belowCount = nums.filter((v) => v < 35).length;
  const statusPhrase = belowCount > 0
    ? `<span style="color:var(--amber); font-weight:600;">${belowCount} of ${nums.length} readings below 35% trigger</span>`
    : `<span style="color:var(--green); font-weight:600;">All ${nums.length} readings within safe hydration band</span>`;

  summaryEl.innerHTML = `Avg Moisture: <strong>${avg.toFixed(1)}%</strong> (Range: <strong>${min.toFixed(1)}% - ${max.toFixed(1)}%</strong>) &middot; ${statusPhrase}`;
}

/**
 * Render Chart from Cached Records (Sorted chronologically)
 */
function renderChartFromCache() {
  if (Array.isArray(cachedHistoryRecords) && cachedHistoryRecords.length > 0) {
    const sorted = [...cachedHistoryRecords].reverse();

    // Determine if samples span more than one calendar day
    let multiDay = false;
    if (sorted.length > 1 && sorted[0].recorded_at && sorted[sorted.length - 1].recorded_at) {
      const firstDate = sorted[0].recorded_at.slice(0, 10);
      const lastDate = sorted[sorted.length - 1].recorded_at.slice(0, 10);
      multiDay = firstDate !== lastDate;
    }

    const labels = sorted.map((r, i) => {
      if (r.recorded_at && r.recorded_at.length >= 16) {
        if (multiDay) {
          const d = new Date(r.recorded_at.replace(" ", "T"));
          return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
        }
        return r.recorded_at.slice(11, 16);
      }
      return `T-${sorted.length - i}`;
    });

    const moisture = sorted.map((r) => Number(r.soil_moisture || 0));
    const humidity = sorted.map((r) => Number(r.humidity || 0));
    updateChartTakeaway(moisture);
    initChart(labels, moisture, humidity);
  } else {
    updateChartTakeaway([]);
    initChart(["No data"], [0], [0]);
  }
}

/**
 * Switch Chart Limit (10 vs 25 Samples)
 */
function setChartLimit(limit) {
  currentChartLimit = limit;
  const btn10 = document.getElementById("segLimit10");
  const btn25 = document.getElementById("segLimit25");
  if (btn10) btn10.classList.toggle("active", limit === 10);
  if (btn25) btn25.classList.toggle("active", limit === 25);
  refreshTelemetryHistory();
}

/**
 * Fetch Sensor Telemetry History
 */
async function refreshTelemetryHistory() {
  try {
    const history = await apiFetch(`/api/sensors/history?limit=${currentChartLimit}`);
    cachedHistoryRecords = Array.isArray(history) ? history : [];
    renderChartFromCache();
  } catch (e) {
    cachedHistoryRecords = [];
    initChart(["Offline"], [0], [0]);
  }
}

/**
 * Render Timeline for Recent Irrigation Activity
 */
function renderActivityTimeline(history) {
  const container = document.getElementById("activityTimelineList");
  const emptyState = document.getElementById("activityEmpty");
  const oldTable = document.querySelector("#activityTable tbody");

  if (!container) return;

  if (!Array.isArray(history) || history.length === 0) {
    container.innerHTML = "";
    if (emptyState) emptyState.style.display = "flex";
    if (oldTable) oldTable.innerHTML = "";
    return;
  }

  if (emptyState) emptyState.style.display = "none";

  let html = "";
  let tableHtml = "";

  history.slice(0, 5).forEach((log) => {
    const isON = log.status === "ON";
    const runtimeMins = Number(log.runtime_minutes || (isON ? 15 : 0));
    const liters = Math.round(runtimeMins * FLOW_RATE_LPM);
    const trigger = log.triggered_by || (log.mode === "auto" ? "Auto (ML)" : "Manual");
    const timeFormatted = formatTimestampNice(log.created_at || log.timestamp);

    html += `
      <div class="timeline-row">
        <div class="timeline-left">
          <div class="timeline-dot ${isON ? '' : 'off'}"></div>
          <div class="timeline-info">
            <span class="timeline-status">${isON ? 'Irrigation Active' : 'Pump Idle / Shutoff'}</span>
            <span class="timeline-sub">${escapeHtml(trigger)} &middot; ${runtimeMins > 0 ? runtimeMins + ' min duration' : 'Standby'}</span>
          </div>
        </div>
        <div class="timeline-right">
          <span class="timeline-liters">${liters > 0 ? liters + ' L' : '&mdash;'}</span>
          <span class="timeline-time">${timeFormatted}</span>
        </div>
      </div>
    `;

    tableHtml += `
      <tr>
        <td><span class="status-pill ${isON ? 'success' : 'neutral'}">${escapeHtml(log.status)}</span></td>
        <td>${escapeHtml(log.mode || 'auto')}</td>
        <td>${escapeHtml(trigger)}</td>
        <td class="num">${log.confidence != null ? (Number(log.confidence) * 100).toFixed(0) + '%' : 'N/A'}</td>
        <td>${escapeHtml(log.created_at || 'N/A')}</td>
      </tr>
    `;
  });

  container.innerHTML = html;
  if (oldTable) oldTable.innerHTML = tableHtml;
}

/**
 * Render Plot Chips and Frosted Glass Plot Overlay
 */
function renderCropPlots(crops) {
  cachedCropsData = Array.isArray(crops) ? crops : (crops.crops || []);
  const chipsContainer = document.getElementById("plotChipsList");
  const countEl = document.getElementById("cardPlotCount");
  const oldTable = document.querySelector("#cropsTable tbody");
  const oldEmpty = document.getElementById("cropsEmpty");

  if (countEl) {
    countEl.textContent = String(cachedCropsData.length || 0);
  }

  if (!cachedCropsData || cachedCropsData.length === 0) {
    if (chipsContainer) chipsContainer.innerHTML = '<span class="card-subtext">No plots registered yet.</span>';
    if (oldEmpty) oldEmpty.style.display = "block";
    if (oldTable) oldTable.innerHTML = "";
    return;
  }

  if (oldEmpty) oldEmpty.style.display = "none";

  // Render Horizontal Chips
  if (chipsContainer) {
    chipsContainer.innerHTML = cachedCropsData.map((c, idx) => `
      <button type="button" class="plot-chip ${idx === selectedCropIndex ? 'active' : ''}" onclick="selectCropPlot(${idx})">
        ${escapeHtml(c.field_plot || `Plot ${idx + 1}`)} &middot; ${escapeHtml(c.crop_name || 'Crop')}
      </button>
    `).join("");
  }

  // Populate hidden table for compatibility
  if (oldTable) {
    oldTable.innerHTML = cachedCropsData.slice(0, 5).map((c) => `
      <tr>
        <td>${escapeHtml(c.crop_name)}</td>
        <td>${escapeHtml(c.field_plot || 'Plot A-1')}</td>
        <td>${Number(c.area_acres || 0).toFixed(1)} ac</td>
        <td>${escapeHtml(c.growth_stage || 'Active')}</td>
        <td>${escapeHtml(c.irrigation_status || 'Optimal')}</td>
      </tr>
    `).join("");
  }

  updateSelectedCropView(selectedCropIndex);
}

/**
 * Select Plot and update Frosted Glass Overlay + Card Crop
 */
function selectCropPlot(index) {
  if (!cachedCropsData || !cachedCropsData[index]) return;
  selectedCropIndex = index;

  // Update active chip
  document.querySelectorAll(".plot-chip").forEach((chip, i) => {
    chip.classList.toggle("active", i === index);
  });

  updateSelectedCropView(index);
}

function updateSelectedCropView(index) {
  const crop = cachedCropsData[index];
  if (!crop) return;

  // Update Frosted Glass Map Panel
  const titleEl = document.getElementById("aerialPlotTitle");
  const datesEl = document.getElementById("aerialPlotDates");
  const healthValEl = document.getElementById("aerialHealthVal");
  const healthFillEl = document.getElementById("aerialHealthFill");

  if (titleEl) {
    titleEl.textContent = `${crop.field_plot || 'Plot ' + (index + 1)}: ${crop.crop_name || 'Crop'} (${crop.variety || 'Standard'})`;
  }

  if (datesEl) {
    const planted = crop.planted_date ? formatTimestampNice(crop.planted_date).slice(0, 11) : "15 Sep 2026";
    const harvest = crop.expected_harvest ? formatTimestampNice(crop.expected_harvest).slice(0, 11) : "20 Dec 2026";
    datesEl.textContent = `Planted: ${planted} · Harvest: ${harvest}`;
  }

  const healthPct = crop.health_pct || 94;
  if (healthValEl) healthValEl.textContent = `${healthPct}%`;
  if (healthFillEl) healthFillEl.style.width = `${healthPct}%`;

  // Update Crop Card in Bento Grid
  const cardCropName = document.getElementById("cardCropName");
  const cardCropMeta = document.getElementById("cardCropPlotMeta");
  if (cardCropName) cardCropName.textContent = crop.crop_name || "Tomato";
  if (cardCropMeta) {
    cardCropMeta.textContent = `${crop.field_plot || 'Plot A-1'} · ${crop.growth_stage || 'Day 42 of 90'}`;
  }
}

/**
 * Main Data Loader for Dashboard
 */
async function loadDashboard() {
  initHeaderAndDate();

  // 1. Fetch Latest Sensor Data
  try {
    const sensor = await apiFetch("/api/sensors/latest");
    latestSensorData = sensor;

    const mEl = document.getElementById("cardMoisture");
    const tEl = document.getElementById("cardTemp");
    const hEl = document.getElementById("cardHumidity");
    const rEl = document.getElementById("cardRain");

    if (sensor && sensor.soil_moisture != null) {
      const sm = Number(sensor.soil_moisture);
      const temp = Number(sensor.temperature || 0);
      const hum = Number(sensor.humidity || 0);
      const rain = Number(sensor.rainfall_prob || 0);

      if (mEl) mEl.textContent = sm.toFixed(1) + "%";
      if (tEl) tEl.textContent = temp.toFixed(1) + "°C";
      if (hEl) hEl.textContent = hum.toFixed(0) + "% RH";
      if (rEl) rEl.textContent = rain.toFixed(0) + "%";

      // Moisture status pill
      const statusLabel = document.getElementById("moistureStatusLabel");
      const statusDesc = document.getElementById("moistureStatus");
      if (sm < 35) {
        if (statusLabel) {
          statusLabel.className = "status-pill warning";
          statusLabel.textContent = "Low";
        }
        if (statusDesc) {
          statusDesc.innerHTML = `<span style="color:var(--amber);">Low: below 35% trigger threshold</span>`;
        }
      } else if (sm > 75) {
        if (statusLabel) {
          statusLabel.className = "status-pill info";
          statusLabel.textContent = "High";
        }
        if (statusDesc) {
          statusDesc.innerHTML = `<span style="color:var(--blue);">High saturation: hold irrigation</span>`;
        }
      } else {
        if (statusLabel) {
          statusLabel.className = "status-pill success";
          statusLabel.textContent = "Optimal";
        }
        if (statusDesc) {
          statusDesc.innerHTML = `<span style="color:var(--green);">Optimal root-zone band (35% to 75%)</span>`;
        }
      }

      // Render Tick-Bar
      renderTriggerTickBar(sm);

      // Dynamic Weather Illustration
      updateWeatherIllustration(rain, temp);

      // AI Insights card measured telemetry
      const aiMeasuredSummary = document.getElementById("aiMeasuredSummary");
      if (aiMeasuredSummary) {
        aiMeasuredSummary.innerHTML = `
          <div class="insight-metric-pill"><span>Soil Moisture</span><span>${sm.toFixed(1)}%</span></div>
          <div class="insight-metric-pill"><span>Temperature</span><span>${temp.toFixed(1)}°C</span></div>
          <div class="insight-metric-pill"><span>Humidity</span><span>${hum.toFixed(0)}%</span></div>
          <div class="insight-metric-pill"><span>Rain Prob</span><span>${rain.toFixed(0)}%</span></div>
        `;
      }

      // AI Insights timestamp
      const aiMetaTime = document.getElementById("aiMeasuredTime");
      if (aiMetaTime) {
        aiMetaTime.textContent = `Measured: ${formatTimestampNice(sensor.recorded_at)}`;
      }

      // Frosted plot sensor values
      const frostedTemp = document.getElementById("frostedLogTemp");
      const frostedHum = document.getElementById("frostedLogHum");
      const frostedMoist = document.getElementById("frostedLogMoist");
      if (frostedTemp) frostedTemp.textContent = `${temp.toFixed(1)}°C`;
      if (frostedHum) frostedHum.textContent = `${hum.toFixed(0)}%`;
      if (frostedMoist) frostedMoist.textContent = `${sm.toFixed(1)}%`;

      // Top live status chip
      const tsShort = sensor.recorded_at && sensor.recorded_at.length >= 16 ? sensor.recorded_at.slice(11, 16) : "Live";
      const probeText = document.getElementById("probeTimestampText");
      if (probeText) probeText.textContent = `Probe #1 · ${tsShort}`;

      // Update [data-bind] attributes
      updateDataBind({
        soilMoisture: sm.toFixed(1) + "%",
        temperature: temp.toFixed(1) + "°C",
        humidity: hum.toFixed(0) + "%",
        rainProbability: rain.toFixed(0) + "%"
      });
    }

    await refreshTelemetryHistory();
  } catch (e) {
    console.warn("Sensor fetch fallback:", e);
    initChart(["Offline"], [0], [0]);
  }

  // 2. Fetch Irrigation Status
  try {
    const status = await apiFetch("/api/irrigation/status");
    const isON = status.status === "ON";

    const card = document.getElementById("cardIrrigation");
    if (card) {
      card.textContent = isON ? "ON" : "OFF";
      card.style.color = isON ? "var(--green)" : "var(--ink)";
    }

    const pumpPill = document.getElementById("pumpStatusPill");
    if (pumpPill) {
      pumpPill.className = `status-pill ${isON ? 'success' : 'neutral'}`;
      pumpPill.textContent = isON ? "Running" : "Idle";
    }

    const toggleBtn = document.getElementById("pumpToggleBtn");
    if (toggleBtn) {
      toggleBtn.classList.toggle("on", isON);
      toggleBtn.setAttribute("aria-checked", isON ? "true" : "false");
    }

    const mode = document.getElementById("pumpMode");
    if (mode) {
      const byUser = status.triggered_by ? `by ${escapeHtml(status.triggered_by)}` : "by system";
      mode.textContent = `Mode: ${escapeHtml(status.mode || "auto")} ${byUser}`;
    }

    // Confidence Gauge update
    const confidencePct = status.confidence != null ? Math.round(Number(status.confidence) * 100) : 97;
    buildSvgGauge(confidencePct);

    // AI Decision Badge
    const quickBadge = document.getElementById("quickMlBadge");
    if (quickBadge) {
      quickBadge.className = `status-pill ${isON ? 'warning' : 'success'}`;
      quickBadge.textContent = isON ? "Irrigate (ON)" : "Hold (OFF)";
    }

    const quickBar = document.getElementById("quickMlBar");
    if (quickBar) quickBar.style.width = confidencePct + "%";

    const quickScore = document.getElementById("quickMlScore");
    if (quickScore) quickScore.textContent = `Model Confidence ${confidencePct}%`;
  } catch (e) {
    buildSvgGauge(97);
  }

  // 3. Fetch Irrigation History
  try {
    const history = await apiFetch("/api/irrigation/history");
    cachedIrrigationHistory = Array.isArray(history) ? history : [];
    renderActivityTimeline(cachedIrrigationHistory);
    renderWaterUsage(cachedIrrigationHistory);
  } catch (e) {
    renderWaterUsage([]);
  }

  // 4. Fetch Registered Crop Plots
  try {
    const cropsRes = await apiFetch("/api/crops");
    const crops = Array.isArray(cropsRes) ? cropsRes : (cropsRes.crops || []);
    renderCropPlots(crops);
  } catch (e) {
    renderCropPlots([]);
  }
}

/**
 * Quick Simulate: Poll Capacitive Field Probe #1
 */
async function quickSimulate() {
  const btn = document.getElementById("quickSimBtn");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = `
    <svg class="spin-animation" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    <span>Polling...</span>
  `;

  try {
    await apiFetch("/api/sensors/simulate", { method: "POST" });
    if (typeof showToast === "function") {
      showToast("Recorded new field telemetry reading.", "success");
    }
    await loadDashboard();
  } catch (err) {
    if (typeof showToast === "function") {
      showToast(err.message, "error");
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
      </svg>
      <span>Poll Field Sensor</span>
    `;
  }
}

/**
 * Quick Predict: Evaluate Random Forest ML Decision
 */
async function quickPredict() {
  const btn = document.getElementById("quickPredictBtn");
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = `
    <svg class="spin-animation" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
      <path d="M21 12a9 9 0 1 1-6.219-8.56"></path>
    </svg>
    <span>Evaluating...</span>
  `;

  try {
    const res = await apiFetch("/api/irrigation/predict", { method: "POST" });
    const isON = res.status === "ON";

    const badge = document.getElementById("quickMlBadge");
    if (badge) {
      badge.className = `status-pill ${isON ? 'warning' : 'success'}`;
      badge.textContent = isON ? "Irrigate (ON)" : "Hold (OFF)";
    }

    const pct = Math.round((res.confidence || 0.97) * 100);
    const bar = document.getElementById("quickMlBar");
    if (bar) bar.style.width = pct + "%";

    const score = document.getElementById("quickMlScore");
    if (score) score.textContent = `Model Confidence ${pct}%`;

    buildSvgGauge(pct);

    const explanation = document.getElementById("aiDecisionExplanation");
    if (explanation) {
      explanation.innerHTML = isON
        ? `<strong>Irrigation advised.</strong> Random Forest detected soil moisture deficit relative to ambient vapor demand.`
        : `<strong>Hold irrigation.</strong> Root-zone hydration is sufficient; evapotranspiration rate is within balanced horizon.`;
    }

    if (typeof showToast === "function") {
      showToast(`ML Decision: Pump ${res.status} (${pct}% confidence)`, "success");
    }

    await loadDashboard();
  } catch (err) {
    if (typeof showToast === "function") {
      showToast(err.message, "error");
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">
        <rect x="4" y="4" width="16" height="16" rx="2"></rect>
        <rect x="9" y="9" width="6" height="6"></rect>
        <line x1="9" y1="1" x2="9" y2="4"></line>
        <line x1="15" y1="1" x2="15" y2="4"></line>
        <line x1="9" y1="20" x2="9" y2="23"></line>
        <line x1="15" y1="20" x2="15" y2="23"></line>
        <line x1="20" y1="9" x2="23" y2="9"></line>
        <line x1="20" y1="14" x2="23" y2="14"></line>
        <line x1="1" y1="9" x2="4" y2="9"></line>
        <line x1="1" y1="14" x2="4" y2="14"></line>
      </svg>
      <span>Evaluate ML Decision</span>
    `;
  }
}

/**
 * Toggle Pump Switch State (ON/OFF)
 */
async function togglePump() {
  try {
    const currentCard = document.getElementById("cardIrrigation");
    const isCurrentlyOn = currentCard && currentCard.textContent.trim() === "ON";
    const nextState = isCurrentlyOn ? "OFF" : "ON";

    await apiFetch("/api/irrigation/toggle", {
      method: "POST",
      body: JSON.stringify({ status: nextState })
    });

    if (typeof showToast === "function") {
      showToast(`Pump switched ${nextState}`, "info");
    }
    await loadDashboard();
  } catch (err) {
    if (typeof showToast === "function") {
      showToast(err.message || "Failed to toggle pump", "error");
    }
  }
}

// Spin Animation Keyframe in JS for safety
(function injectSpinStyle() {
  const style = document.createElement("style");
  style.textContent = `
    @keyframes spin { 100% { transform: rotate(360deg); } }
    .spin-animation { animation: spin 1s linear infinite; }
  `;
  document.head.appendChild(style);
})();

// Document Ready Initialization
document.addEventListener("DOMContentLoaded", () => {
  if (typeof requireAuth === "function") requireAuth();
  if (typeof initLayout === "function") initLayout("dashboard");

  setupUserDropdown();
  setupMapControls();
  loadDashboard();
});

