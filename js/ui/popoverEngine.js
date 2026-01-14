let initialized = false;
let rootEl = null;
let popoverCounter = 0;
const openPopovers = new Map();

function ensureRoot() {
  if (rootEl) return rootEl;
  rootEl = document.getElementById("global-popover-root");
  if (!rootEl) {
    rootEl = document.createElement("div");
    rootEl.id = "global-popover-root";
    rootEl.className = "global-popover-root";
    document.body.appendChild(rootEl);
  }
  return rootEl;
}

function positionPopover({ el, anchorRect, point, placement = "bottom-start" }) {
  const rect = el.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const offset = 8;
  const gutter = 16;

  let left = point?.x ?? anchorRect?.left ?? gutter;
  let top = point?.y ?? anchorRect?.bottom ?? gutter;
  let preferredTop = top + offset;

  if (placement.startsWith("top") && anchorRect) {
    preferredTop = anchorRect.top - rect.height - offset;
  }

  if (anchorRect && preferredTop + rect.height > viewportHeight - gutter) {
    const fallbackTop = anchorRect.top - rect.height - offset;
    if (fallbackTop >= gutter) {
      preferredTop = fallbackTop;
    }
  }

  if (preferredTop < gutter) {
    preferredTop = gutter;
  }

  if (left + rect.width > viewportWidth - gutter) {
    left = viewportWidth - rect.width - gutter;
  }

  if (left < gutter) {
    left = gutter;
  }

  el.style.left = `${left}px`;
  el.style.top = `${preferredTop}px`;
}

function handlePointerDown(event) {
  if (openPopovers.size === 0) return;
  if (rootEl && rootEl.contains(event.target)) return;
  closePopover();
}

function handleKeyDown(event) {
  if (event.key !== "Escape") return;
  closePopover();
}

function handleRouteChange() {
  closePopover();
}

export function initPopoverEngineOnce() {
  if (initialized) return;
  initialized = true;
  ensureRoot();
  document.addEventListener("pointerdown", handlePointerDown);
  document.addEventListener("keydown", handleKeyDown);
  window.addEventListener("hashchange", handleRouteChange);
}

export function openPopover({ id, anchorRect, point, contentEl, onClose, placement }) {
  if (!contentEl) return null;
  ensureRoot();

  const popoverId = id || `popover-${popoverCounter++}`;
  if (openPopovers.has(popoverId)) {
    closePopover(popoverId);
  }

  contentEl.dataset.popoverId = popoverId;
  contentEl.classList.add("global-popover-item");
  contentEl.style.position = "absolute";
  rootEl.appendChild(contentEl);

  positionPopover({ el: contentEl, anchorRect, point, placement });

  openPopovers.set(popoverId, { el: contentEl, onClose });
  return popoverId;
}

export function closePopover(id) {
  const closeItem = (popoverId, item) => {
    if (!item) return;
    item.el?.remove();
    if (typeof item.onClose === "function") {
      item.onClose();
    }
    openPopovers.delete(popoverId);
  };

  if (id) {
    closeItem(id, openPopovers.get(id));
    return;
  }

  for (const [popoverId, item] of openPopovers.entries()) {
    closeItem(popoverId, item);
  }
}

export function getPopoverRoot() {
  return ensureRoot();
}
