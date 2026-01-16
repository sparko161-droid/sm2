
import { cached } from "../cache/requestCache.js";
import {
    getKpCatalogIds,
    getKpServicesMapping,
    getKpMaintenanceMapping,
    getKpLicensesMapping,
    getKpEquipmentFormConfig
} from "../config.js";

export function createKpCatalogsService({ pyrusClient }) {
    const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

    if (!pyrusClient || typeof pyrusClient.getCatalog !== "function") {
        throw new Error("pyrusClient with getCatalog is required for kpCatalogsService");
    }

    const cleanText = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

    const parseNumber = (value) => {
        if (typeof value === "number") return value;
        const cleaned = String(value ?? "")
            .replace(/\s+/g, "")
            .replace(",", ".")
            .replace(/[^\d.-]/g, "");
        const parsed = Number(cleaned);
        return Number.isFinite(parsed) ? parsed : 0;
    };

    function indexByHeader(headers) {
        const map = new Map();
        headers.forEach((header, index) => {
            const key = cleanText(header);
            if (key && !map.has(key)) {
                map.set(key, index);
            }
        });
        return map;
    }

    function getHeaderIndex(headerMap, headerLabel, context) {
        const key = cleanText(headerLabel);
        const idx = headerMap.get(key);
        if (idx === undefined) {
            console.warn("[KP][Catalogs] Missing header", {
                context,
                header: headerLabel,
                headers: Array.from(headerMap.keys()),
            });
        }
        return idx;
    }

    // --- Services (Catalog) ---
    async function loadServicesCatalog() {
        const catalogIds = getKpCatalogIds();
        const mapping = getKpServicesMapping(); // { name: "Название", price: "Цена" }

        return cached(
            `kp_catalog_services_${catalogIds.services}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const data = await pyrusClient.getCatalog(catalogIds.services);
                const headerMap = indexByHeader(data.headers || []);

                const nameIdx = getHeaderIndex(headerMap, mapping.name, "services.name");
                const priceIdx = getHeaderIndex(headerMap, mapping.price, "services.price");
                const descIdx = mapping.description
                    ? getHeaderIndex(headerMap, mapping.description, "services.description")
                    : undefined;

                return (data.items || []).map(item => ({
                    id: item.item_id,
                    name: cleanText(nameIdx !== undefined ? item.values?.[nameIdx] : "") || "Без названия",
                    price: parseNumber(priceIdx !== undefined ? item.values?.[priceIdx] : 0),
                    description: cleanText(descIdx !== undefined ? item.values?.[descIdx] : ""),
                }));
            }
        );
    }

    // --- Licenses (Catalog) ---
    async function loadLicensesCatalog() {
        const catalogIds = getKpCatalogIds();
        const mapping = getKpLicensesMapping(); // { name: "sm_name", description: "sm_opisanie" }

        return cached(
            `kp_catalog_licenses_${catalogIds.licenses}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const data = await pyrusClient.getCatalog(catalogIds.licenses);
                const headerMap = indexByHeader(data.headers || []);

                const nameIdx = getHeaderIndex(headerMap, mapping.name, "licenses.name");
                const descIdx = getHeaderIndex(headerMap, mapping.description, "licenses.description");

                return (data.items || []).map(item => ({
                    id: item.item_id,
                    name: cleanText(nameIdx !== undefined ? item.values?.[nameIdx] : "") || "Без названия",
                    description: cleanText(descIdx !== undefined ? item.values?.[descIdx] : ""),
                    price: 0
                }));
            }
        );
    }

    // --- Maintenance (Catalog) ---
    async function loadMaintenanceCatalog() {
        const catalogIds = getKpCatalogIds();
        const mapping = getKpMaintenanceMapping();

        return cached(
            `kp_catalog_maintenance_${catalogIds.maintenance}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const data = await pyrusClient.getCatalog(catalogIds.maintenance);
                const headerMap = indexByHeader(data.headers || []);

                const terminalsIdx = getHeaderIndex(headerMap, mapping.terminals, "maintenance.terminals");
                const sumIdx = getHeaderIndex(headerMap, mapping.sum, "maintenance.sum");
                const rangeIdx = mapping.range
                    ? getHeaderIndex(headerMap, mapping.range, "maintenance.range")
                    : undefined;

                const parseRange = (value) => {
                    const normalized = cleanText(value);
                    if (!normalized) return { min: 0, max: 0, raw: "" };
                    if (normalized.includes("-")) {
                        const [left, right] = normalized.split("-").map((v) => parseNumber(v));
                        return { min: left || 0, max: right || 0, raw: normalized };
                    }
                    if (normalized.includes("+") || normalized.includes(">")) {
                        const min = parseNumber(normalized);
                        return { min, max: Infinity, raw: normalized };
                    }
                    const single = parseNumber(normalized);
                    return { min: single, max: single, raw: normalized };
                };

                return (data.items || []).map(item => {
                    const terminalsValue = terminalsIdx !== undefined ? item.values?.[terminalsIdx] : "";
                    const rangeValue = rangeIdx !== undefined ? item.values?.[rangeIdx] : "";
                    const range = parseRange(terminalsValue || rangeValue);
                    const price = parseNumber(sumIdx !== undefined ? item.values?.[sumIdx] : 0);

                    return {
                        id: item.item_id,
                        rangeRaw: range.raw,
                        terminalsMin: range.min,
                        terminalsMax: range.max,
                        price: price
                    };
                }).sort((a,b) => a.terminalsMin - b.terminalsMin);
            }
        );
    }
    
    function getMaintenancePrice(catalogItems, count) {
        if (!catalogItems || !catalogItems.length) return 0;
        const found = catalogItems.find(x => count >= x.terminalsMin && count <= x.terminalsMax);
        return found ? found.price : 0;
    }

    // --- Equipment (Form Register) ---
    async function loadEquipmentCatalog() {
        // Technically this is a Form Register, so we use getFormRegister via pyrusClient (or wrapper)
        // Ideally kpEquipmentService handles this, but kpView calls kpCatalogService.loadEquipmentCatalog too.
        // We implement it here to satisfy the call.
        const conf = getKpEquipmentFormConfig();

        return cached(
            `kp_catalog_equipment_reg_${conf.id}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const response = await pyrusClient.getFormRegister(conf.id);
                const tasks = response.tasks || [];

                const getVal = (task, fieldId) => {
                    if (!task.fields) return null;
                    const f = task.fields.find(x => x.id === fieldId);
                    return f ? f.value : null;
                };

                return tasks.map(task => {
                    const name = getVal(task, conf.fieldIds.name) || "Без названия";
                    const price = Number(getVal(task, conf.fieldIds.salePrice)) || 0;
                    const photoField = getVal(task, conf.fieldIds.photo);

                    return {
                        id: task.id,
                        name,
                        price,
                        image: null,
                        photo: photoField
                    };
                });
            }
        );
    }

    return {
        loadServicesCatalog,
        loadLicensesCatalog,
        loadMaintenanceCatalog,
        loadEquipmentCatalog,
        getMaintenancePrice
    };
}
