import {
  addDays,
  addMinutesLocal,
  computeDurationMinutes,
  convertLocalRangeToUtcWithMeta,
  convertUtcStartToLocalRange,
  dateKey,
  formatDateTimeRangeLocal,
  formatTimeRangeLocal,
  parseTimeToMinutes,
  startOfDay,
  startOfWeekLocal,
} from "../utils/dateTime.js";
import { TIME_GRID_STEP_MINUTES } from "../utils/timeGrid.js";
import { createTimeGridSelection } from "../ui/timeGridSelection.js";
import { closePopover, openPopover } from "../ui/popoverEngine.js";

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
  const timezoneOffsetMin =
    ctx?.getConfigValue?.("timezone.localOffsetMin", { defaultValue: 4 * 60, required: true }) ??
    4 * 60;

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
  toolbar.append(employeeButton, titleEl, controls);
  controls.append(todayButton, prevButton, nextButton, modeGroup);
  hscrollHeader.appendChild(dayBar);
  sticky.append(toolbar, hscrollHeader);
  hscrollBody.appendChild(content);
  scroll.appendChild(hscrollBody);
  root.append(sticky, scroll);

  const state = {
    mode: DEFAULT_MODE,
    anchorDate: startOfDay(new Date()),
    selectedEmployeeId: null,
    userId: null,
    roleIds: [],
    renderToken: 0,
    hasLoaded: false,
    members: [],
    memberMap: new Map(),
    employeePopoverOpen: false,
    calendarCache: new Map(),
    optimisticMeetingId: 0,
  };
  let selectionController = null;

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
    if (state.selectedEmployeeId === null) {
      label = "Сотрудник: Все";
    } else if (state.selectedEmployeeId === state.userId) {
      label = "Сотрудник: Я";
    } else {
      const member = state.memberMap.get(state.selectedEmployeeId);
      if (member) {
        const fullName = `${member.last_name || ""} ${member.first_name || ""}`.trim();
        label = `Сотрудник: ${fullName || member.name || member.email || member.id}`;
      }
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
        timezoneOffsetMin,
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
    if (!state.selectedEmployeeId) return meetings;
    const selectedId = Number(state.selectedEmployeeId);
    const isMe = state.userId != null && selectedId === state.userId;
    return meetings.filter((meeting) => {
      const userIds = meeting.participantsUsers || meeting.participants?.userIds || [];
      if (userIds.includes(selectedId)) return true;
      if (!isMe || !state.roleIds.length) return false;
      const roleIds = meeting.participants?.roleIds || [];
      return roleIds.some((roleId) => state.roleIds.includes(Number(roleId)));
    });
  }

  function buildMeetingCard(item, extraClasses = "") {
    const { meeting, meta } = item;
    const allowed = isAllowedMeeting(meeting, state.userId, state.roleIds);

    const card = buildElement("div", `meet-card ${extraClasses}`.trim());
    card.classList.toggle("meet-card--busy", !allowed);

    const formattedTime =
      formatTimeRangeLocal(meeting.startUtc, meeting.endUtc, timezoneOffsetMin) ||
      `${meta.startLocal}–${meta.endLocal}`;
    const time = buildElement("div", "meet-card__time", formattedTime);
    const title = buildElement(
      "div",
      "meet-card__title",
      allowed ? meeting.subject || "Без темы" : "Занято"
    );

    card.append(time, title);
    if (allowed) {
      card.classList.add("meet-card--interactive");
      card.setAttribute("role", "button");
      card.tabIndex = 0;
      const openDetails = (event) => {
        event.stopPropagation();
        openMeetingDetailsPopover(meeting, card);
      };
      card.addEventListener("click", openDetails);
      card.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openDetails(event);
      });
    }
    return card;
  }

  function buildSegment({ dayDate, index, isBusy }) {
    const segment = buildElement("div", "meet-time-grid__segment");
    segment.dataset.index = String(index);
    if (index % 4 === 0) {
      segment.dataset.hour = String(index / 4);
    }
    if (isBusy) {
      segment.classList.add("is-busy");
    }
    segment.dataset.date = dateKey(dayDate);
    return segment;
  }

  function buildTimeGrid({ dayDate, items }) {
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

    for (let index = 0; index < busySegments.length; index += 1) {
      segments.appendChild(buildSegment({ dayDate, index, isBusy: busySegments[index] }));
    }

    for (const item of items) {
      const block = buildMeetingCard(item, "meet-card--overlay");
      const startMinutes = item.meta.startMinutes;
      const heightMinutes = item.meeting.durationMin;
      block.style.top = `${startMinutes * PX_PER_MINUTE}px`;
      block.style.height = `${heightMinutes * PX_PER_MINUTE}px`;
      overlay.appendChild(block);
    }

    grid.append(segments, overlay);
    return { grid, busySegments };
  }

  function renderDayColumn(dayDate, itemsByDate, dayTypeMap, { showLabel = true } = {}) {
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
    for (const hour of HOUR_SLOTS) {
      const hourLabel = buildElement("div", "meet-time-grid__hour", `${String(hour).padStart(2, "0")}:00`);
      hours.appendChild(hourLabel);
    }

    const items = itemsByDate.get(dayKey) || [];
    const { grid, busySegments } = buildTimeGrid({ dayDate, items });
    grid.dataset.date = dayKey;

    gridBody.append(hours, grid);
    column.append(gridBody);

    if (selectionController) {
      selectionController.destroy();
      selectionController = null;
    }

    if (state.mode === "day") {
      selectionController = createTimeGridSelection({
        gridEl: grid,
        busySegments,
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
    }

    return column;
  }

  function renderDayView({ start, meetingsByDate, dayTypeMap }) {
    content.innerHTML = "";
    const grid = buildElement("div", "meet-grid");
    grid.style.setProperty("--meet-days-count", "1");
    grid.appendChild(renderDayColumn(start, meetingsByDate, dayTypeMap, { showLabel: false }));
    content.appendChild(grid);
  }

  function renderMultiDayView({ start, daysCount, meetingsByDate, dayTypeMap }) {
    content.innerHTML = "";
    const grid = buildElement("div", "meet-grid");
    grid.style.setProperty("--meet-days-count", String(daysCount));
    for (let i = 0; i < daysCount; i += 1) {
      const dayDate = addDays(start, i);
      grid.appendChild(renderDayColumn(dayDate, meetingsByDate, dayTypeMap, { showLabel: false }));
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
      const dayKey = dateKey(current);
      const cell = buildElement("button", "meet-month__day");
      cell.type = "button";
      cell.dataset.date = dayKey;
      const number = buildElement("div", "meet-month__number", String(current.getDate()));
      cell.appendChild(number);

      const items = meetingsByDate.get(dayKey) || [];
      if (items.length) {
        const maxItems = 3;
        const list = buildElement("div", "meet-month__items");
        for (const item of items.slice(0, maxItems)) {
          list.appendChild(buildMonthMeetingRow(item));
        }
        if (items.length > maxItems) {
          list.appendChild(buildElement("div", "meet-month__more", `+ ещё ${items.length - maxItems}`));
        }
        cell.appendChild(list);
      } else {
        const count = buildElement("div", "meet-month__count", "Нет встреч");
        cell.appendChild(count);
      }

      const type = dayTypeMap.get(dayKey);
      if (type) cell.classList.add(`meet-day--${type}`);

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
      formatTimeRangeLocal(meeting.startUtc, meeting.endUtc, timezoneOffsetMin) ||
      `${meta.startLocal}–${meta.endLocal}`;
    const time = buildElement("div", "meet-month__meeting-time", formattedTime);
    const title = buildElement(
      "div",
      "meet-month__meeting-title",
      allowed ? meeting.subject || "Без темы" : "Занято"
    );
    row.append(time, title);
    if (allowed) {
      row.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openMeetingDetailsPopover(meeting, row);
      });
    }
    return row;
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
      formatDateTimeRangeLocal(meeting.startUtc, meeting.endUtc, timezoneOffsetMin) || "—";

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

  function openMeetingDetailsPopover(meeting, anchorEl) {
    if (!meeting || !anchorEl) return;
    closePopovers();
    const popover = buildMeetingDetailsPopover(meeting);
    openPopover({ anchorRect: anchorEl.getBoundingClientRect(), contentEl: popover });
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
    if (selectionController && state.mode !== "day") {
      selectionController.destroy();
      selectionController = null;
    }
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
      const [meetings, dayTypeMap] = await Promise.all([
        meetingsService.getMeetingsForRange({ startLocal: start, endLocal: end }),
        ensureCalendarMap(start, end),
      ]);

      if (token !== state.renderToken) return;
      const filtered = applyEmployeeFilter(meetings);
      const meetingsByDate = getMeetingsByDate(filtered);

      state.hasLoaded = true;
      if (state.mode === "day") {
        renderDayBar({ start, daysCount: 1, dayTypeMap });
        renderDayView({ start, meetingsByDate, dayTypeMap });
      } else if (state.mode === "days4") {
        renderDayBar({ start, daysCount: 4, dayTypeMap });
        renderMultiDayView({ start, daysCount: 4, meetingsByDate, dayTypeMap });
      } else if (state.mode === "days7") {
        renderDayBar({ start, daysCount: 7, dayTypeMap });
        renderMultiDayView({ start, daysCount: 7, meetingsByDate, dayTypeMap });
      } else if (state.mode === "days28") {
        hideDayBar();
        renderMonthGrid({ start, end, meetingsByDate, dayTypeMap });
      } else {
        hideDayBar();
        renderListView({ start, end, meetingsByDate, dayTypeMap });
      }
    } catch (error) {
      if (token !== state.renderToken) return;
      const message = error?.message || "Ошибка сети";
      showError(message, () => renderMeetings());
    }
  }

  function closePopovers() {
    closePopover();
    state.employeePopoverOpen = false;
  }

  function buildEmployeePopover() {
    const popover = buildElement("div", "meet-popover");
    const search = buildElement("input", "meet-popover__search");
    search.type = "search";
    search.placeholder = "Поиск сотрудника";

    const list = buildElement("div", "meet-popover__list");

    function renderItems(filterText) {
      list.innerHTML = "";
      const query = String(filterText || "").trim().toLowerCase();

      const baseItems = [{ id: null, label: "Все" }];
      if (state.userId) {
        baseItems.push({ id: state.userId, label: "Я" });
      }
      for (const item of baseItems) {
        const btn = buildElement("button", "meet-popover__item", item.label);
        btn.type = "button";
        btn.dataset.employeeId = item.id ?? "";
        btn.addEventListener("click", () => {
          state.selectedEmployeeId = item.id ?? null;
          updateEmployeeButtonLabel();
          closePopovers();
          renderMeetings();
        });
        list.appendChild(btn);
      }

      const filtered = state.members.filter((member) => {
        const name = `${member.last_name || ""} ${member.first_name || ""}`.trim();
        if (!query) return true;
        return name.toLowerCase().includes(query);
      });

      for (const member of filtered) {
        const name = `${member.last_name || ""} ${member.first_name || ""}`.trim();
        const label = name || member.name || member.email || String(member.id);
        const btn = buildElement("button", "meet-popover__item", label);
        btn.type = "button";
        btn.dataset.employeeId = String(member.id);
        btn.addEventListener("click", () => {
          state.selectedEmployeeId = Number(member.id);
          updateEmployeeButtonLabel();
          closePopovers();
          renderMeetings();
        });
        list.appendChild(btn);
      }
    }

    search.addEventListener("input", () => renderItems(search.value));
    renderItems("");

    popover.append(search, list);
    return popover;
  }

  function openEmployeePopover() {
    closePopovers();
    const popover = buildEmployeePopover();
    openPopover({ anchorRect: employeeButton.getBoundingClientRect(), contentEl: popover });
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

    cancelBtn.addEventListener("click", () => closePopovers());

    submitBtn.addEventListener("click", async () => {
      errorEl.textContent = "";
      submitBtn.disabled = true;

      try {
        if (!state.userId) {
          throw new Error("Не удалось определить пользователя");
        }
        const subject = subjectInput.value.trim();
        const dateValue = dateInput.value;
        const [year, month, day] = dateValue.split("-").map((part) => Number(part));
        const meta = convertLocalRangeToUtcWithMeta(
          year,
          month - 1,
          day,
          startInput.value,
          endInput.value || "",
          timezoneOffsetMin
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

        // Pyrus expects the meeting range on the task root (due + duration),
        // while the due_date_time field stores only the start timestamp.
        // NOTE: duration must be a string.
        const payload = {
          form_id: config?.pyrus?.forms?.form_meet,
          due: meta.startUtcIso,
          duration: String(meta.durationMinutes),
          fields: [
            { id: 1, value: subject },
            { id: 4, value: meta.startUtcIso },
            { id: 27, value: { id: state.userId, type: "user" } },
            {
              id: 14,
              value: residents.map((resident, index) => ({
                row_id: index,
                cells: [{ id: 15, value: { id: resident.id, type: resident.type } }],
              })),
            },
          ],
        };

        const response = await graphClient.callGraphApi("pyrus_api", {
          method: "POST",
          path: "/v4/tasks",
          body: payload,
        });

        const taskId = response?.data?.id ?? response?.data?.task_id ?? response?.task_id ?? null;
        const meeting = {
          id: taskId ?? `local-${state.optimisticMeetingId++}`,
          startUtc: meta.startUtcIso,
          endUtc: meta.endUtcIso,
          startMs: new Date(meta.startUtcIso).getTime(),
          endMs: new Date(meta.endUtcIso).getTime(),
          durationMin: meta.durationMinutes,
          subject,
          residentsNormalized: residents.map((resident) => ({
            type: resident.type,
            id: resident.id,
            title:
              resident.type === "user"
                ? `${
                    state.memberMap.get(resident.id)?.last_name || ""
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
        closePopovers();
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
    closePopovers();

    const defaultResidents = buildDefaultResidents();
    // Если выбран фильтр "Все", по умолчанию оставляем только текущего пользователя.
    const popover = buildMeetingPopover({
      date,
      time,
      durationMinutes,
      defaultResidents,
    });
    openPopover({ anchorRect, point, contentEl: popover });
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
        state.anchorDate = new Date(year, month - 1, day);
        state.mode = "day";
        updateModeButtons();
        renderMeetings();
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
    if (mode === "days28" || mode === "days7") {
      state.anchorDate = startOfWeekLocal(state.anchorDate);
    }
    updateModeButtons();
    renderMeetings();
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

  return {
    el: root,
    mount() {
      if (!mounted) {
        mounted = true;
        resolveCurrentUser();
        loadMembers();
      }
      updateEmployeeButtonLabel();
      renderMeetings();
    },
    unmount() {
      closePopovers();
      if (selectionController) {
        selectionController.destroy();
        selectionController = null;
      }
    },
  };
}
