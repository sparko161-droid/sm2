export function createAppShell({ rootEl } = {}) {
  if (!rootEl) {
    throw new Error("rootEl is required for appShell");
  }

  let headerRoot = rootEl.querySelector("#app-header");
  if (!headerRoot) {
    headerRoot = document.createElement("div");
    rootEl.prepend(headerRoot);
  }
  if (!headerRoot.id) headerRoot.id = "app-header";
  headerRoot.classList.add("app-shell-header");

  let pageRoot = rootEl.querySelector("#app-page");
  if (!pageRoot) {
    pageRoot = document.createElement("div");
    rootEl.appendChild(pageRoot);
  }
  if (!pageRoot.id) pageRoot.id = "app-page";
  pageRoot.classList.add("app-shell-page");

  let headerVisible = true;

  function updateOffsets() {
    const height = headerVisible ? headerRoot.offsetHeight || 0 : 0;
    pageRoot.style.paddingTop = height ? `${height}px` : "0px";
    document.documentElement.style.setProperty("--header-height", `${height}px`);
  }

  const resizeObserver = new ResizeObserver(() => {
    updateOffsets();
  });

  resizeObserver.observe(headerRoot);

  function setHeaderVisible(isVisible) {
    headerVisible = Boolean(isVisible);
    headerRoot.style.display = headerVisible ? "" : "none";
    updateOffsets();
  }

  updateOffsets();

  return { headerRoot, pageRoot, setHeaderVisible };
}
