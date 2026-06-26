// LOW NOISE — bootstrap. Wires the DOM to the two modes (LOW RUN + CITY DUB).

import { Game } from "./game.js";
import { CityDub } from "./citydub.js";
import { acquireWakeLock, releaseWakeLock } from "./wakelock.js";

const $ = (id) => document.getElementById(id);

const dom = {
  canvas: $("field"),
  hud: { noiseprint: $("noiseprint"), state: $("state-label"), timer: $("timer") },
  callout: $("callout"),
  onReport: showReport,
};

let game = null;        // active mode controller (Game or CityDub)
let lastBlob = null;
let lastReport = null;

const screens = {
  start: $("screen-start"),
  report: $("screen-report"),
};

function show(screen) {
  for (const k in screens) screens[k].classList.add("hidden");
  if (screen) screens[screen].classList.remove("hidden");
}

function clearHud() {
  $("noiseprint").textContent = "";
  $("state-label").textContent = "";
  $("timer").textContent = "";
}

// ---- length selectors --------------------------------------------------
function setupSeg(id, attr) {
  const seg = $(id);
  seg.addEventListener("click", (e) => {
    const opt = e.target.closest(".seg-opt");
    if (!opt) return;
    seg.querySelectorAll(".seg-opt").forEach((o) => o.classList.remove("is-active"));
    opt.classList.add("is-active");
  });
  return () => {
    const active = seg.querySelector(".seg-opt.is-active") || seg.querySelector(".seg-opt");
    return parseInt(active.dataset[attr], 10);
  };
}
const lowrunSeconds = setupSeg("seg-lowrun", "sec");
const citydubMinutes = setupSeg("seg-citydub", "min");

// ---- run lifecycle -----------------------------------------------------
async function startRun() {
  show(null);
  clearHud();
  await acquireWakeLock();
  game = new Game(dom, { seconds: lowrunSeconds() });
  window.__g = game;
  try {
    await game.startRun();
  } catch (err) {
    console.error(err);
    releaseWakeLock();
    dom.hud.state.textContent = "AUDIO BLOCKED — TAP REDUCE AGAIN";
    show("start");
  }
}

async function startCityDub() {
  show(null);
  clearHud();
  await acquireWakeLock();
  game = new CityDub(dom, { seconds: citydubMinutes() * 60 });
  window.__g = game;
  try {
    await game.start();
  } catch (err) {
    console.error(err);
    releaseWakeLock();
    dom.hud.state.textContent =
      err.message === "microphone-required"
        ? "CITY DUB NEEDS THE MIC — ENABLE IT, THEN RETRY"
        : "AUDIO BLOCKED — TAP TO RETRY";
    show("start");
  }
}

function showReport(report, blob) {
  releaseWakeLock();
  clearHud(); // drop the leftover HUD line so it doesn't bleed under the report
  lastReport = report;
  lastBlob = blob;
  $("report-body").textContent = report.text;

  const playback = $("loop-playback");
  const caption = $("loop-caption");
  $("share-hint").textContent = "";

  if (blob && blob.size > 0) {
    playback.src = URL.createObjectURL(blob);
    playback.classList.remove("hidden");
    caption.textContent = "YOUR LOOP IS READY";
    $("btn-share").style.display = "";
  } else {
    playback.removeAttribute("src");
    playback.classList.add("hidden");
    caption.textContent = "NO LOOP CAPTURED ON THIS DEVICE";
    $("btn-share").style.display = "none";
  }
  show("report");
}

function shareText() {
  const code = lastReport?.code ? ` ${lastReport.code}` : "";
  return `This is what my world sounded like after I reduced it.${code} #LOWNOISE`;
}

async function shareLoop() {
  const hint = $("share-hint");
  hint.textContent = "";

  // No audio file — still let people share the result text/code.
  if (!lastBlob || lastBlob.size === 0) {
    if (navigator.share) {
      try { await navigator.share({ title: "LOW NOISE", text: shareText() }); return; }
      catch (e) { if (e.name === "AbortError") return; }
    }
    hint.textContent = "Sharing isn't available on this browser.";
    return;
  }

  const t = lastBlob.type || "";
  const ext = (t.includes("mp4") || t.includes("aac") || t.includes("m4a")) ? "m4a" : "webm";
  const name = `low-noise-${lastReport?.code || "loop"}.${ext}`;
  const file = new File([lastBlob], name, { type: lastBlob.type || "audio/webm" });

  // 1) Native share with the audio file (best on phones that support it).
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "LOW NOISE", text: shareText() });
      return;
    } catch (e) {
      if (e.name === "AbortError") return; // user dismissed the sheet
      // otherwise fall through to download
    }
  }

  // 2) Download fallback.
  try {
    const url = URL.createObjectURL(lastBlob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 8000);
    hint.textContent = "Loop saved. On iPhone: tap the player above, then Share to send it.";
    return;
  } catch (_) { /* fall through */ }

  // 3) Last resort.
  hint.textContent = "Long-press the player above to save your loop.";
}

$("btn-reduce").addEventListener("click", startRun);
$("btn-citydub").addEventListener("click", startCityDub);
$("btn-again").addEventListener("click", () => { releaseWakeLock(); game = null; show("start"); });
$("btn-share").addEventListener("click", shareLoop);

// Coming back from a locked/backgrounded screen: resume the audio graph.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !game) return;
  const ctx = game.ctx || (game.audio && game.audio.ctx);
  if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
});

// Idle ambient field behind the start screen.
import("./visual.js").then(({ Visual }) => {
  const idle = new Visual(dom.canvas);
  const idleParams = { filter: 0.4, depth: 0.3, stability: 0, noise: 0.5, echo: 0, bassCharge: 0.2, low: 0 };
  const idleInput = { tiltLR: 0, tiltFB: 0, stillness: 0.6, holding: false, twoFinger: false };
  let last = performance.now();
  function tick(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t;
    if (!game || game.state === "idle" || game.state === "report") {
      idle.render(idleParams, idleInput, 0.3, dt);
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
});
