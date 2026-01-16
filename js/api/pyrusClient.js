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
    return getRegistry(formId, params);
  }

  async function getTask(taskId) {
    return unwrapPyrusData(await pyrusRequest(`/tasks/${taskId}`));
  }

  async function createTask(body) {
    return unwrapPyrusData(await pyrusRequest(`/tasks`, { method: "POST", body }));
  }

  async function updateTask(taskId, body) {
    // Pyrus API for commenting/updating is usually POST /tasks/:id/comments
    return unwrapPyrusData(await pyrusRequest(`/tasks/${taskId}/comments`, { method: "POST", body }));
  }

  return {
    pyrusRequest,
    getRegistry,
    getFormRegister,
    getTask,
    createTask,
    updateTask
  };
}
