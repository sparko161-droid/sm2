import { MINUTES_IN_DAY } from "../utils/timeGrid.js";

export function createTimeGridSelection({
  gridEl,
  busySegments,
  startHour = 0,
  stepMinutes,
  pxPerMinute,
  dateKey,
  onSelect,
}) {
  if (!gridEl) return { destroy() {} };

  const startIdx = (startHour * 60) / stepMinutes;

  const segmentsCount = MINUTES_IN_DAY / stepMinutes;
  let isDragging = false;
  let startIndex = null;
  let range = null;

  const selectionEl = document.createElement("div");
  selectionEl.className = "meet-time-selection is-hidden";
  gridEl.appendChild(selectionEl);

  function getSegmentIndexFromElement(element) {
    const segment = element?.closest?.(".meet-time-grid__segment");
    if (!segment || !gridEl.contains(segment)) return null;
    const index = Number(segment.dataset.index);
    return Number.isFinite(index) ? index : null;
  }

  function getSegmentIndexFromPoint(clientX, clientY) {
    const target = document.elementFromPoint(clientX, clientY);
    const index = getSegmentIndexFromElement(target);
    if (index != null) return index;

    const rect = gridEl.getBoundingClientRect();
    const offsetY = Math.min(Math.max(clientY - rect.top, 0), rect.height - 1);
    return startIdx + Math.floor(offsetY / (stepMinutes * pxPerMinute));
  }

  function clampRange(targetIndex) {
    if (targetIndex == null) return null;
    let start = startIndex;
    let end = startIndex;

    if (targetIndex >= startIndex) {
      for (let i = startIndex; i <= targetIndex && i < segmentsCount; i += 1) {
        if (busySegments[i]) break;
        end = i;
      }
    } else {
      for (let i = startIndex; i >= targetIndex && i >= 0; i -= 1) {
        if (busySegments[i]) break;
        start = i;
      }
    }

    return { start, end };
  }

  function renderSelection(nextRange) {
    if (!nextRange) return;
    const top = (nextRange.start - startIdx) * stepMinutes * pxPerMinute;
    const height = (nextRange.end - nextRange.start + 1) * stepMinutes * pxPerMinute;
    selectionEl.style.top = `${top}px`;
    selectionEl.style.height = `${height}px`;
    selectionEl.classList.remove("is-hidden");
  }

  function clearSelection() {
    selectionEl.classList.add("is-hidden");
  }

  function handleMouseMove(event) {
    if (!isDragging) return;
    const targetIndex = getSegmentIndexFromPoint(event.clientX, event.clientY);
    range = clampRange(targetIndex);
    renderSelection(range);
  }

  function handleMouseUp(event) {
    if (!isDragging) return;
    isDragging = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);

    if (!range) {
      clearSelection();
      return;
    }

    const minutes = range.start * stepMinutes;
    const durationMinutes = (range.end - range.start + 1) * stepMinutes;
    const rect = gridEl.getBoundingClientRect();
    const point = {
      x: rect.left + 60,
      y: rect.top + (minutes - startHour * 60) * pxPerMinute,
    };

    onSelect?.({
      dateKey,
      startMinutes: minutes,
      durationMinutes,
      point,
    });

    clearSelection();
  }

  function handleMouseDown(event) {
    if (event.button !== 0) return;
    const index = getSegmentIndexFromElement(event.target);
    if (index == null || busySegments[index]) return;
    event.preventDefault();

    isDragging = true;
    startIndex = index;
    range = { start: index, end: index };
    renderSelection(range);

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  gridEl.addEventListener("mousedown", handleMouseDown);

  return {
    destroy() {
      gridEl.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    },
  };
}
