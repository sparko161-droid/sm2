
import { getKpN8nConfig, getKpCrmConfig } from "../config.js";
import { renderKpHtml, parseKpHtml } from "../utils/kpHtml.js";

export function createKpService({ pyrusClient, config }) {
    const n8nConfig = getKpN8nConfig();
    const crmConfig = getKpCrmConfig();

    /**
     * Saves KP: Generates HTML -> Uploads to n8n -> Updates CRM Task
     */
    async function saveKpForDeal(dealId, model) {
        if (!n8nConfig.saveEndpoint) throw new Error("n8n saveEndpoint not configured");

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
            const response = await fetch(n8nConfig.saveEndpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(savePayload)
            });
            if (!response.ok) throw new Error("Failed to upload KP file");
            const resJson = await response.json();
            if (!resJson.success) throw new Error(resJson.error || "Upload failed");

            publicUrl = resJson.url || (n8nConfig.publicBaseUrl + filename);
        } catch (e) {
            throw new Error(`Upload Error: ${e.message}`);
        }

        // 4. Update CRM Task
        // We need to update fields in the deal task
        const updates = {};

        // Helper to map field updates
        const addFieldUpdate = (fieldKey, value) => {
            const fieldId = crmConfig.fields?.[fieldKey];
            if (fieldId) updates[fieldId] = value;
        };

        addFieldUpdate("kpFilename", filename);
        addFieldUpdate("kpUrl", publicUrl);
        addFieldUpdate("kpDate", new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
        addFieldUpdate("kpTotal", model.total); // Numeric or formatted? Pyrus money field usually expects number

        // TODO: Update Table fields logic (complex).
        // For now, let's just update header fields.

        // Pyrus API update
        // Assuming pyrusClient has a method for raw field updates
        await pyrusClient.updateTask(dealId, {
            fields: Object.entries(updates).map(([id, val]) => ({ id: Number(id), value: val }))
        });

        // 5. Update local model with new filename/url
        model.meta.kpFilename = filename;
        model.meta.kpUrl = publicUrl;

        return { success: true, publicUrl };
    }

    /**
     * Loads KP from file via n8n/public URL and parses it.
     */
    async function loadKpFromFile(filename) {
        if (!n8nConfig.loadEndpoint) throw new Error("n8n loadEndpoint not configured");

        // Fetch HTML content. 
        // Can be via n8n proxy if auth needed, or public URL if CORS allowed.
        // Using n8n proxy for safety/CORS
        const url = `${n8nConfig.loadEndpoint}?filename=${encodeURIComponent(filename)}`;

        const response = await fetch(url);
        if (!response.ok) throw new Error("Failed to fetch KP file");

        const html = await response.text();
        return parseKpHtml(html); // Extract JSON model
    }

    return {
        saveKpForDeal,
        loadKpFromFile
    };
}
