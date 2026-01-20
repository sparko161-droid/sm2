/**
 * KP N8N Service - fetches Pyrus attachments via graphClient
 */

const cache = new Map(); // attachmentId -> { ok, data }

export function createKpN8nService({ graphClient }) {
    if (!graphClient || typeof graphClient.callGraphApi !== "function") {
        console.warn("[KP][n8n] graphClient not provided, attachment loading disabled");
    }
    
    /**
     * Fetches base64 data for a Pyrus attachment via graphClient.
     * @param {number|string} attachmentId 
     * @returns {Promise<{ok:boolean, data:string}>}
     */
    async function fetchPyrusAttachmentBase64(attachmentId) {
        if (!attachmentId) return { ok: false, data: "" };
        
        // Check cache first
        const cached = cache.get(attachmentId);
        if (cached) return cached;

        // Validate graphClient
        if (!graphClient || typeof graphClient.callGraphApi !== "function") {
            console.warn("[KP][n8n] graphClient not available for attachment fetch");
            return { ok: false, data: "" };
        }
        
        try {
            // Use pyrus_files type for fetching Pyrus attachments
            const json = await graphClient.callGraphApi("pyrus_files", {
                action: "get_base64",
                attachment_id: Number(attachmentId)
            });
            
            const ok = Boolean(json?.success);
            const data = typeof json?.data === "string" ? json.data : "";

            const result = { ok, data };
            if (ok && data) {
                cache.set(attachmentId, result);
            }
            return result;
        } catch (e) {
            console.error("[KP][n8n] Failed to fetch attachment", attachmentId, e);
            return { ok: false, data: "" };
        }
    }

    /**
     * Clear attachment cache (useful for testing or memory management)
     */
    function clearCache() {
        cache.clear();
    }

    return {
        fetchPyrusAttachmentBase64,
        clearCache
    };
}
