const ROUTES = new Set(["work", "meet", "kp"]);
const DEFAULT_ROUTE = "work";

function resolveRoute(hash) {
  const raw = String(hash || "").replace(/^#/, "").trim().toLowerCase();
  if (!raw) {
    return { name: DEFAULT_ROUTE, shouldNavigate: true };
  }
  if (ROUTES.has(raw)) {
    return { name: raw, shouldNavigate: false };
  }
  return { name: DEFAULT_ROUTE, shouldNavigate: true };
}

export function parseRoute(hash) {
  const { name } = resolveRoute(hash);
  return { name };
}

export function getCurrentRoute() {
  const resolved = resolveRoute(window.location.hash);
  if (resolved.shouldNavigate) {
    window.location.hash = `#${resolved.name}`;
  }
  return { name: resolved.name };
}

export function subscribe(callback) {
  const handler = () => {
    callback(getCurrentRoute());
  };
  window.addEventListener("hashchange", handler);
  handler();
  return () => window.removeEventListener("hashchange", handler);
}

export function navigate(routeName) {
  const raw = String(routeName || "").trim().toLowerCase();
  const target = ROUTES.has(raw) ? raw : DEFAULT_ROUTE;
  const nextHash = `#${target}`;
  if (window.location.hash !== nextHash) {
    window.location.hash = nextHash;
  }
}
