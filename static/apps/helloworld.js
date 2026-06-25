/* Hello World: the first vss.dev mini-app. A dialog that says hello and closes.

   The kernel loads this module on demand, clones the dialog shell, and calls
   mount(host, api). `host` is the dialog window element; `api.close()` tears the
   app down. Everything starts with a hello world.
*/
export default {
  meta: { title: "Hello World", kind: "dialog", maxWidth: 380 },

  mount(host, api) {
    host.querySelector(".dialog-body").textContent = "Hello World!";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dlg-btn primary";
    btn.textContent = "Close";
    btn.addEventListener("click", () => api.close());
    host.querySelector(".dialog-actions").appendChild(btn);
  },

  unmount() {},
};
