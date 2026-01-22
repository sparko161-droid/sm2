import { getKpEquipmentFormConfig } from "../config/kpConfig.js";

// Cache valid for session
let cache = null;

const CONSUMABLES_TYPE = "Расходные материалы";

export function createKpEquipmentService({ pyrusClient }) {

    async function loadAllItems() {
        if (cache) return cache;
        
        const conf = getKpEquipmentFormConfig(); // { id, fieldIds: { type, description, photo, salePrice, name } }
        
        try {
            // GET /v4/forms/:id/register
            const data = await pyrusClient.getFormRegister(conf.id);
            const tasks = data.tasks || [];
            
            const items = tasks.map(task => {
                const getVal = (fid) => {
                   if (!task.fields) return null;
                   const f = task.fields.find(x => x.id === fid);
                   return f ? f.value : null;
                };

                const extractString = (val) => {
                    if (!val) return "";
                    if (typeof val === "string") return val;
                    if (typeof val === "object") {
                        const s = val.item_name || val.name || (val.values && val.values[0]) || (val.choice_names && val.choice_names[0]) || "";
                        return String(s || "");
                    }
                    return String(val);
                };

                // name: id 7 check
                const name = extractString(getVal(conf.fieldIds.name)) || task.text || "Без названия";
                
                // type: catalog or choice (id 1)
                const typeName = extractString(getVal(conf.fieldIds.type));

                // description: 3
                const description = extractString(getVal(conf.fieldIds.description));

                // salePrice: 5 (money)
                const salePrice = Number(getVal(conf.fieldIds.salePrice) || 0);

                // photo: 4 (file) -> object or array of objects { id, name, ... }
                // We just store meta. We don't load base64 yet.
                const photoRaw = getVal(conf.fieldIds.photo);
                // If multiple, take first?
                let photo = null;
                if (Array.isArray(photoRaw) && photoRaw.length > 0) {
                     const f = photoRaw[0]; // { id, name, size, ... }
                     photo = {
                         attachmentId: f.id,
                         name: f.name
                     };
                }

                return {
                    id: task.id, // Task ID as equipment ID
                    name,
                    typeName,
                    description,
                    price: salePrice,
                    photo, // { attachmentId, name } or null
                    taskId: task.id,
                    isConsumable: typeName === CONSUMABLES_TYPE
                };
            }).filter(i => i.name);

            cache = items;
            return items;
        } catch (e) {
            console.error("[KP][Equipment] Failed to load register", e);
            throw e;
        }
    }

    // Load only equipment (excluding consumables)
    async function loadEquipmentRegister() {
        const all = await loadAllItems();
        return all.filter(item => !item.isConsumable);
    }

    // Load only consumables
    async function loadConsumablesFromEquipment() {
        const all = await loadAllItems();
        return all.filter(item => item.isConsumable);
    }

    return {
        loadEquipmentRegister,
        loadConsumablesFromEquipment,
        loadAllItems
    };
}
