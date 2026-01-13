function getCookie(name) {
  try {
    const match = document.cookie.match(
      new RegExp('(?:^|; )' + name.replace(/[.$?*|{}()\[\]\\/+^]/g, "\\$&") + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
  } catch (_) {
    return null;
  }
}

function setCookie(name, value, days) {
  try {
    const expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch (_) {}
}

function readRawSession(storageKey) {
  if (!storageKey) return null;
  let raw = null;
  try {
    raw = localStorage.getItem(storageKey);
  } catch (_) {
    raw = null;
  }
  if (!raw) {
    raw = getCookie(storageKey);
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_) {
    return null;
  }
}

function resolveSavedAt(payload) {
  return payload?.savedAt ?? payload?.createdAt ?? payload?.ts ?? payload?.timestamp ?? null;
}

export function createAuthService({ config } = {}) {
  const storageKey = config?.storage?.auth?.key || "sm_graph_auth_v1";
  const ttlMs = Number(config?.storage?.auth?.sessionTtlMs ?? config?.storage?.auth?.ttlMs) || 0;
  const cookieDays = Number(config?.storage?.auth?.cookieDays) || 0;

  function getSession() {
    const payload = readRawSession(storageKey);
    if (!payload) return null;
    const savedAt = resolveSavedAt(payload);
    if (!savedAt) return null;
    if (ttlMs > 0 && Date.now() - savedAt > ttlMs) return null;
    return payload;
  }

  function hasValidSession() {
    return Boolean(getSession());
  }

  function clearSession() {
    try {
      localStorage.removeItem(storageKey);
    } catch (_) {}
    if (cookieDays) {
      setCookie(storageKey, "", -1);
    }
  }

  return { hasValidSession, getSession, clearSession };
}
