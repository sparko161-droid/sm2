import { getKpCrmFormConfig } from "../config.js";
import { cached } from "../cache/requestCache.js";

export function createCrmService({ pyrusClient, config }) {
    const DEALS_CACHE_TTL_MS = 60 * 1000; // 60 seconds for deals list
    
    // Local cache for stale-while-revalidate
    let cachedDeals = { data: null, fetchedAt: 0, managerId: null };

    /**
     * Loads CRM deals (tasks) for a specific manager.
     * Uses Pyrus form register search with caching.
     *
     * @param {Object} params
     * @param {number} params.managerId - User ID of the manager
     * @returns {Promise<Array>} List of deals
     */
    async function loadDealsForManager({ managerId }) {
        const cacheKey = `crm_deals_manager_${managerId}`;
        
        try {
            const crmConf = getKpCrmFormConfig(); // { id, filters: {managerFieldId}, registerFieldIds }
            
            const result = await cached(
                cacheKey,
                { ttlMs: DEALS_CACHE_TTL_MS },
                async () => {
                    const params = {};
                    // field_ids needs to be comma joined string usually or array if proxy handles it.
                    // Pyrus API expects field_ids=id1,id2
                    if (crmConf.registerFieldIds) {
                        params.field_ids = crmConf.registerFieldIds.join(",");
                    }
                    
                    // Filter by manager: fld{ID}={Value}
                    if (crmConf.filters?.managerFieldId) {
                        params[`fld${crmConf.filters.managerFieldId}`] = managerId;
                    }

                    // Also usually fetch closed? Maybe not. Default is open.
                    
                    const response = await pyrusClient.getFormRegister(crmConf.id, params);
                    const deals = normalizeDeals(response.tasks || [], crmConf.titleFieldId, crmConf.clientNameFieldIds);
                    return deals.sort((a, b) => {
                        const da = a.createDate ? new Date(a.createDate).getTime() : 0;
                        const db = b.createDate ? new Date(b.createDate).getTime() : 0;
                        return db - da;
                    });
                }
            );
            
            // Update local cache for stale-while-revalidate
            cachedDeals = { data: result, fetchedAt: Date.now(), managerId };
            return result;
        } catch (error) {
            console.error("[CRM] Failed to load deals", error);
            throw error;
        }
    }

    /**
     * Get cached deals immediately (stale-while-revalidate pattern)
     * Returns null if no cache available
     */
    function getCachedDeals() {
        return cachedDeals.data;
    }

    function normalizeDeals(tasks, titleFieldId, clientNameFieldIds = []) {
        return tasks.map(task => {
            // Helper to find field value (including nested fields in "title" or "block" fields)
            const findField = (fields, id) => {
                if (!fields) return null;
                for (const f of fields) {
                    if (f.id === id) return f;
                    if (f.value && f.value.fields) {
                        const nested = findField(f.value.fields, id);
                        if (nested) return nested;
                    }
                }
                return null;
            };

            const getVal = (id) => {
                const f = findField(task.fields, id);
                return f ? f.value : null;
            };

            // Trying to extract meaningful title. 
            // In config we have registerFieldIds: [7,156,1,138,2,6,161,162]
            // We don't have strictly mapping for "title".
            // We use standard 'text' or first available string field or just Subject.
            // Task object usually has 'text' (summary).
            
            const titleFromField = titleFieldId ? getVal(titleFieldId) : null;
            const title = titleFromField || task.text || "Без темы";
            
            // Customer Name -> which field? 
            // Prompt says: "customerName: <from field 156/138...>"
            const customerName = clientNameFieldIds
              .map((id) => getVal(id))
              .find((value) => value) || "Клиент (не указан)";
            
            // Extract INN - often in field 161/162 or similar 10/12 digit value
            let clientInn = "";
            let clientJuridicalName = customerName;
            
            if (task.fields) {
                for (const f of task.fields) {
                    const val = f.value;
                    // If it's an object (Pyrus Contact/Org field)
                    if (val && typeof val === "object") {
                        if (val.inn) clientInn = String(val.inn);
                        if (val.name && !clientJuridicalName) clientJuridicalName = val.name;
                    } 
                    // Or if it's a string that looks like INN (10 or 12 digits)
                    else if (typeof val === "string" && /^\d{10}(\d{2})?$/.test(val.trim())) {
                        clientInn = val.trim();
                    }
                }
            }
            
            // Extract KP filename (field 161) and URL (field 162)
            const kpFilename = getVal(161) || null;
            const kpUrl = getVal(162) || null;
            // KP exists if filename is a valid .html file
            const hasKp = typeof kpFilename === 'string' && kpFilename.trim().endsWith('.html');
            
            return {
                id: task.id,
                createDate: task.create_date,
                lastModified: task.last_modified_date,
                subject: title,
                clientName: customerName,
                clientInn: clientInn,
                clientJuridicalName: clientJuridicalName,
                kpFilename: kpFilename,
                kpUrl: kpUrl,
                kpTotal: null, // Placeholder - could be extracted from another field if needed
                hasKp: hasKp,
                raw: task
            };
        });
    }

    return {
        loadDealsForManager,
        getCachedDeals
    };
}
