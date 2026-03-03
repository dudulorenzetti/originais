const STORAGE_KEY = "originais_lumine_state_v2";

const CONFIG_META = {
  categories: "Categorias",
  productionTypes: "Tipos de Produção",
  formats: "Formatos",
  natures: "Naturezas",
  durations: "Durações",
  statuses: "Status",
  stages: "Etapas"
};

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
let selectedDashboardYear = "Todos";
let selectedConfigKey = "categories";
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
    state.timeline = { start, end };
    saveState();
    renderGantt();
  });
  document.getElementById("timelineBack").addEventListener("click", () => shiftTimeline(-6));
  document.getElementById("timelineForward").addEventListener("click", () => shiftTimeline(6));

  document.getElementById("projectSearch").addEventListener("input", renderProjectsTable);
  document.getElementById("projectStatusFilter").addEventListener("change", renderProjectsTable);

  document.getElementById("btnImportCsv").addEventListener("click", () => {
    document.getElementById("csvInput").click();
  });

  document.getElementById("csvInput").addEventListener("change", importCsvFile);

  document.getElementById("btnAddConfig").addEventListener("click", addConfigItem);
}

function bindDialog() {
  const dialog = document.getElementById("projectDialog");
  const form = document.getElementById("projectForm");
  const stageDialog = document.getElementById("stageDialog");
  const stageForm = document.getElementById("stageForm");

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
  const allProjects = [...state.projects];
  const projects = filteredDashboardProjects();

  const totalProjects = allProjects.length;
  const projectsWithSpent = projects.filter((p) => hasNumericValue(p.spent) || hasNumericValue(p.budget));
  const totalSpent = projectsWithSpent.reduce((acc, p) => acc + Number(p.spent ?? p.budget ?? 0), 0);
  const avgSpent = projectsWithSpent.length ? totalSpent / projectsWithSpent.length : 0;

  document.getElementById("summaryCards").innerHTML = [
    cardHtml("Total de Produções", String(totalProjects)),
    cardHtml("Total Gasto", money(totalSpent)),
    cardHtml("Gasto Médio por Projeto", money(avgSpent))
  ].join("");

  renderBarChart(document.getElementById("chartByYear"), countBy(projects, (p) => String(p.year), true), "vertical", ["#f3ba00"]);
  renderBarChart(document.getElementById("chartByStatus"), countBy(projects, (p) => p.status, true), "vertical", ["#10b981", "#3b82f6", "#f59e0b", "#94a3b8"]);
  renderDonutChart(document.getElementById("chartByCategory"), countBy(projects, (p) => p.category, true));
  renderBarChart(document.getElementById("chartByNature"), countBy(projects, (p) => p.nature, true), "vertical", ["#10b981", "#3b82f6", "#f59e0b"]);
  renderBarChart(document.getElementById("chartByDuration"), countBy(projects, (p) => p.duration, true), "vertical", ["#10b981", "#3b82f6", "#f59e0b"]);
  renderBarChart(document.getElementById("chartAvgStage"), avgMonthsByStage(projects), "horizontal", ["#94a3b8", "#60a5fa", "#fcd34d", "#34d399", "#f472b6"]);
}

function renderDashboardYearChips() {
  const years = [...new Set(state.projects.map((p) => Number(p.year)).filter((y) => y > 0))].sort((a, b) => a - b);
  const chips = ["Todos", ...years];
  document.getElementById("yearChips").innerHTML = chips
    .map((y) => `<button class="chip ${String(y) === String(selectedDashboardYear) ? "active" : ""}" data-year="${y}">${y}</button>`)
    .join("");

  document.querySelectorAll("#yearChips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      selectedDashboardYear = chip.dataset.year;
      renderDashboard();
    });
  });
}

function filteredDashboardProjects() {
  const withYear = state.projects.filter((p) => Number(p.year) > 0);
  if (selectedDashboardYear === "Todos") return withYear;
  return withYear.filter((p) => String(p.year) === String(selectedDashboardYear));
}

