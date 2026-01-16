import { cached as defaultCached, invalidateKey as defaultInvalidateKey } from "../cache/requestCache.js";
import { getMeetingsFormId, getMeetingsFieldIds } from "../config.js";

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

function collectParticipantIds(task, residentsField, responsibleField) {
  const userIds = new Set();
  const roleIds = new Set();
  if (!task || typeof task !== "object") {
    return { userIds: [], roleIds: [] };
  }

  addPersonValue(task.responsible, userIds, roleIds);
  if (responsibleField?.type === "person") {
    addPersonValue(responsibleField.value, userIds, roleIds);
  }
  if (residentsField?.type === "table") {
    const rows = safeArray(residentsField.value);
    for (const row of rows) {
      const cells = safeArray(row?.cells);
      for (const cell of cells) {
        if (cell?.type === "person") {
          addPersonValue(cell.value, userIds, roleIds);
        }
      }
    }
  }

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

function unwrapRegisterPayload(raw) {
  const data = raw?.data ?? raw;
  if (data?.tasks && Array.isArray(data.tasks)) {
    return { tasks: data.tasks, registerItems: [], rawTasksCount: data.tasks.length };
  }
  if (Array.isArray(data)) {
    const tasksCount = data.reduce((count, item) => count + safeArray(item?.tasks).length, 0);
    return { tasks: [], registerItems: data, rawTasksCount: tasksCount };
  }
  if (Array.isArray(raw)) {
    const tasksCount = raw.reduce((count, item) => count + safeArray(item?.tasks).length, 0);
    return { tasks: [], registerItems: raw, rawTasksCount: tasksCount };
  }
  return { tasks: [], registerItems: [], rawTasksCount: 0 };
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

function normalizeRegister(raw, { logSummary = false, fieldConfig = {} } = {}) {
  const { tasks, registerItems, rawTasksCount } = unwrapRegisterPayload(raw);
  const meetings = [];

  const taskList = tasks.length
    ? tasks
    : registerItems.flatMap((item) => safeArray(item?.tasks));

  for (const task of taskList) {
    const fields = safeArray(task?.fields);
    const dueField = findField(
      fields,
      (field) =>
        field.type === "due_date_time" ||
        field.code === fieldConfig.dueDateTime ||
        field.id === fieldConfig.dueDateTime
    );
    const startUtc = dueField?.value || null;
    if (!startUtc || typeof startUtc !== "string") continue;
    const startDate = new Date(startUtc);
    if (Number.isNaN(startDate.getTime())) continue;
    const durationMin = safeNumber(dueField?.duration, 60) || 60;
    const endDate = new Date(startDate.getTime() + durationMin * 60 * 1000);

    const subjectField = findField(
      fields,
      (field) => field.code === fieldConfig.subject || field.id === fieldConfig.subject
    );
    const postLinkField = findField(
      fields,
      (field) => field.code === fieldConfig.postLink || field.id === fieldConfig.postLink
    );
    const responsibleField = findField(
      fields,
      (field) => field.id === fieldConfig.responsible && field.type === "person"
    );
    const residentsField = findField(
      fields,
      (field) => field.id === fieldConfig.residentsTable && field.type === "table"
    );

    const participants = collectParticipantIds(task, residentsField, responsibleField);
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
      participantsUsers: participants.userIds || [],
    });
  }

  if (logSummary && rawTasksCount > 0 && meetings.length === 0) {
    console.warn("[meetings] tasks received but normalized list is empty", {
      tasksCount: rawTasksCount,
      normalizedCount: meetings.length,
    });
  }

  if (logSummary && meetings.length > 0) {
    const first = meetings[0];
    console.debug("[meetings] normalized", {
      count: meetings.length,
      firstStartUtc: first?.startUtc || null,
      firstSubject: first?.subject || "",
    });
  }

  return meetings;
}

export function createMeetingsService({ graphClient, cache, config, membersService } = {}) {
  if (!graphClient || typeof graphClient.callGraphApi !== "function") {
    throw new Error("graphClient is required for meetingsService");
  }
  const cachedFn = cache?.cached || defaultCached;
  const invalidateKeyFn = cache?.invalidateKey || defaultInvalidateKey;
  const formId = getMeetingsFormId();

  let lastNormalized = [];
  let loggedSummary = false;

  async function resolveParticipantScope({ userIds }) {
    if (!Array.isArray(userIds) || userIds.length === 0) {
      return { userIds: [], roleIds: [] };
    }

    const allRoleIds = new Set();
    const validUserIds = [];

    await Promise.all(
      userIds.map(async (id) => {
        const userId = Number(id);
        if (!Number.isFinite(userId)) return;
        validUserIds.push(userId);

        try {
          if (!membersService) return;
          const details = await membersService.getMemberDetails({ id: userId });
          // Пытаемся извлечь роли. В структуре деталей участника обычно есть roles или role_ids
          const roles = details?.roles || details?.role_ids || [];
          if (Array.isArray(roles)) {
            for (const r of roles) {
              const rId = typeof r === "object" ? r.id : r;
              if (rId != null) allRoleIds.add(Number(rId));
            }
          }
        } catch (err) {
          console.warn(`Failed to resolve roles for user ${userId}`, err);
        }
      })
    );

    return {
      userIds: validUserIds,
      roleIds: Array.from(allRoleIds),
    };
  }


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
    lastNormalized = normalizeRegister(data, {
      logSummary: !loggedSummary,
      fieldConfig: getMeetingsFieldIds(),
    });
    loggedSummary = true;
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

  async function createMeeting({ subject, startUtc, durationMinutes, residents, userId }) {
    if (!formId) {
      throw new Error("form_meet is missing in config");
    }
    const f = getMeetingsFieldIds();
    const payload = {
      form_id: formId,
      due: startUtc,
      duration: String(durationMinutes),
      fields: [
        { id: f.subject, value: subject },
        { id: f.dueDateTime, value: startUtc },
        { id: f.responsible, value: { id: userId, type: "user" } },
        {
          id: f.residentsTable,
          value: residents.map((resident, index) => ({
            row_id: index,
            cells: [{ id: f.residentCellPerson, value: { id: resident.id, type: resident.type } }],
          })),
        },
      ],
    };

    const response = await graphClient.callGraphApi("pyrus_api", {
      method: "POST",
      path: "/v4/tasks",
      body: payload,
    });

    const taskId = response?.data?.id ?? response?.data?.task_id ?? response?.task_id ?? null;
    return { taskId, raw: response };
  }

  return {
    loadRegister,
    getMeetingsForRange,
    getCachedMeetings,
    invalidateCache,
    addOptimisticMeeting,
    createMeeting,
    resolveParticipantScope,
  };
}

export { collectParticipantIds };
