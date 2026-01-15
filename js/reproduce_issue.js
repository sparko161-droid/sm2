
// Mock dateTime functions based on view_file content
function addMinutesLocal(baseMinutes, delta) {
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

function convertUtcStartToLocalRange(utcIsoString, durationMinutes, timezoneOffsetMin, options = {}) {
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
        ? new Date(Date.UTC(startLocalDate.getUTCFullYear(), startLocalDate.getUTCMonth(), startLocalDate.getUTCDate()))
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

// Test Case
// Event: 11th Oct 00:00 MSK (UTC+3)
// UTC: 10th Oct 21:00 Z
const utcIso = "2023-10-10T21:00:00.000Z";
const duration = 60;

console.log("--- MSK (+180) ---");
const msk = convertUtcStartToLocalRange(utcIso, duration, 180);
console.log("MSK:", msk);

console.log("--- KGM (+120) ---");
const kgm = convertUtcStartToLocalRange(utcIso, duration, 120);
console.log("KGM:", kgm);
