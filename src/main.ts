import { App } from "./core/App.ts";

const canvas = document.getElementById("webgl") as HTMLCanvasElement;
const intro = document.getElementById("intro") as HTMLElement;
const enterButton = document.getElementById("enterButton") as HTMLButtonElement;

const app = new App(canvas);

// Audio can only start after a user gesture, so gate behind the intro screen.
enterButton.addEventListener("click", async () => {
  enterButton.disabled = true;
  enterButton.textContent = "Igniting…";
  await app.start();
  intro.classList.add("dismissed");
  setTimeout(() => intro.remove(), 700);
});

// Expose for debugging / console tinkering.
(window as any).gravastar = app;

// Register the offline service worker (PWA). Ignored in dev where the file may
// be absent; only meaningful for the built site.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is optional */
    });
  });
}
