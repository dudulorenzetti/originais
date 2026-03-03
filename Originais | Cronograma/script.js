const STORAGE_KEY = "originais_lumine_state_v2";
const STORAGE_FALLBACK_KEYS = [
  `${STORAGE_KEY}_backup`,
  "originais_lumine_state_v1",
  "originais_lumine_state",
  "base44_app_state"
];

const CONFIG_META = {
  stages: "ETAPA",
  categories: "CATEGORIA",
  formats: "FORMATO",
  natures: "NATUREZA",
  durations: "DURAÇÃO",
  statuses: "STATUS"
};

const CONFIG_SINGULAR_META = {
  stages: "Etapa",
  categories: "Categoria",
  formats: "Formato",
  natures: "Natureza",
  durations: "Duração",
  statuses: "Status"
};

const COLOR_CONFIG_KEYS = new Set(["categories", "formats", "natures", "statuses"]);

const STATUS_COLORS = {
  Backlog: "gray",
  "Em Planejamento": "yellow",
  "Em andamento": "blue",
  Concluído: "green",
  Pausado: "gray",
  INCUBADO: "yellow"
};

const BASE44_FILES = [
  "Category_export.csv",
  "Duration_export.csv",
  "Format_export.csv",
  "Nature_export.csv",
  "ProductionType_export.csv",
  "Project_export.csv",
  "ProjectStatus_export.csv",
  "Stage_export.csv",
  "StageType_export.csv"
];

let state = loadState();
let currentTab = "dashboard";
let selectedDashboardYears = new Set();
let dashboardFiltersOpen = false;
let selectedDashboardFilters = {
  categories: new Set(),
  formats: new Set(),
  natures: new Set(),
  durations: new Set()
};
let selectedGanttYears = new Set();
let ganttFiltersOpen = false;
let selectedGanttFilters = {
  categories: new Set(),
  formats: new Set(),
  natures: new Set(),
  durations: new Set()
};
let selectedProjectYears = new Set();
let projectFiltersOpen = false;
let selectedProjectFilters = {
  categories: new Set(),
  formats: new Set(),
  natures: new Set(),
  durations: new Set()
};
let selectedConfigKey = "stages";
let selectedStageRef = null;
let draggingStage = null;
let suppressLineClickUntil = 0;

init();

function init() {
  bindNavigation();
  bindGlobalActions();
  bindDialog();
  renderAll();
}

function bindNavigation() {
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      openTab(btn.dataset.tab);
    });
  });
}

function openTab(tab) {
  currentTab = tab;
  document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
  document.getElementById(tab).classList.add("active");
  renderAll();
}

function bindGlobalActions() {
  document.getElementById("btnNewProject").addEventListener("click", () => openProjectDialog());
  document.getElementById("btnQuickNewProject").addEventListener("click", () => openProjectDialog());

  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;

  document.getElementById("applyTimeline").addEventListener("click", () => {
    const start = document.getElementById("timelineStart").value;
    const end = document.getElementById("timelineEnd").value;
    if (!start || !end || monthToIndex(start) > monthToIndex(end)) {
      alert("Período inválido.");
      return;
    }
    state.timeline.start = start;
    state.timeline.end = end;
    state.timeline.monthsShown = monthToIndex(end) - monthToIndex(start) + 1;
    saveState();
    renderGantt();
  });
  document.getElementById("timelineBack").addEventListener("click", decreaseTimelineWindow);
  document.getElementById("timelineForward").addEventListener("click", increaseTimelineWindow);
  document.getElementById("timelineLeft").addEventListener("click", () => panTimeline(-1));
  document.getElementById("timelineRight").addEventListener("click", () => panTimeline(1));

  document.getElementById("projectSearch").addEventListener("input", renderProjectsTable);

  document.getElementById("btnImportCsv").addEventListener("click", () => {
    document.getElementById("csvInput").click();
  });

  document.getElementById("csvInput").addEventListener("change", importCsvFile);

  document.getElementById("btnAddConfig").addEventListener("click", addConfigItem);
  document.getElementById("dashboardFiltersToggle").addEventListener("click", () => {
    dashboardFiltersOpen = !dashboardFiltersOpen;
    renderDashboard();
  });
  document.getElementById("btnFilterGantt").addEventListener("click", () => {
    ganttFiltersOpen = !ganttFiltersOpen;
    renderGantt();
  });
  document.getElementById("btnFilterProjects").addEventListener("click", () => {
    projectFiltersOpen = !projectFiltersOpen;
    renderProjectsTools();
    renderProjectsTable();
  });
}

function bindDialog() {
  const dialog = document.getElementById("projectDialog");
  const form = document.getElementById("projectForm");
  const stageDialog = document.getElementById("stageDialog");
  const stageForm = document.getElementById("stageForm");
  const configItemDialog = document.getElementById("configItemDialog");
  const configItemForm = document.getElementById("configItemForm");

  document.getElementById("btnCancelDialog").addEventListener("click", () => dialog.close());

  document.getElementById("btnDeleteProject").addEventListener("click", () => {
    const id = document.getElementById("projectId").value;
    if (!id) return;
    if (!confirm("Excluir projeto?")) return;
    state.projects = state.projects.filter((p) => p.id !== id);
    saveState();
    dialog.close();
    renderAll();
  });

  document.getElementById("btnAddStage").addEventListener("click", () => {
    document.getElementById("projectStages").appendChild(buildStageRow());
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const project = collectProjectForm();
    if (!project) return;
    const idx = state.projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) state.projects[idx] = project;
    else state.projects.push(project);
    saveState();
    dialog.close();
    renderAll();
  });

  document.getElementById("stageCancelBtn").addEventListener("click", () => stageDialog.close());
  document.getElementById("stageDeleteBtn").addEventListener("click", () => {
    const projectId = document.getElementById("stageProjectId").value;
    const stageId = document.getElementById("stageId").value;
    if (!projectId || !stageId) return;
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    project.stages = project.stages.filter((s) => s.id !== stageId);
    saveState();
    stageDialog.close();
    renderAll();
  });

  stageForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const projectId = document.getElementById("stageProjectId").value;
    const stageId = document.getElementById("stageId").value;
    const stageTypeId = document.getElementById("stageTypeSelect").value;
    const start = document.getElementById("stageStart").value;
    const end = document.getElementById("stageEnd").value;
    const notes = document.getElementById("stageNotes").value.trim();
    if (!projectId || !stageTypeId || !start || !end || monthToIndex(start) > monthToIndex(end)) {
      alert("Preencha etapa, início e fim com período válido.");
      return;
    }
    const project = state.projects.find((p) => p.id === projectId);
    if (!project) return;
    const stageDef = state.settings.stages.find((s) => s.id === stageTypeId);
    const payload = {
      id: stageId || uid(),
      stageId: stageTypeId,
      start,
      end,
      name: stageDef?.name || "",
      notes
    };
    const idx = project.stages.findIndex((s) => s.id === payload.id);
    if (idx >= 0) project.stages[idx] = { ...project.stages[idx], ...payload };
    else project.stages.push(payload);
    project.stages.sort((a, b) => monthToIndex(a.start) - monthToIndex(b.start));
    saveState();
    stageDialog.close();
    renderAll();
  });

  document.getElementById("configItemCancelBtn").addEventListener("click", () => configItemDialog.close());
  configItemForm.addEventListener("submit", (e) => {
    e.preventDefault();
    saveConfigItemDialog();
    configItemDialog.close();
  });
}

function renderAll() {
  renderDashboard();
  renderGantt();
  renderProjectsTools();
  renderProjectsTable();
  renderConfigTabs();
  renderConfigList();
}

function renderDashboard() {
  renderDashboardYearChips();
  renderDashboardExtraFilters();
  const allProjects = [...state.projects];
  const projects = filteredDashboardProjects();

  const totalProjects = allProjects.length;
  const projectsWithSpent = projects
    .map((p) => ({ p, value: getProjectSpentValue(p) }))
    .filter((item) => item.value !== null);
  const totalSpent = projectsWithSpent.reduce((acc, item) => acc + item.value, 0);
  const avgSpent = projectsWithSpent.length ? totalSpent / projectsWithSpent.length : 0;

  document.getElementById("summaryCards").innerHTML = [
    cardHtml("Total de Produções", String(totalProjects), "projects"),
    cardHtml("Total Gasto", money(totalSpent), "spent"),
    cardHtml("Gasto Médio por Projeto", money(avgSpent), "avg")
  ].join("");

  renderBarChart(document.getElementById("chartByYear"), countBy(projects, (p) => getProjectYear(p), true), "vertical", ["#f3ba00"]);
  renderBarChart(document.getElementById("chartByStatus"), countBy(projects, (p) => getProjectField(p, "status"), true), "vertical", ["#10b981", "#3b82f6", "#f59e0b", "#94a3b8"]);
  renderBarChart(document.getElementById("chartByCategory"), countBy(projects, (p) => getProjectField(p, "category"), true), "vertical", ["#10b981", "#3b82f6", "#f59e0b", "#94a3b8"]);
  renderBarChart(document.getElementById("chartByFormat"), countBy(projects, (p) => getProjectField(p, "format"), true), "vertical", ["#10b981", "#3b82f6", "#f59e0b"]);
  renderBarChart(document.getElementById("chartByNature"), countBy(projects, (p) => getProjectField(p, "nature"), true), "vertical", ["#10b981", "#3b82f6", "#f59e0b"]);
  renderBarChart(document.getElementById("chartByDuration"), countBy(projects, (p) => getProjectField(p, "duration"), true), "vertical", ["#10b981", "#3b82f6", "#f59e0b"]);
  renderBarChart(document.getElementById("chartAvgStage"), avgMonthsByStage(projects), "horizontal", ["#94a3b8", "#60a5fa", "#fcd34d", "#34d399", "#f472b6"]);
}

