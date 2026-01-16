import { getKpN8nPyrusFilesWebhookUrl } from "../config.js";

const cache = new Map(); // attachmentId -> { ok, data }

export function createKpN8nService({ } = {}) {
    
    /**
     * Fetches base64 data for a Pyrus attachment via n8n webhook.
     * @param {number|string} attachmentId 
     * @returns {Promise<{ok:boolean, data:string}>}
     */
    async function fetchPyrusAttachmentBase64(attachmentId) {
        if (!attachmentId) return { ok: false, data: "" };
        
        const cached = cache.get(attachmentId);
        if (cached) return cached;

        const url = getKpN8nPyrusFilesWebhookUrl();
        // Prompt says: POST body { type:"pyrus_files", attachment_id: ... }
        
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    type: "pyrus_files",
                    attachment_id: Number(attachmentId)
                })
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            const json = await res.json(); 
            // Expected: { ok: true, data: "base64..." }
            
            // Validate
            if (json && typeof json.data === "string") {
                cache.set(attachmentId, json);
                return json;
            } else {
                return { ok: false, data: "" };
            }
        } catch (e) {
            console.error("[KP][n8n] Failed to fetch attachment", attachmentId, e);
            return { ok: false, data: "" };
        }
    }

    return {
        fetchPyrusAttachmentBase64
    };
}
