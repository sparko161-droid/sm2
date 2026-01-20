// js/legacy/scheduleFromPyrus.js
import { pyrusFetch } from "./pyrusAuth.js";
import { getConfigValue } from "../config.js";

/**
 * Загружаем реестр задач формы 2375272 и строим карту графика на месяц.
 *
 * @returns структуру:
 * {
 *   byEmployee: {
 *     [employeeId]: {
 *       [day]: {
 *         taskId,
 *         shiftItemId,
 *         startUtcMinutes,
 *         endUtcMinutes,
 *         startMinutes,
 *         endMinutes,
 *         amount,
 *         line
 *       }
 *     }
 *   }
 * }
 */
export async function loadScheduleForMonth(year, month0, employees, shifts, { localOffsetMin } = {}) {
  // Fallback to config if not provided, but favor the argument
  const targetOffsetMin = localOffsetMin ?? getConfigValue("timezone.localOffsetMin", { defaultValue: 180 });

  const scheduleFormId = getConfigValue("pyrus.forms.smeni", {
    defaultValue: 2375272,
    required: true,
  });

  const dueFieldId = getConfigValue("pyrus.fields.smeni.due", {
    defaultValue: 4,
    required: true,
  });

  const moneyFieldId = getConfigValue("pyrus.fields.smeni.amount", {
    defaultValue: 5,
    required: true,
  });

  const personFieldId = getConfigValue("pyrus.fields.smeni.person", {
    defaultValue: 8,
    required: true,
  });

  const shiftFieldId = getConfigValue("pyrus.fields.smeni.template", {
    defaultValue: 10,
    required: true,
  });

  const localOffsetMs = targetOffsetMin * 60 * 1000;

  const res = await pyrusFetch(`/v4/forms/${scheduleFormId}/register`, {
    method: "GET",
  });

  const json = await res.json();
  const wrapper = Array.isArray(json) ? json[0] : json;
  const tasks = wrapper && Array.isArray(wrapper.tasks) ? wrapper.tasks : [];

  const byEmployee = {};

  for (const task of tasks) {
    const fields = task.fields || [];

    const dueField = fields.find((f) => f.id === dueFieldId && f.type === "due_date_time");
    const moneyField = fields.find((f) => f.id === moneyFieldId && f.type === "money");
    const personField = fields.find((f) => f.id === personFieldId && f.type === "person");
    const shiftField = fields.find((f) => f.id === shiftFieldId && f.type === "catalog");

    if (!dueField || !personField || !shiftField || !shiftField.value) continue;

    const dueVal = dueField.value;
    if (!dueVal) continue;

    const dueUtc = new Date(dueVal);
    if (isNaN(dueUtc.getTime())) continue;

    const dueLocal = new Date(dueUtc.getTime() + localOffsetMs);

    if (dueLocal.getFullYear() !== year || dueLocal.getMonth() !== month0) {
      continue;
    }

    const empId = personField.value && personField.value.id;
    if (!empId) continue;

    const shiftItemId = shiftField.value.item_id;
    const shiftDef = shifts.byId[shiftItemId];

    const day = dueLocal.getDate();

    let startUtcMinutes = null;
    let endUtcMinutes = null;
    let startMinutesLocal = null;
    let endMinutesLocal = null;

    if (typeof dueField.duration === "number" && dueField.duration > 0) {
      const hUtc = dueUtc.getUTCHours();
      const mUtc = dueUtc.getUTCMinutes();
      startUtcMinutes = hUtc * 60 + mUtc;
      endUtcMinutes = (startUtcMinutes + dueField.duration) % (24 * 60);

      startMinutesLocal = (startUtcMinutes + targetOffsetMin + 24 * 60 * 10) % (24 * 60);
      endMinutesLocal = (endUtcMinutes + targetOffsetMin + 24 * 60 * 10) % (24 * 60);
    } else if (shiftDef && shiftDef.startMinutes != null && shiftDef.durationMinutes != null) {
      startMinutesLocal = shiftDef.startMinutes;
      endMinutesLocal = (shiftDef.startMinutes + shiftDef.durationMinutes) % (24 * 60);

      startUtcMinutes = (startMinutesLocal - targetOffsetMin + 24 * 60 * 10) % (24 * 60);
      endUtcMinutes = (endMinutesLocal - targetOffsetMin + 24 * 60 * 10) % (24 * 60);
    } else {
      startUtcMinutes = 0;
      endUtcMinutes = 0;
      startMinutesLocal = (startUtcMinutes + targetOffsetMin + 24 * 60 * 10) % (24 * 60);
      endMinutesLocal = (endUtcMinutes + targetOffsetMin + 24 * 60 * 10) % (24 * 60);
    }

    const amount = typeof moneyField.value === "number"
      ? moneyField.value
      : moneyField.value
        ? parseInt(String(moneyField.value).replace(/\D/g, ""), 10) || 0
        : 0;

    const line = shiftDef && shiftDef.lines
      ? shiftDef.lines.has("L1") && !shiftDef.lines.has("L2")
        ? "L1"
        : shiftDef.lines.has("L2") && !shiftDef.lines.has("L1")
          ? "L2"
          : null
      : null;

    const empMap = (byEmployee[empId] = byEmployee[empId] || {});
    empMap[day] = {
      taskId: task.id,
      shiftItemId,
      startUtcMinutes,
      endUtcMinutes,
      startMinutes: startMinutesLocal,
      endMinutes: endMinutesLocal,
      amount,
      line
    };
  }

  return { byEmployee };
}
