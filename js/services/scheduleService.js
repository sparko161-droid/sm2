import { cached } from "../cache/requestCache.js";
import { unwrapPyrusData } from "../api/pyrusClient.js";

export function createScheduleService({ pyrusClient, formId } = {}) {
  if (!pyrusClient || typeof pyrusClient.pyrusRequest !== "function") {
    throw new Error("pyrusClient is required for scheduleService");
  }

  let latestToken = 0;

  async function loadMonthSchedule(monthKey, { force } = {}) {
    const token = ++latestToken;
    const data = await cached(
      `pyrus:schedule:${monthKey}`,
      { ttlMs: 0, force },
      async () => {
        const raw = await pyrusClient.pyrusRequest(`/v4/forms/${formId}/register`, {
          method: "GET",
        });
        return unwrapPyrusData(raw);
      }
    );

    return {
      data,
      monthKey,
      isLatest: token === latestToken,
    };
  }

  return { loadMonthSchedule };
}
