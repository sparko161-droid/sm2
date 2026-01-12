const NAV_ITEMS = [
  { route: "work", label: "График раб." },
  { route: "meet", label: "Встречи" },
  { route: "kp", label: "КП" },
];

export function renderHeader({ activeRoute, onNavigate }) {
  const header = document.createElement("header");
  header.className = "app-header";

  const nav = document.createElement("nav");
  nav.className = "app-nav";
  nav.setAttribute("aria-label", "Основная навигация");

  NAV_ITEMS.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn toggle";
    button.textContent = item.label;
    button.dataset.route = item.route;
    if (item.route === activeRoute) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      if (typeof onNavigate === "function") {
        onNavigate(item.route);
      }
    });
    nav.appendChild(button);
  });

  header.appendChild(nav);
  return header;
}
