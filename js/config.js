const CONFIG_URL = "./config.json";

async function loadConfig() {
  try {
    const response = await fetch(CONFIG_URL, { cache: "no-store" });
    if (!response.ok) {
      console.error(`Не удалось загрузить конфиг: HTTP ${response.status}`);
      return {};
    }
    const data = await response.json();
    if (!data || typeof data !== "object") {
      console.error("Конфиг получен, но имеет некорректный формат.");
      return {};
    }
    return data;
  } catch (error) {
    console.error("Ошибка загрузки конфига:", error);
    return {};
  }
}

const configCache = await loadConfig();

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
  const value = resolvePath(configCache, path);
  if (value === undefined || value === null) {
    const message = `Отсутствует ключ конфига: ${path}`;
    if (required) {
      console.error(message);
    } else {
      console.warn(message);
    }
    return defaultValue;
  }
  return value;
}

export function getConfig() {
  return configCache;
}
