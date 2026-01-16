import { unwrapPyrusData } from "../api/pyrusClient.js";

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
  } catch (_) { }
}

function extractInitials(firstName, lastName) {
  const first = String(firstName || "").trim();
  const last = String(lastName || "").trim();
  const firstLetter = last[0] || "";
  const secondLetter = first[0] || "";
  return `${firstLetter}${secondLetter}`.toUpperCase();
}

function normalizeAvatarPayload(payload) {
  if (!payload) return "";
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return "";
    if (trimmed.startsWith("data:")) return trimmed;
    if (trimmed.startsWith("http")) return trimmed;
    const isBase64 = /^[A-Za-z0-9+/=]+$/.test(trimmed);
    if (isBase64) {
      return `data:image/jpeg;base64,${trimmed}`;
    }
    return trimmed;
  }
  if (typeof payload !== "object") return "";

  if (payload.url) {
    return String(payload.url);
  }

  const base64 = payload.base64 || payload.data || payload.content || "";
  if (!base64) return "";
  if (String(base64).startsWith("data:")) return String(base64);
  const contentType = payload.contentType || payload.mimeType || "image/png";
  return `data:${contentType};base64,${base64}`;
}

function normalizeProfileData(data) {
  if (!data || typeof data !== "object") return null;
  const profile = { ...data };
  const firstName = data.first_name || "";
  const lastName = data.last_name || "";
  const fullName = `${lastName} ${firstName}`.trim();
  const initials = extractInitials(firstName, lastName);
  const roleIds = Array.isArray(data.roles) ? data.roles.map((role) => String(role)) : [];
  const departmentName =
    data.department_name || data.department?.name || data.department?.title || "";
  const departmentId = data.department_id ?? data.department?.id ?? null;

  return {
    ...profile,
    fullName,
    initials,
    position: data.position || "",
    phoneWork: data.phone || "",
    phoneMobile: data.mobile_phone || "",
    department_name: departmentName,
    department_id: departmentId,
    roleIds,
    avatarUrl: data.avatarUrl || profile.avatarUrl || "",
  };
}

export function createUserProfileService({ pyrusClient, cache, config } = {}) {
  if (!pyrusClient || typeof pyrusClient.pyrusRequest !== "function") {
    throw new Error("pyrusClient is required for userProfileService");
  }

  const storageKey = config?.storage?.profile?.key || "sm_graph_profile_v1";
  const cookieDays =
    Number(config?.storage?.profile?.cookieDays) ||
    Number(config?.storage?.auth?.cookieDays) ||
    0;
  const avatarSize = Number(config?.ui?.avatarSize) || 40;

  let profile = null;
  const avatarCache = new Map();

  function saveProfile(nextProfile) {
    profile = normalizeProfileData(nextProfile);
    if (profile && cookieDays) {
      const { avatarUrl, ...safeProfile } = profile;
      setCookie(storageKey, JSON.stringify(safeProfile), cookieDays);
    }
    return profile;
  }

  function readProfileCookie() {
    if (!storageKey) return null;
    const raw = getCookie(storageKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  async function loadCurrentUserProfile({ userId, force = false } = {}) {
    if (!userId) {
      throw new Error("userId is required to load profile");
    }
    if (!force) {
      const cached = getCachedProfile();
      if (cached && String(cached.id) === String(userId)) {
        return cached;
      }
    }

    const raw = await pyrusClient.pyrusRequest(`/v4/members/${userId}`, {
      method: "GET",
    });
    const data = unwrapPyrusData(raw);
    if (!data || typeof data !== "object") {
      throw new Error("Profile response is invalid");
    }
    if (cache?.invalidateByPrefix) {
      cache.invalidateByPrefix("pyrus:members:detail:");
    }
    const savedProfile = saveProfile(data);
    if (savedProfile?.avatar_id) {
      try {
        const avatarUrl = await loadAvatar({
          avatarId: savedProfile.avatar_id,
          size: avatarSize,
          force,
        });
        if (avatarUrl) {
          savedProfile.avatarUrl = avatarUrl;
          if (cookieDays) {
            const { avatarUrl: _, ...safeProfile } = savedProfile;
            setCookie(storageKey, JSON.stringify(safeProfile), cookieDays);
          }
        }
      } catch (_) { }
    }
    return savedProfile;
  }

  function getCachedProfile() {
    if (profile) return profile;
    const cached = readProfileCookie();
    if (cached) {
      profile = normalizeProfileData(cached);
      return profile;
    }
    return null;
  }

  function getRoleIds() {
    const cached = getCachedProfile();
    return cached?.roleIds || [];
  }

  async function loadAvatar({ avatarId, size = avatarSize, force = false } = {}) {
    if (!avatarId) return "";
    const key = `${avatarId}:${size}`;
    if (!force && avatarCache.has(key)) {
      return avatarCache.get(key);
    }
    const url = `https://files.pyrus.com/services/avatar/${avatarId}/${size}`;
    const raw = await pyrusClient.pyrusRequest(url, { method: "GET" });
    const data = unwrapPyrusData(raw);
    const normalized = normalizeAvatarPayload(data);
    if (!normalized) {
      throw new Error("Avatar payload is invalid");
    }
    avatarCache.set(key, normalized);
    return normalized;
  }

  function clear() {
    profile = null;
    setCookie(storageKey, "", -1);
    for (const url of avatarCache.values()) {
      if (typeof url === "string" && url.startsWith("blob:")) {
        URL.revokeObjectURL(url);
      }
    }
    avatarCache.clear();
  }

  return {
    loadCurrentUserProfile,
    getCachedProfile,
    getRoleIds,
    loadAvatar,
    clear,
  };
}