function renderDashboardYearChips() {
  const years = [...new Set(state.projects.map((p) => getProjectYear(p)).filter((y) => y > 0))].sort((a, b) => a - b);
  const allActive = selectedDashboardYears.size === 0;
  const chips = ["Todos", ...years];
  document.getElementById("yearChips").innerHTML = chips
    .map((y) => {
      const active = y === "Todos" ? allActive : selectedDashboardYears.has(String(y));
      const value = y === "Todos" ? "__all" : String(y);
      return `<button class="chip ${active ? "active" : ""}" data-year="${value}">${y}</button>`;
    })
    .join("");

  document.querySelectorAll("#yearChips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.year === "__all") {
        selectedDashboardYears.clear();
      } else {
        const y = chip.dataset.year;
        if (selectedDashboardYears.has(y)) selectedDashboardYears.delete(y);
        else selectedDashboardYears.add(y);
      }
      renderDashboard();
    });
  });
}

function filteredDashboardProjects() {
  const withYear = state.projects.filter((p) => getProjectYear(p) > 0);
  return withYear.filter((p) => {
    if (selectedDashboardYears.size && !selectedDashboardYears.has(String(getProjectYear(p)))) return false;
    if (!matchesMultiFilter(getProjectField(p, "category"), selectedDashboardFilters.categories)) return false;
    if (!matchesMultiFilter(getProjectField(p, "format"), selectedDashboardFilters.formats)) return false;
    if (!matchesMultiFilter(getProjectField(p, "nature"), selectedDashboardFilters.natures)) return false;
    if (!matchesMultiFilter(getProjectField(p, "duration"), selectedDashboardFilters.durations)) return false;
    return true;
  });
}

function renderDashboardExtraFilters() {
  const panel = document.getElementById("dashboardFiltersPanel");
  const toggle = document.getElementById("dashboardFiltersToggle");
  panel.hidden = !dashboardFiltersOpen;
  toggle.innerHTML = `Filtros <span class="filter-arrow">${dashboardFiltersOpen ? "▴" : "▾"}</span>`;

  renderDashboardFilterChips(
    document.getElementById("dashboardCategoryChips"),
    uniq([...state.settings.categories, ...state.projects.map((p) => getProjectField(p, "category"))]).filter(Boolean),
    selectedDashboardFilters.categories,
    "categories"
  );
  renderDashboardFilterChips(
    document.getElementById("dashboardFormatChips"),
    uniq([...state.settings.formats, ...state.projects.map((p) => getProjectField(p, "format"))]).filter(Boolean),
    selectedDashboardFilters.formats,
    "formats"
  );
  renderDashboardFilterChips(
    document.getElementById("dashboardNatureChips"),
    uniq([...state.settings.natures, ...state.projects.map((p) => getProjectField(p, "nature"))]).filter(Boolean),
    selectedDashboardFilters.natures,
    "natures"
  );
  renderDashboardFilterChips(
    document.getElementById("dashboardDurationChips"),
    uniq([...state.settings.durations, ...state.projects.map((p) => getProjectField(p, "duration"))]).filter(Boolean),
    selectedDashboardFilters.durations,
    "durations"
  );
}

function renderDashboardFilterChips(container, values, selectedSet, key, onChange = renderDashboard) {
  const allActive = selectedSet.size === 0;
  container.innerHTML = [
    `<button class="chip ${allActive ? "active" : ""}" data-filter-key="${key}" data-filter-value="__all">Todos</button>`,
    ...values.map((value) => `<button class="chip ${selectedSet.has(value) ? "active" : ""}" data-filter-key="${key}" data-filter-value="${encodeURIComponent(value)}">${escapeHtml(value)}</button>`)
  ].join("");

  container.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const filterValue = chip.dataset.filterValue === "__all" ? "__all" : decodeURIComponent(chip.dataset.filterValue);
      const set = selectedSet;
      if (filterValue === "__all") {
        set.clear();
      } else if (set.has(filterValue)) {
        set.delete(filterValue);
      } else {
        set.add(filterValue);
      }
      onChange();
    });
  });
}

function matchesMultiFilter(value, selectedSet) {
  if (!selectedSet || selectedSet.size === 0) return true;
  const normalized = String(value || "").trim();
  return normalized && selectedSet.has(normalized);
}

function getProjectField(project, field) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = project?.[key];
      if (value !== null && value !== undefined && String(value).trim() !== "") return String(value).trim();
    }
    return "";
  };

  if (field === "category") return pick("category", "categoria");
  if (field === "format") return pick("format", "formato", "productionType", "production_type");
  if (field === "nature") return pick("nature", "natureza");
  if (field === "duration") return pick("duration", "duracao");
  if (field === "status") return pick("status");
  return pick(field);
}

function getProjectYear(project) {
  const normalizedReleaseDate = inferReleaseDate(project);
  if (!normalizedReleaseDate) return null;
  return Number(normalizedReleaseDate.slice(0, 4));
}

function renderGantt() {
  renderGanttYearChips();
  renderGanttExtraFilters();
  normalizeTimelineWindow();
  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;

  const months = monthsBetween(state.timeline.start, state.timeline.end);
  const list = sortedProjects(filteredGanttProjects(), "desc");
  const container = document.getElementById("ganttContainer");
  const rangeLabel = document.getElementById("timelineRangeLabel");
  if (rangeLabel) rangeLabel.textContent = timelineRangeLabel(state.timeline.start, state.timeline.end);

  if (!months.length) {
    container.innerHTML = '<div class="empty">Período inválido.</div>';
    return;
  }

  const leftWidth = 270;
  const availableWidth = Math.max(container.clientWidth - leftWidth - 8, 320);
  const monthWidth = Math.max(38, Math.floor(availableWidth / months.length));
  const timelineWidth = months.length * monthWidth;
  container.style.setProperty("--month-width", `${monthWidth}px`);

  let html = `<div class="gantt" style="min-width:${leftWidth + timelineWidth}px">`;
  html += `<div class="gantt-head" style="grid-template-columns:${leftWidth}px ${timelineWidth}px">`;
  html += '<div class="g-left">PROJETO</div>';
  html += `<div class="g-months">${months.map((m) => `<div class="g-month">${monthLabel(m)}</div>`).join("")}</div>`;
  html += "</div>";

  list.forEach((project) => {
    html += `<div class="gantt-row" style="grid-template-columns:${leftWidth}px ${timelineWidth}px">`;
    html += `<div class="g-left">
      <button class="g-open" data-open-project="${project.id}">
        <span class="g-code">${escapeHtml(project.code || "")}</span>
        <span class="g-title">${escapeHtml(project.title)}</span>
      </button>
      <button class="g-add-stage" data-add-stage="${project.id}" title="Adicionar etapa">+</button>
    </div>`;

    html += `<div class="g-line" data-line-project="${project.id}">`;
    project.stages.forEach((st) => {
      const start = monthToIndex(st.start) - monthToIndex(state.timeline.start);
      const end = monthToIndex(st.end) - monthToIndex(state.timeline.start);
      if (end < 0 || start >= months.length) return;
      const visStart = Math.max(0, start);
      const visEnd = Math.min(months.length - 1, end);
      const width = visEnd - visStart + 1;
      const stageDef = state.settings.stages.find((s) => s.id === st.stageId);
      const color = stageDef?.color || "#cbd5e1";
      const selected = selectedStageRef && selectedStageRef.projectId === project.id && selectedStageRef.stageId === st.id;

      html += `<div class="stage-bar ${selected ? "selected" : ""}" style="left: calc(${visStart} * var(--month-width)); width: calc(${width} * var(--month-width) - 2px); background:${color}" data-project="${project.id}" data-stage="${st.id}">
        <span class="label">${escapeHtml(stageDef?.name || st.name || "Etapa")}</span>
        <span class="stage-handle left" data-resize="left"></span>
        <span class="stage-handle right" data-resize="right"></span>
      </div>`;
    });

    const releaseMarker = getReleaseMarkerData(project.releaseDate, state.timeline.start, state.timeline.end);
    if (releaseMarker) {
      html += `<div class="release-marker" style="left: calc(${releaseMarker.offsetMonths.toFixed(4)} * var(--month-width));" title="Lançamento: ${escapeHtml(
        releaseMarker.label
      )}">
        <span class="release-dot"></span>
        <small>${escapeHtml(releaseMarker.short)}</small>
      </div>`;
    }
    html += "</div></div>";
  });

  html += "</div>";
  container.innerHTML = html;

  container.querySelectorAll("[data-open-project]").forEach((el) => {
    el.addEventListener("click", () => openProjectDialog(el.dataset.openProject));
  });

  container.querySelectorAll("[data-add-stage]").forEach((el) => {
    el.addEventListener("click", () => openStageDialog(el.dataset.addStage));
  });

  container.querySelectorAll(".stage-bar").forEach((bar) => {
    bar.addEventListener("click", () => {
      selectedStageRef = { projectId: bar.dataset.project, stageId: bar.dataset.stage };
      renderGantt();
    });
    bar.addEventListener("dblclick", () => openStageDialog(bar.dataset.project, bar.dataset.stage));
    bar.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      const handle = event.target.closest("[data-resize]");
      startStageDrag(event, bar, handle?.dataset.resize || "move");
    });
  });

  container.querySelectorAll(".g-line").forEach((line) => {
    const projectId = line.dataset.lineProject;
    line.addEventListener("mousemove", (event) => renderStageGhost(line, event));
    line.addEventListener("mouseleave", () => removeStageGhost(line));
    line.addEventListener("click", (event) => {
      if (Date.now() < suppressLineClickUntil) return;
      if (event.target.closest(".stage-bar")) return;
      const idx = monthIndexFromLinePointer(line, event);
      if (idx == null) return;
      const month = addMonths(state.timeline.start, idx);
      openStageDialog(projectId, null, month);
    });
  });
}

function renderTimelineYearChips() {
  const years = [...new Set(monthsBetween(state.timeline.start, state.timeline.end).map((m) => Number(m.slice(0, 4))))];
  document.getElementById("timelineYears").innerHTML = years.map((y) => `<span class="chip active">${y}</span>`).join("");
}

