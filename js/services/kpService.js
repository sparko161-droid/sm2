
import { getKpN8nConfig } from "../config.js";
import { renderKpHtml, parseKpHtml } from "../utils/kpHtml.js";

export function createKpService({ pyrusClient, config }) {
    const n8nConfig = getKpN8nConfig();

    /**
     * Saves KP: Generates HTML -> Uploads to n8n -> Updates CRM Task
     */
    async function saveKpForDeal(dealId, model) {
        if (!n8nConfig.uploadKp?.path) throw new Error("n8n uploadKp is not configured");

        // 1. Generate HTML
        const htmlContent = renderKpHtml(model);

        // 2. Prepare Metadata
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
        // Use existing filename if present (re-save), else generate new
        let filename = model.meta.kpFilename;
        if (!filename) {
            filename = `kp_${dealId}_${dateStr}.html`;
        }

        // 3. Upload to n8n (which saves to FTP and returns URL)
        // Contract: POST JSON { filename, content, ... } -> { success: true, url: "..." }
        const savePayload = {
            filename: filename,
            content: htmlContent, // n8n endpoint should handle raw html string or base64. Assuming raw string in body or json field.
            // Let's assume JSON body with 'content' field
        };

        let publicUrl = "";
        try {
            const response = await fetch(n8nConfig.uploadKp.path, {
                method: n8nConfig.uploadKp.method || "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(savePayload)
            });
            if (!response.ok) throw new Error("Failed to upload KP file");
            const resJson = await response.json();
            if (!resJson.success) throw new Error(resJson.error || "Upload failed");

            publicUrl = resJson.url || "";
        } catch (e) {
            throw new Error(`Upload Error: ${e.message}`);
        }

        // 4. Update local model with new filename/url
        model.meta.kpFilename = filename;
        model.meta.kpUrl = publicUrl;

        return { success: true, publicUrl };
    }

    /**
     * Loads KP from file via n8n/public URL and parses it.
     */
    async function loadKpFromFile(filename) {
        if (!n8nConfig.getKp?.path) throw new Error("n8n getKp is not configured");

        const response = await fetch(n8nConfig.getKp.path, {
            method: n8nConfig.getKp.method || "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ filename })
        });
        if (!response.ok) throw new Error("Failed to fetch KP file");

        const resJson = await response.json();
        if (!resJson.success || typeof resJson.data !== "string") {
            throw new Error(resJson.error || "Invalid response from n8n");
        }
        const html = resJson.data;
        return parseKpHtml(html); // Extract JSON model
    }

    return {
        saveKpForDeal,
        loadKpFromFile
    };
}
