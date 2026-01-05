// js/config.js
//
// Цель: убрать хардкод → все берём из config.json, но:
// 1) сохраняем строгие дефолты и нормализацию (чтобы структура всегда была валидной)
// 2) даём удобный доступ по пути (getConfigValue), чтобы не разносить проверки по коду

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

/**
 * Гарантируем, что config всегда имеет ожидаемую структуру,
 * даже если config.json отсутствует/неполный.
 */
function normalizeConfig(config) {
  const root = config && typeof config === "object" ? config : {};
  const storage = root.storage ?? {};

  return {
    ...root,
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

/**
 * Резолвим URL на config.json относительно текущего модуля.
 * Это надёжнее, чем "./" или "../" (не зависит от того, откуда открыли страницу).
 */
const CONFIG_URL = new URL("../config.json", import.meta.url).toString();

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Config load failed: HTTP ${response.status}`);
    }
    const loaded = await response.json();
    return normalizeConfig(loaded);
  } catch (error) {
    console.warn(
      "Не удалось загрузить config.json, использую значения по умолчанию",
      error
    );
    return normalizeConfig({});
  }
}

/**
 * Единый кэш конфига для всего приложения.
 */
export const config = await loadConfig();

/**
 * Безопасно достаём значение по "a.b.c".
 */
function resolvePath(obj, path) {
  if (!path) return undefined;

  const parts = String(path).split(".").filter(Boolean);
  let current = obj;

  for (const part of parts) {
    if (current && Object.prototype.hasOwnProperty.call(current, part)) {
      current = current[part];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * Универсальный доступ к значениям конфига по пути.
 * @param {string} path - например "storage.keys.localChanges"
 * @param {{defaultValue?: any, required?: boolean}} options
 */
export function getConfigValue(path, options = {}) {
  const { defaultValue = undefined, required = false } = options;

  const value = resolvePath(config, path);
  if (value === undefined || value === null) {
    const message = `Отсутствует ключ конфига: ${path}`;
    if (required) console.error(message);
    else console.warn(message);
    return defaultValue;
  }
  return value;
}

/**
 * Полный конфиг (нормализованный).
 */
export function getConfig() {
  return config;
}