function renderGanttYearChips() {
  const years = [...new Set(state.projects.map((p) => getProjectYear(p)).filter((y) => y > 0))].sort((a, b) => a - b);
  const allActive = selectedGanttYears.size === 0;
  const chips = ["Todos", ...years];
  document.getElementById("timelineYears").innerHTML = chips
    .map((y) => {
      const active = y === "Todos" ? allActive : selectedGanttYears.has(String(y));
      const value = y === "Todos" ? "__all" : String(y);
      return `<button class="chip ${active ? "active" : ""}" data-gyear="${value}">${y}</button>`;
    })
    .join("");

  document.querySelectorAll("#timelineYears .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.gyear === "__all") {
        selectedGanttYears.clear();
      } else {
        const y = chip.dataset.gyear;
        if (selectedGanttYears.has(y)) selectedGanttYears.delete(y);
        else selectedGanttYears.add(y);
      }
      renderGantt();
    });
  });
}

function renderGanttExtraFilters() {
  const panel = document.getElementById("ganttFiltersPanel");
  const toggle = document.getElementById("btnFilterGantt");
  panel.hidden = !ganttFiltersOpen;
  toggle.innerHTML = `Filtros <span class="filter-arrow">${ganttFiltersOpen ? "▴" : "▾"}</span>`;

  renderDashboardFilterChips(
    document.getElementById("ganttCategoryChips"),
    uniq([...state.settings.categories, ...state.projects.map((p) => getProjectField(p, "category"))]).filter(Boolean),
    selectedGanttFilters.categories,
    "categories",
    () => renderGantt()
  );
  renderDashboardFilterChips(
    document.getElementById("ganttFormatChips"),
    uniq([...state.settings.formats, ...state.projects.map((p) => getProjectField(p, "format"))]).filter(Boolean),
    selectedGanttFilters.formats,
    "formats",
    () => renderGantt()
  );
  renderDashboardFilterChips(
    document.getElementById("ganttNatureChips"),
    uniq([...state.settings.natures, ...state.projects.map((p) => getProjectField(p, "nature"))]).filter(Boolean),
    selectedGanttFilters.natures,
    "natures",
    () => renderGantt()
  );
  renderDashboardFilterChips(
    document.getElementById("ganttDurationChips"),
    uniq([...state.settings.durations, ...state.projects.map((p) => getProjectField(p, "duration"))]).filter(Boolean),
    selectedGanttFilters.durations,
    "durations",
    () => renderGantt()
  );
}

function filteredGanttProjects() {
  return state.projects.filter((p) => {
    if (selectedGanttYears.size && !selectedGanttYears.has(String(getProjectYear(p)))) return false;
    if (!matchesMultiFilter(getProjectField(p, "category"), selectedGanttFilters.categories)) return false;
    if (!matchesMultiFilter(getProjectField(p, "format"), selectedGanttFilters.formats)) return false;
    if (!matchesMultiFilter(getProjectField(p, "nature"), selectedGanttFilters.natures)) return false;
    if (!matchesMultiFilter(getProjectField(p, "duration"), selectedGanttFilters.durations)) return false;
    return true;
  });
}

function openStageDialog(projectId, stageId = null, forcedStart = null) {
  const project = state.projects.find((p) => p.id === projectId);
  if (!project) return;
  const stage = stageId ? project.stages.find((s) => s.id === stageId) : null;
  const dialog = document.getElementById("stageDialog");
  const stageSelect = document.getElementById("stageTypeSelect");

  stageSelect.innerHTML = state.settings.stages
    .map((st) => `<option value="${st.id}" ${st.id === (stage?.stageId || state.settings.stages[0]?.id) ? "selected" : ""}>${escapeHtml(st.name)}</option>`)
    .join("");

  document.getElementById("stageDialogTitle").textContent = stage ? "Editar Etapa" : "Nova Etapa";
  document.getElementById("stageProjectId").value = project.id;
  document.getElementById("stageId").value = stage?.id || "";
  document.getElementById("stageProjectLabel").value = `${project.code || ""} ${project.title}`.trim();
  document.getElementById("stageStart").value = stage?.start || forcedStart || state.timeline.start;
  document.getElementById("stageEnd").value = stage?.end || forcedStart || state.timeline.start;
  document.getElementById("stageNotes").value = stage?.notes || "";
  document.getElementById("stageDeleteBtn").style.visibility = stage ? "visible" : "hidden";
  dialog.showModal();
}

function startStageDrag(event, bar, mode) {
  event.preventDefault();
  const projectId = bar.dataset.project;
  const stageId = bar.dataset.stage;
  const project = state.projects.find((p) => p.id === projectId);
  const stage = project?.stages.find((s) => s.id === stageId);
  if (!stage) return;
  const monthWidth = parseFloat(getComputedStyle(document.getElementById("ganttContainer")).getPropertyValue("--month-width")) || 46;
  draggingStage = {
    projectId,
    stageId,
    mode,
    startX: event.clientX,
    startMonth: monthToIndex(stage.start),
    endMonth: monthToIndex(stage.end),
    monthWidth,
    moved: false
  };
  document.addEventListener("mousemove", onStageDragMove);
  document.addEventListener("mouseup", onStageDragEnd, { once: true });
}

function onStageDragMove(event) {
  if (!draggingStage) return;
  const delta = Math.round((event.clientX - draggingStage.startX) / draggingStage.monthWidth);
  const project = state.projects.find((p) => p.id === draggingStage.projectId);
  const stage = project?.stages.find((s) => s.id === draggingStage.stageId);
  if (!stage) return;

  let start = draggingStage.startMonth;
  let end = draggingStage.endMonth;
  if (draggingStage.mode === "move") {
    start += delta;
    end += delta;
  } else if (draggingStage.mode === "left") {
    start = Math.min(draggingStage.startMonth + delta, end);
  } else if (draggingStage.mode === "right") {
    end = Math.max(draggingStage.endMonth + delta, start);
  }
  stage.start = indexToMonth(start);
  stage.end = indexToMonth(end);
  if (delta !== 0) draggingStage.moved = true;
  renderGantt();
}

function onStageDragEnd() {
  document.removeEventListener("mousemove", onStageDragMove);
  if (draggingStage?.moved) suppressLineClickUntil = Date.now() + 250;
  draggingStage = null;
  saveState();
  renderDashboard();
}

function monthIndexFromLinePointer(line, event) {
  const rect = line.getBoundingClientRect();
  const monthWidth = parseFloat(getComputedStyle(document.getElementById("ganttContainer")).getPropertyValue("--month-width")) || 46;
  const x = event.clientX - rect.left;
  const idx = Math.floor(x / monthWidth);
  const max = monthsBetween(state.timeline.start, state.timeline.end).length - 1;
  if (idx < 0 || idx > max) return null;
  return idx;
}

function renderStageGhost(line, event) {
  const idx = monthIndexFromLinePointer(line, event);
  if (idx == null) return;
  let ghost = line.querySelector(".stage-ghost");
  if (!ghost) {
    ghost = document.createElement("div");
    ghost.className = "stage-ghost";
    line.appendChild(ghost);
  }
  ghost.style.left = `calc(${idx} * var(--month-width))`;
  ghost.textContent = monthHoverLabel(addMonths(state.timeline.start, idx));
}

function removeStageGhost(line) {
  line.querySelector(".stage-ghost")?.remove();
}

function zoomTimeline(delta) {
  normalizeTimelineWindow();
  const current = getTimelineMonthsShown();
  const next = Math.max(6, Math.min(72, current + delta));
  state.timeline.monthsShown = next;
  state.timeline.end = addMonths(state.timeline.start, next - 1);
  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;
  saveState();
  renderGantt();
}

function decreaseTimelineWindow() {
  zoomTimeline(6);
}

function increaseTimelineWindow() {
  zoomTimeline(-6);
}

function panTimeline(delta) {
  normalizeTimelineWindow();
  state.timeline.start = addMonths(state.timeline.start, delta);
  state.timeline.end = addMonths(state.timeline.end, delta);
  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;
  saveState();
  renderGantt();
}

function renderProjectsTools() {
  const panel = document.getElementById("projectFiltersPanel");
  const toggle = document.getElementById("btnFilterProjects");
  panel.hidden = !projectFiltersOpen;
  toggle.innerHTML = `Filtros <span class="filter-arrow">${projectFiltersOpen ? "▴" : "▾"}</span>`;

  const years = [...new Set(state.projects.map((p) => getProjectYear(p)).filter((y) => y > 0))].sort((a, b) => a - b);
  const allActive = selectedProjectYears.size === 0;
  document.getElementById("projectYears").innerHTML = ["Todos", ...years]
    .map((year) => {
      const active = year === "Todos" ? allActive : selectedProjectYears.has(String(year));
      const value = year === "Todos" ? "__all" : String(year);
      return `<button class="chip ${active ? "active" : ""}" data-pyear="${value}">${year}</button>`;
    })
    .join("");

  document.querySelectorAll("#projectYears .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      if (chip.dataset.pyear === "__all") selectedProjectYears.clear();
      else if (selectedProjectYears.has(chip.dataset.pyear)) selectedProjectYears.delete(chip.dataset.pyear);
      else selectedProjectYears.add(chip.dataset.pyear);
      renderProjectsTable();
      renderProjectsTools();
    });
  });

  renderDashboardFilterChips(
    document.getElementById("projectCategoryChips"),
    uniq([...state.settings.categories, ...state.projects.map((p) => getProjectField(p, "category"))]).filter(Boolean),
    selectedProjectFilters.categories,
    "categories",
    () => {
      renderProjectsTools();
      renderProjectsTable();
    }
  );
  renderDashboardFilterChips(
    document.getElementById("projectFormatChips"),
    uniq([...state.settings.formats, ...state.projects.map((p) => getProjectField(p, "format"))]).filter(Boolean),
    selectedProjectFilters.formats,
    "formats",
    () => {
      renderProjectsTools();
      renderProjectsTable();
    }
  );
  renderDashboardFilterChips(
    document.getElementById("projectNatureChips"),
    uniq([...state.settings.natures, ...state.projects.map((p) => getProjectField(p, "nature"))]).filter(Boolean),
    selectedProjectFilters.natures,
    "natures",
    () => {
      renderProjectsTools();
      renderProjectsTable();
    }
  );
  renderDashboardFilterChips(
    document.getElementById("projectDurationChips"),
    uniq([...state.settings.durations, ...state.projects.map((p) => getProjectField(p, "duration"))]).filter(Boolean),
    selectedProjectFilters.durations,
    "durations",
    () => {
      renderProjectsTools();
      renderProjectsTable();
    }
  );
}

