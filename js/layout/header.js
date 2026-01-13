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
  avatarButton.textContent = "—";
  avatarButton.addEventListener("click", () => {
    if (typeof onOpenUserPopover === "function") {
      onOpenUserPopover(avatarButton);
    }
  });

  userBlock.appendChild(userText);
  userBlock.appendChild(avatarButton);

  rightGroup.appendChild(themeButton);
  rightGroup.appendChild(logoutButton);
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
    const initials = summary?.initials || "—";
    userName.textContent = fullName;
    userRole.textContent = position;
    avatarButton.textContent = initials;
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

  return { el: header, setActive, setUserSummary, updateThemeLabel };
}
