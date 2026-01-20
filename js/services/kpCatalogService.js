
import { cached, peekCache } from "../cache/requestCache.js";
import {
    getKpCatalogIds,
    getKpServicesMapping,
    getKpMaintenanceMapping,
    getKpLicensesMapping,
    getKpTrainingsMapping,
    getKpEquipmentFormConfig
} from "../config.js";

export function createKpCatalogsService({ pyrusClient }) {
    const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
    const STALE_TTL_MS = 60 * 60 * 1000; // 1 hour for stale data

    // Local cache for stale-while-revalidate pattern
    const localCache = {
        services: { data: null, fetchedAt: 0 },
        licenses: { data: null, fetchedAt: 0 },
        maintenance: { data: null, fetchedAt: 0 },
        equipment: { data: null, fetchedAt: 0 },
        trainings: { data: null, fetchedAt: 0 }
    };

    const isStale = (entry) => {
        if (!entry.data) return true;
        return Date.now() - entry.fetchedAt > CACHE_TTL_MS;
    };

    const isExpired = (entry) => {
        if (!entry.data) return true;
        return Date.now() - entry.fetchedAt > STALE_TTL_MS;
    };

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

    const warnMissingColumn = (context, index, headers) => {
        if (!Array.isArray(headers)) return;
        if (!Number.isFinite(index)) {
            console.warn("[KP][Catalogs] Missing column index", { context, index, headers });
            return;
        }
        if (index < headers.length) return;
        console.warn("[KP][Catalogs] Missing column index", {
            context,
            index,
            headers
        });
    };

    // --- Services (Catalog) ---
    async function loadServicesCatalog() {
        const catalogIds = getKpCatalogIds();
        const mapping = getKpServicesMapping(); // { name: "Название", price: "Цена" }

        const result = await cached(
            `kp_catalog_services_${catalogIds.services}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const data = await pyrusClient.getCatalog(catalogIds.services);
                const nameIdx = mapping.nameIndex;
                const priceIdx = mapping.priceIndex;
                const autoDiscountIdx = mapping.autoDiscountIndex;
                const descIdx = mapping.descriptionIndex;

                warnMissingColumn("services.nameIndex", nameIdx, data.headers);
                warnMissingColumn("services.priceIndex", priceIdx, data.headers);
                if (autoDiscountIdx !== undefined) warnMissingColumn("services.autoDiscountIndex", autoDiscountIdx, data.headers);
                if (descIdx !== undefined) {
                    warnMissingColumn("services.descriptionIndex", descIdx, data.headers);
                }

                return (data.items || []).map(item => {
                    const autoDiscountVal = autoDiscountIdx !== undefined ? cleanText(item.values?.[autoDiscountIdx]).toUpperCase() : "";
                    let discountMode = "manual";
                    if (autoDiscountVal === "ДА" || autoDiscountVal === "YES") discountMode = "auto";
                    else if (autoDiscountVal === "НЕТ" || autoDiscountVal === "NO") discountMode = "fixed";

                    return {
                        id: item.item_id,
                        name: cleanText(item.values?.[nameIdx]) || "Без названия",
                        price: parseNumber(item.values?.[priceIdx]),
                        description: descIdx !== undefined ? cleanText(item.values?.[descIdx]) : "",
                        discountMode: discountMode
                    };
                });
            }
        );
        
        // Update local cache for stale-while-revalidate
        localCache.services = { data: result, fetchedAt: Date.now() };
        return result;
    }
    
    // Get cached services immediately (stale-while-revalidate)
    function getCachedServicesCatalog() {
        return localCache.services.data;
    }


    // --- Licenses (Catalog) ---
    async function loadLicensesCatalog() {
        const catalogIds = getKpCatalogIds();
        const mapping = getKpLicensesMapping(); // { name: "sm_name", description: "sm_opisanie" }

        const result = await cached(
            `kp_catalog_licenses_${catalogIds.licenses}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const data = await pyrusClient.getCatalog(catalogIds.licenses);
                const nameIdx = mapping.nameIndex;
                const descIdx = mapping.descriptionIndex;
                const fallbackIdx = mapping.fallbackNameIndex;
                const priceIdx = mapping.smPriceIndex;

                warnMissingColumn("licenses.nameIndex", nameIdx, data.headers);
                warnMissingColumn("licenses.descriptionIndex", descIdx, data.headers);
                if (priceIdx !== undefined) warnMissingColumn("licenses.smPriceIndex", priceIdx, data.headers);
                if (fallbackIdx !== undefined) {
                    warnMissingColumn("licenses.fallbackNameIndex", fallbackIdx, data.headers);
                }

                return (data.items || []).map(item => {
                    const name = cleanText(item.values?.[nameIdx]) || cleanText(item.values?.[fallbackIdx]);
                    const price = (priceIdx !== undefined) ? (Number(item.values?.[priceIdx]) || 0) : 0;
                    return {
                        id: item.item_id,
                        name: name || "Без названия",
                        description: cleanText(item.values?.[descIdx]),
                        price: price
                    };
                });
            }
        );
        
        localCache.licenses = { data: result, fetchedAt: Date.now() };
        return result;
    }
    
    function getCachedLicensesCatalog() {
        return localCache.licenses.data;
    }

    // --- Maintenance (Catalog) ---
    async function loadMaintenanceCatalog() {
        const catalogIds = getKpCatalogIds();
        const mapping = getKpMaintenanceMapping();

        const result = await cached(
            `kp_catalog_maintenance_${catalogIds.maintenance}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const data = await pyrusClient.getCatalog(catalogIds.maintenance);
                const frontsIdx = mapping.frontsIndex;
                const totalIdx = mapping.totalIndex;
                const unitIdx = mapping.unitIndex;

                warnMissingColumn("maintenance.frontsIndex", frontsIdx, data.headers);
                warnMissingColumn("maintenance.totalIndex", totalIdx, data.headers);
                warnMissingColumn("maintenance.unitIndex", unitIdx, data.headers);

                return (data.items || []).map(item => ({
                    id: item.item_id,
                    fronts: parseNumber(item.values?.[frontsIdx]),
                    total: parseNumber(item.values?.[totalIdx]),
                    unit: parseNumber(item.values?.[unitIdx])
                })).filter((row) => Number.isFinite(row.fronts)).sort((a, b) => a.fronts - b.fronts);
            }
        );
        
        localCache.maintenance = { data: result, fetchedAt: Date.now() };
        return result;
    }
    
    function getCachedMaintenanceCatalog() {
        return localCache.maintenance.data;
    }
    
    // --- Trainings (Catalog) ---
    async function loadTrainingsCatalog() {
        const catalogIds = getKpCatalogIds();
        const mapping = getKpTrainingsMapping();

        const result = await cached(
            `kp_catalog_trainings_${catalogIds.trainings}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const data = await pyrusClient.getCatalog(catalogIds.trainings);
                const nameIdx = mapping.nameIndex;
                const priceIdx = mapping.priceIndex;

                warnMissingColumn("trainings.nameIndex", nameIdx, data.headers);
                warnMissingColumn("trainings.priceIndex", priceIdx, data.headers);

                return (data.items || []).map(item => ({
                    id: item.item_id,
                    name: cleanText(item.values?.[nameIdx]) || "Без названия",
                    price: parseNumber(item.values?.[priceIdx]),
                    description: ""
                }));
            }
        );
        
        localCache.trainings = { data: result, fetchedAt: Date.now() };
        return result;
    }
    
    function getCachedTrainingsCatalog() {
        return localCache.trainings.data;
    }
    
    function getMaintenancePriceForTerminals(catalogItems, count) {
        if (!catalogItems || !catalogItems.length) return { unitPrice: 0, baseUnitPrice: 0, total: 0 };
        const terminals = Number(count) || 0;
        
        const sorted = [...catalogItems].sort((a, b) => a.fronts - b.fronts);
        const baseEntry = sorted.find(row => row.fronts === 1) || sorted[0];
        const baseUnitPrice = baseEntry?.unit || 0;

        const exact = catalogItems.find((row) => row.fronts === terminals);
        if (exact) return { unitPrice: exact.unit, baseUnitPrice, total: exact.total };

        const fallback = sorted.filter((row) => row.fronts <= terminals).pop() || sorted[0];
        return { unitPrice: fallback?.unit || 0, baseUnitPrice, total: fallback?.total || 0 };
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
                    const typeName = getVal(task, conf.fieldIds.type) || "";
                    const description = getVal(task, conf.fieldIds.description) || "";
                    const photoField = getVal(task, conf.fieldIds.photo);

                    // Pyrus returns photo as an array of attachments
                    const firstPhoto = Array.isArray(photoField) && photoField.length > 0 ? photoField[0] : null;

                    return {
                        id: task.id,
                        name,
                        price,
                        typeName,
                        description,
                        image: null,
                        photo: firstPhoto ? { attachmentId: firstPhoto.id, name: firstPhoto.name } : null
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
        loadTrainingsCatalog,
        getMaintenancePriceForTerminals,
        // Stale-while-revalidate cached getters
        getCachedServicesCatalog,
        getCachedLicensesCatalog,
        getCachedMaintenanceCatalog,
        getCachedTrainingsCatalog,
        // Utility: check if cache has data
        hasCachedData: () => !!(localCache.services.data || localCache.licenses.data || localCache.maintenance.data || localCache.trainings.data)
    };
}
