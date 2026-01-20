import { renderKpHtml, parseKpHtml } from "../utils/kpHtml.js";

/**
 * KP Service - uses standard graphClient with type=pyrus_kp
 */
export function createKpService({ graphClient, pyrusClient }) {
    if (!graphClient || typeof graphClient.callGraphApi !== "function") {
        throw new Error("graphClient is required for kpService");
    }

    /**
     * Saves KP: Generates HTML -> Uploads via graphClient -> Updates CRM Task
     * @param {number|string} dealId - CRM deal/task ID
     * @param {Object} model - KP model
     * @param {Object} [options] - Save options
     * @param {'original'|'new'} [options.format] - KP format
     * @returns {Promise<{success: boolean, model: Object, publicUrl: string}>}
     */
    async function saveKpForDeal(dealId, model, options = {}) {
        const format = options.format || 'original';
        
        // Refresh creation date (Actualization)
        model.meta.createdAt = new Date().toISOString();

        // 1. Generate HTML
        let htmlContent;
        if (format === 'new') {
            const { renderKpHtmlNew } = await import("../utils/kpHtmlNew.js");
            htmlContent = renderKpHtmlNew(model);
        } else {
            htmlContent = renderKpHtml(model);
        }

        // 2. Prepare Metadata
        const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, ""); // YYYYMMDD
        // Use existing filename if present (re-save), else generate new
        let filename = model.meta.kpFilename;
        
        if (!filename) {
            filename = `kp_${dealId}_${dateStr}.html`;
        }

        // Handle format suffix
        if (format === 'new' && !filename.includes('_new.html')) {
            filename = filename.replace('.html', '_new.html');
        }

        // 3. Upload via graphClient with type=pyrus_kp
        const uploadResult = await graphClient.callGraphApi("pyrus_kp", {
            action: "upload",
            filename: filename,
            content: htmlContent,
            dealId: dealId
        });

        if (!uploadResult.success) {
            throw new Error(uploadResult.error || "Failed to upload KP file");
        }

        const publicUrl = uploadResult.url || "";

        // 4. Update model with new filename/url
        const updatedModel = {
            ...model,
            meta: {
                ...model.meta,
                kpFilename: filename,
                kpUrl: publicUrl
            }
        };

        // 5. Update CRM task with KP info (if pyrusClient available)
        if (pyrusClient && pyrusClient.updateTask) {
            try {
                await pyrusClient.updateTask(dealId, {
                    field_updates: [
                        {
                            id: 161,
                            value: filename
                        },
                        {
                            id: 162,
                            value: publicUrl
                        }
                    ]
                });
            } catch (e) {
                console.warn("[KP] Failed to update CRM task", e);
            }
        }

        return { success: true, model: updatedModel, publicUrl };
    }

    /**
     * Loads KP from file via graphClient and parses it.
     * @param {string} filename - KP filename
     * @returns {Promise<Object>} Parsed KP model
     */
    async function loadKpFromFile(filename) {
        const result = await graphClient.callGraphApi("pyrus_kp", {
            action: "get",
            filename: filename
        });

        if (!result.success || typeof result.data !== "string") {
            throw new Error(result.error || "Failed to fetch KP file");
        }

        const html = result.data;
        return parseKpHtml(html); // Extract JSON model
    }

    return {
        saveKpForDeal,
        loadKpFromFile
    };
}
