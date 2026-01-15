// js/services/timezoneService.js

export function createTimezoneService({ config } = {}) {
    let currentZone = null;
    const subscribers = new Set();
    const storageKey = config?.timezone?.storageKey || "sm2_timezone";
    const zones = config?.timezone?.zones || [];

    function getZone() {
        return currentZone;
    }

    function getOffsetMin() {
        return currentZone?.utcOffsetMin ?? (config?.timezone?.localOffsetMin || 4 * 60);
    }

    function getLabelShort() {
        if (!currentZone) return "";
        const mskOffset = 180; // UTC+3
        const deltaHours = (currentZone.utcOffsetMin - mskOffset) / 60;
        if (deltaHours === 0) return "МСК";
        return deltaHours > 0 ? `МСК+${deltaHours}` : `МСК${deltaHours}`;
    }

    function getLabelLong() {
        const short = getLabelShort();
        return short ? `по ${short}` : "";
    }

    function listZones() {
        return zones;
    }

    function setZoneById(id) {
        const zone = zones.find((z) => z.id === id);
        if (!zone) return;

        currentZone = zone;
        try {
            localStorage.setItem(storageKey, id);
        } catch (e) {
            console.warn("timezoneService: failed to persist to localStorage", e);
        }
        notify();
    }

    function notify() {
        subscribers.forEach((fn) => {
            try {
                fn(currentZone);
            } catch (e) {
                console.error("timezoneService subscriber error", e);
            }
        });
    }

    function subscribe(fn) {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
    }

    function init() {
        let savedId = null;
        try {
            savedId = localStorage.getItem(storageKey);
        } catch (e) { }

        if (savedId) {
            const found = zones.find((z) => z.id === savedId);
            if (found) {
                currentZone = found;
                return;
            }
        }

        // Auto-detect based on system TZ
        const systemUtcOffsetMin = -new Date().getTimezoneOffset();
        const match = zones.find((z) => z.utcOffsetMin === systemUtcOffsetMin);
        if (match) {
            currentZone = match;
        } else {
            // Fallback on legacy config or closest offset
            const fallbackOffset = config?.timezone?.localOffsetMin || 180;
            const closest = zones.reduce((prev, curr) => {
                return Math.abs(curr.utcOffsetMin - fallbackOffset) < Math.abs(prev.utcOffsetMin - fallbackOffset)
                    ? curr
                    : prev;
            }, zones[0]);
            currentZone = closest || zones.find(z => z.id === 'moscow') || zones[0];
        }

        if (currentZone) {
            try {
                localStorage.setItem(storageKey, currentZone.id);
            } catch (e) { }
        }
    }

    return {
        init,
        getZone,
        getOffsetMin,
        getLabelShort,
        getLabelLong,
        setZoneById,
        listZones,
        subscribe,
    };
}
