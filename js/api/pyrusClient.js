export function unwrapPyrusData(raw) {
  if (
    raw &&
    typeof raw === "object" &&
    Object.prototype.hasOwnProperty.call(raw, "data") &&
    Object.prototype.hasOwnProperty.call(raw, "success")
  ) {
    return raw.data;
  }
  return raw;
}

export function createPyrusClient({ graphClient }) {
  if (!graphClient || typeof graphClient.callGraphApi !== "function") {
    throw new Error("graphClient is required for pyrusClient");
  }

  function unwrapArrayPayload(data) {
    if (Array.isArray(data)) return data[0] || null;
    return data;
  }

  function normalizeCatalogPayload(data) {
    const normalized = unwrapArrayPayload(data) || {};
    const rawHeaders = normalized.catalog_headers || normalized.headers || [];
    const headers = rawHeaders
      .map((header) => (typeof header === "string" ? header : header?.name))
      .filter(Boolean)
      .map((header) => String(header).trim());
    const items = normalized.items || normalized.catalog_items || [];
    return { headers, items };
  }

  function normalizeFormRegisterPayload(data) {
    const normalized = unwrapArrayPayload(data) || {};
    return { tasks: normalized.tasks || [] };
  }

  async function pyrusRequest(endpoint, payload = {}) {
    const method = payload.method || "GET";
    const body = payload.body || null;
    const requestPayload = { path: endpoint, method };
    if (body) requestPayload.body = body;
    return graphClient.callGraphApi("pyrus_api", requestPayload);
  }

  async function getRegistry(formId, params = {}) {
    // params usually contains filters like { f_id, f_value } or format options
    // The proxy expects: GET /v4/forms/:id/register
    // We map it to: path: `/v4/forms/${formId}/register` + query params in body or mapped via proxy conventions
    // Assuming the existing proxy allows passing query params via the payload or we construct the path with query.

    // For n8n proxy / graph client, usually we send a JSON body. 
    // If the proxy simply forwards the body to Pyrus, for getRegistry Pyrus expects a POST or GET with params.
    // Let's assume the standard way: 
    // If params are passed, we send them.

    const query = new URLSearchParams(
      Object.entries(params || {}).filter(([, value]) => value !== undefined && value !== null)
    ).toString();
    const path = query
      ? `/v4/forms/${formId}/register?${query}`
      : `/v4/forms/${formId}/register`;

    return unwrapPyrusData(await pyrusRequest(path, {
      method: "GET", // or POST depending on how complex search is, but Pyrus registry is often read via GET with params
    }));
  }

  async function getFormRegister(formId, params = {}) {
    const data = await getRegistry(formId, params);
    return normalizeFormRegisterPayload(data);
  }

  async function getCatalog(catalogId) {
    if (!catalogId) {
      throw new Error("catalogId is required for getCatalog");
    }
    const data = unwrapPyrusData(await pyrusRequest(`/v4/catalogs/${catalogId}`, { method: "GET" }));
    return normalizeCatalogPayload(data);
  }

  async function getTask(taskId) {
    return unwrapPyrusData(await pyrusRequest(`/tasks/${taskId}`));
  }

  async function createTask(body) {
    return unwrapPyrusData(await pyrusRequest(`/tasks`, { method: "POST", body }));
  }

  async function updateTask(taskId, body) {
    // Pyrus API for commenting/updating is POST /v4/tasks/:id/comments
    return unwrapPyrusData(await pyrusRequest(`/v4/tasks/${taskId}/comments`, { method: "POST", body }));
  }

  return {
    pyrusRequest,
    getRegistry,
    getFormRegister,
    getCatalog,
    getTask,
    createTask,
    updateTask
  };
}
