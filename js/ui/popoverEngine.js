let initialized = false;
let rootEl = null;
let popoverCounter = 0;
const openPopovers = new Map();
let blockNextInteraction = false;

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

  // Определяем предпочтительный верх (с учетом отступа)
  let preferredTop = top + offset;

  // Если указано "top-*", пробуем сразу разместить сверху
  if (placement.startsWith("top") && anchorRect) {
    preferredTop = anchorRect.top - rect.height - offset;
  }

  // Проверка на выход за нижний край
  const wouldOverflowBottom = preferredTop + rect.height > viewportHeight - gutter;
  if (wouldOverflowBottom) {
    // Если есть anchorRect, пробуем над ним
    if (anchorRect) {
      const flippedTop = anchorRect.top - rect.height - offset;
      if (flippedTop >= gutter) {
        preferredTop = flippedTop;
      } else {
        // Если и сверху не лезет, выбираем где места больше
        preferredTop = Math.max(gutter, viewportHeight - rect.height - gutter);
      }
    } else if (point) {
      // Если это точка (клик), просто открываем вверх от точки
      const flippedTop = point.y - rect.height - offset;
      if (flippedTop >= gutter) {
        preferredTop = flippedTop;
      } else {
        preferredTop = Math.max(gutter, viewportHeight - rect.height - gutter);
      }
    }
  }

  if (placement === "center") {
    left = (viewportWidth - rect.width) / 2;
    preferredTop = (viewportHeight - rect.height) / 2;
  } else {
    // Финальная проверка границ экрана
    if (preferredTop + rect.height > viewportHeight - gutter) {
      preferredTop = viewportHeight - rect.height - gutter;
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
  }

  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(preferredTop)}px`;

  // Если поповер всё еще слишком высокий для экрана, добавляем внутренний скролл
  if (rect.height > viewportHeight - gutter * 2) {
    el.style.maxHeight = `${viewportHeight - gutter * 2}px`;
    el.style.overflowY = "auto";
  }
}

function handlePointerDown(event) {
  if (openPopovers.size === 0) return;

  // Ищем самый верхний поповер (последний добавленный в rootEl)
  if (!rootEl) return;
  const items = Array.from(rootEl.querySelectorAll(".global-popover-item"));
  if (items.length === 0) return;

  const topMostEl = items[items.length - 1];
  const popoverId = topMostEl.dataset.popoverId;

  // Если клик ВНУТРИ самого верхнего поповера — ничего не делаем, даем событию идти дальше
  if (topMostEl.contains(event.target)) return;

  // Если клик ВНЕ верхнего поповера — закрываем только его и ГАСИМ событие нажатия
  closePopover(popoverId);

  // Ставим флаг, чтобы "съесть" следующий за этим нажатием системный "click"
  blockNextInteraction = true;

  event.stopPropagation();
  event.stopImmediatePropagation();
  event.preventDefault();
}

function handleClick(event) {
  if (blockNextInteraction) {
    // В клике сбрасываем флаг, так как это последнее событие в цепочке
    blockNextInteraction = false;
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
  }
}

function handleMouseUp(event) {
  if (blockNextInteraction) {
    // Не сбрасываем флаг здесь, чтобы handleClick тоже сработал
    event.stopPropagation();
    event.stopImmediatePropagation();
    event.preventDefault();
  }
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

  // Используем useCapture = true (третий аргумент), чтобы перехватить события РАНЬШЕ всех остальных
  document.addEventListener("pointerdown", handlePointerDown, true);
  document.addEventListener("mouseup", handleMouseUp, true);
  document.addEventListener("click", handleClick, true);
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
