// LOW NOISE — bootstrap. Wires the DOM to the LOW RUN game.

import { Game } from "./game.js";

const $ = (id) => document.getElementById(id);

const dom = {
  canvas: $("field"),
  hud: { noiseprint: $("noiseprint"), state: $("state-label"), timer: $("timer") },
  callout: $("callout"),
  onReport: showReport,
};

let game = null;
let lastBlob = null;

const screens = {
  start: $("screen-start"),
  report: $("screen-report"),
};

function show(screen) {
  for (const k in screens) screens[k].classList.add("hidden");
  if (screen) screens[screen].classList.remove("hidden");
}

async function startRun() {
  show(null);
  $("noiseprint").textContent = "";
  $("state-label").textContent = "";
  $("timer").textContent = "";
  game = new Game(dom);
  window.__g = game; // dev/debug handle
  try {
    await game.startRun();
  } catch (err) {
    console.error(err);
    dom.hud.state.textContent = "AUDIO BLOCKED — TAP REDUCE AGAIN";
    show("start");
  }
}

function showReport(report, blob) {
  lastBlob = blob;
  $("report-body").textContent = report.text;
  const playback = $("loop-playback");
  if (blob) {
    playback.src = URL.createObjectURL(blob);
    playback.classList.remove("hidden");
  } else {
    playback.classList.add("hidden");
  }
  show("report");
}

async function shareLoop() {
  if (!lastBlob) return;
  const ext = lastBlob.type.includes("mp4") ? "m4a" : "webm";
  const file = new File([lastBlob], `low-noise-loop.${ext}`, { type: lastBlob.type });
  const text = "This is what my world sounded like after I reduced it. #LOWNOISE";

  // Prefer native share (mobile); fall back to download.
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "LOW NOISE", text });
      return;
    } catch (_) { /* user cancelled → fall through to download */ }
  }
  const url = URL.createObjectURL(lastBlob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

$("btn-reduce").addEventListener("click", startRun);
$("btn-again").addEventListener("click", startRun);
$("btn-share").addEventListener("click", shareLoop);

// Idle ambient field behind the start screen.
import("./visual.js").then(({ Visual }) => {
  const idle = new Visual(dom.canvas);
  const idleParams = { filter: 0.4, depth: 0.3, stability: 0, noise: 0.5, echo: 0, bassCharge: 0.2, low: 0 };
  const idleInput = { tiltLR: 0, tiltFB: 0, stillness: 0.6, holding: false, twoFinger: false };
  let last = performance.now();
  function tick(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    // Only animate idle while no run is active.
    if (!game || game.state === "idle" || game.state === "report") {
      idle.render(idleParams, idleInput, 0.3, dt);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
});
