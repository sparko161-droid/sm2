// js/config/kpConfig.js
// Изолированный конфиг для модуля КП
// Импортируем только нужные JSON-файлы

import kpJson from "../../config/kp.json" with { type: "json" };
import globalJson from "../../config/global.json" with { type: "json" };

// === Экспорт конфигов ===
export const kpConfig = kpJson;
export const globalConfig = globalJson;

// === Геттеры для удобства ===

export function getKpDefaults() {
  return kpConfig.defaults || { validDays: 10, maintenanceMonths: 3 };
}

export function getKpCompany() {
  return kpConfig.company || { name: "", address: "" };
}

export function getKpAvatarSize() {
  return kpConfig.avatarSize || 160;
}

export function getKpCatalogsConfig() {
  return kpConfig.catalogs || {};
}

export function getKpFormsConfig() {
  return kpConfig.forms || {};
}

export function getKpTaxConfig() {
  return kpConfig.tax || { rate: 20, included: true };
}

export function getKpDiscountsConfig() {
  return kpConfig.discounts || { servicesByQty: [] };
}

export function getKpN8nConfig() {
  return kpConfig.n8n || {};
}

export function getGraphHookUrl() {
  return globalConfig.graphHookUrl || "";
}

// === Служебные функции ===

export function getDiscountPercentForQty(qty) {
  const rules = getKpDiscountsConfig().servicesByQty || [];
  for (const rule of rules) {
    const min = rule.min ?? 0;
    const max = rule.max ?? Infinity;
    if (qty >= min && qty <= max) {
      return rule.percent || 0;
    }
  }
  return 0;
}

// === Каталоги ===

function requireKpCatalogId(key) {
  const cat = getKpCatalogsConfig()[key];
  if (!cat?.catalogId) {
    throw new Error(`[KP][Config] Missing kp.catalogs.${key}.catalogId`);
  }
  return cat.catalogId;
}

export function getKpServicesCatalog() {
  return {
    id: requireKpCatalogId("services"),
    columns: getKpCatalogsConfig().services?.columns || {},
  };
}

export function getKpServicesMapping() {
  return getKpCatalogsConfig().services?.columns || {};
}

export function getKpMaintenanceCatalog() {
  return {
    id: requireKpCatalogId("maintenance"),
    columns: getKpCatalogsConfig().maintenance?.columns || {},
  };
}

export function getKpMaintenanceMapping() {
  return getKpCatalogsConfig().maintenance?.columns || {};
}

export function getKpLicensesCatalog() {
  return {
    id: requireKpCatalogId("licenses"),
    columns: getKpCatalogsConfig().licenses?.columns || {},
  };
}

export function getKpLicensesMapping() {
  return getKpCatalogsConfig().licenses?.columns || {};
}

export function getKpTrainingsCatalog() {
  return {
    id: requireKpCatalogId("trainings"),
    columns: getKpCatalogsConfig().trainings?.columns || {},
  };
}

export function getKpTrainingsMapping() {
  return getKpCatalogsConfig().trainings?.columns || {};
}


// === Формы ===

export function getKpEquipmentFormId() {
  const formId = getKpFormsConfig().equipment?.formId;
  if (!formId)
    throw new Error("[KP][Config] Missing kp.forms.equipment.formId");
  return formId;
}

export function getKpEquipmentFieldIds() {
  const fieldIds = getKpFormsConfig().equipment?.fieldIds;
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
  const crm = getKpFormsConfig().crm || {};
  if (!crm.formId) throw new Error("[KP][Config] Missing kp.forms.crm.formId");
  return {
    id: crm.formId,
    titleFieldId: crm.titleFieldId || 1,
    clientNameFieldIds: crm.clientNameFieldIds || [],
    filters: crm.filters || {},
    registerFieldIds: crm.registerFieldIds || [],
  };
}
