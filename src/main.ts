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

// Collapsible HUD / control panels. On phones both panels start collapsed so
// the star in the center is never hidden; a tap on the chevron expands them.
function setPanelCollapsed(panel: HTMLElement, collapsed: boolean): void {
  panel.classList.toggle("collapsed", collapsed);
  const toggle = panel.querySelector<HTMLButtonElement>(".panel-toggle");
  if (toggle) {
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.textContent = collapsed ? "▸" : "▾";
  }
}
const panels = Array.from(document.querySelectorAll<HTMLElement>(".panel"));
for (const btn of document.querySelectorAll<HTMLButtonElement>(".panel-toggle")) {
  btn.addEventListener("click", () => {
    const panel = btn.closest<HTMLElement>(".panel");
    if (panel) setPanelCollapsed(panel, !panel.classList.contains("collapsed"));
  });
}
const isMobile = window.matchMedia("(max-width: 760px)");
function applyDefaultCollapse(): void {
  for (const panel of panels) setPanelCollapsed(panel, isMobile.matches);
}
applyDefaultCollapse();
isMobile.addEventListener("change", applyDefaultCollapse);

// Register the offline service worker (PWA). Ignored in dev where the file may
// be absent; only meaningful for the built site.
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      /* offline support is optional */
    });
  });
}
