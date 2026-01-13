const NAV_ITEMS = [
  { route: "work", label: "График раб." },
  { route: "meet", label: "Встречи" },
  { route: "kp", label: "КП" },
];

export function createHeader({ onNavigate } = {}) {
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
      button.classList.toggle("active", route === routeName);
    });
  }

  return { el: header, setActive };
}
