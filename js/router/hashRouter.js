const ROUTES = new Set(["work", "meet", "kp", "gantt", "login"]);
const DEFAULT_ROUTE = "work";

function resolveRoute(hash) {
  const raw = String(hash || "");
  const current = raw.startsWith("#") ? raw : raw ? `#${raw}` : "";
  const name = current.replace(/^#/, "").trim().toLowerCase();
  const target = ROUTES.has(name) ? name : DEFAULT_ROUTE;
  const normalizedHash = `#${target}`;
  const shouldNavigate = current !== normalizedHash;
  return { name: target, normalizedHash, shouldNavigate };
}

export function parseRoute(hash) {
  return resolveRoute(hash);
}

export function getCurrentRoute() {
  return resolveRoute(window.location.hash);
}

export function subscribe(callback) {
  const handler = () => {
    const resolved = getCurrentRoute();
    if (resolved.shouldNavigate) {
      window.location.hash = resolved.normalizedHash;
      return;
    }
    if (typeof callback === "function") {
      callback(resolved);
    }
  };
  window.addEventListener("hashchange", handler);
  handler();
  return () => window.removeEventListener("hashchange", handler);
}

export function navigate(routeName) {
  const resolved = resolveRoute(`#${routeName}`);
  if (window.location.hash !== resolved.normalizedHash) {
    window.location.hash = resolved.normalizedHash;
  }
}
