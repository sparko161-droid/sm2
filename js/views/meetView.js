import {
  addDays,
  addMinutesLocal,
  computeDurationMinutes,
  convertLocalRangeToUtcWithMeta,
  convertUtcStartToLocalRange,
  dateKey,
  formatDateTimeRangeLocal,
  formatDateTimeRangeLocalWithMskLabel,
  formatTimeRangeLocal,
  parseTimeToMinutes,
  startOfDay,
  startOfWeekLocal,
} from "../utils/dateTime.js";
import { TIME_GRID_STEP_MINUTES } from "../utils/timeGrid.js";
import { createTimeGridSelection } from "../ui/timeGridSelection.js";
import { closePopover, openPopover } from "../ui/popoverEngine.js";

const ID_EMPLOYEE = "meet-employee";
const ID_DAY_OVERLAY = "meet-day-overlay";
const ID_DETAILS = "meet-details";
const ID_FORM = "meet-form";

const DEFAULT_MODE = "day";
const MODES = ["day", "days4", "days7", "days28", "list"];
const HOUR_SLOTS = Array.from({ length: 24 }, (_, i) => i);
const PX_PER_MINUTE = 1;

const MODE_LABELS = {
  day: "День",
  days4: "4 дня",
  days7: "7 дней",
  days28: "28 дней",
  list: "Список",
};

function formatDateLabel(date, options) {
  return new Intl.DateTimeFormat("ru-RU", options).format(date);
}

function formatRangeTitle(start, end) {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  if (sameMonth) {
    const startLabel = formatDateLabel(start, { day: "numeric" });
    const endLabel = formatDateLabel(end, { day: "numeric", month: "long", year: "numeric" });
    return `${startLabel}–${endLabel}`;
  }
  const startLabel = formatDateLabel(start, { day: "numeric", month: "short" });
  const endLabel = formatDateLabel(end, { day: "numeric", month: "short", year: "numeric" });
  return `${startLabel}–${endLabel}`;
}

function buildElement(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text != null) el.textContent = text;
  return el;
}

function isAllowedMeeting(meeting, userId, roleIds) {
  if (!meeting) return false;
  if (userId && meeting.participants?.userIds?.includes(Number(userId))) return true;
  const meetingRoles = meeting.participants?.roleIds || [];
  return meetingRoles.some((roleId) => roleIds.includes(Number(roleId)));
}

function normalizeRoleOptions(config) {
  const roleIds = new Set();
  const raw = config?.auth?.rolePermissions || {};
  for (const value of Object.values(raw)) {
    if (Array.isArray(value)) {
      for (const id of value) roleIds.add(Number(id));
    }
  }
  return Array.from(roleIds)
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b)
    .map((id) => ({ id, title: `Роль #${id}` }));
}