function renderProjectsTable() {
  const query = document.getElementById("projectSearch").value.trim().toLowerCase();

  const projects = sortedProjects(state.projects, "desc").filter((p) => {
    const hit = !query || String(p.title || "").toLowerCase().includes(query) || String(p.code || "").toLowerCase().includes(query);
    if (!hit) return false;
    if (selectedProjectYears.size && !selectedProjectYears.has(String(getProjectYear(p)))) return false;
    if (!matchesMultiFilter(getProjectField(p, "category"), selectedProjectFilters.categories)) return false;
    if (!matchesMultiFilter(getProjectField(p, "format"), selectedProjectFilters.formats)) return false;
    if (!matchesMultiFilter(getProjectField(p, "nature"), selectedProjectFilters.natures)) return false;
    if (!matchesMultiFilter(getProjectField(p, "duration"), selectedProjectFilters.durations)) return false;
    return true;
  });

  const body = document.getElementById("projectsTableBody");
  if (!projects.length) {
    body.innerHTML = '<tr><td colspan="9" class="empty">Nenhum projeto encontrado.</td></tr>';
    return;
  }

  const categories = uniq(state.settings.categories).filter(Boolean);
  const formats = uniq(state.settings.formats).filter(Boolean);
  const natures = uniq(state.settings.natures).filter(Boolean);
  const statuses = uniq(state.settings.statuses).filter(Boolean);

  body.innerHTML = projects
    .map((p) => {
      const badgeClass = STATUS_COLORS[p.status] || "gray";
      return `<tr>
        <td><button class="btn light cell-link-edit" data-action="edit" data-id="${p.id}">${escapeHtml(p.code || "")}</button></td>
        <td><button class="btn light cell-link-edit" data-action="edit" data-id="${p.id}">${escapeHtml(p.title || "")}</button></td>
        <td>${inlineSelect("category", p.id, getProjectField(p, "category"), categories)}</td>
        <td>${inlineSelect("format", p.id, getProjectField(p, "format"), formats)}</td>
        <td>${inlineSelect("nature", p.id, getProjectField(p, "nature"), natures)}</td>
        <td><input class="cell-inline-input" data-action="inline-budget" data-id="${p.id}" type="number" min="0" step="0.01" value="${p.budget ?? p.spent ?? ""}" placeholder="R$" /></td>
        <td><input class="cell-inline-input" data-action="inline-release-date" data-id="${p.id}" type="text" inputmode="numeric" placeholder="dd/mm/aaaa" maxlength="10" value="${formatDatePtBr(p.releaseDate || "")}" /></td>
        <td>${inlineSelect("status", p.id, getProjectField(p, "status"), statuses, badgeClass)}</td>
        <td>
          <button class="btn light icon-btn" data-action="edit" data-id="${p.id}" title="Editar projeto" aria-label="Editar projeto">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41L18.37 3.3a1 1 0 0 0-1.41 0l-1.54 1.54 3.75 3.75 1.54-1.55z"/></svg>
          </button>
          <button class="btn danger icon-btn" data-action="del" data-id="${p.id}" title="Excluir projeto" aria-label="Excluir projeto">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v9h-2V9zm4 0h2v9h-2V9zM7 9h2v9H7V9zm-1 12h12a2 2 0 0 0 2-2V8H4v11a2 2 0 0 0 2 2z"/></svg>
          </button>
        </td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll("button[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => openProjectDialog(btn.dataset.id));
  });

  body.querySelectorAll("select[data-action='inline-select']").forEach((el) => {
    el.addEventListener("change", () => {
      const project = state.projects.find((p) => p.id === el.dataset.id);
      if (!project) return;
      const field = el.dataset.field;
      if (field === "category") project.category = el.value;
      if (field === "format") project.format = el.value;
      if (field === "nature") project.nature = el.value;
      if (field === "status") project.status = el.value;
      saveState();
      renderProjectsTable();
      renderDashboard();
      renderGantt();
    });
  });

  body.querySelectorAll("input[data-action='inline-budget']").forEach((el) => {
    el.addEventListener("change", () => {
      const project = state.projects.find((p) => p.id === el.dataset.id);
      if (!project) return;
      const value = el.value.trim();
      project.budget = value === "" ? null : Number(value);
      saveState();
      renderProjectsTable();
      renderDashboard();
    });
  });

  body.querySelectorAll("input[data-action='inline-release-date']").forEach((el) => {
    el.addEventListener("change", () => {
      const project = state.projects.find((p) => p.id === el.dataset.id);
      if (!project) return;
      const raw = String(el.value || "").trim();
      const normalized = normalizeDateInput(raw);
      if (raw && !normalized) {
        alert("Data inválida. Use o formato dd/mm/aaaa.");
        renderProjectsTable();
        return;
      }
      project.releaseDate = normalized;
      project.year = normalized ? Number(normalized.slice(0, 4)) : null;
      saveState();
      renderProjectsTable();
      renderGantt();
      renderDashboard();
      renderProjectsTools();
    });
  });

  body.querySelectorAll("button[data-action='del']").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!confirm("Excluir projeto?")) return;
      state.projects = state.projects.filter((p) => p.id !== btn.dataset.id);
      saveState();
      renderAll();
    });
  });
}

function openProjectDialog(projectId = null) {
  const project = state.projects.find((p) => p.id === projectId);
  const dialog = document.getElementById("projectDialog");

  fillSelect("projectCategory", state.settings.categories, project?.category);
  fillSelect("projectFormat", state.settings.formats, project?.format);
  fillSelect("projectNature", state.settings.natures, project?.nature);
  fillSelect("projectDuration", state.settings.durations, project?.duration);
  fillSelect("projectStatus", ["", ...state.settings.statuses], project?.status || "");

  document.getElementById("dialogTitle").textContent = project ? "Editar Projeto" : "Novo Projeto";
  document.getElementById("btnDeleteProject").style.visibility = project ? "visible" : "hidden";

  document.getElementById("projectId").value = project?.id || uid();
  document.getElementById("projectCode").value = project?.code || nextCode();
  document.getElementById("projectTitle").value = project?.title || "";
  document.getElementById("projectBudget").value = project?.budget ?? "";
  document.getElementById("projectReleaseDate").value = formatDatePtBr(project?.releaseDate || "");
  document.getElementById("projectNotes").value = project?.notes || "";

  const stageWrap = document.getElementById("projectStages");
  stageWrap.innerHTML = "";
  const stages = project?.stages?.length
    ? project.stages
    : [
        {
          id: uid(),
          stageId: state.settings.stages[0]?.id || "",
          start: state.timeline.start,
          end: addMonths(state.timeline.start, 2)
        }
      ];

  stages.forEach((stage) => stageWrap.appendChild(buildStageRow(stage)));
  dialog.showModal();
}

function collectProjectForm() {
  const projectId = document.getElementById("projectId").value;
  const existingProject = state.projects.find((project) => project.id === projectId);
  const rawBudget = document.getElementById("projectBudget").value.trim();
  const rawReleaseDate = document.getElementById("projectReleaseDate").value.trim();
  const normalizedReleaseDate = normalizeDateInput(rawReleaseDate);
  if (rawReleaseDate && !normalizedReleaseDate) {
    alert("Data de lançamento inválida. Use o formato dd/mm/aaaa.");
    return null;
  }
  const stages = [...document.querySelectorAll("#projectStages .stage-row")]
    .map((row) => {
      const stageId = row.querySelector('[data-field="stageId"]').value;
      const start = row.querySelector('[data-field="start"]').value;
      const end = row.querySelector('[data-field="end"]').value;
      if (!stageId || !start || !end || monthToIndex(start) > monthToIndex(end)) return null;
      return {
        id: row.dataset.id,
        stageId,
        start,
        end
      };
    })
    .filter(Boolean);

  return {
    id: projectId,
    code: document.getElementById("projectCode").value.trim(),
    title: document.getElementById("projectTitle").value.trim(),
    year: normalizedReleaseDate ? Number(normalizedReleaseDate.slice(0, 4)) : null,
    category: document.getElementById("projectCategory").value,
    productionType: existingProject?.productionType || "",
    format: document.getElementById("projectFormat").value,
    nature: document.getElementById("projectNature").value,
    duration: document.getElementById("projectDuration").value,
    status: document.getElementById("projectStatus").value,
    budget: rawBudget === "" ? null : Number(rawBudget),
    releaseDate: normalizedReleaseDate,
    spent: null,
    notes: document.getElementById("projectNotes").value.trim(),
    stages
  };
}

function buildStageRow(stage = null) {
  const tpl = document.getElementById("stageRowTpl");
  const row = tpl.content.firstElementChild.cloneNode(true);
  row.dataset.id = stage?.id || uid();

  const select = row.querySelector('[data-field="stageId"]');
  select.innerHTML = state.settings.stages
    .map((st) => `<option value="${st.id}" ${st.id === (stage?.stageId || state.settings.stages[0]?.id) ? "selected" : ""}>${escapeHtml(st.name)}</option>`)
    .join("");

  row.querySelector('[data-field="start"]').value = stage?.start || state.timeline.start;
  row.querySelector('[data-field="end"]').value = stage?.end || addMonths(state.timeline.start, 1);

  row.querySelector("[data-remove]").addEventListener("click", () => row.remove());
  return row;
}

function renderConfigTabs() {
  if (!CONFIG_META[selectedConfigKey]) selectedConfigKey = Object.keys(CONFIG_META)[0];
  const tabs = Object.entries(CONFIG_META);
  const el = document.getElementById("configTabs");
  el.innerHTML = tabs
    .map(([key, label]) => `<button class="chip config-tab-chip ${selectedConfigKey === key ? "active" : ""}" data-key="${key}">${label}</button>`)
    .join("");

  el.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedConfigKey = chip.dataset.key;
      renderConfigTabs();
      renderConfigList();
    });
  });
}

function renderConfigList() {
  document.getElementById("configTitle").textContent = CONFIG_META[selectedConfigKey];
  const list = document.getElementById("configList");

  if (selectedConfigKey === "stages") {
    list.innerHTML = state.settings.stages
      .map(
        (item, index) => `<li class="config-item" data-config-index="${index}" data-config-id="${item.id}">
      <span class="config-item-main">
        <button type="button" class="btn light config-drag-btn" draggable="true" title="Arrastar para ordenar" aria-label="Arrastar para ordenar">⋮⋮</button>
        <span class="config-item-label">${escapeHtml(item.name)}</span>
      </span>
      <span class="actions">
        <input class="config-color-input" type="color" value="${item.color}" data-action="color" data-id="${item.id}" />
        <button class="btn light" data-action="edit" data-id="${item.id}">Editar</button>
        <button class="btn danger" data-action="del" data-id="${item.id}">Excluir</button>
      </span>
    </li>`
      )
      .join("");
  } else {
    const hasColor = COLOR_CONFIG_KEYS.has(selectedConfigKey);
    const arr = state.settings[selectedConfigKey] || [];
    list.innerHTML = arr
      .map(
        (item, i) => `<li class="config-item" data-config-index="${i}" data-config-id="${i}">
      <span class="config-item-main">
        <button type="button" class="btn light config-drag-btn" draggable="true" title="Arrastar para ordenar" aria-label="Arrastar para ordenar">⋮⋮</button>
        <span class="config-item-label">${escapeHtml(item)}</span>
      </span>
      <span class="actions">
        ${
          hasColor
            ? `<input class="config-color-input" type="color" value="${getConfigItemColor(selectedConfigKey, item, i)}" data-action="item-color" data-id="${i}" />`
            : ""
        }
        <button class="btn light" data-action="edit" data-id="${i}">Editar</button>
        <button class="btn danger" data-action="del" data-id="${i}">Excluir</button>
      </span>
    </li>`
      )
      .join("");
  }

  if (!list.children.length) list.innerHTML = '<li class="empty">Sem itens.</li>';

  list.querySelectorAll("button[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => editConfigItem(btn.dataset.id));
  });

  list.querySelectorAll("button[data-action='del']").forEach((btn) => {
    btn.addEventListener("click", () => deleteConfigItem(btn.dataset.id));
  });

  list.querySelectorAll("input[data-action='color']").forEach((input) => {
    input.addEventListener("change", () => {
      const stage = state.settings.stages.find((st) => st.id === input.dataset.id);
      if (!stage) return;
      stage.color = input.value;
      saveState();
      renderGantt();
      renderConfigList();
    });
  });

  list.querySelectorAll("input[data-action='item-color']").forEach((input) => {
    input.addEventListener("change", () => {
      const idx = Number(input.dataset.id);
      const item = state.settings[selectedConfigKey]?.[idx];
      if (!item) return;
      setConfigItemColor(selectedConfigKey, item, input.value);
      saveState();
      renderAll();
    });
  });

  initConfigDragAndDrop(list);
}

function addConfigItem() {
  if (selectedConfigKey === "stages") {
    const name = prompt("Nome da etapa:");
    if (!name || !name.trim()) return;
    state.settings.stages.push({ id: uid(), name: name.trim(), color: randomColor() });
  } else {
    const label = CONFIG_SINGULAR_META[selectedConfigKey];
    const value = prompt(`Novo ${label}:`);
    if (!value || !value.trim()) return;
    const nextValue = value.trim();
    state.settings[selectedConfigKey].push(nextValue);
    if (COLOR_CONFIG_KEYS.has(selectedConfigKey)) {
      setConfigItemColor(selectedConfigKey, nextValue, getConfigItemColor(selectedConfigKey, nextValue, state.settings[selectedConfigKey].length - 1));
    }
  }
  saveState();
  renderAll();
}

function editConfigItem(id) {
  openConfigItemDialog(id);
}

function deleteConfigItem(id) {
  if (!confirm("Excluir item?")) return;
  if (selectedConfigKey === "stages") {
    state.settings.stages = state.settings.stages.filter((st) => st.id !== id);
    state.projects.forEach((p) => {
      p.stages = p.stages.filter((st) => st.stageId !== id);
    });
  } else {
    const arr = state.settings[selectedConfigKey];
    const removed = arr[Number(id)];
    arr.splice(Number(id), 1);
    if (COLOR_CONFIG_KEYS.has(selectedConfigKey)) {
      deleteConfigItemColor(selectedConfigKey, removed);
    }
  }
  saveState();
  renderAll();
}

function isColorEnabledConfigKey(key) {
  return key === "stages" || COLOR_CONFIG_KEYS.has(key);
}

function openConfigItemDialog(id) {
  const key = selectedConfigKey;
  const dialog = document.getElementById("configItemDialog");
  const title = document.getElementById("configItemDialogTitle");
  const nameInput = document.getElementById("configItemName");
  const colorInput = document.getElementById("configItemColor");
  const colorWrap = document.getElementById("configItemColorWrap");

  let currentName = "";
  let currentColor = randomColor();

  if (key === "stages") {
    const stage = state.settings.stages.find((item) => item.id === id);
    if (!stage) return;
    currentName = stage.name;
    currentColor = stage.color || randomColor();
  } else {
    const idx = Number(id);
    const item = state.settings[key]?.[idx];
    if (!item) return;
    currentName = item;
    currentColor = getConfigItemColor(key, item, idx);
  }

  title.textContent = `Editar ${CONFIG_META[key]}`;
  document.getElementById("configItemKey").value = key;
  document.getElementById("configItemId").value = id;
  nameInput.value = currentName;
  colorWrap.hidden = !isColorEnabledConfigKey(key);
  colorInput.value = currentColor;
  dialog.showModal();
}

function saveConfigItemDialog() {
  const key = document.getElementById("configItemKey").value;
  const id = document.getElementById("configItemId").value;
  const nameInput = document.getElementById("configItemName");
  const colorInput = document.getElementById("configItemColor");
  const nextName = String(nameInput.value || "").trim();
  if (!nextName) return;

  const nextColor = normalizeHexColor(colorInput.value) || randomColor();
  const hasColor = isColorEnabledConfigKey(key);

  if (key === "stages") {
    const stage = state.settings.stages.find((item) => item.id === id);
    if (!stage) return;
    stage.name = nextName;
    if (hasColor) stage.color = nextColor;
  } else {
    const arr = state.settings[key] || [];
    const idx = Number(id);
    const current = arr[idx];
    if (!current) return;
    arr[idx] = nextName;
    if (hasColor) {
      if (current !== nextName) renameConfigItemColor(key, current, nextName, idx);
      setConfigItemColor(key, nextName, nextColor);
    }
  }

  saveState();
  renderAll();
}

function initConfigDragAndDrop(list) {
  let draggedIndex = null;
  const rows = [...list.querySelectorAll(".config-item")];
  rows.forEach((row) => {
    const handle = row.querySelector(".config-drag-btn");
    if (!handle) return;

    handle.addEventListener("dragstart", (event) => {
      draggedIndex = Number(row.dataset.configIndex);
      row.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(draggedIndex));
    });

    handle.addEventListener("dragend", () => {
      draggedIndex = null;
      rows.forEach((item) => item.classList.remove("drag-over", "dragging"));
    });

    row.addEventListener("dragover", (event) => {
      if (draggedIndex === null) return;
      event.preventDefault();
      row.classList.add("drag-over");
      event.dataTransfer.dropEffect = "move";
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over");
    });

    row.addEventListener("drop", (event) => {
      if (draggedIndex === null) return;
      event.preventDefault();
      row.classList.remove("drag-over");
      const targetIndex = Number(row.dataset.configIndex);
      if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex === draggedIndex) return;

      if (selectedConfigKey === "stages") moveArrayItem(state.settings.stages, draggedIndex, targetIndex);
      else moveArrayItem(state.settings[selectedConfigKey], draggedIndex, targetIndex);

      saveState();
      renderAll();
    });
  });
}

function importCsvFile(event) {
  const files = [...(event.target.files || [])];
  if (!files.length) return;
  readFilesAsText(files).then((fileMap) => {
    const normalized = normalizeBase44FileMap(fileMap);
    const available = Object.keys(normalized);
    const hasBase44 = BASE44_FILES.some((name) => available.includes(name));

    if (hasBase44) {
      try {
        state = buildStateFromBase44Exports(normalized, state);
        saveState();
        renderAll();
        alert(`Base44 importado: ${state.projects.length} projetos carregados.`);
      } catch (err) {
        alert(`Falha ao importar Base44 CSV: ${err.message}`);
      }
    } else {
      importSimpleProjectCsv(fileMap[Object.keys(fileMap)[0]]);
    }
  });
  event.target.value = "";
}

function normalizeBase44FileMap(fileMap) {
  const mapped = {};
  const patterns = {
    "Category_export.csv": /category_export/i,
    "Duration_export.csv": /duration_export/i,
    "Format_export.csv": /format_export/i,
    "Nature_export.csv": /nature_export/i,
    "ProductionType_export.csv": /productiontype_export/i,
    "Project_export.csv": /project_export/i,
    "ProjectStatus_export.csv": /projectstatus_export/i,
    "Stage_export.csv": /stage_export/i,
    "StageType_export.csv": /stagetype_export/i
  };

  Object.entries(fileMap).forEach(([name, text]) => {
    const base = name.split("/").pop();
    const canonical = Object.entries(patterns).find(([, re]) => re.test(base))?.[0];
    if (canonical) mapped[canonical] = text;
  });

  return mapped;
}

function readFilesAsText(files) {
  return Promise.all(
    files.map(
      (file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve([file.name, String(reader.result || "")]);
          reader.onerror = () => reject(new Error(`Falha ao ler ${file.name}`));
          reader.readAsText(file, "utf-8");
        })
    )
  ).then((entries) => Object.fromEntries(entries));
}

function importSimpleProjectCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) {
    alert("CSV vazio.");
    return;
  }

  const imported = rows
    .filter((row) => row.titulo || row.title)
    .map((row) => ({
      id: uid(),
      code: row.codigo || row.code || nextCode(),
      title: row.titulo || row.title,
      year: row.ano || row.year ? Number(row.ano || row.year) : null,
      category: row.categoria || state.settings.categories[0],
      productionType: row.production_type || row.tipo || state.settings.productionTypes[0] || "",
      format: row.formato || state.settings.formats[0],
      nature: row.natureza || state.settings.natures[0],
      duration: row.duracao || state.settings.durations[0],
      status: row.status || "",
      budget: row.gasto || row.budget ? Number(row.gasto || row.budget) : null,
      releaseDate: inferReleaseDate({
        releaseDate: row.data_de_lancamento || row.data_lancamento || row.release_date || row.release_date_at || "",
        year: row.ano || row.year || ""
      }),
      spent: row.spent ? Number(row.spent) : null,
      notes: row.notas || "",
      stages: []
    }));

  state.projects.push(...imported);
  saveState();
  renderAll();
  alert(`${imported.length} projeto(s) importado(s).`);
}

function buildStateFromBase44Exports(fileMap, fallbackState) {
  const data = {};
  Object.entries(fileMap).forEach(([name, text]) => {
    data[name] = parseCsv(text);
  });

  const categoryRows = data["Category_export.csv"] || [];
  const durationRows = data["Duration_export.csv"] || [];
  const formatRows = data["Format_export.csv"] || [];
  const natureRows = data["Nature_export.csv"] || [];
  const productionTypeRows = data["ProductionType_export.csv"] || [];
  const projectRows = data["Project_export.csv"] || [];
  const statusRows = data["ProjectStatus_export.csv"] || [];
  const stageRows = data["Stage_export.csv"] || [];
  const stageTypeRows = data["StageType_export.csv"] || [];

  if (!projectRows.length) throw new Error("Project_export.csv não encontrado ou vazio.");

  const orderSort = (arr) =>
    [...arr].sort((a, b) => Number(a.order || 999) - Number(b.order || 999) || String(a.name || "").localeCompare(String(b.name || "")));
  const pickName = (arr) => orderSort(arr).map((r) => String(r.name || "").trim()).filter(Boolean);

  const stageTypeByName = {};
  const stages = orderSort(stageTypeRows).map((row) => {
    const obj = {
      id: row.id || uid(),
      name: row.name || "Etapa",
      color: colorKeyToHex(row.color),
      singleDay: String(row.single_day || "").toLowerCase() === "true"
    };
    stageTypeByName[String(obj.name).toLowerCase()] = obj;
    return obj;
  });

  const stageRowsByProject = {};
  stageRows.forEach((row) => {
    const projectId = String(row.project_id || "").trim();
    if (!projectId) return;
    const name = String(row.name || "").trim();
    const type = stageTypeByName[name.toLowerCase()];
    const start = monthFromDate(row.start_date);
    const end = monthFromDate(row.end_date) || start;
    if (!start) return;

    const stage = {
      id: row.id || uid(),
      stageId: type?.id || uid(),
      start,
      end,
      name,
      color: type?.color || colorKeyToHex(row.color),
      notes: row.notes || "",
      completed: String(row.completed || "").toLowerCase() === "true"
    };

    if (!stageRowsByProject[projectId]) stageRowsByProject[projectId] = [];
    stageRowsByProject[projectId].push(stage);
  });

  const projects = projectRows.map((row, idx) => {
    const projectId = row.id || uid();
    const linkedStages = (stageRowsByProject[projectId] || []).sort((a, b) => a.start.localeCompare(b.start));
    const parsedYear = String(row.year || "").trim();
    const yearValue = parsedYear ? Number(parsedYear) : null;
    return {
      id: projectId,
      code: row.sku || `02-${String(idx + 1).padStart(2, "0")}`,
      title: row.name || "Sem título",
      year: Number.isNaN(yearValue) ? null : yearValue,
      category: row.category || "",
      productionType: row.production_type || "",
      format: row.format || "",
      nature: row.nature || "",
      duration: row.duration || "",
      status: row.status || "",
      budget: row.budget ? Number(row.budget) : null,
      releaseDate: inferReleaseDate({
        releaseDate: row.release_date || row.data_de_lancamento || "",
        year: row.year || ""
      }),
      spent: row.spent ? Number(row.spent) : null,
      notes: row.notes || "",
      description: row.description || "",
      stages: linkedStages
    };
  });

  const categories = uniq([...pickName(categoryRows), ...projects.map((p) => p.category)]);
  const settings = {
    categories,
    productionTypes: uniq([...pickName(productionTypeRows), ...projects.map((p) => p.productionType)]),
    formats: uniq([...pickName(formatRows), ...projects.map((p) => p.format)]),
    natures: uniq([...pickName(natureRows), ...projects.map((p) => p.nature)]),
    durations: uniq([...pickName(durationRows), ...projects.map((p) => p.duration)]),
    statuses: uniq([...pickName(statusRows), ...projects.map((p) => p.status)]),
    stages: stages.length ? stages : fallbackState.settings.stages
  };
  settings.itemColors = mergeItemColors(buildDefaultItemColors(settings), {
    categories: buildItemColorMap(categoryRows, settings.categories, DEFAULT_ITEM_COLOR_PALETTES.categories),
    formats: buildItemColorMap(formatRows, settings.formats, DEFAULT_ITEM_COLOR_PALETTES.formats),
    natures: buildItemColorMap(natureRows, settings.natures, DEFAULT_ITEM_COLOR_PALETTES.natures),
    statuses: buildItemColorMap(statusRows, settings.statuses, DEFAULT_ITEM_COLOR_PALETTES.statuses)
  });

  const timeline = defaultTimelineWindow();

  return { settings, projects, timeline };
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  const pushCell = () => {
    row.push(cell);
    cell = "";
  };
  const pushRow = () => {
    if (row.length && row.some((c) => c !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (ch === "\"") {
      if (inQuotes && next === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      pushCell();
      continue;
    }
    if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && next === "\n") i += 1;
      pushCell();
      pushRow();
      continue;
    }
    cell += ch;
  }
  if (cell.length || row.length) {
    pushCell();
    pushRow();
  }

  if (!rows.length) return [];
  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());
  return rows.slice(1).map((cols) => {
    const item = {};
    headers.forEach((h, idx) => {
      item[h] = String(cols[idx] || "").trim();
    });
    return item;
  });
}

function colorKeyToHex(colorKey) {
  const key = String(colorKey || "").trim().toLowerCase();
  const map = {
    red: "#ef4444",
    yellow: "#f59e0b",
    green: "#10b981",
    gray: "#94a3b8",
    blue: "#3b82f6",
    pink: "#ec4899",
    orange: "#f97316",
    purple: "#8b5cf6"
  };
  return map[key] || randomColor();
}

function monthFromDate(date) {
  const value = String(date || "").trim();
  if (!value) return "";
  return value.slice(0, 7);
}

function isValidDateIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return false;
  const [year, month, day] = String(value).split("-").map(Number);
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function normalizeDateInput(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";

  if (isValidDateIso(raw)) return raw;

  const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) {
    const iso = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return isValidDateIso(iso) ? iso : "";
  }

  const isoDatePrefix = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoDatePrefix && isValidDateIso(isoDatePrefix[1])) return isoDatePrefix[1];

  return "";
}

function inferReleaseDate(source) {
  const direct = normalizeDateInput(source?.releaseDate || source?.release_date || source?.dataDeLancamento || source?.data_de_lancamento || "");
  if (direct) return direct;

  const rawYear = Number(source?.year || source?.ano);
  if (Number.isInteger(rawYear) && rawYear > 0) return `${rawYear}-01-01`;
  return "";
}

function formatDatePtBr(isoDate) {
  const normalized = normalizeDateInput(isoDate);
  if (!normalized) return "";
  const date = new Date(`${normalized}T00:00:00Z`);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date);
}

function getReleaseMarkerData(releaseDate, timelineStart, timelineEnd) {
  const normalized = normalizeDateInput(releaseDate);
  if (!normalized || !isValidMonth(timelineStart) || !isValidMonth(timelineEnd)) return null;
  const [year, month, day] = normalized.split("-").map(Number);
  const monthIso = `${year}-${String(month).padStart(2, "0")}`;
  const monthIndex = monthToIndex(monthIso);
  const startIndex = monthToIndex(timelineStart);
  const endIndex = monthToIndex(timelineEnd);
  if (monthIndex < startIndex || monthIndex > endIndex) return null;

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayOffset = Math.max(0, Math.min(day - 1, daysInMonth - 1)) / daysInMonth;
  const offsetMonths = monthIndex - startIndex + dayOffset;

  return {
    offsetMonths,
    label: formatDatePtBr(normalized),
    short: formatDatePtBr(normalized)
  };
}

function uniq(values) {
  return [...new Set(values.filter((v) => String(v || "").trim()))];
}

function renderBarChart(container, map, mode = "vertical", palette = ["#f3ba00"]) {
  const entries = Object.entries(map);
  if (!entries.length) {
    container.innerHTML = '<div class="empty">Sem dados.</div>';
    return;
  }

  const max = Math.max(...entries.map(([, v]) => Number(v)), 1);

  if (mode === "horizontal") {
    container.innerHTML = entries
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .map(([label, value], idx) => {
        const color = palette[idx % palette.length];
        return `<div class="bar-row">
          <small>${escapeHtml(label)}</small>
          <strong class="bar-value-start">${value} MESES</strong>
          <div class="bar-row-track"><div class="bar-row-fill" style="width:${(Number(value) / max) * 100}%; background:${color}"></div></div>
        </div>`;
      })
      .join("");
    return;
  }

  container.innerHTML = entries
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([label, value], idx) => {
      const color = palette[idx % palette.length];
      const height = Math.max((Number(value) / max) * 110, 8);
      return `<div class="bar-col"><div class="bar" style="height:${height}px; background:${color}"></div><small>${escapeHtml(label)}</small><small>${value}</small></div>`;
    })
    .join("");
}

function renderDonutChart(container, map) {
  const entries = Object.entries(map);
  if (!entries.length) {
    container.innerHTML = '<div class="empty">Sem dados.</div>';
    return;
  }

  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#8b5cf6", "#fb7185", "#06b6d4"];
  const total = entries.reduce((acc, [, v]) => acc + Number(v), 0);

  let angle = 0;
  const slices = entries
    .map(([, v], idx) => {
      const pct = (Number(v) / total) * 100;
      const from = angle;
      angle += pct;
      return `${colors[idx % colors.length]} ${from}% ${angle}%`;
    })
    .join(", ");

  const legend = entries
    .map(
      ([label, value], idx) => `<li><span class="legend-dot" style="background:${colors[idx % colors.length]}"></span>${escapeHtml(label)}: ${value}</li>`
    )
    .join("");

  container.innerHTML = `<div class="chart-donut-wrap"><div class="donut" style="background: conic-gradient(${slices})"></div><ul class="legend">${legend}</ul></div>`;
}

function summaryIconHtml(icon) {
  if (icon === "projects") {
    return `<span class="metric-icon metric-icon-yellow" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M3 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4zm2 1v3h3V5H5zm5 0v3h4V5h-4zm6 0v3h3V5h-3zM5 10v4h3v-4H5zm5 0v4h4v-4h-4zm6 0v4h3v-4h-3zM5 16v3h3v-3H5zm5 0v3h4v-3h-4zm6 0v3h3v-3h-3z"/></svg>
    </span>`;
  }
  if (icon === "spent") {
    return `<span class="metric-icon metric-icon-red" aria-hidden="true">
      <svg viewBox="0 0 24 24"><path d="M4 6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2h1a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-1v1a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6zm2 0v14h10V6H6zm12 4v7h1v-7h-1zm-3 3h4v2h-4v-2z"/></svg>
    </span>`;
  }
  return `<span class="metric-icon metric-icon-blue" aria-hidden="true">
    <svg viewBox="0 0 24 24"><path d="M4 4h2v15h14v2H4V4zm4 9h2v4H8v-4zm4-6h2v10h-2V7zm4 3h2v7h-2v-7z"/></svg>
  </span>`;
}

function cardHtml(title, value, icon = "projects") {
  return `<article class="card metric-card">
    <div class="metric-content">
      <span>${escapeHtml(title)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
    ${summaryIconHtml(icon)}
  </article>`;
}

function inlineSelect(field, projectId, currentValue, options, badgeClass = "") {
  const values = ["", ...options.filter((v) => String(v || "").trim())];
  const colorKey = field === "category" ? "categories" : field === "format" ? "formats" : field === "nature" ? "natures" : field === "status" ? "statuses" : "";
  const hexColor = colorKey ? getConfigItemColor(colorKey, currentValue, 0, true) : "";
  const inlineStyle = hexColor ? ` style="background:${hexToRgba(hexColor, 0.16)};border-color:${hexToRgba(hexColor, 0.45)}"` : "";
  const cls = `cell-inline-select${field === "status" && !inlineStyle && badgeClass ? ` status-${badgeClass}` : ""}`;
  return `<select class="${cls}" data-action="inline-select" data-field="${field}" data-id="${projectId}"${inlineStyle}>
    ${values
      .map((value) => `<option value="${escapeHtml(value)}" ${String(currentValue || "") === String(value) ? "selected" : ""}>${escapeHtml(value || "—")}</option>`)
      .join("")}
  </select>`;
}

function sortedProjects(list = state.projects, order = "asc") {
  const sorted = [...list].sort((a, b) => compareSkuDesc(a.code, b.code));
  return order === "desc" ? sorted : sorted.reverse();
}

function countBy(projects, picker, ignoreEmpty = false) {
  return projects.reduce((acc, p) => {
    const raw = picker(p);
    const key = String(raw ?? "").trim();
    if (ignoreEmpty && !key) return acc;
    const finalKey = key || "-";
    acc[finalKey] = (acc[finalKey] || 0) + 1;
    return acc;
  }, {});
}

function avgMonthsByStage(projects) {
  const acc = Object.fromEntries(
    state.settings.stages
      .filter((stage) => String(stage?.name || "").trim())
      .map((stage) => [stage.id, { name: stage.name, total: 0, count: 0 }])
  );

  projects.forEach((p) => {
    p.stages.forEach((s) => {
      if (!acc[s.stageId] || !isValidMonth(s.start) || !isValidMonth(s.end)) return;
      const months = monthToIndex(s.end) - monthToIndex(s.start) + 1;
      if (!Number.isFinite(months) || months <= 0) return;
      acc[s.stageId].total += months;
      acc[s.stageId].count += 1;
    });
  });

  return Object.fromEntries(Object.values(acc).filter((v) => v.count > 0).map((v) => [v.name, (v.total / v.count).toFixed(1)]));
}

function fillSelect(id, list, selected) {
  const el = document.getElementById(id);
  if (!el) return;
  const safeList = list?.length ? list : [""];
  el.innerHTML = safeList
    .map((item) => `<option ${item === selected ? "selected" : ""}>${escapeHtml(item)}</option>`)
    .join("");
  if (!safeList.includes(selected)) el.value = safeList[0];
}

function monthsBetween(start, end) {
  const out = [];
  let i = monthToIndex(start);
  const max = monthToIndex(end);
  while (i <= max) {
    out.push(indexToMonth(i));
    i += 1;
  }
  return out;
}

function monthToIndex(value) {
  if (!isValidMonth(value)) return Number.NaN;
  const [year, month] = value.split("-").map(Number);
  return year * 12 + (month - 1);
}

function indexToMonth(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

function addMonths(month, delta) {
  return indexToMonth(monthToIndex(month) + delta);
}

function monthLabel(isoMonth) {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, m] = isoMonth.split("-");
  return `${labels[Number(m) - 1]} ${String(y).slice(2)}`;
}

function monthHoverLabel(isoMonth) {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, m] = isoMonth.split("-");
  return `${labels[Number(m) - 1]}/${y}`;
}

function monthLabelLong(isoMonth) {
  const labels = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  const [y, m] = isoMonth.split("-");
  return `${labels[Number(m) - 1]} ${y}`;
}

function timelineRangeLabel(start, end) {
  if (!isValidMonth(start) || !isValidMonth(end)) return "";
  return `${monthLabelLong(start)} — ${monthLabelLong(end)}`;
}

function isValidMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ""));
}

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

function hasNumericValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return !Number.isNaN(Number(value));
}

function compareSkuDesc(codeA, codeB) {
  const a = parseSku(codeA);
  const b = parseSku(codeB);
  if (a && b) {
    if (a.prefix !== b.prefix) return b.prefix - a.prefix;
    return b.number - a.number;
  }
  if (a) return -1;
  if (b) return 1;
  return String(codeB || "").localeCompare(String(codeA || ""));
}

function parseSku(code) {
  const match = String(code || "").trim().match(/^(\d+)-(\d+)$/);
  if (!match) return null;
  return { prefix: Number(match[1]), number: Number(match[2]) };
}

function getTimelineMonthsShown() {
  const raw = Number(state.timeline?.monthsShown);
  if (Number.isFinite(raw) && raw > 0) return raw;
  if (isValidMonth(state.timeline?.start) && isValidMonth(state.timeline?.end)) {
    const diff = monthToIndex(state.timeline.end) - monthToIndex(state.timeline.start) + 1;
    if (Number.isFinite(diff) && diff > 0) return diff;
  }
  return 24;
}

function normalizeTimelineWindow() {
  if (!isValidMonth(state.timeline?.start)) {
    const def = defaultTimelineWindow();
    state.timeline.start = def.start;
  }
  const months = getTimelineMonthsShown();
  state.timeline.monthsShown = months;
  state.timeline.end = addMonths(state.timeline.start, months - 1);
}

function getProjectSpentValue(project) {
  const spentCandidate = project?.spent;
  const budgetCandidate = project?.budget;

  if (hasNumericValue(spentCandidate) && Number(spentCandidate) > 0) return Number(spentCandidate);
  if (hasNumericValue(budgetCandidate) && Number(budgetCandidate) > 0) return Number(budgetCandidate);
  return null;
}

function defaultTimelineWindow() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { start, end: addMonths(start, 23), monthsShown: 24 };
}

function moveArrayItem(arr, fromIndex, toIndex) {
  if (!Array.isArray(arr) || fromIndex === toIndex) return;
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
}

const DEFAULT_ITEM_COLOR_PALETTES = {
  categories: ["#f3ba00", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"],
  formats: ["#60a5fa", "#34d399", "#f472b6", "#f59e0b", "#a78bfa", "#22c55e"],
  natures: ["#10b981", "#0ea5e9", "#f97316", "#ef4444", "#8b5cf6", "#14b8a6"],
  statuses: ["#3b82f6", "#10b981", "#f59e0b", "#94a3b8", "#f97316", "#64748b"]
};

function normalizeHexColor(value) {
  const color = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color.toLowerCase();
  return "";
}

function buildDefaultItemColors(settings = {}) {
  return {
    categories: arrayToColorMap(settings.categories, DEFAULT_ITEM_COLOR_PALETTES.categories),
    formats: arrayToColorMap(settings.formats, DEFAULT_ITEM_COLOR_PALETTES.formats),
    natures: arrayToColorMap(settings.natures, DEFAULT_ITEM_COLOR_PALETTES.natures),
    statuses: arrayToColorMap(settings.statuses, DEFAULT_ITEM_COLOR_PALETTES.statuses)
  };
}

function arrayToColorMap(items = [], palette = []) {
  const list = Array.isArray(items) ? items : [];
  const map = {};
  list.forEach((item, index) => {
    const name = String(item || "").trim();
    if (!name) return;
    map[name] = palette[index % palette.length] || randomColor();
  });
  return map;
}

function mergeItemColors(defaults = {}, incoming = {}) {
  const output = {};
  Object.keys(defaults).forEach((key) => {
    output[key] = { ...defaults[key] };
    const source = incoming?.[key] && typeof incoming[key] === "object" ? incoming[key] : {};
    Object.entries(source).forEach(([name, color]) => {
      const normalized = normalizeHexColor(color);
      if (normalized) output[key][name] = normalized;
    });
  });
  return output;
}

function getConfigItemColor(key, label, index = 0, strict = false) {
  if (!COLOR_CONFIG_KEYS.has(key)) return "";
  const cleanLabel = String(label || "").trim();
  const existing = normalizeHexColor(state.settings?.itemColors?.[key]?.[cleanLabel]);
  if (existing) return existing;
  if (strict) return "";
  const palette = DEFAULT_ITEM_COLOR_PALETTES[key] || [];
  return palette[index % palette.length] || randomColor();
}

function setConfigItemColor(key, label, color) {
  if (!COLOR_CONFIG_KEYS.has(key)) return;
  const cleanLabel = String(label || "").trim();
  const normalized = normalizeHexColor(color);
  if (!cleanLabel || !normalized) return;
  if (!state.settings.itemColors || typeof state.settings.itemColors !== "object") {
    state.settings.itemColors = buildDefaultItemColors(state.settings);
  }
  if (!state.settings.itemColors[key]) state.settings.itemColors[key] = {};
  state.settings.itemColors[key][cleanLabel] = normalized;
}

function deleteConfigItemColor(key, label) {
  const cleanLabel = String(label || "").trim();
  if (!cleanLabel || !COLOR_CONFIG_KEYS.has(key)) return;
  if (!state.settings?.itemColors?.[key]) return;
  delete state.settings.itemColors[key][cleanLabel];
}

function renameConfigItemColor(key, oldLabel, newLabel, index = 0) {
  if (!COLOR_CONFIG_KEYS.has(key)) return;
  const oldName = String(oldLabel || "").trim();
  const newName = String(newLabel || "").trim();
  if (!newName) return;
  const previous = getConfigItemColor(key, oldName, index);
  deleteConfigItemColor(key, oldName);
  setConfigItemColor(key, newName, previous);
}

function buildItemColorMap(rows = [], items = [], fallbackPalette = []) {
  const byName = {};
  rows.forEach((row) => {
    const name = String(row?.name || "").trim();
    if (!name) return;
    const rawColor = String(row?.color || "").trim();
    const normalized = normalizeHexColor(rawColor) || (rawColor ? normalizeHexColor(colorKeyToHex(rawColor)) : "");
    if (normalized) byName[name] = normalized;
  });

  const map = {};
  items.forEach((name, index) => {
    const key = String(name || "").trim();
    if (!key) return;
    map[key] = byName[key] || fallbackPalette[index % fallbackPalette.length] || randomColor();
  });
  return map;
}

function hexToRgba(hex, alpha = 1) {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "";
  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function nextCode() {
  const skus = state.projects.map((p) => String(p.code || "").trim()).filter(Boolean);
  const matched = skus.map((sku) => sku.match(/^(\d+)-(\d+)$/)).filter(Boolean);
  if (matched.length) {
    const prefix = matched[0][1];
    const next = Math.max(...matched.map((m) => Number(m[2]) || 0)) + 1;
    return `${prefix}-${String(next).padStart(2, "0")}`;
  }
  const n = skus.length + 1;
  return `02-${String(n).padStart(2, "0")}`;
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function randomColor() {
  const colors = ["#34d399", "#60a5fa", "#fcd34d", "#f472b6", "#a78bfa", "#fb7185"];
  return colors[Math.floor(Math.random() * colors.length)];
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function saveState() {
  const serialized = JSON.stringify(state);
  localStorage.setItem(STORAGE_KEY, serialized);
  localStorage.setItem(`${STORAGE_KEY}_backup`, serialized);
}

function loadState() {
  const primary = loadStateFromKey(STORAGE_KEY);
  if (primary) return primary;

  for (const key of STORAGE_FALLBACK_KEYS) {
    const recovered = loadStateFromKey(key);
    if (recovered) {
      console.warn(`[Originais] Estado recuperado de '${key}'.`);
      if (key !== STORAGE_KEY) {
        const serialized = JSON.stringify(recovered);
        localStorage.setItem(STORAGE_KEY, serialized);
        localStorage.setItem(`${STORAGE_KEY}_backup`, serialized);
      }
      return recovered;
    }
  }

  console.warn("[Originais] Nenhum estado válido encontrado no localStorage. Carregando seed.");
  return seedState();
}

function loadStateFromKey(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const merged = mergeState(parsed);
    if (!Array.isArray(merged?.projects)) return null;
    return merged;
  } catch (error) {
    console.warn(`[Originais] Falha ao carregar localStorage '${key}'.`, error);
    return null;
  }
}

function pickArray(value, fallback) {
  if (Array.isArray(value) && value.length) return value;
  return Array.isArray(fallback) ? fallback : [];
}

function mergeState(parsed) {
  const base = seedState();
  const mergedSettings = {
    categories: pickArray(parsed?.settings?.categories, base.settings.categories),
    productionTypes: pickArray(parsed?.settings?.productionTypes, base.settings.productionTypes),
    formats: pickArray(parsed?.settings?.formats, base.settings.formats),
    natures: pickArray(parsed?.settings?.natures, base.settings.natures),
    durations: pickArray(parsed?.settings?.durations, base.settings.durations),
    statuses: pickArray(parsed?.settings?.statuses, base.settings.statuses),
    stages: pickArray(parsed?.settings?.stages, base.settings.stages)
  };
  mergedSettings.itemColors = mergeItemColors(buildDefaultItemColors(mergedSettings), parsed?.settings?.itemColors || base.settings.itemColors);

  const sourceProjects = Array.isArray(parsed?.projects) ? parsed.projects.filter((p) => p && typeof p === "object") : base.projects;
  const projects = sourceProjects.map((project) => ({
    ...project,
    releaseDate: inferReleaseDate(project)
  }));

  return {
    settings: mergedSettings,
    projects,
    timeline: {
      start: parsed?.timeline?.start || defaultTimelineWindow().start,
      end: parsed?.timeline?.end || defaultTimelineWindow().end,
      monthsShown:
        parsed?.timeline?.monthsShown ||
        (isValidMonth(parsed?.timeline?.start) && isValidMonth(parsed?.timeline?.end)
          ? monthToIndex(parsed.timeline.end) - monthToIndex(parsed.timeline.start) + 1
          : defaultTimelineWindow().monthsShown)
    }
  };
}

function seedState() {
  if (window.BASE44_SEED?.projects?.length) {
    const cloned = structuredClone(window.BASE44_SEED);
    cloned.settings = cloned.settings || {};
    cloned.projects = (cloned.projects || []).map((project) => ({
      ...project,
      releaseDate: inferReleaseDate(project)
    }));
    const defaults = buildDefaultItemColors(cloned.settings);
    cloned.settings.itemColors = mergeItemColors(defaults, cloned.settings.itemColors);
    return cloned;
  }

  const stages = [
    { id: uid(), name: "Desenvolvimento", color: "#34d399" },
    { id: uid(), name: "Pré-produção", color: "#60a5fa" },
    { id: uid(), name: "Produção", color: "#fcd34d" },
    { id: uid(), name: "Pós-produção", color: "#f472b6" },
    { id: uid(), name: "Distribuição", color: "#a78bfa" }
  ];

  const projects = [
    projectSeed("02-01", "Short Doc Miss", 2026, "Streaming", "Obra Não Seriada", "Documental", "Curta-metragem", "Em andamento", 0, [
      stageSeed(stages[0].id, "2025-08", "2025-09"),
      stageSeed(stages[2].id, "2025-10", "2026-02"),
      stageSeed(stages[3].id, "2026-01", "2026-04")
    ]),
    projectSeed("02-12", "Leveza Feminina", 2025, "Streaming", "Série", "Documental", "Curta-metragem", "Planejamento", 0, [
      stageSeed(stages[0].id, "2026-03", "2026-05"),
      stageSeed(stages[1].id, "2026-06", "2026-08")
    ]),
    projectSeed("02-21", "O Encontro", 2026, "Streaming", "Obra Não Seriada", "Ficção", "Longa-metragem", "Concluído", 100879, [
      stageSeed(stages[0].id, "2025-02", "2025-03"),
      stageSeed(stages[2].id, "2025-04", "2025-08"),
      stageSeed(stages[3].id, "2025-09", "2025-11")
    ]),
    projectSeed("02-33", "Cidade Amarela", 2024, "Produtora", "Obra Não Seriada", "Ficção", "Curta-metragem", "Em andamento", 45623, [
      stageSeed(stages[2].id, "2025-04", "2025-09"),
      stageSeed(stages[4].id, "2025-10", "2025-11")
    ]),
    projectSeed("02-45", "São Francisco e Primeiro Presépio", 2024, "Streaming", "Obra Não Seriada", "Documental", "Média-metragem", "Concluído", 120540, [
      stageSeed(stages[1].id, "2024-01", "2024-03"),
      stageSeed(stages[2].id, "2024-04", "2024-06"),
      stageSeed(stages[3].id, "2024-07", "2024-09")
    ]),
    projectSeed("02-52", "Cinema Católico", 2023, "Produtora", "Série", "Documental", "Longa-metragem", "Pausado", 0, [
      stageSeed(stages[0].id, "2023-09", "2023-12")
    ])
  ];

  return {
    settings: {
      categories: ["Streaming", "Produtora", "Incubado"],
      productionTypes: ["Documentário", "Curta", "Série"],
      formats: ["Obra Não Seriada", "Série"],
      natures: ["Documental", "Ficção", "Animação"],
      durations: ["Média-metragem", "Curta-metragem", "Longa-metragem"],
      statuses: ["Em andamento", "Concluído", "Planejamento", "Pausado"],
      stages,
      itemColors: {
        categories: {
          Streaming: "#f3ba00",
          Produtora: "#3b82f6",
          Incubado: "#10b981"
        },
        formats: {
          "Obra Não Seriada": "#60a5fa",
          Série: "#34d399"
        },
        natures: {
          Documental: "#0ea5e9",
          Ficção: "#10b981",
          Animação: "#f97316"
        },
        statuses: {
          "Em andamento": "#3b82f6",
          Concluído: "#10b981",
          Planejamento: "#f59e0b",
          Pausado: "#94a3b8"
        }
      }
    },
    projects,
    timeline: {
      ...defaultTimelineWindow()
    }
  };
}

function projectSeed(code, title, year, category, format, nature, duration, status, budget, stages) {
  return {
    id: uid(),
    code,
    title,
    year,
    category,
    productionType: "",
    format,
    nature,
    duration,
    status,
    budget,
    releaseDate: "",
    spent: 0,
    notes: "",
    stages
  };
}

function stageSeed(stageId, start, end) {
  return { id: uid(), stageId, start, end };
}