function renderGantt() {
  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;
  renderTimelineYearChips();

  const months = monthsBetween(state.timeline.start, state.timeline.end);
  const list = sortedProjects();
  const container = document.getElementById("ganttContainer");

  if (!months.length) {
    container.innerHTML = '<div class="empty">Período inválido.</div>';
    return;
  }

  let html = '<div class="gantt">';
  html += '<div class="gantt-head">';
  html += '<div class="g-left">PROJETO</div>';
  html += `<div class="g-months">${months.map((m) => `<div class="g-month">${monthLabel(m)}</div>`).join("")}</div>`;
  html += "</div>";

  list.forEach((project) => {
    html += '<div class="gantt-row">';
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
  const monthWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--month-width")) || 46;
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
  const monthWidth = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--month-width")) || 46;
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
}

function removeStageGhost(line) {
  line.querySelector(".stage-ghost")?.remove();
}

function shiftTimeline(delta) {
  state.timeline.start = addMonths(state.timeline.start, delta);
  state.timeline.end = addMonths(state.timeline.end, delta);
  document.getElementById("timelineStart").value = state.timeline.start;
  document.getElementById("timelineEnd").value = state.timeline.end;
  saveState();
  renderGantt();
}

function renderProjectsTools() {
  const select = document.getElementById("projectStatusFilter");
  const statuses = ["Todos", ...uniq(state.settings.statuses).filter(Boolean)];
  const current = select.value || "Todos";
  select.innerHTML = statuses.map((s) => `<option ${s === current ? "selected" : ""}>${escapeHtml(s)}</option>`).join("");
}

function renderProjectsTable() {
  const query = document.getElementById("projectSearch").value.trim().toLowerCase();
  const status = document.getElementById("projectStatusFilter").value || "Todos";

  const projects = sortedProjects().filter((p) => {
    const hit = !query || String(p.title || "").toLowerCase().includes(query) || String(p.code || "").toLowerCase().includes(query);
    const okStatus = status === "Todos" || p.status === status;
    return hit && okStatus;
  });

  const body = document.getElementById("projectsTableBody");
  if (!projects.length) {
    body.innerHTML = '<tr><td colspan="7" class="empty">Nenhum projeto encontrado.</td></tr>';
    return;
  }

  body.innerHTML = projects
    .map((p) => {
      const badgeClass = STATUS_COLORS[p.status] || "gray";
      return `<tr>
        <td>${escapeHtml(p.code)}</td>
        <td><strong>${escapeHtml(p.title)}</strong></td>
        <td>${escapeHtml(p.category || "-")}</td>
        <td>${escapeHtml(p.format || p.productionType || "-")} ${p.nature ? `<small>· ${escapeHtml(p.nature)}</small>` : ""}</td>
        <td>${(p.spent || p.budget) ? money(Number(p.spent || p.budget)) : "-"}</td>
        <td>${p.status ? `<span class="badge ${badgeClass}">${escapeHtml(p.status)}</span>` : ""}</td>
        <td>
          <button class="btn light" data-action="edit" data-id="${p.id}">Editar</button>
          <button class="btn danger" data-action="del" data-id="${p.id}">Excluir</button>
        </td>
      </tr>`;
    })
    .join("");

  body.querySelectorAll("button[data-action='edit']").forEach((btn) => {
    btn.addEventListener("click", () => openProjectDialog(btn.dataset.id));
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
  fillSelect("projectProductionType", state.settings.productionTypes, project?.productionType);
  fillSelect("projectFormat", state.settings.formats, project?.format);
  fillSelect("projectNature", state.settings.natures, project?.nature);
  fillSelect("projectDuration", state.settings.durations, project?.duration);
  fillSelect("projectStatus", ["", ...state.settings.statuses], project?.status || "");

  document.getElementById("dialogTitle").textContent = project ? "Editar Projeto" : "Novo Projeto";
  document.getElementById("btnDeleteProject").style.visibility = project ? "visible" : "hidden";

  document.getElementById("projectId").value = project?.id || uid();
  document.getElementById("projectCode").value = project?.code || nextCode();
  document.getElementById("projectTitle").value = project?.title || "";
  document.getElementById("projectYear").value = project?.year || "";
  document.getElementById("projectBudget").value = project?.budget || "";
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
  const rawBudget = document.getElementById("projectBudget").value.trim();
  const rawYear = document.getElementById("projectYear").value.trim();
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
    id: document.getElementById("projectId").value,
    code: document.getElementById("projectCode").value.trim(),
    title: document.getElementById("projectTitle").value.trim(),
    year: rawYear === "" ? null : Number(rawYear),
    category: document.getElementById("projectCategory").value,
    productionType: document.getElementById("projectProductionType").value,
    format: document.getElementById("projectFormat").value,
    nature: document.getElementById("projectNature").value,
    duration: document.getElementById("projectDuration").value,
    status: document.getElementById("projectStatus").value,
    budget: rawBudget === "" ? null : Number(rawBudget),
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
  const tabs = Object.entries(CONFIG_META);
  const el = document.getElementById("configTabs");
  el.innerHTML = tabs
    .map(([key, label]) => `<button class="chip ${selectedConfigKey === key ? "active" : ""}" data-key="${key}">${label}</button>`)
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
        (item) => `<li class="config-item">
      <span>${escapeHtml(item.name)}</span>
      <span class="actions">
        <input type="color" value="${item.color}" data-action="color" data-id="${item.id}" />
        <button class="btn light" data-action="edit" data-id="${item.id}">Editar</button>
        <button class="btn danger" data-action="del" data-id="${item.id}">Excluir</button>
      </span>
    </li>`
      )
      .join("");
  } else {
    const arr = state.settings[selectedConfigKey];
    list.innerHTML = arr
      .map(
        (item, i) => `<li class="config-item">
      <span>${escapeHtml(item)}</span>
      <span class="actions">
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
}

function addConfigItem() {
  if (selectedConfigKey === "stages") {
    const name = prompt("Nome da etapa:");
    if (!name || !name.trim()) return;
    state.settings.stages.push({ id: uid(), name: name.trim(), color: randomColor() });
  } else {
    const label = CONFIG_META[selectedConfigKey].slice(0, -1);
    const value = prompt(`Novo ${label}:`);
    if (!value || !value.trim()) return;
    state.settings[selectedConfigKey].push(value.trim());
  }
  saveState();
  renderAll();
}

function editConfigItem(id) {
  if (selectedConfigKey === "stages") {
    const stage = state.settings.stages.find((s) => s.id === id);
    if (!stage) return;
    const next = prompt("Novo nome da etapa:", stage.name);
    if (!next || !next.trim()) return;
    stage.name = next.trim();
  } else {
    const arr = state.settings[selectedConfigKey];
    const current = arr[Number(id)];
    const next = prompt("Novo valor:", current);
    if (!next || !next.trim()) return;
    arr[Number(id)] = next.trim();
  }
  saveState();
  renderAll();
}

function deleteConfigItem(id) {
  if (!confirm("Excluir item?")) return;
  if (selectedConfigKey === "stages") {
    state.settings.stages = state.settings.stages.filter((st) => st.id !== id);
    state.projects.forEach((p) => {
      p.stages = p.stages.filter((st) => st.stageId !== id);
    });
  } else {
    state.settings[selectedConfigKey].splice(Number(id), 1);
  }
  saveState();
  renderAll();
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
          <div class="bar-row-track"><div class="bar-row-fill" style="width:${(Number(value) / max) * 100}%; background:${color}"></div></div>
          <strong>${value}</strong>
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

function cardHtml(title, value) {
  return `<article class="card"><span>${escapeHtml(title)}</span><strong>${escapeHtml(value)}</strong></article>`;
}

function sortedProjects() {
  return [...state.projects].sort((a, b) => String(a.code || "").localeCompare(String(b.code || "")));
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
  const acc = {};
  projects.forEach((p) => {
    p.stages.forEach((s) => {
      const stage = state.settings.stages.find((st) => st.id === s.stageId);
      const key = stage?.name || "Etapa";
      const months = monthToIndex(s.end) - monthToIndex(s.start) + 1;
      if (!acc[key]) acc[key] = { total: 0, count: 0 };
      acc[key].total += months;
      acc[key].count += 1;
    });
  });

  return Object.fromEntries(
    Object.entries(acc).map(([k, v]) => [k, (v.total / v.count).toFixed(1)])
  );
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

function money(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value || 0);
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "" && !Number.isNaN(Number(value));
}

function defaultTimelineWindow() {
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  return { start, end: addMonths(start, 23) };
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
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw);
    return mergeState(parsed);
  } catch {
    return seedState();
  }
}

function mergeState(parsed) {
  const base = seedState();
  return {
    settings: {
      categories: parsed?.settings?.categories?.length ? parsed.settings.categories : base.settings.categories,
      productionTypes: parsed?.settings?.productionTypes?.length ? parsed.settings.productionTypes : base.settings.productionTypes,
      formats: parsed?.settings?.formats?.length ? parsed.settings.formats : base.settings.formats,
      natures: parsed?.settings?.natures?.length ? parsed.settings.natures : base.settings.natures,
      durations: parsed?.settings?.durations?.length ? parsed.settings.durations : base.settings.durations,
      statuses: parsed?.settings?.statuses?.length ? parsed.settings.statuses : base.settings.statuses,
      stages: parsed?.settings?.stages?.length ? parsed.settings.stages : base.settings.stages
    },
    projects: Array.isArray(parsed?.projects) ? parsed.projects : base.projects,
    timeline: {
      start: parsed?.timeline?.start || defaultTimelineWindow().start,
      end: parsed?.timeline?.end || defaultTimelineWindow().end
    }
  };
}

function seedState() {
  if (window.BASE44_SEED?.projects?.length) return structuredClone(window.BASE44_SEED);

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
      stages
    },
    projects,
    timeline: {
      ...defaultTimelineWindow()
    }
  };
}

function projectSeed(code, title, year, category, format, nature, duration, status, budget, stages) {
  return { id: uid(), code, title, year, category, productionType: "", format, nature, duration, status, budget, spent: 0, notes: "", stages };
}

function stageSeed(stageId, start, end) {
  return { id: uid(), stageId, start, end };
}
