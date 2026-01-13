function ensureText(value, fallback = "—") {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

function formatRoles(roles) {
  if (!Array.isArray(roles) || roles.length === 0) return "—";
  return roles.map((role) => String(role)).join(", ");
}

export function createUserPopover({ getProfile, onClose } = {}) {
  let popoverEl = null;
  let backdropEl = null;
  let isOpen = false;
  let anchorEl = null;

  function renderProfile(profile) {
    if (!popoverEl) return;
    if (!profile) {
      popoverEl.innerHTML = "<div class=\"user-popover__empty\">Профиль недоступен</div>";
      return;
    }

    const details = {
      "Рабочий номер": profile.phoneWork || profile.phone,
      "Сотовый": profile.phoneMobile || profile.mobile_phone,
      Email: profile.email,
      Отдел: profile.department_name || profile.department?.name,
      "ID сотрудника": profile.id,
      Roles: formatRoles(profile.roleIds || profile.roles),
    };

    const rows = Object.entries(details)
      .map(
        ([label, value]) =>
          `<div class="user-popover__row"><span>${label}</span><span>${ensureText(value)}</span></div>`
      )
      .join("");

    const rawData = JSON.stringify(profile, null, 2);

    popoverEl.innerHTML = `
      <div class="user-popover__title">${ensureText(profile.fullName || profile.name)}</div>
      <div class="user-popover__subtitle">${ensureText(profile.position)}</div>
      <div class="user-popover__rows">${rows}</div>
      <details class="user-popover__details">
        <summary>Все поля</summary>
        <pre>${rawData}</pre>
      </details>
    `;
  }

  function close() {
    if (!isOpen) return;
    isOpen = false;
    popoverEl?.classList.remove("open");
    backdropEl?.classList.remove("open");
    document.removeEventListener("click", handleOutsideClick);
    document.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("resize", updatePosition);
    window.removeEventListener("scroll", updatePosition, true);
    onClose?.();
  }

  function handleOutsideClick(event) {
    if (!isOpen) return;
    if (popoverEl?.contains(event.target) || anchorEl?.contains(event.target)) {
      return;
    }
    close();
  }

  function handleKeydown(event) {
    if (event.key === "Escape") {
      close();
    }
  }

  function updatePosition() {
    if (!popoverEl || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const popoverRect = popoverEl.getBoundingClientRect();
    const gap = 12;
    let top = rect.bottom + gap;
    let left = rect.right - popoverRect.width;

    const padding = 12;
    const maxLeft = window.innerWidth - popoverRect.width - padding;
    const minLeft = padding;
    if (left > maxLeft) left = maxLeft;
    if (left < minLeft) left = minLeft;

    if (top + popoverRect.height > window.innerHeight - padding) {
      top = rect.top - popoverRect.height - gap;
    }
    if (top < padding) top = padding;

    popoverEl.style.top = `${Math.max(top, padding)}px`;
    popoverEl.style.left = `${left}px`;
  }

  function ensureElements() {
    if (!popoverEl) {
      popoverEl = document.createElement("div");
      popoverEl.className = "user-popover";
      popoverEl.setAttribute("role", "dialog");
      popoverEl.setAttribute("aria-label", "Профиль сотрудника");
      document.body.appendChild(popoverEl);
    }
    if (!backdropEl) {
      backdropEl = document.createElement("div");
      backdropEl.className = "user-popover-backdrop";
      document.body.appendChild(backdropEl);
    }
  }

  function open(nextAnchorEl) {
    ensureElements();
    anchorEl = nextAnchorEl || anchorEl;
    if (isOpen) {
      close();
      return;
    }
    if (!anchorEl) return;
    renderProfile(getProfile?.());
    isOpen = true;
    popoverEl?.classList.add("open");
    backdropEl?.classList.add("open");
    updatePosition();
    document.addEventListener("click", handleOutsideClick);
    document.addEventListener("keydown", handleKeydown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
  }

  return { open, close, isOpen: () => isOpen };
}
