/* Install: put vss.dev on your device as an app.

   Where the browser exposes the PWA install prompt (Chromium), the kernel has
   already stashed the beforeinstallprompt event as window.__installPrompt and
   the Install button replays it. Browsers without the prompt API (iOS Safari,
   Firefox) get pointed at their own install/add-to-home-screen menu instead.
*/

// Already running as an installed app? (navigator.standalone is iOS Safari's
// pre-standard spelling of display-mode: standalone.)
const isStandalone = () =>
  matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;

const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1); // iPadOS reports as Mac

export default {
  meta: { title: "Install vss.dev", kind: "dialog", maxWidth: 400 },

  mount(host, api) {
    const body = host.querySelector(".dialog-body");
    const actions = host.querySelector(".dialog-actions");

    const button = (label, primary, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dlg-btn" + (primary ? " primary" : "");
      b.textContent = label;
      b.addEventListener("click", onClick);
      actions.appendChild(b);
      return b;
    };
    const say = (msg) => { body.textContent = msg; };

    // If the install happens while the dialog is open (from our button or the
    // browser's own UI), confirm it. Cleaned up in unmount.
    this._onInstalled = () => {
      say("Installed! Look for the vss.dev icon on your home screen or app list.");
      actions.textContent = "";
      button("Close", true, () => api.close());
    };
    window.addEventListener("appinstalled", this._onInstalled);

    if (isStandalone()) {
      say("vss.dev is already installed: you are running the app right now.");
      button("Close", true, () => api.close());
      return;
    }

    const prompt = window.__installPrompt;
    if (prompt) {
      say("Install vss.dev on this device? It gets its own icon and opens in its own window, desktop and all.");
      button("Not now", false, () => api.close());
      const install = button("Install", true, () => {
        install.disabled = true;
        window.__installPrompt = null; // a prompt event is single-use
        prompt.prompt();
        prompt.userChoice.then((choice) => {
          if (choice.outcome !== "accepted") {
            say("No problem. You can reopen this app whenever you change your mind.");
            install.remove();
          }
          // Accepted: the appinstalled listener above updates the dialog.
        });
      });
      return;
    }

    if (isIOS()) {
      say("On iPhone and iPad, Safari handles installs: tap the Share button, then \"Add to Home Screen\".");
    } else {
      say("Your browser is not offering an install right now. In Chrome or Edge, look for \"Install app\" (or \"Add to Home screen\") in the browser menu. If you already installed vss.dev, this is expected.");
    }
    button("Close", true, () => api.close());
  },

  unmount() {
    if (this._onInstalled) window.removeEventListener("appinstalled", this._onInstalled);
  },
};
