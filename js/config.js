// js/config.js
//
// Цель: убрать хардкод → все берём из config.json, но:
// 1) сохраняем дефолты и нормализацию (структура всегда валидна)
// 2) даём удобный доступ по пути (getConfigValue)
// 3) проверяем “обязательные” пути (логируем, но не валим приложение)

const DEFAULT_CONFIG = {
  graphHookUrl: "https://jolikcisout.beget.app/webhook/pyrus/graph",
  timezone: {
    localOffsetMin: 4 * 60, // GMT+4
  },
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
  // Оставляем дефолты для Pyrus-структуры, чтобы можно было читать config.pyrus.*
  // даже если config.json пустой/не загрузился.
  pyrus: {
    catalogs: {
      shifts: 281369,
    },
    forms: {
      otpusk: 2348174,
      smeni: 2375272,
    },
    // Важно: в коде выше использовались:
    // - smeni.template (а не smeni.shift)
    // - otpusk.person, otpusk.period
    fields: {
      otpusk: { person: 1, period: 2 },
      smeni: { due: 4, amount: 5, person: 8, template: 10 },
    },
  },

  // Эти секции ранее были fallback'ами в app.js.
  // Если хотите убрать “жёсткие” дефолты из app.js полностью — держим их тут.
  ui: {
    lines: {
      order: ["ALL", "OP", "OV", "L1", "L2", "AI", "OU"],
      labels: { ALL: "ВСЕ", OP: "OP", OV: "OV", L1: "L1", L2: "L2", AI: "AI", OU: "OU" },
    },
  },
  departments: {
    byLine: {
      L1: [108368027],
      L2: [108368026, 171248779, 171248780],
      OV: [80208117],
      OP: [108368021, 157753518, 157753516], // важно: порядок групп
      OU: [108368030],
      AI: [166353950],
    },
    orderByLine: {
      L2: [108368026, 171248779, 171248780],
      OP: [108368021, 157753518, 157753516],
    },
  },
  management: {
    topManagementIds: [1167305, 314287], // Лузин, Сухачев
  },
  // Pyrus: значение каталога "Линия/Отдел" (field id=1) в форме явок
  pyrusLineItemIdByLine: {
    L2: 157816613,
    L1: 165474029,
    OV: 157816614,
    OU: 157816622,
    AI: 168065907,
    OP: 157816621,
  },
};

const REQUIRED_PATHS = [
  "graphHookUrl",
  "pyrus",
  "pyrus.catalogs",
  "pyrus.forms",
  "pyrus.fields",
  "timezone",
  "timezone.localOffsetMin",
  "storage",
  "storage.keys",
  "storage.auth",
];

function normalizeConfig(config) {
  const root = config && typeof config === "object" ? config : {};

  const storage = root.storage ?? {};
  const storageKeys = storage.keys ?? {};
  const storageAuth = storage.auth ?? {};

  const timezone = root.timezone ?? {};
  const pyrus = root.pyrus ?? {};
  const pyrusCatalogs = pyrus.catalogs ?? {};
  const pyrusForms = pyrus.forms ?? {};
  const pyrusFields = pyrus.fields ?? {};
  const pyrusFieldsOtpusk = pyrusFields.otpusk ?? {};
  const pyrusFieldsSmeni = pyrusFields.smeni ?? {};

  const ui = root.ui ?? {};
  const uiLines = ui.lines ?? {};
  const departments = root.departments ?? {};
  const deptByLine = departments.byLine ?? {};
  const deptOrderByLine = departments.orderByLine ?? {};
  const management = root.management ?? {};

  return {
    ...DEFAULT_CONFIG,
    ...root,

    graphHookUrl: root.graphHookUrl ?? DEFAULT_CONFIG.graphHookUrl,

    timezone: {
      ...DEFAULT_CONFIG.timezone,
      ...timezone,
      localOffsetMin: timezone.localOffsetMin ?? DEFAULT_CONFIG.timezone.localOffsetMin,
    },

    storage: {
      ...DEFAULT_CONFIG.storage,
      ...storage,
      keys: {
        ...DEFAULT_CONFIG.storage.keys,
        ...storageKeys,
      },
      auth: {
        ...DEFAULT_CONFIG.storage.auth,
        ...storageAuth,
      },
    },

    pyrus: {
      ...DEFAULT_CONFIG.pyrus,
      ...pyrus,
      catalogs: {
        ...DEFAULT_CONFIG.pyrus.catalogs,
        ...pyrusCatalogs,
      },
      forms: {
        ...DEFAULT_CONFIG.pyrus.forms,
        ...pyrusForms,
      },
      fields: {
        ...DEFAULT_CONFIG.pyrus.fields,
        ...pyrusFields,
        otpusk: {
          ...DEFAULT_CONFIG.pyrus.fields.otpusk,
          ...pyrusFieldsOtpusk,
        },
        smeni: {
          ...DEFAULT_CONFIG.pyrus.fields.smeni,
          ...pyrusFieldsSmeni,
        },
      },
    },

    ui: {
      ...DEFAULT_CONFIG.ui,
      ...ui,
      lines: {
        ...DEFAULT_CONFIG.ui.lines,
        ...uiLines,
        order: uiLines.order ?? DEFAULT_CONFIG.ui.lines.order,
        labels: {
          ...DEFAULT_CONFIG.ui.lines.labels,
          ...(uiLines.labels ?? {}),
        },
      },
    },

    departments: {
      ...DEFAULT_CONFIG.departments,
      ...departments,
      byLine: {
        ...DEFAULT_CONFIG.departments.byLine,
        ...deptByLine,
      },
      orderByLine: {
        ...DEFAULT_CONFIG.departments.orderByLine,
        ...deptOrderByLine,
      },
    },

    management: {
      ...DEFAULT_CONFIG.management,
      ...management,
      topManagementIds:
        management.topManagementIds ?? DEFAULT_CONFIG.management.topManagementIds,
    },

    pyrusLineItemIdByLine: root.pyrusLineItemIdByLine ?? DEFAULT_CONFIG.pyrusLineItemIdByLine,
  };
}

function hasPath(obj, path) {
  const parts = String(path).split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) return false;
    current = current[part];
  }
  return true;
}

function warnMissingRequiredPaths(cfg) {
  const missing = REQUIRED_PATHS.filter((p) => !hasPath(cfg, p));
  if (missing.length) {
    console.error(`Отсутствуют ключи в config.json: ${missing.join(", ")}`);
  }
}

const CONFIG_URL = new URL("../config.json", import.meta.url).toString();

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!response.ok) throw new Error(`Config load failed: HTTP ${response.status}`);

    const loaded = await response.json();
    const normalized = normalizeConfig(loaded);

    warnMissingRequiredPaths(normalized);
    window.APP_CONFIG = normalized; // отладка

    return normalized;
  } catch (error) {
    console.warn("Не удалось загрузить config.json, использую значения по умолчанию", error);

    const normalized = normalizeConfig({});
    warnMissingRequiredPaths(normalized);
    window.APP_CONFIG = normalized;

    return normalized;
  }
}

export const config = await loadConfig();

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

export function getConfig() {
  return config;
}
