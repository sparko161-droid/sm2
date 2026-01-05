// js/config.js

const DEFAULT_CONFIG = {
  storage: {
    keys: {
      localChanges: "sm1_local_changes",
      changeHistory: "sm1_change_history",
      theme: "sm1_theme_preference",
      currentLine: "sm1_current_line",
      employeeFilters: "sm1_employee_filters",
      cachedEmployees: "sm1_cached_employees",
      cachedShiftTemplates: "sm1_cached_shift_templates",
      cachedSchedulePrefix: "sm1_cached_schedule_",
      shiftDrafts: "graph_l1l2_shift_drafts_v1",
    },
    auth: {
      key: "sm_graph_auth_v1",
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      cookieDays: 7,
    },
  },
};

function normalizeConfig(config) {
  const storage = config.storage ?? {};
  return {
    ...config,
    storage: {
      ...DEFAULT_CONFIG.storage,
      ...storage,
      keys: {
        ...DEFAULT_CONFIG.storage.keys,
        ...(storage.keys ?? {}),
      },
      auth: {
        ...DEFAULT_CONFIG.storage.auth,
        ...(storage.auth ?? {}),
      },
    },
  };
}

async function loadConfig() {
  try {
    const response = await fetch("../config.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Config load failed: ${response.status}`);
    }
    const loaded = await response.json();
    return normalizeConfig(loaded);
  } catch (error) {
    console.warn("Не удалось загрузить config.json, использую значения по умолчанию", error);
    return normalizeConfig({});
  }
}

export const config = await loadConfig();
