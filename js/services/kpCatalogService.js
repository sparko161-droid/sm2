
import { cached } from "../cache/requestCache.js";
import {
    getKpCatalogIds,
    getKpServicesMapping,
    getKpMaintenanceMapping,
    getKpLicensesMapping,
    getKpEquipmentFormConfig
} from "../config.js";

export function createKpCatalogsService({ pyrusClient, catalogsService }) {
    const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

    if (!catalogsService || typeof catalogsService.getCatalog !== "function") {
        throw new Error("catalogsService with getCatalog is required for kpCatalogsService");
    }

    function extractCatalogData(data) {
        return {
            headers: data.headers || data.catalog_headers || [],
            items: data.items || data.catalog_items || [],
        };
    }

    // --- Services (Catalog) ---
    async function loadServicesCatalog() {
        const catalogIds = getKpCatalogIds();
        const mapping = getKpServicesMapping(); // { name: "Название", price: "Цена" }

        return cached(
            `kp_catalog_services_${catalogIds.services}`,
            { ttlMs: CACHE_TTL_MS },
            async () => {
                const data = await catalogsService.getCatalog({ catalogId: catalogIds.services });
                const { headers, items } = extractCatalogData(data);

                const nameIdx = headers.indexOf(mapping.name);
                const priceIdx = headers.indexOf(mapping.price);
                const descIdx = mapping.description ? headers.indexOf(mapping.description) : -1;

                if (nameIdx < 0 || priceIdx < 0) {
                    console.error("[KP][Catalogs] Services catalog headers mismatch", {
                        headers,
                        mapping,
                    });
                }

                return items.map(item => ({
                    id: item.item_id,
                    name: (nameIdx >= 0 ? item.values[nameIdx] : "") || "Без названия",
                    price: (priceIdx >= 0 ? Number(item.values[priceIdx]) : 0) || 0,
                    description: (descIdx >= 0 ? item.values[descIdx] : "") || "",
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
                const data = await catalogsService.getCatalog({ catalogId: catalogIds.licenses });
                const { headers, items } = extractCatalogData(data);

                const nameIdx = headers.indexOf(mapping.name);
                const descIdx = headers.indexOf(mapping.description);

                if (nameIdx < 0 || descIdx < 0) {
                    console.error("[KP][Catalogs] Licenses catalog headers mismatch", {
                        headers,
                        mapping,
                    });
                }

                return items.map(item => ({
                    id: item.item_id,
                    name: (nameIdx >= 0 ? item.values[nameIdx] : "") || "Без названия",
                    description: (descIdx >= 0 ? item.values[descIdx] : "") || "",
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
                const data = await catalogsService.getCatalog({ catalogId: catalogIds.maintenance });
                const { headers, items } = extractCatalogData(data);

                const termIdx = headers.indexOf(mapping.terminals);
                const sumIdx = headers.indexOf(mapping.sum);
                const rangeIdx = headers.indexOf(mapping.range);

                if (sumIdx < 0 || rangeIdx < 0) {
                    console.error("[KP][Catalogs] Maintenance catalog headers mismatch", {
                        headers,
                        mapping,
                    });
                }

                return items.map(item => {
                    const rangeStr = (rangeIdx >= 0 ? item.values[rangeIdx] : "") || "";
                    const price = (sumIdx >= 0 ? Number(item.values[sumIdx]) : 0);

                    let min = 0, max = 0;
                    if (rangeStr.includes("-")) {
                        const parts = rangeStr.split("-");
                        min = Number(parts[0]);
                        max = Number(parts[1]);
                    } else if (rangeStr.includes("+") || rangeStr.includes(">")) {
                        min = Number(rangeStr.replace(/\D/g, ""));
                        max = Infinity;
                    } else {
                        min = Number(rangeStr) || 0;
                        max = min;
                    }

                    return {
                        id: item.item_id,
                        rangeRaw: rangeStr,
                        terminalsMin: min,
                        terminalsMax: max,
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
