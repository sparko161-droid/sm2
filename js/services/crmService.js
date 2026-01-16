
import { getKpCrmFormConfig } from "../config.js";

export function createCrmService({ pyrusClient, config }) {


    /**
     * Loads CRM deals (tasks) for a specific manager.
     * Uses Pyrus form register search.
     *
     * @param {Object} params
     * @param {number} params.managerId - User ID of the manager
     * @returns {Promise<Array>} List of deals
     */
    async function loadDealsForManager({ managerId }) {
        try {
            const crmConf = getKpCrmFormConfig(); // { id, filters: {managerFieldId}, registerFieldIds }
            
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
            return deals.sort((a, b) => (b.createDate || 0) - (a.createDate || 0));
        } catch (error) {
            console.error("[CRM] Failed to load deals", error);
            throw error;
        }
    }

    function normalizeDeals(tasks, titleFieldId, clientNameFieldIds = []) {
        return tasks.map(task => {
            // Helper to find field value
            const getVal = (id) => {
                if (!task.fields) return null;
                const f = task.fields.find(f => f.id === id);
                return f ? f.value : null;
            };

            // Trying to extract meaningful title. 
            // In config we have registerFieldIds: [7,156,1,138,2,6,161,162]
            // We don't have strictly mapping for "title".
            // We use standard 'text' or first available string field or just Subject.
            // Task object usually has 'text' (summary).
            
            const titleFromField = titleFieldId ? getVal(titleFieldId) : null;
            const title = titleFromField || task.text || "";
            
            // Customer Name -> which field? 
            // Prompt says: "customerName: <from field 156/138...>"
            // Let's try to grab from known fields if they look like strings. 
            // We can't know for sure without exact mapping, so let's check field 156 then 138.
            const customerName = clientNameFieldIds
              .map((id) => getVal(id))
              .find((value) => value) || "Клиент (не указан)";
            
            // inn -> <if exists>
            // kpFileName -> <if exists>
            // For now, returning basic model + raw
            
            return {
                id: task.id,
                createDate: task.create_date,
                lastModified: task.last_modified_date,
                subject: title,
                clientName: customerName,
                // These are currently placeholders until we have specific field IDs for KP details
                kpFilename: null, 
                kpUrl: null,
                kpTotal: null,
                hasKp: false,
                raw: task
            };
        });
    }

    return {
        loadDealsForManager
    };
}
