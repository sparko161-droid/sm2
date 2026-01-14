export function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date, count) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

export function startOfWeekLocal(date, weekStartsOn = 1) {
  const base = startOfDay(date);
  const day = base.getDay();
  const offset = (day - weekStartsOn + 7) % 7;
  return addDays(base, -offset);
}

export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseDateKey(key) {
  if (!key || typeof key !== "string") return null;
  const [y, m, d] = key.split("-").map((value) => Number(value));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
  return new Date(y, m - 1, d);
}

export function addMinutesLocal(baseMinutes, delta) {
  let total = baseMinutes + delta;
  let dayShift = 0;
  while (total < 0) {
    total += 24 * 60;
    dayShift -= 1;
  }
  while (total >= 24 * 60) {
    total -= 24 * 60;
    dayShift += 1;
  }
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return { time: `${hh}:${mm}`, dayShift };
}

export function parseTimeToMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return null;
  const [hh, mm] = hhmm.split(":").map((part) => Number(part));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

export function computeDurationMinutes(startLocal, endLocal) {
  const start = parseTimeToMinutes(startLocal);
  const end = parseTimeToMinutes(endLocal);
  if (start == null || end == null) return null;
  let diff = end - start;
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

export function convertLocalRangeToUtcWithMeta(
  year,
  monthIndex,
  day,
  startLocal,
  endLocal,
  offsetMin
) {
  try {
    const durationMinutes = computeDurationMinutes(startLocal, endLocal);
    if (durationMinutes == null) return null;

    const y = Number(year);
    const m = Number(monthIndex);
    const d = Number(day);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;

    const startMin = parseTimeToMinutes(startLocal);
    if (startMin == null) return null;
    const hhNum = Math.floor(startMin / 60);
    const mmNum = startMin % 60;
    const offsetMs = Number(offsetMin) * 60 * 1000;
    const baseUtcMs = Date.UTC(y, m, d, hhNum, mmNum);
    if (!Number.isFinite(baseUtcMs)) return null;

    const startUtcMs = baseUtcMs - offsetMs;
    const endUtcMs = startUtcMs + durationMinutes * 60 * 1000;

    const startDate = new Date(startUtcMs);
    const endDate = new Date(endUtcMs);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      return null;
    }

    return {
      durationMinutes,
      startUtcIso: startDate.toISOString(),
      endUtcIso: endDate.toISOString(),
    };
  } catch (error) {
    console.warn("convertLocalRangeToUtcWithMeta: invalid time value", {
      year,
      monthIndex,
      day,
      startLocal,
      endLocal,
      error: String(error && error.message ? error.message : error),
    });
    return null;
  }
}

export function convertUtcStartToLocalRange(
  utcIsoString,
  durationMinutes,
  timezoneOffsetMin,
  options = {}
) {
  if (!utcIsoString || typeof utcIsoString !== "string") return null;
  const startUtc = new Date(utcIsoString);
  if (Number.isNaN(startUtc.getTime())) return null;

  const startLocalMs = startUtc.getTime() + timezoneOffsetMin * 60 * 1000;
  const startLocalDate = new Date(startLocalMs);

  const startHH = String(startLocalDate.getUTCHours()).padStart(2, "0");
  const startMM = String(startLocalDate.getUTCMinutes()).padStart(2, "0");
  const startLocal = `${startHH}:${startMM}`;

  const startMinutes = startLocalDate.getUTCHours() * 60 + startLocalDate.getUTCMinutes();
  const { time: endLocal, dayShift } = addMinutesLocal(startMinutes, durationMinutes || 0);

  const adjustDayByDuration = Boolean(options.adjustDayByDuration);
  const baseDate = adjustDayByDuration
    ? new Date(
        Date.UTC(
          startLocalDate.getUTCFullYear(),
          startLocalDate.getUTCMonth(),
          startLocalDate.getUTCDate()
        )
      )
    : startLocalDate;
  if (adjustDayByDuration) {
    baseDate.setUTCDate(baseDate.getUTCDate() + dayShift);
  }

  const y = baseDate.getUTCFullYear();
  const m = String(baseDate.getUTCMonth() + 1).padStart(2, "0");
  const d = String(baseDate.getUTCDate()).padStart(2, "0");

  return {
    localDateKey: `${y}-${m}-${d}`,
    startLocal,
    endLocal,
    startMinutes,
  };
}
