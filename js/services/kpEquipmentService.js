import { getKpEquipmentForm } from "../config.js";

// Cache valid for session
let cache = null;

export function createKpEquipmentService({ pyrusClient }) {

    async function loadEquipmentRegister() {
        if (cache) return cache;
        
        const conf = getKpEquipmentForm(); // { id, fieldIds: { type, description, photo, salePrice, name } }
        
        try {
            // GET /forms/:id/register
            const data = await pyrusClient.getFormRegister(conf.id);
            const tasks = data.tasks || [];
            
            const items = tasks.map(task => {
                const getVal = (fid) => {
                   if (!task.fields) return null;
                   const f = task.fields.find(x => x.id === fid);
                   return f ? f.value : null;
                };

                // name: id 7 check
                const name = getVal(conf.fieldIds.name) || task.text || "Без названия";
                
                // type: catalog (id 1)
                const typeRaw = getVal(conf.fieldIds.type);
                // Catalog field value in Pyrus task: { item_id, choice_names: [...], values: [...] }
                // Usually values[0] or choice_names[0] is the name.
                let typeName = "";
                if (typeRaw && typeof typeRaw === "object") {
                    if (typeRaw.values && typeRaw.values.length) typeName = typeRaw.values[0];
                    else if (typeRaw.choice_names && typeRaw.choice_names.length) typeName = typeRaw.choice_names[0];
                }

                // description: 3
                const description = getVal(conf.fieldIds.description) || "";

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
                    taskId: task.id
                };
            }).filter(i => i.name);

            cache = items;
            return items;
        } catch (e) {
            console.error("[KP][Equipment] Failed to load register", e);
            throw e;
        }
    }

    return {
        loadEquipmentRegister
    };
}
