import { cached as defaultCached, invalidateKey as defaultInvalidateKey } from "../cache/requestCache.js";
import { unwrapPyrusData } from "../api/pyrusClient.js";

const MEETINGS_CACHE_KEY = "sm_meet_register_v1";
const MEETINGS_TTL_MS = 3 * 60 * 1000;

function isObject(value) {
  return value && typeof value === "object";
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function addPersonValue(value, userIds, roleIds) {
  if (!isObject(value)) return;
  const type = value.type || value.kind || (value.role_id ? "role" : "user");
  const id = safeNumber(value.id || value.user_id || value.role_id, null);
  if (!id) return;
  if (type === "role") {
    roleIds.add(id);
  } else {
    userIds.add(id);
  }
}

function collectParticipantIds(task) {
  const userIds = new Set();
  const roleIds = new Set();
  if (!task || typeof task !== "object") {
    return { userIds: [], roleIds: [] };
  }

  addPersonValue(task.responsible, userIds, roleIds);

  const extraKeys = [
    "approvers",
    "subscribers",
    "observers",
    "watchers",
    "followers",
    "auditors",
    "reviewers",
    "participants",
    "assignees",
    "members",
  ];
  for (const key of extraKeys) {
    const list = safeArray(task[key]);
    for (const value of list) {
      addPersonValue(value, userIds, roleIds);
    }
  }

  const fields = safeArray(task.fields);
  for (const field of fields) {
    if (!field || typeof field !== "object") continue;
    if (field.type === "person") {
      addPersonValue(field.value, userIds, roleIds);
    }
    if (field.type === "table") {
      const rows = safeArray(field.value);
      for (const row of rows) {
        const cells = safeArray(row?.cells);
        for (const cell of cells) {
          if (cell?.type === "person") {
            addPersonValue(cell.value, userIds, roleIds);
          }
        }
      }
    }
  }

  return { userIds: Array.from(userIds), roleIds: Array.from(roleIds) };
}

function resolvePersonTitle(value) {
  if (!value || typeof value !== "object") return "";
  if (value.type === "role") {
    const title = String(value.last_name || value.name || "").trim();
    return title || `role #${value.id}`;
  }
  const firstName = String(value.first_name || value.name || "").trim();
  const lastName = String(value.last_name || "").trim();
  return `${firstName} ${lastName}`.trim();
}

function normalizeResidents(field) {
  const residents = [];
  if (!field || field.type !== "table") return residents;
  const rows = safeArray(field.value);
  for (const row of rows) {
    const cells = safeArray(row?.cells);
    for (const cell of cells) {
      if (cell?.type !== "person") continue;
      const value = cell.value;
      if (!value) continue;
      const type = value.type === "role" ? "role" : "user";
      const id = safeNumber(value.id, null);
      if (!id) continue;
      residents.push({
        type,
        id,
        title: resolvePersonTitle(value),
      });
    }
  }
  return residents;
}

function findField(fields, predicate) {
  return safeArray(fields).find((field) => field && predicate(field));
}

function normalizeRegister(raw) {
  const data = unwrapPyrusData(raw);
  const registerItems = safeArray(data);
  const meetings = [];

  for (const item of registerItems) {
    const tasks = safeArray(item?.tasks);
    for (const task of tasks) {
      const fields = safeArray(task?.fields);
      const dueField = findField(
        fields,
        (field) => field.type === "due_date_time" || field.id === 4
      );
      const startUtc = dueField?.value || null;
      if (!startUtc || typeof startUtc !== "string") continue;
      const startDate = new Date(startUtc);
      if (Number.isNaN(startDate.getTime())) continue;
      const durationMin = safeNumber(dueField?.duration, 60) || 60;
      const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

      const subjectField = findField(
        fields,
        (field) => field.code === "Subject" || field.id === 1
      );
      const postLinkField = findField(fields, (field) => field.code === "PostLink");
      const responsibleField = findField(fields, (field) => field.id === 27);
      const residentsField = findField(fields, (field) => field.id === 14 && field.type === "table");

      const participants = collectParticipantIds(task);
      const residentsNormalized = normalizeResidents(residentsField);

      meetings.push({
        id: task?.id ?? null,
        startUtc,
        endUtc: endDate.toISOString(),
        startMs: startDate.getTime(),
        endMs: endDate.getTime(),
        durationMin,
        subject: subjectField?.value || "",
        postLink: postLinkField?.value || "",
        taskResponsible: task?.responsible || null,
        responsibleField: responsibleField?.value || null,
        residents: residentsField?.value || [],
        residentsNormalized,
        participants,
      });
    }
  }

  return meetings;
}

export function createMeetingsService({ graphClient, cache, config } = {}) {
  if (!graphClient || typeof graphClient.callGraphApi !== "function") {
    throw new Error("graphClient is required for meetingsService");
  }
  const cachedFn = cache?.cached || defaultCached;
  const invalidateKeyFn = cache?.invalidateKey || defaultInvalidateKey;
  const formId = config?.pyrus?.forms?.form_meet;

  let lastNormalized = [];

  async function loadRegister({ force = false } = {}) {
    if (!formId) {
      throw new Error("form_meet is missing in config");
    }
    const data = await cachedFn(
      MEETINGS_CACHE_KEY,
      { ttlMs: MEETINGS_TTL_MS, force },
      async () => {
        return graphClient.callGraphApi("pyrus_api", {
          method: "GET",
          path: `/v4/forms/${formId}/register`,
        });
      }
    );
    lastNormalized = normalizeRegister(data);
    return lastNormalized;
  }

  function getCachedMeetings() {
    return lastNormalized;
  }

  async function getMeetingsForRange({ startLocal, endLocal, force = false } = {}) {
    const meetings = lastNormalized.length ? lastNormalized : await loadRegister({ force });
    const startMs = startLocal?.getTime?.() ?? null;
    const endMs = endLocal?.getTime?.() ?? null;
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      return meetings;
    }
    return meetings.filter((meeting) => {
      if (!meeting) return false;
      return meeting.startMs < endMs && meeting.endMs > startMs;
    });
  }

  function invalidateCache() {
    invalidateKeyFn(MEETINGS_CACHE_KEY);
  }

  function addOptimisticMeeting(meeting) {
    if (!meeting) return;
    lastNormalized = [meeting, ...lastNormalized];
  }

  return {
    loadRegister,
    getMeetingsForRange,
    getCachedMeetings,
    invalidateCache,
    addOptimisticMeeting,
  };
}

export { collectParticipantIds };
