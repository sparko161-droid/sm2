function buildModal() {
  const overlay = document.createElement("div");
  overlay.className = "birthday-modal";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const card = document.createElement("div");
  card.className = "birthday-modal__card";

  const title = document.createElement("div");
  title.className = "birthday-modal__title";
  title.textContent = "🎉 Поздравляем с днём рождения!";

  const body = document.createElement("div");
  body.className = "birthday-modal__body";
  body.textContent =
    "Сообщаем дежурным: в день рождения в компании положен выходной день.";

  const actions = document.createElement("div");
  actions.className = "birthday-modal__actions";

  const closeButton = document.createElement("button");
  closeButton.type = "button";
  closeButton.className = "btn toggle";
  closeButton.textContent = "Закрыть";

  actions.appendChild(closeButton);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(actions);
  overlay.appendChild(card);

  return { overlay, closeButton };
}

export function createUserBirthdayModal() {
  let overlay = null;
  let isOpen = false;

  function open() {
    if (isOpen) return;
    isOpen = true;
    const built = buildModal();
    overlay = built.overlay;
    document.body.appendChild(overlay);
    built.closeButton.addEventListener("click", close);
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    overlay?.remove();
    overlay = null;
  }

  return { open, close, isOpen: () => isOpen };
}
