import { getKpN8nConfig } from "../config.js";

const cache = new Map(); // attachmentId -> { ok, data }

export function createKpN8nService({ } = {}) {
    const n8nConfig = getKpN8nConfig();
    
    /**
     * Fetches base64 data for a Pyrus attachment via n8n webhook.
     * @param {number|string} attachmentId 
     * @returns {Promise<{ok:boolean, data:string}>}
     */
    async function fetchPyrusAttachmentBase64(attachmentId) {
        if (!attachmentId) return { ok: false, data: "" };
        
        const cached = cache.get(attachmentId);
        if (cached) return cached;

        const url = n8nConfig.pyrusFiles?.path;
        if (!url) return { ok: false, data: "" };
        
        try {
            const res = await fetch(url, {
                method: n8nConfig.pyrusFiles?.method || "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    attachmentId: Number(attachmentId)
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const json = await res.json(); 
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

    return {
        fetchPyrusAttachmentBase64
    };
}
