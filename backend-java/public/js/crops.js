/**
 * ==========================================================================
 * AgroPulse Crop Inventory Page Logic
 * ==========================================================================
 * Connects to live CropHandler.java backend via AgroPulse.api.
 * Implements search, filtering, sorting, pagination, CSV export, and modal CRUD.
 */

(function () {
  "use strict";

  // Require authentication
  if (typeof AgroPulse !== "undefined" && AgroPulse.requireAuth) {
    AgroPulse.requireAuth();
  }

  const FARM_CAPACITY_ACRES = 20.0;
  const PAGE_SIZE = 10;

  let allCrops = [];
  let filteredCrops = [];
  let currentPage = 1;
  let sortColumn = "id";
  let sortOrder = "desc";
  let latestSensor = null;
  let latestStatus = null;

  // DOM Elements cache
  let searchInput, filterStage, filterStatus, exportBtn, addBtn, emptyAddBtn;
  let tableBody, emptyState, prevPageBtn, nextPageBtn, pageIndicator, paginationSummary;
  let metricTotalFarm, metricTotalDesc, metricCultivated, metricCultDesc, metricVarieties, metricVarDesc, metricNeedingIrr, metricIrrDesc;
  let cropModal, cropForm, cropIdInput, cropNameInput, cropVarietyInput, fieldPlotInput, areaAcresInput, plantingDateInput, growthStageInput, irrigationStatusInput, cropNotesInput, formError, saveSubmitBtn, cancelModalBtn, closeModalBtn;
  let prioritySummaryEl, telemetryBreakdownEl, areaDistListEl;

  function init() {
    // 1. Initialize Shell
    if (typeof AgroPulse !== "undefined" && AgroPulse.initShell) {
      AgroPulse.initShell(
        "crops",
        "Crop Inventory",
        "Manage field plot allocations, crop cultivars, growth stages, and root-zone irrigation requirements."
      );
    }

    cacheElements();
    attachEventListeners();
    loadWorkspaceData();

    // Tab visibility handling
    if (AgroPulse.onTabVisibilityChange) {
      AgroPulse.onTabVisibilityChange(() => loadWorkspaceData(false), null);
    }
  }

  function cacheElements() {
    searchInput = document.getElementById("cropSearchInput");
    filterStage = document.getElementById("filterStage");
    filterStatus = document.getElementById("filterStatus");
    exportBtn = document.getElementById("exportCropsCsvBtn");
    addBtn = document.getElementById("openAddCropBtn");
    emptyAddBtn = document.getElementById("emptyStateAddBtn");

    tableBody = document.getElementById("cropTableBody");
    emptyState = document.getElementById("cropEmptyState");
    prevPageBtn = document.getElementById("prevPageBtn");
    nextPageBtn = document.getElementById("nextPageBtn");
    pageIndicator = document.getElementById("pageIndicator");
    paginationSummary = document.getElementById("paginationSummary");

    // Metrics
    metricTotalFarm = document.getElementById("metricTotalFarmArea");
    metricTotalDesc = document.getElementById("metricTotalFarmDesc");
    metricCultivated = document.getElementById("metricCultivatedArea");
    metricCultDesc = document.getElementById("metricCultivatedDesc");
    metricVarieties = document.getElementById("metricCropVarieties");
    metricVarDesc = document.getElementById("metricVarietiesDesc");
    metricNeedingIrr = document.getElementById("metricFieldsNeedingIrrigation");
    metricIrrDesc = document.getElementById("metricIrrigationDesc");

    // Insights panel
    prioritySummaryEl = document.getElementById("cropPrioritySummary");
    telemetryBreakdownEl = document.getElementById("cropTelemetryBreakdown");
    areaDistListEl = document.getElementById("cropAreaDistList");

    // Modal
    cropModal = document.getElementById("cropModalBackdrop");
    cropForm = document.getElementById("cropForm");
    cropIdInput = document.getElementById("cropIdInput");
    cropNameInput = document.getElementById("cropNameInput");
    cropVarietyInput = document.getElementById("cropVarietyInput");
    fieldPlotInput = document.getElementById("fieldPlotInput");
    areaAcresInput = document.getElementById("areaAcresInput");
    plantingDateInput = document.getElementById("plantingDateInput");
    growthStageInput = document.getElementById("growthStageInput");
    irrigationStatusInput = document.getElementById("irrigationStatusInput");
    cropNotesInput = document.getElementById("cropNotesInput");
    formError = document.getElementById("cropFormError");
    saveSubmitBtn = document.getElementById("saveCropSubmitBtn");
    cancelModalBtn = document.getElementById("cancelCropModalBtn");
    closeModalBtn = document.getElementById("closeCropModalBtn");
  }

  function attachEventListeners() {
    if (searchInput) searchInput.addEventListener("input", onFilterChange);
    if (filterStage) filterStage.addEventListener("change", onFilterChange);
    if (filterStatus) filterStatus.addEventListener("change", onFilterChange);

    if (exportBtn) exportBtn.addEventListener("click", exportCsv);
    if (addBtn) addBtn.addEventListener("click", openAddModal);
    if (emptyAddBtn) emptyAddBtn.addEventListener("click", openAddModal);

    if (prevPageBtn) prevPageBtn.addEventListener("click", () => changePage(-1));
    if (nextPageBtn) nextPageBtn.addEventListener("click", () => changePage(1));

    // Sortable table headers
    document.querySelectorAll("th.sortable").forEach((th) => {
      th.addEventListener("click", () => {
        const col = th.dataset.sort;
        if (sortColumn === col) {
          sortOrder = sortOrder === "asc" ? "desc" : "asc";
        } else {
          sortColumn = col;
          sortOrder = "asc";
        }
        updateSortIcons();
        applyFiltersAndRender();
      });
    });

    // Modal close triggers
    if (closeModalBtn) closeModalBtn.addEventListener("click", closeModal);
    if (cancelModalBtn) cancelModalBtn.addEventListener("click", closeModal);

    if (cropModal) {
      cropModal.addEventListener("click", (e) => {
        if (e.target === cropModal) closeModal();
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && cropModal && (cropModal.classList.contains("open") || cropModal.style.display !== "none")) {
        closeModal();
      }
    });

    if (cropForm) {
      cropForm.addEventListener("submit", handleFormSubmit);
    }

    // Live validation cleanup on input
    [cropNameInput, fieldPlotInput, areaAcresInput].forEach((inp) => {
      if (inp) {
        inp.addEventListener("input", () => {
          inp.classList.remove("input-error");
          if (formError) {
            formError.textContent = "";
            formError.classList.remove("show");
            formError.style.display = "none";
          }
        });
      }
    });
  }

  // Expose global modal triggers on AgroPulse namespace
  if (typeof AgroPulse !== "undefined") {
    AgroPulse.openCropModal = openAddModal;
    AgroPulse.closeCropModal = closeModal;
    AgroPulse.openEditCropModal = openEditModal;
  }

  async function loadWorkspaceData(showToast = false) {
    try {
      const [crops, sensor, status] = await Promise.all([
        AgroPulse.api.getCropPlots(),
        AgroPulse.api.getLatestSensorReading(),
        AgroPulse.api.getIrrigationStatus()
      ]);

      allCrops = Array.isArray(crops) ? crops : [];
      latestSensor = sensor;
      latestStatus = status;

      updateMetrics();
      applyFiltersAndRender();
      renderInsights();

      if (showToast && AgroPulse.showToast) {
        AgroPulse.showToast("Crop inventory synced with backend.", "success");
      }
    } catch (err) {
      if (AgroPulse.showToast) {
        AgroPulse.showToast("Failed to load crop inventory: " + err.message, "error");
      }
    }
  }

  function updateMetrics() {
    const cultivated = allCrops.reduce((acc, c) => acc + (Number(c.area_acres) || 0), 0);
    const totalCapacity = Math.max(FARM_CAPACITY_ACRES, cultivated);
    const unallocated = Math.max(0, totalCapacity - cultivated);

    const varietiesSet = new Set(
      allCrops.map((c) => `${(c.crop_name || "").toLowerCase().trim()}::${(c.variety || "").toLowerCase().trim()}`)
    );

    const needingIrr = allCrops.filter((c) => evaluateIrrigationRequirement(c).needsWater).length;

    if (metricTotalFarm) metricTotalFarm.textContent = totalCapacity.toFixed(1);
    if (metricTotalDesc) metricTotalDesc.textContent = unallocated > 0
      ? `${unallocated.toFixed(1)} ac fallow / unallocated`
      : "100% capacity allocated";

    if (metricCultivated) metricCultivated.textContent = cultivated.toFixed(1);
    if (metricCultDesc) metricCultDesc.textContent = `${allCrops.length} registered field plots`;

    if (metricVarieties) metricVarieties.textContent = String(varietiesSet.size);
    if (metricVarDesc) metricVarDesc.textContent = "Cultivars in current rotation";

    if (metricNeedingIrr) {
      metricNeedingIrr.textContent = String(needingIrr);
      metricNeedingIrr.style.color = needingIrr > 0 ? "var(--amber)" : "var(--ink)";
    }
    if (metricIrrDesc) {
      metricIrrDesc.textContent = needingIrr > 0
        ? "Action recommended"
        : "All plots within optimal moisture";
    }
  }

  function evaluateIrrigationRequirement(crop) {
    const status = (crop.irrigation_status || "Optimal").trim();
    const moisture = (latestSensor && typeof latestSensor.soil_moisture === "number")
      ? Number(latestSensor.soil_moisture)
      : null;

    if (status === "Requires Irrigation" || (moisture !== null && moisture < 35)) {
      return {
        needsWater: true,
        label: "Requires Irrigation",
        pillClass: "warning"
      };
    }
    if (status === "Scheduled") {
      return {
        needsWater: false,
        label: "Scheduled",
        pillClass: "info"
      };
    }
    return {
      needsWater: false,
      label: "Optimal",
      pillClass: "success"
    };
  }

  function onFilterChange() {
    currentPage = 1;
    applyFiltersAndRender();
  }

  function applyFiltersAndRender() {
    const query = (searchInput ? searchInput.value : "").trim().toLowerCase();
    const stage = filterStage ? filterStage.value : "ALL";
    const status = filterStatus ? filterStatus.value : "ALL";

    filteredCrops = allCrops.filter((crop) => {
      const matchQuery = !query ||
        (crop.crop_name && crop.crop_name.toLowerCase().includes(query)) ||
        (crop.variety && crop.variety.toLowerCase().includes(query)) ||
        (crop.field_plot && crop.field_plot.toLowerCase().includes(query)) ||
        (crop.notes && crop.notes.toLowerCase().includes(query));

      const matchStage = stage === "ALL" || (crop.growth_stage || "").toLowerCase() === stage.toLowerCase();
      const matchStatus = status === "ALL" || (crop.irrigation_status || "").toLowerCase() === status.toLowerCase();

      return matchQuery && matchStage && matchStatus;
    });

    // Sorting
    filteredCrops.sort((a, b) => {
      let valA = a[sortColumn] ?? "";
      let valB = b[sortColumn] ?? "";

      if (sortColumn === "area_acres" || sortColumn === "id") {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
        return sortOrder === "asc" ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortOrder === "asc" ? -1 : 1;
      if (strA > strB) return sortOrder === "asc" ? 1 : -1;
      return 0;
    });

    renderTable();
  }

  function renderTable() {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    const total = filteredCrops.length;
    if (total === 0) {
      if (emptyState) emptyState.style.display = "block";
      if (paginationSummary) paginationSummary.textContent = "Showing 0 of 0 plots";
      if (pageIndicator) pageIndicator.textContent = "Page 1 of 1";
      if (prevPageBtn) prevPageBtn.disabled = true;
      if (nextPageBtn) nextPageBtn.disabled = true;
      return;
    }

    if (emptyState) emptyState.style.display = "none";

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const endIdx = Math.min(startIdx + PAGE_SIZE, total);
    const pageItems = filteredCrops.slice(startIdx, endIdx);

    pageItems.forEach((crop) => {
      const tr = document.createElement("tr");
      const evalState = evaluateIrrigationRequirement(crop);
      const iconPath = getCropIconSvg(crop.crop_name);

      tr.innerHTML = `
        <td>
          <div class="crop-cell-main">
            <div class="crop-avatar-icon">
              ${iconPath}
            </div>
            <div>
              <div class="crop-name-strong">${AgroPulse.escapeHtml(crop.crop_name || "Unspecified")}</div>
              <div class="crop-variety-sub">${AgroPulse.escapeHtml(crop.variety || "Standard cultivar")}</div>
            </div>
          </div>
        </td>
        <td><strong>${AgroPulse.escapeHtml(crop.field_plot || "Plot A-1")}</strong></td>
        <td>${AgroPulse.escapeHtml(crop.variety || "--")}</td>
        <td class="num">${Number(crop.area_acres || 0).toFixed(1)} ac</td>
        <td>${AgroPulse.formatDate(crop.planting_date || crop.created_at)}</td>
        <td>
          <span class="status-pill neutral">
            ${AgroPulse.escapeHtml(crop.growth_stage || "Vegetative")}
          </span>
        </td>
        <td>
          <span class="status-pill ${evalState.pillClass}">
            <span class="dot"></span>${evalState.label}
          </span>
        </td>
        <td style="text-align:right; white-space:nowrap;">
          <button type="button" class="action-icon-btn edit-btn" data-id="${crop.id}" title="Edit Plot" aria-label="Edit Plot">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button type="button" class="action-icon-btn delete-btn" data-id="${crop.id}" title="Delete Plot" aria-label="Delete Plot">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </td>
      `;

      tr.querySelector(".edit-btn").addEventListener("click", () => openEditModal(crop.id));
      tr.querySelector(".delete-btn").addEventListener("click", () => promptDelete(crop.id));

      tableBody.appendChild(tr);
    });

    if (paginationSummary) {
      paginationSummary.textContent = `Showing ${startIdx + 1} to ${endIdx} of ${total} plots`;
    }
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;
    }
    if (prevPageBtn) prevPageBtn.disabled = currentPage <= 1;
    if (nextPageBtn) nextPageBtn.disabled = currentPage >= totalPages;
  }

  function changePage(delta) {
    currentPage += delta;
    renderTable();
  }

  function updateSortIcons() {
    document.querySelectorAll("th.sortable").forEach((th) => {
      const col = th.dataset.sort;
      const isCurrent = col === sortColumn;
      th.classList.toggle("sort-asc", isCurrent && sortOrder === "asc");
      th.classList.toggle("sort-desc", isCurrent && sortOrder === "desc");
    });
  }

  function renderInsights() {
    const totalArea = allCrops.reduce((acc, c) => acc + (Number(c.area_acres) || 0), 0);

    // Priority summary
    if (prioritySummaryEl) {
      const needing = allCrops.filter((c) => evaluateIrrigationRequirement(c).needsWater);
      if (needing.length > 0) {
        const plotNames = needing.map((c) => c.field_plot || c.crop_name).join(", ");
        prioritySummaryEl.innerHTML = `<span style="color:var(--amber); font-weight:600;">${needing.length} plot${needing.length === 1 ? "" : "s"} need attention:</span> ${AgroPulse.escapeHtml(plotNames)}. Soil moisture or growth stage demands replenishment.`;
      } else {
        prioritySummaryEl.innerHTML = `All <strong>${allCrops.length} registered plots</strong> are within target root-zone hydration parameters.`;
      }
    }

    // Telemetry breakdown
    if (telemetryBreakdownEl) {
      if (latestSensor && typeof latestSensor.soil_moisture === "number") {
        const sm = Number(latestSensor.soil_moisture).toFixed(1);
        const temp = Number(latestSensor.temperature || 0).toFixed(1);
        const hum = Math.round(Number(latestSensor.humidity || 0));
        telemetryBreakdownEl.innerHTML = `
          <div><strong>Live Telemetry (Probe #1):</strong> Soil Moisture <strong>${sm}%</strong> · Temp <strong>${temp}°C</strong> · Humidity <strong>${hum}% RH</strong></div>
          <div style="font-size:12px; color:var(--muted); margin-top:4px;">Recorded: ${AgroPulse.formatDate(latestSensor.recorded_at)}</div>
        `;
      } else {
        telemetryBreakdownEl.innerHTML = `Telemetry probe offline or awaiting first packet.`;
      }
    }

    // Area distribution bars
    if (areaDistListEl) {
      if (allCrops.length === 0 || totalArea <= 0) {
        areaDistListEl.innerHTML = `<div style="font-size:12px; color:var(--muted);">No crop allocations recorded.</div>`;
      } else {
        const byCrop = {};
        allCrops.forEach((c) => {
          const name = c.crop_name || "Unspecified";
          byCrop[name] = (byCrop[name] || 0) + (Number(c.area_acres) || 0);
        });

        const sorted = Object.entries(byCrop).sort((a, b) => b[1] - a[1]);
        areaDistListEl.innerHTML = sorted.map(([name, acres]) => {
          const pct = Math.min(100, Math.round((acres / totalArea) * 100));
          return `
            <div class="dist-item">
              <div class="dist-header">
                <span class="dist-title">${AgroPulse.escapeHtml(name)}</span>
                <span class="dist-meta">${acres.toFixed(1)} ac (${pct}%)</span>
              </div>
              <div class="dist-bar-track">
                <div class="dist-bar-fill" style="width:${pct}%;"></div>
              </div>
            </div>
          `;
        }).join("");
      }
    }
  }

  // ==========================================================================
  // Modal Handling & Validation
  // ==========================================================================

  function openAddModal() {
    const modal = document.getElementById("cropModalBackdrop");
    const form = document.getElementById("cropForm");
    if (!modal) return;
    if (form) form.reset();

    const idInp = document.getElementById("cropIdInput");
    if (idInp) idInp.value = "";

    const titleEl = document.getElementById("cropModalTitleText");
    const btnSpan = document.getElementById("saveCropBtnText");
    if (titleEl) titleEl.textContent = "Add Crop Plot";
    if (btnSpan) btnSpan.textContent = "Register Plot";

    const dateInp = document.getElementById("plantingDateInput");
    if (dateInp) dateInp.value = new Date().toISOString().slice(0, 10);

    clearValidation();
    modal.style.display = "flex";
    modal.classList.add("open");

    const nameInp = document.getElementById("cropNameInput");
    if (nameInp) setTimeout(() => nameInp.focus(), 50);
  }

  function openEditModal(cropId) {
    const crop = allCrops.find((c) => String(c.id) === String(cropId));
    const modal = document.getElementById("cropModalBackdrop");
    if (!crop || !modal) return;

    const idInp = document.getElementById("cropIdInput");
    if (idInp) idInp.value = String(crop.id);

    const titleEl = document.getElementById("cropModalTitleText");
    const btnSpan = document.getElementById("saveCropBtnText");
    if (titleEl) titleEl.textContent = `Edit ${crop.field_plot || "Crop Plot"}`;
    if (btnSpan) btnSpan.textContent = "Save Changes";

    if (cropNameInput) cropNameInput.value = crop.crop_name || "";
    if (cropVarietyInput) cropVarietyInput.value = crop.variety || "";
    if (fieldPlotInput) fieldPlotInput.value = crop.field_plot || "";
    if (areaAcresInput) areaAcresInput.value = crop.area_acres || "";
    if (plantingDateInput) plantingDateInput.value = (crop.planting_date || "").slice(0, 10) || new Date().toISOString().slice(0, 10);
    if (growthStageInput) growthStageInput.value = crop.growth_stage || "Vegetative";
    if (irrigationStatusInput) irrigationStatusInput.value = crop.irrigation_status || "Optimal";
    if (cropNotesInput) cropNotesInput.value = crop.notes || "";

    clearValidation();
    modal.style.display = "flex";
    modal.classList.add("open");

    if (cropNameInput) setTimeout(() => cropNameInput.focus(), 50);
  }

  function closeModal() {
    const modal = document.getElementById("cropModalBackdrop");
    if (modal) {
      modal.style.display = "none";
      modal.classList.remove("open");
    }
    clearValidation();
  }

  function clearValidation() {
    const err = document.getElementById("cropFormError");
    if (err) {
      err.textContent = "";
      err.classList.remove("show");
      err.style.display = "none";
    }
    [cropNameInput, fieldPlotInput, areaAcresInput, plantingDateInput].forEach((inp) => {
      if (inp) inp.classList.remove("input-error");
    });
  }

  async function handleFormSubmit(e) {
    e.preventDefault();
    clearValidation();

    const nameVal = cropNameInput ? cropNameInput.value.trim() : "";
    const plotVal = fieldPlotInput ? fieldPlotInput.value.trim() : "";
    const areaVal = areaAcresInput ? parseFloat(areaAcresInput.value) : 0;
    const dateVal = plantingDateInput ? plantingDateInput.value : "";

    let hasError = false;
    let errorMsg = "";

    if (!nameVal) {
      if (cropNameInput) cropNameInput.classList.add("input-error");
      hasError = true;
      errorMsg = "Crop name is required (e.g. Tomato, Rice, Chilli).";
    } else if (!plotVal) {
      if (fieldPlotInput) fieldPlotInput.classList.add("input-error");
      hasError = true;
      errorMsg = "Field / Plot ID is required (e.g. Plot A-1).";
    } else if (isNaN(areaVal) || areaVal <= 0) {
      if (areaAcresInput) areaAcresInput.classList.add("input-error");
      hasError = true;
      errorMsg = "Planted area must be a positive number of acres (e.g. 2.5).";
    } else if (!dateVal) {
      if (plantingDateInput) plantingDateInput.classList.add("input-error");
      hasError = true;
      errorMsg = "Planting date is required.";
    }

    if (hasError) {
      const err = document.getElementById("cropFormError");
      if (err) {
        err.textContent = errorMsg;
        err.classList.add("show");
        err.style.display = "block";
      }
      return;
    }

    const payload = {
      id: cropIdInput ? cropIdInput.value.trim() : "",
      crop_name: nameVal,
      variety: (cropVarietyInput && cropVarietyInput.value.trim()) || "Standard",
      field_plot: plotVal,
      area_acres: areaVal,
      planting_date: dateVal,
      growth_stage: (growthStageInput && growthStageInput.value) || "Vegetative",
      irrigation_status: (irrigationStatusInput && irrigationStatusInput.value) || "Optimal",
      notes: (cropNotesInput && cropNotesInput.value.trim()) || ""
    };

    const submitBtn = document.getElementById("saveCropSubmitBtn");
    const btnSpan = document.getElementById("saveCropBtnText");

    if (submitBtn) submitBtn.disabled = true;
    if (btnSpan) btnSpan.textContent = "Saving...";

    try {
      await AgroPulse.api.saveCropPlot(payload);
      closeModal();
      if (AgroPulse.showToast) {
        AgroPulse.showToast(`Saved plot ${payload.field_plot} (${payload.crop_name}).`, "success");
      }
      await loadWorkspaceData();
    } catch (err) {
      const formErr = document.getElementById("cropFormError");
      if (formErr) {
        formErr.textContent = err.message || "Failed to save crop.";
        formErr.classList.add("show");
        formErr.style.display = "block";
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      if (btnSpan) btnSpan.textContent = payload.id ? "Save Changes" : "Save Plot";
    }
  }

  function promptDelete(cropId) {
    const crop = allCrops.find((c) => String(c.id) === String(cropId));
    if (!crop) return;

    AgroPulse.showConfirmModal({
      title: "Confirm Plot Removal",
      message: `Are you sure you want to remove ${crop.crop_name} (${crop.field_plot || "Plot"}) from your farm inventory? This action updates total cultivated acreage.`,
      confirmText: "Delete Plot",
      cancelText: "Cancel",
      isDanger: true,
      onConfirm: async () => {
        try {
          await AgroPulse.api.deleteCropPlot(crop.id);
          if (AgroPulse.showToast) {
            AgroPulse.showToast(`Plot ${crop.field_plot} removed.`, "info");
          }
          await loadWorkspaceData();
        } catch (err) {
          if (AgroPulse.showToast) {
            AgroPulse.showToast("Failed to delete plot: " + err.message, "error");
          }
        }
      }
    });
  }

  function exportCsv() {
    if (allCrops.length === 0) {
      if (AgroPulse.showToast) AgroPulse.showToast("No crop records to export.", "warning");
      return;
    }

    const headers = [
      "ID",
      "Crop Name",
      "Variety",
      "Field / Plot",
      "Area (Acres)",
      "Planting Date",
      "Growth Stage",
      "Irrigation Status",
      "Notes"
    ];

    const rows = allCrops.map((c) => [
      c.id,
      c.crop_name || "",
      c.variety || "",
      c.field_plot || "",
      c.area_acres || 0,
      c.planting_date || "",
      c.growth_stage || "",
      c.irrigation_status || "",
      c.notes || ""
    ]);

    const timestamp = new Date().toISOString().slice(0, 10);
    AgroPulse.downloadCsv(`agropulse-crops-${timestamp}.csv`, headers, rows);
    if (AgroPulse.showToast) {
      AgroPulse.showToast("Exported crop inventory to CSV.", "success");
    }
  }

  function getCropIconSvg(name = "") {
    const n = String(name).toLowerCase();
    if (n.includes("rice") || n.includes("paddy") || n.includes("wheat")) {
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 22 12 2l10 20H2z"></path><path d="M12 2v20"></path><path d="m7 15 5-5 5 5"></path></svg>`;
    }
    if (n.includes("cotton")) {
      return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="8"></circle><path d="M12 2v4"></path><path d="M12 18v4"></path><path d="M4.93 4.93l2.83 2.83"></path><path d="M16.24 16.24l2.83 2.83"></path></svg>`;
    }
    return `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22v-9"></path><path d="M9 13a4 4 0 0 1 8 0c0 4-4 7-4 7s-4-3-4-7z"></path></svg>`;
  }

  // Self-executing initialization: works whether DOMContentLoaded fired or not
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
