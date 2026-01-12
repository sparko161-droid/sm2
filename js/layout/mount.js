export function mount(rootEl, viewEl) {
  if (!rootEl) return;
  rootEl.innerHTML = "";
  if (viewEl) {
    rootEl.appendChild(viewEl);
  }
}
