const DEFAULT_MESSAGE = "Доступ запрещён, обратитесь к администратору";

export function createForbiddenView({ message = DEFAULT_MESSAGE, onBack } = {}) {
  const el = document.createElement("section");
  el.className = "forbidden-view";

  const overlay = document.createElement("div");
  overlay.className = "forbidden-overlay";

  const card = document.createElement("div");
  card.className = "forbidden-card";

  const text = document.createElement("p");
  text.className = "forbidden-text";
  text.textContent = message || DEFAULT_MESSAGE;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "btn primary";
  button.textContent = "Вернуться к графику работы";
  button.addEventListener("click", () => {
    if (typeof onBack === "function") {
      onBack();
    }
  });

  card.appendChild(text);
  card.appendChild(button);
  el.appendChild(overlay);
  el.appendChild(card);

  return {
    el,
    mount() {},
    unmount() {},
    setMessage(nextMessage) {
      text.textContent = nextMessage || DEFAULT_MESSAGE;
    },
  };
}
