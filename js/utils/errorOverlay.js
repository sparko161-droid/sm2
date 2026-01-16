
/**
 * Global Error Overlay
 * catches unhandled errors and shows a friendly UI to escape the "White Screen of Death".
 */
export function installGlobalErrorOverlay(options = {}) {
    const { onResetSession } = options;

    function showError(eventOrMsg, source, lineno, colno, error) {
        // Prevent recursive errors if overlay itself fails
        if (document.getElementById("global-error-overlay")) return;

        const overlay = document.createElement("div");
        overlay.id = "global-error-overlay";
        overlay.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
        background: #1a1a1a; color: #fff; z-index: 99999;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        font-family: system-ui, -apple-system, sans-serif; padding: 20px; text-align: center;
      `;

        let msg = eventOrMsg;
        let stack = "";

        // Handle PromiseRejectionEvent
        if (eventOrMsg?.reason) {
            msg = eventOrMsg.reason.message || String(eventOrMsg.reason);
            stack = eventOrMsg.reason.stack || "";
        }
        // Handle ErrorEvent or manual error arguments
        else if (error) {
            msg = error.message || String(error);
            stack = error.stack || "";
        }
        else if (eventOrMsg?.message) {
            msg = eventOrMsg.message;
            stack = eventOrMsg.error?.stack || "";
        }

        overlay.innerHTML = `
        <h2 style="color: #ff6b6b; margin-bottom: 20px;">Ошибка приложения</h2>
        <p style="margin-bottom: 30px; font-size: 1.1em;">Что-то пошло не так. Попробуйте обновить страницу.</p>
        
        <div style="background: #333; color: #ccc; padding: 15px; border-radius: 8px; width: 100%; max-width: 600px; overflow: auto; max-height: 200px; text-align: left; margin-bottom: 30px; font-family: monospace; font-size: 0.9em;">
          <div style="color: #fff; font-weight: bold; margin-bottom: 5px;">${msg}</div>
          <pre style="margin: 0;">${stack}</pre>
        </div>
        
        <div style="display: flex; gap: 15px;">
           <button id="geo-reload" style="padding: 10px 20px; cursor: pointer; background: #fff; color: #000; border: none; border-radius: 4px; font-weight: bold;">
             Обновить страницу
           </button>
           <button id="geo-reset" style="padding: 10px 20px; cursor: pointer; background: #c0392b; color: #fff; border: none; border-radius: 4px; font-weight: bold;">
             Выйти и очистить данные
           </button>
        </div>
      `;

        document.body.appendChild(overlay);

        document.getElementById("geo-reload").onclick = () => window.location.reload();
        document.getElementById("geo-reset").onclick = () => {
            if (onResetSession) onResetSession();
            // Fallback cleanup
            localStorage.clear();
            sessionStorage.clear();
            document.cookie.split(";").forEach(c => {
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
            });
            window.location.hash = "#/login";
            window.location.reload();
        };
    }

    window.addEventListener("error", showError);
    window.addEventListener("unhandledrejection", showError);

    // Test hook
    window.__triggerFakeError = () => { throw new Error("Test Error Overlay"); };
}
