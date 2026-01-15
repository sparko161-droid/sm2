import { openPopover } from "../ui/popoverEngine.js";

const NAV_ITEMS = [
  { route: "work", label: "График работы" },
  { route: "meet", label: "Встречи" },
  { route: "kp", label: "КП" },
  { route: "gantt", label: "Диаграмма Ганта" },
];

export function createHeader({
  onNavigate,
  onToggleTheme,
  onLogout,
  onOpenUserPopover,
  canAccessRoute,
  getTimezoneLabelShort,
  listTimezoneZones,
  onTimezoneChange,
} = {}) {
  const header = document.createElement("header");
  header.className = "app-header";

  const headerContent = document.createElement("div");
  headerContent.className = "app-header__content";

  const nav = document.createElement("nav");
  nav.className = "app-nav";
  nav.setAttribute("aria-label", "Основная навигация");

  const buttonsByRoute = new Map();

  NAV_ITEMS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn toggle";
    button.textContent = item.label;
    button.dataset.route = item.route;
    if (typeof canAccessRoute === "function" && !canAccessRoute(item.route)) {
      button.hidden = true;
      button.setAttribute("aria-hidden", "true");
    }
    button.addEventListener("click", () => {
      if (typeof onNavigate === "function") {
        onNavigate(item.route);
      }
    });
    buttonsByRoute.set(item.route, button);
    nav.appendChild(button);
  });

  const rightGroup = document.createElement("div");
  rightGroup.className = "app-header__actions";

  const timezoneButton = document.createElement("button");
  timezoneButton.type = "button";
  timezoneButton.className = "btn toggle";
  timezoneButton.addEventListener("click", () => {
    openTimezonePopover();
  });

  function openTimezonePopover() {
    const popover = document.createElement("div");
    popover.className = "meet-popover";

    const zones = listTimezoneZones ? listTimezoneZones() : [];
    zones.forEach((zone) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "meet-popover__item";

      const mskOffset = 180;
      const deltaHours = (zone.utcOffsetMin - mskOffset) / 60;
      const label = deltaHours === 0 ? "МСК" : (deltaHours > 0 ? `МСК+${deltaHours}` : `МСК${deltaHours}`);

      btn.textContent = `${label} — ${zone.city}`;
      btn.addEventListener("click", () => {
        if (onTimezoneChange) {
          onTimezoneChange(zone.id);
        }
      });
      popover.appendChild(btn);
    });

    openPopover({
      id: "header_timezone",
      anchorRect: timezoneButton.getBoundingClientRect(),
      contentEl: popover,
    });
  }

  function updateTimezoneLabel() {
    if (getTimezoneLabelShort) {
      timezoneButton.textContent = `📍 ${getTimezoneLabelShort()}`;
    }
  }
  updateTimezoneLabel();

  const themeButton = document.createElement("button");
  themeButton.type = "button";
  themeButton.className = "btn toggle";
  themeButton.textContent = "🌙 Тема";
  themeButton.addEventListener("click", () => {
    if (typeof onToggleTheme === "function") {
      onToggleTheme();
    }
    updateThemeLabel();
  });

  const logoutButton = document.createElement("button");
  logoutButton.type = "button";
  logoutButton.className = "btn toggle";
  logoutButton.textContent = "🚪 Выйти";
  logoutButton.title = "Сбросить авторизацию";
  logoutButton.addEventListener("click", () => {
    if (typeof onLogout === "function") {
      onLogout();
    }
  });

  const userBlock = document.createElement("div");
  userBlock.className = "app-header__user";

  const userText = document.createElement("div");
  userText.className = "app-header__user-text";

  const userName = document.createElement("div");
  userName.className = "app-header__user-name";
  userName.textContent = "—";

  const userRole = document.createElement("div");
  userRole.className = "app-header__user-role";
  userRole.textContent = "—";

  userText.appendChild(userName);
  userText.appendChild(userRole);

  const avatarButton = document.createElement("button");
  avatarButton.type = "button";
  avatarButton.className = "app-header__avatar";
  avatarButton.setAttribute("aria-label", "Открыть профиль");
  avatarButton.addEventListener("click", () => {
    if (typeof onOpenUserPopover === "function") {
      onOpenUserPopover(avatarButton);
    }
  });

  const avatarImage = document.createElement("img");
  avatarImage.className = "app-header__avatar-image";
  avatarImage.alt = "";
  avatarImage.loading = "lazy";
  avatarImage.hidden = false;
  avatarButton.appendChild(avatarImage);

  avatarImage.addEventListener("load", () => {
    avatarButton.classList.add("has-avatar");
  });

  avatarImage.addEventListener("error", () => {
    avatarButton.classList.remove("has-avatar");
    avatarImage.removeAttribute("src");
  });

  const avatarInitials = document.createElement("span");
  avatarInitials.className = "app-header__avatar-initials";
  avatarInitials.textContent = "—";
  avatarButton.appendChild(avatarInitials);

  userBlock.appendChild(userText);
  userBlock.appendChild(avatarButton);

  /* ГРУППА КНОПОК (СЛЕВА В МОБ) */
  const buttonsGroup = document.createElement("div");
  buttonsGroup.className = "app-header__buttons-group";

  buttonsGroup.appendChild(timezoneButton);
  buttonsGroup.appendChild(themeButton);
  buttonsGroup.appendChild(logoutButton);

  rightGroup.appendChild(buttonsGroup);
  rightGroup.appendChild(userBlock);

  headerContent.appendChild(nav);
  headerContent.appendChild(rightGroup);
  header.appendChild(headerContent);

  function setActive(routeName) {
    buttonsByRoute.forEach((button, route) => {
      const allowed = typeof canAccessRoute === "function" ? canAccessRoute(route) : true;
      if (!allowed) {
        button.hidden = true;
        button.setAttribute("aria-hidden", "true");
        button.classList.remove("active");
        return;
      }
      button.hidden = false;
      button.removeAttribute("aria-hidden");
      button.classList.toggle("active", route === routeName);
    });
  }

  function setUserSummary(summary) {
    const fullName = summary?.fullName || summary?.name || "—";
    const position = summary?.position || "—";
    const avatarUrl = summary?.avatarUrl || "";
    const initials = summary?.initials || "—";
    userName.textContent = fullName;
    userRole.textContent = position;
    avatarInitials.textContent = initials;

    if (avatarUrl) {
      avatarImage.src = avatarUrl;
      // Hide avatar layer until it actually loads to avoid layered flicker.
      avatarButton.classList.remove("has-avatar");
    } else {
      avatarButton.classList.remove("has-avatar");
      avatarImage.removeAttribute("src");
    }
  }

  function updateThemeLabel() {
    const isDark = document.documentElement.getAttribute("data-theme") !== "light";
    themeButton.textContent = isDark ? "🌙 Тема" : "☀️ Тема";
    themeButton.setAttribute(
      "aria-label",
      isDark ? "Включена тёмная тема" : "Включена светлая тема"
    );
  }

  updateThemeLabel();

  return { el: header, setActive, setUserSummary, updateThemeLabel, updateTimezoneLabel };
}
