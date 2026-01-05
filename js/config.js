// js/config.js

export let config = null;

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

function hasPath(obj, path) {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return false;
    }
    current = current[part];
  }
  return true;
}

function validateConfig(data) {
  const missing = REQUIRED_PATHS.filter((path) => !hasPath(data, path));
  if (missing.length) {
    throw new Error(`Отсутствуют ключи в config.json: ${missing.join(", ")}`);
  }
}

export async function loadConfig() {
  if (config) return config;

  const url = new URL("../config.json", import.meta.url);
  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Не удалось загрузить config.json: HTTP ${response.status}`);
  }

  const data = await response.json();
  validateConfig(data);

  config = data;
  window.APP_CONFIG = data;

  return config;
}
