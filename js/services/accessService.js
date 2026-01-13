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

function readAuthCache(storageKey) {
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

function normalizeAllowedList(allowed) {
  if (!Array.isArray(allowed)) return [];
  return allowed.map((item) => String(item)).filter(Boolean);
}

export function createAccessService({ config } = {}) {
  const storageKey = config?.storage?.auth?.key || "sm_graph_auth_v1";

  function getCurrentUserRoleIds() {
    const data = readAuthCache(storageKey);
    if (!data || typeof data !== "object") return [];
    const roles = Array.isArray(data.roles)
      ? data.roles
      : Array.isArray(data.user?.roles)
        ? data.user.roles
        : [];
    const rawIds = [
      ...roles,
      data.memberId,
      data.user?.id,
    ];
    return rawIds
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map((value) => String(value));
  }

  function canAccessRoute(routeName) {
    const allowed = normalizeAllowedList(config?.routeAccess?.[routeName] ?? []);
    if (allowed.length === 0) return true;
    const userRoleIds = getCurrentUserRoleIds();
    return allowed.some((roleId) => userRoleIds.includes(roleId));
  }

  return { canAccessRoute, getCurrentUserRoleIds };
}
