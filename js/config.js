// js/config.js
//
// Цель: убрать хардкод → все берём из config.json, но:
// 1) сохраняем дефолты и нормализацию (структура всегда валидна)
// 2) даём удобный доступ по пути (getConfigValue)
// 3) проверяем “обязательные” пути (логируем, но не валим приложение)

const DEFAULT_CONFIG = {
  graphHookUrl: "https://jolikcisout.beget.app/webhook/pyrus/graph",
  auth: {
    methods: {
      loginPassword: {
        enabled: true,
      },
      emailOtp: {
        enabled: false,
      },
    },
    ttlMs: 10 * 60 * 1000,
    codeLength: 6,
    resendTimerSec: 60,
    uiTexts: {
      title: "Вход",
      subtitle: "Подтвердите доступ",
      loginLabel: "Логин",
      passwordLabel: "Пароль",
      emailLabel: "Email",
      otpLabel: "Код из письма",
      submitLabel: "Продолжить",
      resendLabel: "Отправить код ещё раз",
      loadingLabel: "Проверяем данные...",
      errorGeneric: "Не удалось войти. Попробуйте ещё раз.",
    },
    webhooks: {
      emailInit: "",
      emailVerify: "",
    },
    rolePermissions: {
      ALL: [],
      L1: [],
      L2: [],
      OP: [],
      OV: [],
      OU: [],
      AI: [],
    },
  },
  routeAccess: {
    work: [],
    meet: [],
    kp: [],
    gantt: [],
  },
  meetings: {
    formId: 1382379,
    fields: {
      subject: 1,
      dueDateTime: 4,
      residentsTable: 14,
      residentCellPerson: 15,
      postLink: 20,
      status: 26,
      responsible: 27,
      isOffline: 30,
    },
  },
  timezone: {
    localOffsetMin: 4 * 60, // legacy fallback
    storageKey: "sm2_timezone",
    zones: [
      { id: "kaliningrad", city: "Калининград", utcOffsetMin: 120 },
      { id: "moscow", city: "Москва", utcOffsetMin: 180 },
      { id: "samara", city: "Самара", utcOffsetMin: 240 },
      { id: "yekaterinburg", city: "Екатеринбург", utcOffsetMin: 300 },
      { id: "omsk", city: "Омск", utcOffsetMin: 360 },
      { id: "krasnoyarsk", city: "Красноярск", utcOffsetMin: 420 },
      { id: "irkutsk", city: "Иркутск", utcOffsetMin: 480 },
      { id: "yakutsk", city: "Якутск", utcOffsetMin: 540 },
      { id: "vladivostok", city: "Владивосток", utcOffsetMin: 600 },
      { id: "magadan", city: "Магадан", utcOffsetMin: 660 },
      { id: "kamchatka", city: "Камчатка", utcOffsetMin: 720 },
    ],
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
      meetDisplayMode: "sm1_meet_display_mode",
      meetSelectedEmployee: "sm1_meet_selected_employee",
    },
    auth: {
      key: "sm_graph_auth_v1",
      sessionTtlMs: 7 * 24 * 60 * 60 * 1000,
      ttlMs: 7 * 24 * 60 * 60 * 1000,
      cookieDays: 7,
    },
    profile: {
      key: "sm_graph_profile_v1",
      cookieDays: 7,
    },
  },
  // Оставляем дефолты для Pyrus-структуры, чтобы можно было читать config.pyrus.*
  // даже если config.json пустой/не загрузился.
  pyrus: {
    catalogs: {
      shifts: {
        id: 281369,
        columns: {
          department: 4,
        },
      },
    },
    forms: {
      otpusk: 2348174,
      smeni: 2375272,
      form_meet: 1382379,
    },
    fields: {
      otpusk: { person: 1, period: 2 },
      smeni: { due: 4, amount: 5, person: 8, template: 10 },
      form_meet: {
        subject: 1,
        due: 4,
        responsible: 27,
        residentsTable: 14,
        residentCell: 15,
        postLink: "PostLink",
      },
    },
  },

  // Эти секции ранее были fallback'ами в app.js.
  // Если хотите убрать “жёсткие” дефолты из app.js полностью — держим их тут.
  ui: {
    lines: {
      order: ["ALL", "OP", "OV", "L1", "L2", "AI", "OU"],
      labels: {
        ALL: "ВСЕ",
        OP: "OP",
        OV: "OV",
        L1: "L1",
        L2: "L2",
        AI: "AI",
        OU: "OU",
      },
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
  calendar: {
    prodCal: {
      ttlMs: 30 * 24 * 60 * 60 * 1000,
      urlTemplate:
        "https://isdayoff.ru/api/getdata?year={year}&month={month}&day1=1&day2={lastDay}&pre=1&holiday=1",
      cacheKeyPrefix: "prodcal_ru_",
    },
    ui: {
      light: {
        workday: {
          background: "transparent",
          border: "var(--table-border-strong)",
          dash: "transparent",
        },
        weekend: {
          background: "#f2e8e8",
          border: "var(--table-border-strong)",
          dash: "transparent",
        },
        holiday: {
          background: "#fadddd",
          border: "#e06b6b",
          dash: "transparent",
        },
        preholiday: {
          background: "#fff4cc",
          border: "var(--table-border-strong)",
          dash: "#3a3522",
        },
        microIndicators: {
          weekend: "#f2e8e8",
          holiday: "#e06b6b",
          preholiday: "#3a3522",
        },
      },
      dark: {
        workday: {
          background: "transparent",
          border: "var(--table-border-strong)",
          dash: "transparent",
        },
        weekend: {
          background: "#332626",
          border: "var(--table-border-strong)",
          dash: "transparent",
        },
        holiday: {
          background: "#4a2323",
          border: "#c45a5a",
          dash: "transparent",
        },
        preholiday: {
          background: "#e6c65c",
          border: "var(--table-border-strong)",
          dash: "#d1b84d",
        },
        microIndicators: {
          weekend: "#332626",
          holiday: "#c45a5a",
          preholiday: "#d1b84d",
        },
      },
    },

    indicators: {
      birthdayBg: "#ff2b2b",
      birthdayText: "#000000",
    },
  },
};

const REQUIRED_PATHS = [
  "graphHookUrl",
  "auth",
  "auth.methods",
  "auth.ttlMs",
  "auth.codeLength",
  "auth.resendTimerSec",
  "auth.uiTexts",
  "auth.webhooks",
  "pyrus",
  "pyrus.catalogs",
  "pyrus.forms",
  "pyrus.fields",
  "timezone",
  "timezone.localOffsetMin",
  "storage",
  "storage.keys",
  "storage.auth",
  "calendar",
  "calendar.prodCal",
  "calendar.prodCal.urlTemplate",
  "meetings",
  "meetings.formId",
];

function normalizeConfig(config) {
  const root = config && typeof config === "object" ? config : {};

  const auth = root.auth ?? {};
  const authMethods = auth.methods ?? {};
  const authMethodLoginPassword = authMethods.loginPassword ?? {};
  const authMethodEmailOtp = authMethods.emailOtp ?? {};
  const authUiTexts = auth.uiTexts ?? {};
  const authWebhooks = auth.webhooks ?? {};
  const authRolePermissions = auth.rolePermissions ?? {};

  const storage = root.storage ?? {};
  const storageKeys = storage.keys ?? {};
  const storageAuth = storage.auth ?? {};

  const meetings = root.meetings ?? {};
  const meetingsFields = meetings.fields ?? {};

  const timezone = root.timezone ?? {};
  const pyrus = root.pyrus ?? {};
  const pyrusCatalogs = pyrus.catalogs ?? {};
  const pyrusCatalogsShifts = pyrusCatalogs.shifts ?? {};
  const pyrusCatalogsShiftsColumns = pyrusCatalogsShifts.columns ?? {};

  const pyrusForms = pyrus.forms ?? {};
  const pyrusFields = pyrus.fields ?? {};
  const pyrusFieldsOtpusk = pyrusFields.otpusk ?? {};
  const pyrusFieldsSmeni = pyrusFields.smeni ?? {};
  const pyrusFieldsMeet = pyrusFields.form_meet ?? {};

  const ui = root.ui ?? {};
  const uiLines = ui.lines ?? {};
  const departments = root.departments ?? {};
  const deptByLine = departments.byLine ?? {};
  const deptOrderByLine = departments.orderByLine ?? {};
  const management = root.management ?? {};
  const calendar = root.calendar ?? {};
  const prodCal = calendar.prodCal ?? {};
  const calendarIndicators = calendar.indicators ?? {};
  const calendarUi = calendar.ui ?? {};
  const calendarUiLight = calendarUi.light ?? {};
  const calendarUiDark = calendarUi.dark ?? {};

  const calendarUiLightWorkday = calendarUiLight.workday ?? {};
  const calendarUiLightWeekend = calendarUiLight.weekend ?? {};
  const calendarUiLightHoliday = calendarUiLight.holiday ?? {};
  const calendarUiLightPreholiday = calendarUiLight.preholiday ?? {};
  const calendarUiLightMicro = calendarUiLight.microIndicators ?? {};

  const calendarUiDarkWorkday = calendarUiDark.workday ?? {};
  const calendarUiDarkWeekend = calendarUiDark.weekend ?? {};
  const calendarUiDarkHoliday = calendarUiDark.holiday ?? {};
  const calendarUiDarkPreholiday = calendarUiDark.preholiday ?? {};
  const calendarUiDarkMicro = calendarUiDark.microIndicators ?? {};

  return {
    ...DEFAULT_CONFIG,
    ...root,

    graphHookUrl: root.graphHookUrl ?? DEFAULT_CONFIG.graphHookUrl,

    auth: {
      ...DEFAULT_CONFIG.auth,
      ...auth,
      methods: {
        ...DEFAULT_CONFIG.auth.methods,
        ...authMethods,
        loginPassword: {
          ...DEFAULT_CONFIG.auth.methods.loginPassword,
          ...authMethodLoginPassword,
        },
        emailOtp: {
          ...DEFAULT_CONFIG.auth.methods.emailOtp,
          ...authMethodEmailOtp,
        },
      },
      uiTexts: {
        ...DEFAULT_CONFIG.auth.uiTexts,
        ...authUiTexts,
      },
      webhooks: {
        ...DEFAULT_CONFIG.auth.webhooks,
        ...authWebhooks,
      },
      rolePermissions: {
        ...DEFAULT_CONFIG.auth.rolePermissions,
        ...authRolePermissions,
      },
    },

    timezone: {
      ...DEFAULT_CONFIG.timezone,
      ...timezone,
      localOffsetMin:
        timezone.localOffsetMin ?? DEFAULT_CONFIG.timezone.localOffsetMin,
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

    meetings: {
      ...DEFAULT_CONFIG.meetings,
      ...meetings,
      fields: {
        ...DEFAULT_CONFIG.meetings.fields,
        ...meetingsFields,
      },
    },

    pyrus: {
      ...DEFAULT_CONFIG.pyrus,
      ...pyrus,
      catalogs: {
        ...DEFAULT_CONFIG.pyrus.catalogs,
        ...pyrusCatalogs,
        shifts: {
          ...DEFAULT_CONFIG.pyrus.catalogs.shifts,
          ...pyrusCatalogsShifts,
          columns: {
            ...DEFAULT_CONFIG.pyrus.catalogs.shifts.columns,
            ...pyrusCatalogsShiftsColumns,
          },
        },
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
        form_meet: {
          ...DEFAULT_CONFIG.pyrus.fields.form_meet,
          ...pyrusFieldsMeet,
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
        management.topManagementIds ??
        DEFAULT_CONFIG.management.topManagementIds,
    },

    pyrusLineItemIdByLine:
      root.pyrusLineItemIdByLine ?? DEFAULT_CONFIG.pyrusLineItemIdByLine,

    calendar: {
      ...DEFAULT_CONFIG.calendar,
      ...calendar,
      prodCal: {
        ...DEFAULT_CONFIG.calendar.prodCal,
        ...prodCal,
      },
      ui: {
        ...DEFAULT_CONFIG.calendar.ui,
        ...calendarUi,
        light: {
          ...DEFAULT_CONFIG.calendar.ui.light,
          ...calendarUiLight,
          workday: {
            ...DEFAULT_CONFIG.calendar.ui.light.workday,
            ...calendarUiLightWorkday,
          },
          weekend: {
            ...DEFAULT_CONFIG.calendar.ui.light.weekend,
            ...calendarUiLightWeekend,
          },
          holiday: {
            ...DEFAULT_CONFIG.calendar.ui.light.holiday,
            ...calendarUiLightHoliday,
          },
          preholiday: {
            ...DEFAULT_CONFIG.calendar.ui.light.preholiday,
            ...calendarUiLightPreholiday,
          },
          microIndicators: {
            ...DEFAULT_CONFIG.calendar.ui.light.microIndicators,
            ...calendarUiLightMicro,
          },
        },
        dark: {
          ...DEFAULT_CONFIG.calendar.ui.dark,
          ...calendarUiDark,
          workday: {
            ...DEFAULT_CONFIG.calendar.ui.dark.workday,
            ...calendarUiDarkWorkday,
          },
          weekend: {
            ...DEFAULT_CONFIG.calendar.ui.dark.weekend,
            ...calendarUiDarkWeekend,
          },
          holiday: {
            ...DEFAULT_CONFIG.calendar.ui.dark.holiday,
            ...calendarUiDarkHoliday,
          },
          preholiday: {
            ...DEFAULT_CONFIG.calendar.ui.dark.preholiday,
            ...calendarUiDarkPreholiday,
          },
          microIndicators: {
            ...DEFAULT_CONFIG.calendar.ui.dark.microIndicators,
            ...calendarUiDarkMicro,
          },
        },
      },

      indicators: {
        ...DEFAULT_CONFIG.calendar.indicators,
        ...calendarIndicators,
      },
    },
  };
}

function hasPath(obj, path) {
  const parts = String(path).split(".").filter(Boolean);
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current))
      return false;
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
    if (!response.ok)
      throw new Error(`Config load failed: HTTP ${response.status}`);

    const loaded = await response.json();
    const normalized = normalizeConfig(loaded);

    warnMissingRequiredPaths(normalized);
    window.APP_CONFIG = normalized; // отладка

    return normalized;
  } catch (error) {
    console.warn(
      "Не удалось загрузить config.json, использую значения по умолчанию",
      error,
    );

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

export function getMeetingsFormId() {
  return config.meetings?.formId || config.pyrus?.forms?.form_meet;
}

export function getMeetingsFieldIds() {
  const f = config.meetings?.fields || {};
  const legacy = config.pyrus?.fields?.form_meet || {};

  return {
    subject: f.subject ?? legacy.subject,
    dueDateTime: f.dueDateTime ?? legacy.due ?? 4,
    residentsTable: f.residentsTable ?? legacy.residentsTable ?? 14,
    residentCellPerson: f.residentCellPerson ?? legacy.residentCell ?? 15,
    postLink: f.postLink ?? legacy.postLink ?? 20,
    status: f.status ?? 26,
    responsible: f.responsible ?? legacy.responsible ?? 27,
    isOffline: f.isOffline ?? 30,
  };
}

export function getKpConfig() {
  return config.kp || {};
}

export function getKpN8nConfig() {
  return getKpConfig().n8n || {};
}

export function getKpCrmConfig() {
  return getKpCrmFormConfig();
}

// === NEW TYPED GETTERS ===

export function getKpCatalogsConfig() {
  return getKpConfig().catalogs || {};
}

export function getKpFormsConfig() {
  return getKpConfig().forms || {};
}

export function getKpDiscountsConfig() {
  return getKpConfig().discounts || {};
}

function requireKpCatalogId(section, key) {
  const catalogId = section?.catalogId;
  if (!catalogId) {
    throw new Error(`[KP][Config] Missing kp.catalogs.${key}.catalogId`);
  }
  return catalogId;
}

export function getKpCatalogIds() {
  const catalogs = getKpCatalogsConfig();
  return {
    services: requireKpCatalogId(catalogs.services, "services"),
    maintenance: requireKpCatalogId(catalogs.maintenance, "maintenance"),
    licenses: requireKpCatalogId(catalogs.licenses, "licenses"),
    trainings: requireKpCatalogId(catalogs.trainings, "trainings"),
    consumables: requireKpCatalogId(catalogs.consumables, "consumables"),
  };
}

export function getKpServicesMapping() {
  const columns = getKpCatalogsConfig().services?.columns;
  if (!columns)
    throw new Error("[KP][Config] Missing kp.catalogs.services.columns");
  return columns;
}

export function getKpMaintenanceMapping() {
  const columns = getKpCatalogsConfig().maintenance?.columns;
  if (!columns)
    throw new Error("[KP][Config] Missing kp.catalogs.maintenance.columns");
  return columns;
}

export function getKpLicensesMapping() {
  const columns = getKpCatalogsConfig().licenses?.columns;
  if (!columns)
    throw new Error("[KP][Config] Missing kp.catalogs.licenses.columns");
  return columns;
}

export function getKpTrainingsMapping() {
  const columns = getKpCatalogsConfig().trainings?.columns;
  if (!columns)
    throw new Error("[KP][Config] Missing kp.catalogs.trainings.columns");
  return columns;
}

export function getKpConsumablesMapping() {
  const columns = getKpCatalogsConfig().consumables?.columns;
  if (!columns)
    throw new Error("[KP][Config] Missing kp.catalogs.consumables.columns");
  return columns;
}

export function getKpEquipmentFormId() {
  const formId =
    getKpFormsConfig().equipment?.formId || getKpConfig().equipment?.formId;
  if (!formId)
    throw new Error("[KP][Config] Missing kp.forms.equipment.formId");
  return formId;
}

export function getKpEquipmentFieldIds() {
  const fieldIds =
    getKpFormsConfig().equipment?.fieldIds || getKpConfig().equipment?.fieldIds;
  if (!fieldIds)
    throw new Error("[KP][Config] Missing kp.forms.equipment.fieldIds");
  return fieldIds;
}

export function getKpEquipmentFormConfig() {
  return {
    id: getKpEquipmentFormId(),
    fieldIds: getKpEquipmentFieldIds(),
  };
}

export function getKpCrmFormConfig() {
  const crm = getKpFormsConfig().crm || getKpConfig().crm || {};
  if (!crm.formId) throw new Error("[KP][Config] Missing kp.forms.crm.formId");
  return {
    id: crm.formId,
    titleFieldId: crm.titleFieldId || 1,
    clientNameFieldIds: crm.clientNameFieldIds || [],
    filters: crm.filters || {},
    registerFieldIds: crm.registerFieldIds || [],
  };
}

export function getKpCompanyName() {
  const v = config.kp?.company?.name;
  if (!v) throw new Error("[KP][Config] Missing kp.company.name");
  return v;
}

export function getKpCompanyAddress() {
  const v = config.kp?.company?.address;
  if (!v) throw new Error("[KP][Config] Missing kp.company.address");
  return v;
}

export function getKpAvatarSize() {
  return Number(config.kp?.avatarSize) || 160;
}

export function getKpServicesCatalog() {
  const catalogs = getKpCatalogsConfig();
  return {
    id: requireKpCatalogId(catalogs.services, "services"),
    columns: getKpServicesMapping(),
  };
}

export function getKpMaintenanceCatalog() {
  const catalogs = getKpCatalogsConfig();
  return {
    id: requireKpCatalogId(catalogs.maintenance, "maintenance"),
    columns: getKpMaintenanceMapping(),
  };
}

export function getKpLicensesCatalog() {
  const catalogs = getKpCatalogsConfig();
  return {
    id: requireKpCatalogId(catalogs.licenses, "licenses"),
    columns: getKpLicensesMapping(),
  };
}

export function getKpTrainingsCatalog() {
  const catalogs = getKpCatalogsConfig();
  return {
    id: requireKpCatalogId(catalogs.trainings, "trainings"),
    columns: getKpTrainingsMapping(),
  };
}

export function getKpConsumablesCatalog() {
  const catalogs = getKpCatalogsConfig();
  return {
    id: requireKpCatalogId(catalogs.consumables, "consumables"),
    columns: getKpConsumablesMapping(),
  };
}

export function getKpEquipmentForm() {
  return getKpEquipmentFormConfig();
}

export function getKpCrmForm() {
  return getKpCrmFormConfig();
}

export function getKpN8nPyrusFilesWebhookUrl() {
  const v =
    config.kp?.n8n?.pyrusFiles?.path || config.kp?.n8n?.webhooks?.pyrusFiles;
  if (!v) throw new Error("[KP][Config] Missing kp.n8n.pyrusFiles.path");
  return v;
}

export function getKpDefaults() {
  return getKpConfig().defaults || { validDays: 10, maintenanceMonths: 3 };
}

export function getKpTaxConfig() {
  return config.kp?.tax || { rate: 20, included: true };
}

/**
 * Get discount rules for services based on quantity
 * @returns {Array<{min: number, max: number|null, percent: number}>}
 */
export function getKpServicesDiscountRules() {
  const rules = config.kp?.discounts?.servicesByQty;
  if (!Array.isArray(rules) || rules.length === 0) {
    // Default rules
    return [
      { min: 1, max: 1, percent: 0 },
      { min: 2, max: 2, percent: 25 },
      { min: 3, max: 9, percent: 40 },
      { min: 10, max: null, percent: 50 },
    ];
  }
  return rules;
}

/**
 * Calculate discount percent for a given quantity
 * @param {number} qty
 * @returns {number} discount percent (0-100)
 */
export function getDiscountPercentForQty(qty) {
  const rules = getKpServicesDiscountRules();
  for (const rule of rules) {
    const minOk = qty >= rule.min;
    const maxOk = rule.max === null || qty <= rule.max;
    if (minOk && maxOk) {
      return rule.percent;
    }
  }
  return 0;
}

export function getKpCompanyConfig() {
  return {
    name: getKpCompanyName(),
    address: getKpCompanyAddress(),
  };
}
