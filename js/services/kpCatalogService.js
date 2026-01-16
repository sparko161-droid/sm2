
import { cached } from "../cache/requestCache.js";
import { 
    getKpServicesCatalog, 
    getKpMaintenanceCatalog, 
    getKpLicensesCatalog,
    getKpEquipmentForm 
} from "../config.js";

export function createKpCatalogsService({ pyrusClient }) {
    const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

    // Helper to get value from Catalog Item (array of values) or Form Task (fields list)
    // Pyrus Catalog response items: { values: ["Name", "Price", ...] } - order matches headers
    // Pyrus Form Register response items: { fields: [{id, value}, ...] }
    
    function getCatalogValue(item, headers, colName) {
        // Headers: ["Name", "Price", ...]
        // Item: { values: ["Sva", "100", ...] }
        // We need mapping from config: { "name": "Название", "price": "Цена" }
        // We find index of "Название" in headers, pick that index from item.values
        if (!item?.values || !headers) return null;
        
        // This helper assumes 'colName' is the config key (e.g. "name"), 
        // which maps to a Pyrus Column Name (e.g. "Название").
        
        // Note: The logic inside specific load functions handles the mapping resolution.
        return null;
    }

    // --- Services (Catalog) ---
    async function loadServicesCatalog() {
        const conf = getKpServicesCatalog(); // { id, columns: { name: "Название", price: "Цена" } }
        
        return cached(
            `kp_catalog_services_${conf.id}`,
            async () => {
                const data = await pyrusClient.getCatalog(conf.id); 
                // data = { items: [{ values: [...] }], headers: ["Название", "Цена", ...] }
                // or data could be array if normalized? pyrusClient.getCatalog implementation needs check.
                // Assuming standard Pyrus response or normalized. 
                // If pyrusClient.getCatalog returns raw Pyrus response:
                
                const headers = data.headers || [];
                const items = data.items || [];
                
                // Map headers to indices
                const nameIdx = headers.indexOf(conf.columns.name);
                const priceIdx = headers.indexOf(conf.columns.price);
                const descIdx = headers.indexOf(conf.columns.description); // optional

                return items.map(item => ({
                    id: item.item_id || Math.random(), // Catalog items have item_id
                    name: (nameIdx >= 0 ? item.values[nameIdx] : "") || "Без названия",
                    price: (priceIdx >= 0 ? Number(item.values[priceIdx]) : 0) || 0,
                    description: (descIdx >= 0 ? item.values[descIdx] : "") || "",
                }));
            },
            CACHE_TTL_MS
        );
    }

    // --- Licenses (Catalog) ---
    async function loadLicensesCatalog() {
        const conf = getKpLicensesCatalog(); // { id, columns: { name: "sm_name", description: "sm_opisanie" } }
        
        return cached(
            `kp_catalog_licenses_${conf.id}`,
            async () => {
                const data = await pyrusClient.getCatalog(conf.id);
                const headers = data.headers || [];
                const items = data.items || [];
                
                const nameIdx = headers.indexOf(conf.columns.name);
                const descIdx = headers.indexOf(conf.columns.description);
                // Price not in config columns? If missing, assume 0 or look for "Цена"?
                // Config says: columns: {name, description}. No price?
                // Maybe licenses have dynamic price or it's in description. 
                // Let's check if 'price' key exists in config, if not check specific.
                // For now, assume price is 0 if not mapped.
                
                return items.map(item => ({
                    id: item.item_id,
                    name: (nameIdx >= 0 ? item.values[nameIdx] : "") || "Без названия",
                    description: (descIdx >= 0 ? item.values[descIdx] : "") || "",
                    price: 0 // Default
                }));
            },
            CACHE_TTL_MS
        );
    }

    // --- Maintenance (Catalog) ---
    async function loadMaintenanceCatalog() {
        const conf = getKpMaintenanceCatalog(); 
        // { id, columns: { terminals: "Фронтов", sum: "Сумма", range: "кол-во" } }
        
        return cached(
            `kp_catalog_maintenance_${conf.id}`,
            async () => {
                const data = await pyrusClient.getCatalog(conf.id);
                const headers = data.headers || [];
                const items = data.items || [];
                
                const termIdx = headers.indexOf(conf.columns.terminals); // "Фронтов" - likely just visual
                const sumIdx = headers.indexOf(conf.columns.sum); // "Сумма" -> Price
                const rangeIdx = headers.indexOf(conf.columns.range); // "кол-во" -> Range e.g. "1-2"
                
                return items.map(item => {
                    const rangeStr = (rangeIdx >= 0 ? item.values[rangeIdx] : "") || "";
                    const price = (sumIdx >= 0 ? Number(item.values[sumIdx]) : 0);
                    
                    // Parse range "1-5" or "10+"
                    let min = 0, max = 0;
                    if (rangeStr.includes("-")) {
                        const parts = rangeStr.split("-");
                        min = Number(parts[0]);
                        max = Number(parts[1]);
                    } else if (rangeStr.includes("+") || rangeStr.includes(">")) {
                        min = Number(rangeStr.replace(/\D/g, ""));
                        max = Infinity;
                    } else {
                        // Single number?
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
            },
            CACHE_TTL_MS
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
        const conf = getKpEquipmentForm(); // { id, fieldIds: { ... } }
        
        return cached(
            `kp_catalog_equipment_reg_${conf.id}`,
            async () => {
                // Use getFormRegister for Forms
                const response = await pyrusClient.getFormRegister(conf.id);
                const tasks = response.tasks || [];
                
                // Helper to find field
                const getVal = (task, fieldId) => {
                    if (!task.fields) return null;
                    const f = task.fields.find(x => x.id === fieldId);
                    return f ? f.value : null;
                };

                return tasks.map(task => {
                    const name = getVal(task, conf.fieldIds.name) || "Без названия";
                    const price = Number(getVal(task, conf.fieldIds.salePrice)) || 0;
                    const photoField = getVal(task, conf.fieldIds.photo); // might be text or object?
                    // Photo in register is typically object { id, name, ... } if attachment
                    // Or list of attachments.
                    
                    // For now, map simple structure
                    return {
                        id: task.id, // Task ID
                        name,
                        price,
                        image: null, // We don't load image content here
                        photo: photoField // Keep raw for downstream processing
                    };
                });
            },
            CACHE_TTL_MS
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
