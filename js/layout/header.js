const NAV_ITEMS = [
  { route: "work", label: "График раб." },
  { route: "meet", label: "Встречи" },
  { route: "kp", label: "КП" },
  { route: "gantt", label: "Диаграмма Ганта" },
];

export function createHeader({ onNavigate, canAccessRoute } = {}) {
  const header = document.createElement("header");
  header.className = "app-header";

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

  header.appendChild(nav);

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

  return { el: header, setActive };
}