export function createMeetView(ctx) {
  const services = ctx?.services || {};
  const config = ctx?.config || {};
  const membersService = services.membersService;
  const meetingsService = services.meetingsService;
  const prodCalendarService = services.prodCalendarService;
  const authService = services.authService;
  const graphClient = services.graphClient;
  const userProfileService = services.userProfileService;
  const timezoneService = services.timezoneService;

  const getOffsetMin = () => timezoneService?.getOffsetMin() ?? 180;
  const getLabelLong = () => timezoneService?.getLabelLong() ?? "";

  const root = buildElement("section", "meet-view");
  const sticky = buildElement("div", "meet-sticky");
  const toolbar = buildElement("div", "meet-toolbar");
  const employeeButton = buildElement("button", "meet-toolbar__button meet-toolbar__employee", "Сотрудник");
  employeeButton.type = "button";
  const titleEl = buildElement("div", "meet-toolbar__title", "");
  const controls = buildElement("div", "meet-toolbar__controls");
  const todayButton = buildElement("button", "meet-toolbar__button", "Сегодня");
  todayButton.type = "button";
  const prevButton = buildElement("button", "meet-toolbar__icon", "←");
  prevButton.type = "button";
  const nextButton = buildElement("button", "meet-toolbar__icon", "→");
  nextButton.type = "button";
  const modeGroup = buildElement("div", "meet-toolbar__modes");
  const dayBar = buildElement("div", "meet-daybar is-hidden");
  const hscrollHeader = buildElement("div", "meet-hscroll meet-hscroll__header");
  const scroll = buildElement("div", "meet-scroll");
  const hscrollBody = buildElement("div", "meet-hscroll meet-hscroll__body");
  const content = buildElement("div", "meet-content");

  controls.append(todayButton, prevButton, nextButton, modeGroup);
  toolbar.append(employeeButton, titleEl, controls);

  hscrollHeader.appendChild(dayBar);
  hscrollBody.appendChild(content);
  scroll.appendChild(hscrollBody);

  sticky.append(toolbar, hscrollHeader);
  root.append(sticky, scroll);

  let isSyncingHScroll = false;
  hscrollBody.addEventListener("scroll", () => {
    if (isSyncingHScroll) return;
    isSyncingHScroll = true;
    hscrollHeader.scrollLeft = hscrollBody.scrollLeft;
    isSyncingHScroll = false;
  });
  hscrollHeader.addEventListener("scroll", () => {
    if (isSyncingHScroll) return;
    isSyncingHScroll = true;
    hscrollBody.scrollLeft = hscrollHeader.scrollLeft;
    isSyncingHScroll = false;
  });
  const STORAGE_KEYS = config.storage?.keys || {};

  function getStoredMode() {
    try {
      const mode = localStorage.getItem(STORAGE_KEYS.meetDisplayMode);
      return MODES.includes(mode) ? mode : DEFAULT_MODE;
    } catch (_) {
      return DEFAULT_MODE;
    }
  }

  function getStoredEmployeeIds() {
    try {
      const val = localStorage.getItem(STORAGE_KEYS.meetSelectedEmployee);
      if (val === null) return [];
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) {
        return parsed.map(Number).filter(id => Number.isFinite(id));
      }
      // Backward compatibility: if it was a single number
      const num = Number(parsed);
      return Number.isFinite(num) ? [num] : [];
    } catch (_) {
      return [];
    }
  }

  function saveStoredMode(mode) {
    try {
      localStorage.setItem(STORAGE_KEYS.meetDisplayMode, mode);
    } catch (_) { }
  }

  function saveStoredEmployeeIds(ids) {
    try {
      if (!Array.isArray(ids) || ids.length === 0) {
        localStorage.removeItem(STORAGE_KEYS.meetSelectedEmployee);
      } else {
        localStorage.setItem(STORAGE_KEYS.meetSelectedEmployee, JSON.stringify(ids));
      }
    } catch (_) { }
  }

  const state = {
    mode: getStoredMode(),
    anchorDate: startOfDay(new Date()),
    selectedEmployeeIds: getStoredEmployeeIds(),
    selectedEmployeeScope: { userIds: [], roleIds: [] },
    userId: null,
    roleIds: [],
    renderToken: 0,
    hasLoaded: false,
    members: [],
    memberMap: new Map(),
    employeePopoverOpen: false,
    calendarCache: new Map(),
    optimisticMeetingId: 0,
    selectedItemId: null,
    currentMeetingsByDate: new Map(),
    currentDayTypeMap: new Map(),
    activeDayKey: null,
  };
  let selectionControllers = new Map(); // dateKey -> controller
  let nowTimer = null;

  function destroySelectionControllers() {
    for (const controller of selectionControllers.values()) {
      controller.destroy();
    }
    selectionControllers.clear();
  }

  const modeButtons = new Map();
  for (const mode of MODES) {
    const btn = buildElement("button", "meet-toolbar__mode", MODE_LABELS[mode]);
    btn.type = "button";
    btn.dataset.mode = mode;
    modeGroup.appendChild(btn);
    modeButtons.set(mode, btn);
  }

  function updateModeButtons() {
    for (const [mode, btn] of modeButtons.entries()) {
      btn.classList.toggle("is-active", mode === state.mode);
    }
  }

  function updateEmployeeButtonLabel() {
    let label = "Сотрудник";
    const ids = state.selectedEmployeeIds || [];
    if (ids.length === 0) {
      label = "Сотрудник: Все";
    } else if (ids.length === 1) {
      const id = ids[0];
      if (id === state.userId) {
        label = "Сотрудник: Я";
      } else {
        const member = state.memberMap.get(id);
        if (member) {
          const fullName = `${member.last_name || ""} ${member.first_name || ""}`.trim();
          label = `Сотрудник: ${fullName || member.name || member.email || member.id}`;
        } else {
          label = `Сотрудник: ID ${id}`;
        }
      }
    } else {
      label = `Сотрудники (${ids.length})`;
    }
    employeeButton.textContent = label;
  }

  function resolveCurrentUser() {
    const session = authService?.getSession?.();
    const userId = session?.memberId ?? session?.user?.id ?? session?.userId ?? null;
    state.userId = userId ? Number(userId) : null;
    const profileRoles = userProfileService?.getCachedProfile?.()?.roleIds || [];
    const sessionRoles = session?.roles || [];
    const rawRoles = [...profileRoles, ...sessionRoles];
    state.roleIds = rawRoles.map((role) => Number(role)).filter((id) => Number.isFinite(id));
  }

  async function loadMembers() {
    if (!membersService) return;
    try {
      const members = await membersService.getMembersList();
      state.members = Array.isArray(members) ? members.slice() : [];
      state.members.sort((a, b) => {
        const nameA = `${a.last_name || ""} ${a.first_name || ""}`.trim();
        const nameB = `${b.last_name || ""} ${b.first_name || ""}`.trim();
        return nameA.localeCompare(nameB, "ru");
      });
      state.memberMap = new Map(state.members.map((member) => [Number(member.id), member]));
      updateEmployeeButtonLabel();
    } catch (error) {
      console.warn("Meet view: failed to load members", error);
    }
  }

  function getModeDaysCount(mode) {
    if (mode === "day") return 1;
    if (mode === "days4") return 4;
    if (mode === "days7") return 7;
    return 0;
  }

  function getRangeForMode(mode, anchor) {
    const base = startOfDay(anchor);
    if (mode === "day") {
      return { start: base, end: addDays(base, 1) };
    }
    if (mode === "days4") {
      return { start: base, end: addDays(base, 4) };
    }
    if (mode === "days7") {
      const start = startOfWeekLocal(base);
      return { start, end: addDays(start, 7) };
    }
    if (mode === "days28") {
      const start = startOfWeekLocal(base);
      return { start, end: addDays(start, 28) };
    }
    return { start: base, end: addDays(base, 7) };
  }

  function formatTitle() {
    const { start, end } = getRangeForMode(state.mode, state.anchorDate);
    const endDisplay = addDays(end, -1);
    if (state.mode === "day") {
      titleEl.textContent = formatDateLabel(start, {
        day: "numeric",
        month: "long",
        year: "numeric",
      });
      return;
    }
    titleEl.textContent = formatRangeTitle(start, endDisplay);
  }

  function showSkeleton() {
    content.innerHTML = "";
    const skeleton = buildElement("div", "meet-skeleton");
    for (let i = 0; i < 4; i += 1) {
      const row = buildElement("div", "meet-skeleton__row");
      skeleton.appendChild(row);
    }
    content.appendChild(skeleton);
  }

  function showLoading() {
    content.innerHTML = "";
    const wrapper = buildElement("div", "meet-loading");
    const spinner = buildElement("div", "meet-loading__spinner");
    const text = buildElement("div", "meet-loading__text", "Загрузка встреч...");
    wrapper.append(spinner, text);
    content.appendChild(wrapper);
  }

  function showError(message, onRetry) {
    content.innerHTML = "";
    const wrapper = buildElement("div", "meet-error");
    const title = buildElement("div", "meet-error__title", "Не удалось загрузить встречи");
    const text = buildElement("div", "meet-error__text", message || "Ошибка сети");
    const button = buildElement("button", "meet-toolbar__button", "Повторить");
    button.type = "button";
    button.addEventListener("click", () => onRetry?.());
    wrapper.append(title, text, button);
    content.appendChild(wrapper);
  }

  function getMeetingsByDate(meetings) {
    const map = new Map();
    for (const meeting of meetings) {
      const meta = convertUtcStartToLocalRange(
        meeting.startUtc,
        meeting.durationMin,
        getOffsetMin(),
        { adjustDayByDuration: true }
      );
      if (!meta) continue;
      const list = map.get(meta.localDateKey) || [];
      list.push({ meeting, meta });
      map.set(meta.localDateKey, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.meta.startMinutes - b.meta.startMinutes);
    }
    return map;
  }
  function applyEmployeeFilter(meetings) {
    const ids = state.selectedEmployeeIds || [];
    if (ids.length === 0) return meetings;

    const scope = state.selectedEmployeeScope || { userIds: [], roleIds: [] };
    const targetUserIds = scope.userIds || [];
    const targetRoleIds = scope.roleIds || [];

    return meetings.filter((meeting) => {
      const uIds = meeting.participantsUsers || meeting.participants?.userIds || [];
      const rIds = meeting.participants?.roleIds || [];
      const hasUser = uIds.some(id => targetUserIds.includes(Number(id)));
      const hasRole = rIds.some(id => targetRoleIds.includes(Number(id)));
      return hasUser || hasRole;
    });
  }

  function calculateVisibleRange(meetingsByDate, dayDates) {
    let minHour = 6;
    let maxHour = 21;

    for (const day of dayDates) {
      const key = dateKey(day);
      const items = meetingsByDate.get(key) || [];
      for (const item of items) {
        const startHour = Math.floor(item.meta.startMinutes / 60);
        const endHour = Math.ceil((item.meta.startMinutes + item.meeting.durationMin) / 60);
        if (startHour < minHour) minHour = startHour;
        if (endHour > maxHour) maxHour = endHour;
      }
    }

    return { startHour: minHour, endHour: maxHour };
  }

  function buildMeetingCard(item, extraClasses = "") {
    const { meeting, meta } = item;
    const allowed = isAllowedMeeting(meeting, state.userId, state.roleIds);

    const card = buildElement("div", `meet-card ${extraClasses}`.trim());
    card.classList.toggle("meet-card--busy", !allowed);

    const isShort = meeting.durationMin < 60;
    if (isShort) {
      card.style.padding = "2px 8px";
      card.style.flexDirection = "row";
      card.style.alignItems = "center";
      card.style.gap = "6px";
      if (meeting.durationMin < 25) {
        card.style.padding = "0px 6px";
      }
    }

    const formattedTime =
      formatTimeRangeLocal(meeting.startUtc, meeting.endUtc, getOffsetMin()) ||
      `${meta.startLocal}–${meta.endLocal}`;
    const time = buildElement("div", "meet-card__time", formattedTime);
    const title = buildElement(
      "div",
      "meet-card__title",
      meeting.subject || "Без темы"
    );

    card.append(time, title);
    if (meeting.isOffline) {
      const offline = buildElement("span", "meet-card__offline", " Оффлайн");
      offline.style.color = "red";
      offline.style.fontSize = isShort ? "1em" : "0.85em";
      offline.style.fontWeight = "bold";
      if (isShort) {
        offline.style.whiteSpace = "nowrap";
        time.after(offline);
      } else {
        time.appendChild(offline);
      }
    }

    const isSelected = state.selectedItemId === meeting.id;
    if (isSelected) {
      card.classList.add("is-active");
    }

    card.classList.add("meet-card--interactive");
    card.setAttribute("role", "button");
    card.tabIndex = 0;

    const toggleDetails = (event) => {
      event.stopPropagation();
      if (state.selectedItemId === meeting.id) {
        closePopovers(ID_DETAILS);
      } else {
        openMeetingDetailsPopover(meeting, card);
      }
    };

    card.addEventListener("click", toggleDetails);
    // event.stopPropagation() больше не нужен здесь, так как захватывающий слушатель в popoverEngine 
    // сам решит, закрывать или давать событию идти дальше.
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      toggleDetails(event);
    });

    return card;
  }
  function buildSegment({ dayDate, index, isBusy }) {
    const segment = buildElement("div", "meet-time-grid__segment");
    segment.dataset.index = String(index);
    if (index % 4 === 0) {
      segment.dataset.hour = String(index / 4);
    }
    segment.dataset.date = dateKey(dayDate);
    if (isBusy) {
      segment.classList.add("is-busy");
    }
    return segment;
  }

  function buildTimeGrid({ dayDate, items, startHour = 0, endHour = 24 }) {
    const grid = buildElement("div", "meet-time-grid");
    const segments = buildElement("div", "meet-time-grid__segments");
    const overlay = buildElement("div", "meet-time-grid__overlay");

    const segmentsCount = (24 * 60) / TIME_GRID_STEP_MINUTES;
    const busySegments = new Array(segmentsCount).fill(false);
    for (const item of items) {
      const startIndex = Math.floor(item.meta.startMinutes / TIME_GRID_STEP_MINUTES);
      const endMinutes = item.meta.startMinutes + item.meeting.durationMin;
      const endIndexExclusive = Math.ceil(endMinutes / TIME_GRID_STEP_MINUTES);
      for (let i = startIndex; i < endIndexExclusive && i < busySegments.length; i += 1) {
        busySegments[i] = true;
      }
    }

    const startIdx = (startHour * 60) / TIME_GRID_STEP_MINUTES;
    const endIdx = (endHour * 60) / TIME_GRID_STEP_MINUTES;

    for (let index = startIdx; index < endIdx; index += 1) {
      segments.appendChild(buildSegment({ dayDate, index, isBusy: busySegments[index] }));
    }

    const plannedItems = planMeetingsLayout(items);

    const verticalOffset = startHour * 60;

    for (const item of plannedItems) {
      const block = buildMeetingCard(item, "meet-card--overlay");
      const startMinutes = item.meta.startMinutes;
      const heightMinutes = item.meeting.durationMin;
      const { colIndex, totalCols } = item.layout;

      block.style.top = `${(startMinutes - verticalOffset) * PX_PER_MINUTE}px`;
      block.style.height = `${heightMinutes * PX_PER_MINUTE}px`;

      // Распределяем ширину
      const width = 100 / totalCols;
      const left = colIndex * width;
      block.style.width = `calc(${width}% - 12px)`;
      block.style.left = `calc(${left}% + 6px)`;

      overlay.appendChild(block);
    }

    grid.append(segments, overlay);
    grid.dataset.startHour = String(startHour);
    grid.dataset.endHour = String(endHour);
    return { grid, busySegments };
  }

  function updateTimeGridOverlay(gridEl, items) {
    if (!gridEl) return;
    const overlay = gridEl.querySelector(".meet-time-grid__overlay");
    const segmentsContainer = gridEl.querySelector(".meet-time-grid__segments");
    if (!overlay || !segmentsContainer) return;

    const startHour = Number(gridEl.dataset.startHour || 0);

    // 1. Recalculate busy segments
    const segmentsCount = (24 * 60) / TIME_GRID_STEP_MINUTES;
    const busySegments = new Array(segmentsCount).fill(false);
    for (const item of items) {
      const startIndex = Math.floor(item.meta.startMinutes / TIME_GRID_STEP_MINUTES);
      const endMinutes = item.meta.startMinutes + item.meeting.durationMin;
      const endIndexExclusive = Math.ceil(endMinutes / TIME_GRID_STEP_MINUTES);
      for (let i = startIndex; i < endIndexExclusive && i < busySegments.length; i += 1) {
        busySegments[i] = true;
      }
    }

    // 2. Update segments classes (reuse DOM)
    const segmentEls = segmentsContainer.children;
    const startIdx = (startHour * 60) / TIME_GRID_STEP_MINUTES;
    for (let i = 0; i < segmentEls.length; i++) {
        const globalIdx = startIdx + i;
      if (busySegments[globalIdx]) segmentEls[i].classList.add("is-busy");
      else segmentEls[i].classList.remove("is-busy");
    }

    overlay.innerHTML = "";
    const plannedItems = planMeetingsLayout(items);
    const verticalOffset = startHour * 60;

    for (const item of plannedItems) {
      const block = buildMeetingCard(item, "meet-card--overlay");
      const startMinutes = item.meta.startMinutes;
      const heightMinutes = item.meeting.durationMin;
      const { colIndex, totalCols } = item.layout;

      block.style.top = `${(startMinutes - verticalOffset) * PX_PER_MINUTE}px`;
      block.style.height = `${heightMinutes * PX_PER_MINUTE}px`;

      const width = 100 / totalCols;
      const left = colIndex * width;
      block.style.width = `calc(${width}% - 12px)`;
      block.style.left = `calc(${left}% + 6px)`;

      overlay.appendChild(block);
    }

    return busySegments;
  }

  function planMeetingsLayout(items) {
    if (!items.length) return [];

    // 1. Сортируем по времени начала
    const sorted = [...items].sort((a, b) => a.meta.startMinutes - b.meta.startMinutes);

    // 2. Группируем в блоки (кластеры пересекающихся встреч)
    const blocks = [];
    let currentBlock = null;
    let blockEndTime = 0;

    for (const item of sorted) {
      const itemEndTime = item.meta.startMinutes + item.meeting.durationMin;
      if (!currentBlock || item.meta.startMinutes < blockEndTime) {
        if (!currentBlock) {
          currentBlock = [];
          blocks.push(currentBlock);
        }
        currentBlock.push(item);
        blockEndTime = Math.max(blockEndTime, itemEndTime);
      } else {
        currentBlock = [item];
        blocks.push(currentBlock);
        blockEndTime = itemEndTime;
      }
    }

    // 3. Для каждого блока распределяем колонки
    for (const block of blocks) {
      const columns = []; // Массив массивов (каждый подмассив — колонка)

      for (const item of block) {
        let placed = false;
        for (let i = 0; i < columns.length; i++) {
          const lastInCol = columns[i][columns[i].length - 1];
          const lastInColEndTime = lastInCol.meta.startMinutes + lastInCol.meeting.durationMin;

          if (item.meta.startMinutes >= lastInColEndTime) {
            columns[i].push(item);
            item.layout = { colIndex: i };
            placed = true;
            break;
          }
        }

        if (!placed) {
          item.layout = { colIndex: columns.length };
          columns.push([item]);
        }
      }

      // Проставляем общее кол-во колонок в блоке для вычисления ширины
      for (const item of block) {
        item.layout.totalCols = columns.length;
      }
    }

    return sorted;
  }

  function renderDayColumn(dayDate, itemsByDate, dayTypeMap, options = {}) {
    const { showLabel = true, forceSelection = false } = options;
    const column = buildElement("div", "meet-grid__column");
    const dayKey = dateKey(dayDate);
    const type = dayTypeMap.get(dayKey);
    if (type) {
      column.classList.add(`meet-day--${type}`);
    }

    if (showLabel) {
      const label = buildElement(
        "div",
        "meet-grid__day-label",
        formatDateLabel(dayDate, { weekday: "short", day: "numeric", month: "short" })
      );
      column.append(label);
    } else {
      column.classList.add("meet-grid__column--no-label");
    }

    const gridBody = buildElement("div", "meet-grid__body");
    const hours = buildElement("div", "meet-time-grid__hours");
    const startHour = options.startHour ?? 0;
    const endHour = options.endHour ?? 24;

    for (let h = startHour; h < endHour; h++) {
      const hourLabel = buildElement("div", "meet-time-grid__hour", `${String(h).padStart(2, "0")}:00`);
      hours.appendChild(hourLabel);
    }

    const items = itemsByDate.get(dayKey) || [];
    const { grid, busySegments } = buildTimeGrid({ dayDate, items, startHour, endHour });
    grid.dataset.date = dayKey;

    gridBody.append(hours, grid);
    column.append(gridBody);

    if (forceSelection || ["day", "days4", "days7"].includes(state.mode)) {
      if (selectionControllers.has(dayKey)) {
        selectionControllers.get(dayKey).destroy?.();
      }
      const controller = createTimeGridSelection({
        gridEl: grid,
        busySegments,
        startHour,
        stepMinutes: TIME_GRID_STEP_MINUTES,
        pxPerMinute: PX_PER_MINUTE,
        dateKey: dayKey,
        onSelect: ({ dateKey: selectedDate, startMinutes, durationMinutes, point }) => {
          const time = addMinutesLocal(0, startMinutes).time;
          openCreateMeetingPopover({
            date: selectedDate,
            time,
            durationMinutes,
            anchorRect: null,
            point,
          });
        },
      });
      selectionControllers.set(dayKey, controller);
    }

    return column;
  }

  function renderDayView({ start, meetingsByDate, dayTypeMap, range }) {
    content.innerHTML = "";
    const grid = buildElement("div", "meet-grid");
    grid.style.setProperty("--meet-days-count", "1");
    grid.dataset.mode = "day";

    const col = renderDayColumn(start, meetingsByDate, dayTypeMap, {
      showLabel: false,
      ...range
    });
    grid.appendChild(col);
    content.appendChild(grid);
  }

  function renderMultiDayView({ start, daysCount, meetingsByDate, dayTypeMap, range }) {
    content.innerHTML = "";
    const grid = buildElement("div", "meet-grid");
    grid.style.setProperty("--meet-days-count", String(daysCount));
    grid.dataset.mode = state.mode;

    for (let i = 0; i < daysCount; i++) {
      const dayDate = addDays(start, i);
      grid.appendChild(renderDayColumn(dayDate, meetingsByDate, dayTypeMap, {
        ...range
      }));
    }
    content.appendChild(grid);
  }

  function renderListView({ start, end, meetingsByDate, dayTypeMap }) {
    content.innerHTML = "";
    const list = buildElement("div", "meet-list");
    let current = new Date(start);
    while (current < end) {
      const dayKey = dateKey(current);
      const group = buildElement("div", "meet-list__day");
      const header = buildElement(
        "div",
        "meet-list__title",
        formatDateLabel(current, { weekday: "long", day: "numeric", month: "long" })
      );
      const type = dayTypeMap.get(dayKey);
      if (type) header.classList.add(`meet-day--${type}`);

      const body = buildElement("div", "meet-list__items");
      const items = meetingsByDate.get(dayKey) || [];
      if (items.length) {
        for (const item of items) {
          body.appendChild(buildMeetingCard(item));
        }
      } else {
        body.appendChild(buildElement("div", "meet-list__empty", "Нет встреч"));
      }

      group.append(header, body);
      list.appendChild(group);
      current = addDays(current, 1);
    }
    content.appendChild(list);
  }

  function renderMonthGrid({ start, end, meetingsByDate, dayTypeMap }) {
    content.innerHTML = "";
    const grid = buildElement("div", "meet-month");
    let current = new Date(start);
    while (current < end) {
      const cellDate = new Date(current);
      const dayKey = dateKey(cellDate);
      const cell = buildElement("div", "meet-month__day");
      cell.dataset.date = dayKey;
      const number = buildElement("div", "meet-month__number", String(cellDate.getDate()));
      cell.appendChild(number);

      const items = meetingsByDate.get(dayKey) || [];
      if (items.length) {
        const maxItems = 3;
        const list = buildElement("div", "meet-month__items");
        for (const item of items.slice(0, maxItems)) {
          list.appendChild(buildMonthMeetingRow(item));
        }
        if (items.length > maxItems) {
          const more = buildElement("div", "meet-month__more", `+ ещё ${items.length - maxItems}`);
          more.addEventListener("pointerdown", (event) => event.stopPropagation());
          more.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            openDayOverlay(cellDate);
          });
          list.appendChild(more);
        }
        cell.appendChild(list);
      } else {
        const count = buildElement("div", "meet-month__count", "Нет встреч");
        cell.appendChild(count);
      }

      const type = dayTypeMap.get(dayKey);
      if (type) cell.classList.add(`meet-day--${type}`);

      // Highlight active day
      if (state.activeDayKey === dayKey) {
        cell.classList.add("is-active");
      }

      cell.addEventListener("pointerdown", (event) => event.stopPropagation());
      cell.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openDayOverlay(cellDate);
      });

      grid.appendChild(cell);
      current = addDays(current, 1);
    }
    content.appendChild(grid);
  }

  function buildMonthMeetingRow(item) {
    const { meeting, meta } = item;
    const allowed = isAllowedMeeting(meeting, state.userId, state.roleIds);
    const row = buildElement("div", "meet-month__meeting");
    row.classList.toggle("meet-month__meeting--busy", !allowed);
    const formattedTime =
      formatTimeRangeLocal(meeting.startUtc, meeting.endUtc, getOffsetMin()) ||
      `${meta.startLocal}–${meta.endLocal}`;
    const time = buildElement("div", "meet-month__meeting-time", formattedTime);
    const title = buildElement(
      "div",
      "meet-month__meeting-title",
      meeting.subject || "Без темы"
    );
    row.append(time, title);
    if (meeting.isOffline) {
      const offline = buildElement("span", "meet-month__offline", " ОФФ");
      offline.style.color = "red";
      offline.style.fontSize = "0.8em";
      offline.style.fontWeight = "bold";
      offline.style.marginLeft = "2px";
      time.appendChild(offline);
    }

    const isSelected = state.selectedItemId === meeting.id;
    if (isSelected) {
      row.classList.add("is-active");
    }

    const toggleDetails = (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (state.selectedItemId === meeting.id) {
        closePopovers(ID_DETAILS);
      } else {
        openMeetingDetailsPopover(meeting, row);
      }
    };

    row.addEventListener("click", toggleDetails);
    row.addEventListener("pointerdown", (event) => {
      event.stopPropagation(); // Предотвращаем закрытие глобальным слушателем в popoverEngine
    });
    return row;
  }

  function deselectAllDays() {
    state.activeDayKey = null;
    content.querySelectorAll(".meet-month__day.is-active").forEach((el) => {
      el.classList.remove("is-active");
    });
  }

  function openDayOverlay(dayDate) {
    const dayKey = dateKey(dayDate);

    // Toggle logic: if already open, close it
    if (state.activeDayKey === dayKey) {
      closePopovers();
      return;
    }

    closePopovers();
    state.activeDayKey = dayKey;

    // Highlight the cell
    const cell = content.querySelector(`.meet-month__day[data-date="${dayKey}"]`);
    if (cell) cell.classList.add("is-active");

    const popover = buildElement("div", "meet-popover--day-overlay");

    const header = buildElement("div", "meet-day-overlay__header");
    const title = buildElement("div", "meet-day-overlay__title", formatDateLabel(dayDate, { weekday: "long", day: "numeric", month: "long" }));
    const closeBtn = buildElement("button", "meet-day-overlay__close", "×");
    closeBtn.addEventListener("click", () => closePopovers());
    header.append(title, closeBtn);

    const body = buildElement("div", "meet-day-overlay__body");
    const gridWrapper = buildElement("div", "meet-grid");
    gridWrapper.style.setProperty("--meet-days-count", "1");

    // Рендерим колонку дня. Она сама подключит нужные слушатели и SelectionController
    const column = renderDayColumn(dayDate, state.currentMeetingsByDate, state.currentDayTypeMap, { showLabel: false, forceSelection: true });
    gridWrapper.appendChild(column);
    body.appendChild(gridWrapper);

    popover.append(header, body);

    openPopover({
      id: ID_DAY_OVERLAY,
      contentEl: popover,
      placement: "center",
      onClose: () => {
        // При закрытии оверлея удаляем его контроллер выделения, чтобы не текла память
        if (selectionControllers.has(dayKey)) {
          selectionControllers.get(dayKey).destroy?.();
        }
        selectionControllers.delete(dayKey);
        deselectAllDays();
      }
    });
  }

  function renderDayBar({ start, daysCount, dayTypeMap }) {
    dayBar.innerHTML = "";
    dayBar.classList.remove("is-hidden");
    dayBar.style.setProperty("--meet-days-count", String(daysCount));
    for (let i = 0; i < daysCount; i += 1) {
      const dayDate = addDays(start, i);
      const item = buildElement(
        "div",
        "meet-daybar__item",
        formatDateLabel(dayDate, { weekday: "short", day: "numeric", month: "short" })
      );
      const type = dayTypeMap.get(dateKey(dayDate));
      if (type) item.classList.add(`meet-day--${type}`);
      dayBar.appendChild(item);
    }
  }

  function hideDayBar() {
    dayBar.classList.add("is-hidden");
    dayBar.innerHTML = "";
  }

  function resolveParticipantsList(meeting) {
    const ids = new Set();
    const participants = meeting?.participantsUsers || meeting?.participants?.userIds || [];
    for (const id of participants) {
      const normalized = Number(id);
      if (Number.isFinite(normalized)) ids.add(normalized);
    }
    const labels = Array.from(ids).map((id) => {
      const member = state.memberMap.get(id);
      const name = member
        ? `${member.last_name || ""} ${member.first_name || ""}`.trim() ||
        member.name ||
        member.email ||
        String(id)
        : `ID: ${id}`;
      return { id, label: name };
    });
    labels.sort((a, b) => a.label.localeCompare(b.label, "ru"));
    return labels;
  }

  function buildDetailsRow(label, valueContent) {
    const row = buildElement("div", "meet-details__item");
    const labelEl = buildElement("div", "meet-details__label", label);
    const valueEl = buildElement("div", "meet-details__value");
    if (valueContent instanceof Node) {
      valueEl.appendChild(valueContent);
    } else {
      valueEl.textContent = valueContent;
    }
    row.append(labelEl, valueEl);
    return row;
  }

  function buildMeetingDetailsPopover(meeting) {
    const popover = buildElement("div", "meet-popover meet-popover--details");
    const subject = meeting.subject || "Без темы";
    const timeLabel =
      formatDateTimeRangeLocalWithMskLabel(meeting.startUtc, meeting.endUtc, getOffsetMin(), getLabelLong()) || "—";

    const postLink = meeting.postLink?.trim();
    const postLinkValue = postLink
      ? (() => {
        const link = document.createElement("a");
        link.href = postLink;
        link.textContent = postLink;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "meet-details__link";
        return link;
      })()
      : "Нет ссылки";

    const participants = resolveParticipantsList(meeting);
    const participantsValue = (() => {
      if (!participants.length) {
        return "Нет участников";
      }
      const list = buildElement("ul", "meet-details__list");
      for (const participant of participants) {
        list.appendChild(buildElement("li", "", participant.label));
      }
      return list;
    })();

    const taskId = Number(meeting.id);
    const taskLinkValue = Number.isFinite(taskId)
      ? (() => {
        const link = document.createElement("a");
        link.href = `https://pyrus.com/t#id${taskId}`;
        link.textContent = `#${taskId}`;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.className = "meet-details__link";
        return link;
      })()
      : "Нет ссылки";

    popover.append(
      buildDetailsRow("Тема", subject),
      buildDetailsRow("Дата/время", timeLabel),
      buildDetailsRow("Ссылка на встречу", postLinkValue),
      buildDetailsRow("Участники", participantsValue),
      buildDetailsRow("Ссылка на задачу в Pyrus", taskLinkValue)
    );
    return popover;
  }

  function buildBusyMeetingDetailsPopover(meeting) {
    const popover = buildElement("div", "meet-popover meet-popover--details");
    const timeLabel =
      formatDateTimeRangeLocalWithMskLabel(meeting.startUtc, meeting.endUtc, getOffsetMin(), getLabelLong()) || "—";

    const participants = resolveParticipantsList(meeting);
    const participantsValue = (() => {
      if (!participants.length) {
        return "Нет участников";
      }
      const list = buildElement("ul", "meet-details__list");
      for (const participant of participants) {
        list.appendChild(buildElement("li", "", participant.label));
      }
      return list;
    })();

    const subject = meeting?.subject || "Без темы";

    popover.append(
      buildDetailsRow("Тема", subject),
      buildDetailsRow("Дата/время", timeLabel),
      buildDetailsRow("Участники", participantsValue)
    );
    return popover;
  }

  function openMeetingDetailsPopover(meeting, anchorEl) {
    if (!meeting || !anchorEl) return;

    const allowed = isAllowedMeeting(meeting, state.userId, state.roleIds);
    state.selectedItemId = meeting.id;
    anchorEl.classList.add("is-active");

    const popover = allowed
      ? buildMeetingDetailsPopover(meeting)
      : buildBusyMeetingDetailsPopover(meeting);

    openPopover({
      id: ID_DETAILS,
      anchorRect: anchorEl.getBoundingClientRect(),
      contentEl: popover,
      onClose: () => {
        state.selectedItemId = null;
        anchorEl.classList.remove("is-active");
      }
    });
  }

  async function ensureCalendarMap(start, end) {
    if (!prodCalendarService) return new Map();
    const map = new Map();
    const months = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const limit = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor <= limit) {
      months.push({ year: cursor.getFullYear(), monthIndex: cursor.getMonth() });
      cursor.setMonth(cursor.getMonth() + 1);
    }

    await Promise.all(
      months.map(async ({ year, monthIndex }) => {
        const key = `${year}-${monthIndex}`;
        if (!state.calendarCache.has(key)) {
          const data = await prodCalendarService.getProdCalendarForMonth(year, monthIndex);
          state.calendarCache.set(key, data);
        }
      })
    );

    let current = new Date(start);
    while (current < end) {
      const key = `${current.getFullYear()}-${current.getMonth()}`;
      const payload = state.calendarCache.get(key);
      const dayType = payload?.dayTypeByDay?.[current.getDate()] || 0;
      map.set(dateKey(current),
        dayType === 1
          ? "weekend"
          : dayType === 2
            ? "holiday"
            : dayType === 4
              ? "preholiday"
              : dayType === 8
                ? "holiday"
                : "workday"
      );
      current = addDays(current, 1);
    }
    return map;
  }

  async function renderMeetings() {
    if (!meetingsService) {
      showError("Сервис встреч недоступен", () => renderMeetings());
      return;
    }
    const token = ++state.renderToken;
    destroySelectionControllers();
    const cached = meetingsService.getCachedMeetings?.() || [];
    const hasCached = Array.isArray(cached) && cached.length > 0;
    if (!state.hasLoaded && !hasCached) {
      showLoading();
    } else {
      showSkeleton();
    }
    formatTitle();
    updateModeButtons();
    if (state.mode === "days28" || state.mode === "list") {
      hideDayBar();
    }

    const { start, end } = getRangeForMode(state.mode, state.anchorDate);
    try {
      if (!state.hasLoaded) {
        const cachedMeetingsByDate = getMeetingsByDate(applyEmployeeFilter(cached));
        state.currentMeetingsByDate = cachedMeetingsByDate;
      }

      if (token !== state.renderToken) return;

      if (state.selectedEmployeeIds.length > 0) {
        state.selectedEmployeeScope = await meetingsService.resolveParticipantScope({
          userIds: state.selectedEmployeeIds,
        });
      } else {
        state.selectedEmployeeScope = { userIds: [], roleIds: [] };
      }

      const meetings = await meetingsService.getMeetingsForRange({ startLocal: start, endLocal: end });
      const filtered = applyEmployeeFilter(meetings);

      const itemsByDate = getMeetingsByDate(filtered);
      const dayTypeMap = await ensureCalendarMap(start, end);

      const daysCount = getModeDaysCount(state.mode);
      const days = Array.from({ length: daysCount || 1 }, (_, i) => addDays(start, i));
      const range = calculateVisibleRange(itemsByDate, days);

      state.currentMeetingsByDate = itemsByDate;
      state.currentDayTypeMap = dayTypeMap;
      state.hasLoaded = true;

      if (checkCanReuseGrid(start, daysCount, range)) {
        updateDayView({ start, daysCount, meetingsByDate: itemsByDate, range });
      } else if (state.mode === "day") {
        renderDayBar({ start, daysCount: 1, dayTypeMap });
        renderDayView({ start, meetingsByDate: itemsByDate, dayTypeMap, range });
      } else if (state.mode === "days4" || state.mode === "days7") {
        const dc = state.mode === "days4" ? 4 : 7;
        renderDayBar({ start, daysCount: dc, dayTypeMap });
        renderMultiDayView({ start, daysCount: dc, meetingsByDate: itemsByDate, dayTypeMap, range });
      } else if (state.mode === "days28") {
        hideDayBar();
        renderMonthGrid({ start, end, meetingsByDate: itemsByDate, dayTypeMap });
      } else if (state.mode === "list") {
        hideDayBar();
        renderListView({ start, end, meetingsByDate: itemsByDate, dayTypeMap });
      }
    } catch (error) {
      if (token !== state.renderToken) return;
      const message = error?.message || "Ошибка сети";
      showError(message, () => renderMeetings());
    } finally {
      updateNowLine();
    }
  }


  function scrollToNow() {
    if (!["day", "days4", "days7"].includes(state.mode)) return;

    // Даем времени на рендер
    requestAnimationFrame(() => {
      const now = new Date();
      const gridEl = content.querySelector(".meet-time-grid");
      if (!gridEl) return;

      const startHour = Number(gridEl.dataset.startHour || 0);
      const minutes = now.getHours() * 60 + now.getMinutes();
      const offsetInGrid = (minutes - startHour * 60) * PX_PER_MINUTE;

      const gridTop = gridEl.getBoundingClientRect().top + window.scrollY;

      // Динамически вычисляем высоту шапок
      const appHeader = document.querySelector(".app-header");
      const appHeaderHeight = appHeader ? appHeader.offsetHeight : 0;
      const stickyHeight = sticky.offsetHeight;

      const totalHeaderHeight = appHeaderHeight + stickyHeight;

      // Целевое положение: линия времени на 30% высоты видимой области под шапкой
      const viewportHeight = window.innerHeight;
      const targetScreenY = totalHeaderHeight + (viewportHeight - totalHeaderHeight) * 0.3;

      const targetY = gridTop + offsetInGrid - targetScreenY;

      window.scrollTo({
        top: Math.max(0, targetY),
        behavior: "smooth"
      });
    });
  }

  function updateNowLine() {
    // Удаляем старую линию если есть
    const oldLine = scroll.querySelector(".meet-now-line");
    if (oldLine) oldLine.remove();

    if (!["day", "days4", "days7"].includes(state.mode)) return;

    const today = new Date();
    const todayKey = dateKey(today);
    const gridEl = content.querySelector(`.meet-time-grid[data-date="${todayKey}"]`);
    if (!gridEl) return;

    const minutes = today.getHours() * 60 + today.getMinutes();
    const startHour = Number(gridEl.dataset.startHour || 0);
    const line = buildElement("div", "meet-now-line");
    line.style.top = `${(minutes - startHour * 60) * PX_PER_MINUTE}px`;
    gridEl.appendChild(line);
  }

  function startNowTimer() {
    stopNowTimer();
    nowTimer = setInterval(() => {
      updateNowLine();
    }, 60000);
  }

  function stopNowTimer() {
    if (nowTimer) {
      clearInterval(nowTimer);
      nowTimer = null;
    }
  }

  function closePopovers(onlyId = null) {
    if (onlyId) {
      closePopover(onlyId);
      if (onlyId === ID_DETAILS) {
        state.selectedItemId = null;
        content.querySelectorAll(".meet-card.is-active, .meet-month__meeting.is-active").forEach(el => el.classList.remove("is-active"));
      }
      if (onlyId === ID_EMPLOYEE) {
        state.employeePopoverOpen = false;
      }
      return;
    }

    closePopover(); // Закрываем всё
    state.employeePopoverOpen = false;
    state.selectedItemId = null;
    deselectAllDays();
    // Убираем подсветку со всех активных карточек и строк
    content.querySelectorAll(".meet-card.is-active, .meet-month__meeting.is-active").forEach(el => el.classList.remove("is-active"));
  }

  function buildEmployeePopover() {
    const popover = buildElement("div", "meet-popover meet-popover--employee");
    const search = buildElement("input", "meet-popover__search");
    search.type = "search";
    search.placeholder = "Поиск сотрудника";

    const list = buildElement("div", "meet-popover__list");

    // Временное состояние выбора во время работы поповера
    const currentSelection = new Set(state.selectedEmployeeIds);

    function renderItems(filterText) {
      list.innerHTML = "";
      const query = String(filterText || "").trim().toLowerCase();

      const baseItems = [];
      if (state.userId) {
        baseItems.push({ id: state.userId, label: "Я" });
      }

      const allItems = [
        ...baseItems,
        ...state.members.map(m => ({
          id: Number(m.id),
          label: `${m.last_name || ""} ${m.first_name || ""}`.trim() || m.name || m.email || String(m.id)
        }))
      ];

      const filtered = allItems.filter(item => {
        if (!query) return true;
        return item.label.toLowerCase().includes(query);
      });

      // Отображаем список с чекбоксами
      for (const item of filtered) {
        const row = buildElement("div", "meet-popover__row");
        const checkbox = buildElement("input", "meet-popover__checkbox");
        checkbox.type = "checkbox";
        checkbox.checked = currentSelection.has(item.id);

        const label = buildElement("label", "meet-popover__label", item.label);

        const toggle = () => {
          if (currentSelection.has(item.id)) {
            currentSelection.delete(item.id);
          } else {
            currentSelection.add(item.id);
          }
          checkbox.checked = currentSelection.has(item.id);
        };

        row.addEventListener("click", (e) => {
          if (e.target !== checkbox) toggle();
        });
        checkbox.addEventListener("change", toggle);

        row.append(checkbox, label);
        list.appendChild(row);
      }
    }

    const footer = buildElement("div", "meet-popover__footer");
    const applyBtn = buildElement("button", "meet-toolbar__button meet-toolbar__button--primary", "Применить");
    applyBtn.addEventListener("click", () => {
      state.selectedEmployeeIds = Array.from(currentSelection);
      saveStoredEmployeeIds(state.selectedEmployeeIds);
      updateEmployeeButtonLabel();
      closePopovers();
      renderMeetings();
    });

    const resetBtn = buildElement("button", "meet-toolbar__button", "Сбросить");
    resetBtn.addEventListener("click", () => {
      state.selectedEmployeeIds = [];
      saveStoredEmployeeIds(state.selectedEmployeeIds);
      updateEmployeeButtonLabel();
      closePopovers();
      renderMeetings();
    });

    footer.append(applyBtn, resetBtn);

    search.addEventListener("input", () => renderItems(search.value));
    renderItems("");

    popover.append(search, list, footer);
    return popover;
  }

  function openEmployeePopover() {
    const popover = buildEmployeePopover();
    openPopover({
      id: ID_EMPLOYEE,
      anchorRect: employeeButton.getBoundingClientRect(),
      contentEl: popover,
      onClose: () => { state.employeePopoverOpen = false; }
    });
    state.employeePopoverOpen = true;
  }

  function buildResidentsOptions() {
    const roles = normalizeRoleOptions(config).map((role) => ({
      type: "role",
      id: role.id,
      title: role.title,
    }));
    const users = state.members.map((member) => {
      const title = `${member.last_name || ""} ${member.first_name || ""}`.trim();
      return { type: "user", id: Number(member.id), title: title || String(member.id) };
    });
    return [...users, ...roles];
  }

  function buildMeetingPopover({ date, time, durationMinutes, defaultResidents }) {
    const popover = buildElement("div", "meet-popover meet-popover--form");

    const subjectInput = buildElement("input", "meet-form__input");
    subjectInput.type = "text";
    subjectInput.placeholder = "Тема встречи";

    const dateInput = buildElement("input", "meet-form__input");
    dateInput.type = "date";
    dateInput.value = date;

    const startInput = buildElement("input", "meet-form__input");
    startInput.type = "time";
    startInput.value = time;

    const durationInput = buildElement("input", "meet-form__input");
    durationInput.type = "number";
    durationInput.min = "15";
    durationInput.step = "15";
    durationInput.value = String(durationMinutes || 60);

    const endInput = buildElement("input", "meet-form__input");
    endInput.type = "time";

    const typeWrapper = buildElement("div", "meet-form__type-group");
    const onlineOption = buildElement("label", "meet-form__type-option");
    const onlineRadio = document.createElement("input");
    onlineRadio.type = "radio";
    onlineRadio.name = "meet-type";
    onlineRadio.value = "online";
    onlineRadio.checked = true;
    onlineOption.append(onlineRadio, buildElement("span", "", " Онлайн"));

    const offlineOption = buildElement("label", "meet-form__type-option");
    const offlineRadio = document.createElement("input");
    offlineRadio.type = "radio";
    offlineRadio.name = "meet-type";
    offlineRadio.value = "offline";
    offlineOption.append(offlineRadio, buildElement("span", "", " Оффлайн"));
    typeWrapper.append(onlineOption, offlineOption);

    const linkInput = buildElement("input", "meet-form__input");
    linkInput.type = "text";
    linkInput.placeholder = "Ссылка на встречу (опционально)";

    const errorEl = buildElement("div", "meet-form__error", "");

    function syncEndTime() {
      const startMin = parseTimeToMinutes(startInput.value);
      const duration = Number(durationInput.value);
      if (!Number.isFinite(startMin) || !Number.isFinite(duration)) return;
      const { time: endTime } = addMinutesLocal(startMin, duration);
      endInput.value = endTime;
    }

    function syncDuration() {
      const duration = computeDurationMinutes(startInput.value, endInput.value);
      if (duration != null) {
        durationInput.value = String(duration);
      }
    }

    durationInput.addEventListener("input", () => syncEndTime());
    startInput.addEventListener("input", () => syncEndTime());
    endInput.addEventListener("input", () => syncDuration());
    syncEndTime();

    const residentsWrapper = buildElement("div", "meet-form__residents");
    const residentSearch = buildElement("input", "meet-form__input");
    residentSearch.type = "search";
    residentSearch.placeholder = "Поиск резидента";
    const residentList = buildElement("div", "meet-form__residents-list");

    const options = buildResidentsOptions();
    const selected = new Set();
    for (const resident of defaultResidents || []) {
      selected.add(`${resident.type}:${resident.id}`);
    }

    function renderResidents(query) {
      residentList.innerHTML = "";
      const filter = String(query || "").trim().toLowerCase();
      const filtered = options.filter((opt) => opt.title.toLowerCase().includes(filter));

      for (const opt of filtered) {
        const item = buildElement("label", "meet-form__resident");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = selected.has(`${opt.type}:${opt.id}`);
        checkbox.addEventListener("change", () => {
          const key = `${opt.type}:${opt.id}`;
          if (checkbox.checked) selected.add(key);
          else selected.delete(key);
        });
        const text = buildElement("span", "", opt.title);
        item.append(checkbox, text);
        residentList.appendChild(item);
      }
    }

    residentSearch.addEventListener("input", () => renderResidents(residentSearch.value));
    renderResidents("");

    residentsWrapper.append(residentSearch, residentList);

    const actions = buildElement("div", "meet-form__actions");
    const cancelBtn = buildElement("button", "meet-toolbar__button", "Отмена");
    cancelBtn.type = "button";
    const submitBtn = buildElement("button", "meet-toolbar__button is-primary", "Создать");
    submitBtn.type = "button";

    cancelBtn.addEventListener("click", () => closePopovers(ID_FORM));

    submitBtn.addEventListener("click", async () => {
      errorEl.textContent = "";
      submitBtn.disabled = true;

      try {
        if (!state.userId) {
          throw new Error("Не удалось определить пользователя");
        }
        const subject = subjectInput.value.trim();
        const dateValue = dateInput.value;
        const startValue = startInput.value;
        const durationValue = durationInput.value;

        if (!subject) throw new Error("Укажите тему встречи");
        if (!dateValue) throw new Error("Укажите дату");
        if (!startValue) throw new Error("Укажите время начала");
        if (!durationValue || Number(durationValue) <= 0) throw new Error("Укажите длительность");

        const isOffline = offlineRadio.checked;
        const postLink = linkInput.value.trim();

        const [year, month, day] = dateValue.split("-").map((part) => Number(part));
        const meta = convertLocalRangeToUtcWithMeta(
          year,
          month - 1,
          day,
          startInput.value,
          endInput.value || "",
          getOffsetMin()
        );
        if (!meta) {
          throw new Error("Некорректные дата или время");
        }

        const residents = [{ type: "user", id: state.userId }];
        for (const key of selected.values()) {
          const [type, idRaw] = key.split(":");
          const id = Number(idRaw);
          if (!Number.isFinite(id)) continue;
          if (type === "user" && id === state.userId) continue;
          residents.push({ type, id });
        }

        const { taskId } = await meetingsService.createMeeting({
          subject,
          startUtc: meta.startUtcIso,
          durationMinutes: meta.durationMinutes,
          residents,
          userId: state.userId,
          isOffline,
          postLink: postLink || null,
        });
        const meeting = {
          id: taskId ?? `local-${state.optimisticMeetingId++}`,
          startUtc: meta.startUtcIso,
          endUtc: meta.endUtcIso,
          startMs: new Date(meta.startUtcIso).getTime(),
          endMs: new Date(meta.endUtcIso).getTime(),
          durationMin: meta.durationMinutes,
          subject,
          isOffline,
          postLink,
          residentsNormalized: residents.map((resident) => ({
            type: resident.type,
            id: resident.id,
            title:
              resident.type === "user"
                ? `${state.memberMap.get(resident.id)?.last_name || ""
                  } ${state.memberMap.get(resident.id)?.first_name || ""}`.trim() ||
                String(resident.id)
                : `Роль #${resident.id}`,
          })),
          participants: {
            userIds: residents.filter((r) => r.type === "user").map((r) => r.id),
            roleIds: residents.filter((r) => r.type === "role").map((r) => r.id),
          },
        };

        meetingsService?.addOptimisticMeeting?.(meeting);
        meetingsService?.invalidateCache?.();
        closePopovers(ID_FORM);
        renderMeetings();
      } catch (error) {
        errorEl.textContent = error?.message || "Не удалось создать встречу";
      } finally {
        submitBtn.disabled = false;
      }
    });

    actions.append(cancelBtn, submitBtn);

    popover.append(
      buildElement("div", "meet-form__title", "Новая встреча"),
      subjectInput,
      buildElement("div", "meet-form__row", "Дата"),
      dateInput,
      buildElement("div", "meet-form__row", "Начало"),
      startInput,
      buildElement("div", "meet-form__row", "Длительность (мин)"),
      durationInput,
      buildElement("div", "meet-form__row", "Окончание"),
      endInput,
      buildElement("div", "meet-form__row", "Тип встречи"),
      typeWrapper,
      buildElement("div", "meet-form__row", "Ссылка"),
      linkInput,
      buildElement("div", "meet-form__row", "Резиденты"),
      residentsWrapper,
      errorEl,
      actions
    );

    return popover;
  }

  function buildDefaultResidents() {
    const residents = [];
    if (state.userId) {
      residents.push({ type: "user", id: state.userId });
    }
    if (
      state.selectedEmployeeId &&
      state.selectedEmployeeId !== state.userId
    ) {
      residents.push({ type: "user", id: state.selectedEmployeeId });
    }
    return residents;
  }

  function openCreateMeetingPopover({ date, time, durationMinutes, anchorRect, point }) {
    if (!state.userId) return;

    const defaultResidents = buildDefaultResidents();
    const popover = buildMeetingPopover({
      date,
      time,
      durationMinutes,
      defaultResidents,
    });
    openPopover({
      id: ID_FORM,
      anchorRect,
      point,
      contentEl: popover
    });
  }

  function handleContentClick(event) {
    const segment = event.target.closest(".meet-time-grid__segment");
    if (segment && !segment.classList.contains("is-busy")) {
      const date = segment.dataset.date;
      const index = Number(segment.dataset.index);
      if (!date || !Number.isFinite(index)) return;
      const minutes = index * TIME_GRID_STEP_MINUTES;
      const time = addMinutesLocal(0, minutes).time;
      openCreateMeetingPopover({
        date,
        time,
        durationMinutes: TIME_GRID_STEP_MINUTES,
        anchorRect: segment.getBoundingClientRect(),
      });
      return;
    }

    const monthDay = event.target.closest(".meet-month__day");
    if (monthDay) {
      const key = monthDay.dataset.date;
      if (key) {
        const [year, month, day] = key.split("-").map((value) => Number(value));
        const clickedDate = new Date(year, month - 1, day);

        if (state.mode === "days28") {
          // Вместо перехода — открываем оверлей
          openDayOverlay(clickedDate);
        } else {
          state.anchorDate = clickedDate;
          state.mode = "day";
          updateModeButtons();
          renderMeetings();
        }
      }
    }
  }

  function moveAnchor(deltaDays) {
    state.anchorDate = addDays(state.anchorDate, deltaDays);
    renderMeetings();
  }

  employeeButton.addEventListener("click", () => {
    if (state.employeePopoverOpen) {
      closePopovers();
      return;
    }
    openEmployeePopover();
  });

  todayButton.addEventListener("click", () => {
    const today = startOfDay(new Date());
    state.anchorDate = state.mode === "days28" || state.mode === "days7"
      ? startOfWeekLocal(today)
      : today;
    renderMeetings();
  });

  prevButton.addEventListener("click", () => {
    const step = state.mode === "day" ? -1 : state.mode === "days4" ? -4 : state.mode === "days7" ? -7 : state.mode === "days28" ? -28 : -7;
    moveAnchor(step);
  });

  nextButton.addEventListener("click", () => {
    const step = state.mode === "day" ? 1 : state.mode === "days4" ? 4 : state.mode === "days7" ? 7 : state.mode === "days28" ? 28 : 7;
    moveAnchor(step);
  });

  modeGroup.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-mode]");
    if (!btn) return;
    const mode = btn.dataset.mode;
    if (!MODES.includes(mode)) return;
    state.mode = mode;
    saveStoredMode(mode);
    if (mode === "days28" || mode === "days7") {
      state.anchorDate = startOfWeekLocal(state.anchorDate);
    }
    updateModeButtons();
    renderMeetings();
    if (["day", "days4", "days7"].includes(mode)) {
      scrollToNow();
    }
  });

  content.addEventListener("click", handleContentClick);

  let syncingScroll = false;
  const syncScroll = (source, target) => {
    if (syncingScroll) return;
    syncingScroll = true;
    target.scrollLeft = source.scrollLeft;
    requestAnimationFrame(() => {
      syncingScroll = false;
    });
  };
  hscrollBody.addEventListener("scroll", () => syncScroll(hscrollBody, hscrollHeader));
  hscrollHeader.addEventListener("scroll", () => syncScroll(hscrollHeader, hscrollBody));

  let mounted = false;

  function checkCanReuseGrid(start, daysCount, range) {
    const grid = content.querySelector(".meet-grid");
    if (!grid) return false;
    // Check if days count matches
    if (grid.style.getPropertyValue("--meet-days-count") !== String(daysCount)) return false;

    // Strict mode check
    if (grid.dataset.mode && grid.dataset.mode !== state.mode) return false;

    // Check first column date
    const firstCol = grid.querySelector(".meet-time-grid");
    if (!firstCol) return false;
    if (firstCol.dataset.date !== dateKey(start)) return false;

    // Check range
    if (firstCol.dataset.startHour !== String(range.startHour)) return false;
    if (firstCol.dataset.endHour !== String(range.endHour)) return false;

    return true;
  }

  function updateDayView({ start, daysCount, meetingsByDate, range }) {
    const grid = content.querySelector(".meet-grid");
    if (!grid) return;
    const timeGrids = grid.querySelectorAll(".meet-time-grid");

    for (let i = 0; i < daysCount; i++) {
      if (i >= timeGrids.length) break;
      const dayDate = addDays(start, i);
      const dayKey = dateKey(dayDate);
      const items = meetingsByDate.get(dayKey) || [];
      const gridEl = timeGrids[i];

      // Update overlay and busy segments
      const busySegments = updateTimeGridOverlay(gridEl, items);

      // Update selection controller busy segments if exists
      if (selectionControllers.has(dayKey)) {
        const controller = selectionControllers.get(dayKey);
        controller.destroy();
        const newController = createTimeGridSelection({
          gridEl,
          busySegments,
          startHour: range.startHour,
          stepMinutes: TIME_GRID_STEP_MINUTES,
          pxPerMinute: PX_PER_MINUTE,
          dateKey: dayKey,
          onSelect: ({ dateKey: selectedDate, startMinutes, durationMinutes, point }) => {
            const time = addMinutesLocal(0, startMinutes).time;
            openCreateMeetingPopover({
              date: selectedDate,
              time,
              durationMinutes,
              anchorRect: null,
              point,
            });
          },
        });
        selectionControllers.set(dayKey, newController);
      }
    }
  }

  return {
    el: root,
    mount() {
      if (!mounted) {
        mounted = true;
        resolveCurrentUser();
        loadMembers();
      }
      updateEmployeeButtonLabel();
      renderMeetings().then(() => {
        scrollToNow();
        startNowTimer();
      });
    },
    unmount() {
      closePopovers();
      destroySelectionControllers();
      stopNowTimer();
    },
  };
}
