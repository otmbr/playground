// LOW NOISE — keep the screen awake during a run.
// When the display sleeps, the browser suspends audio — so for a 90s run or a
// 5-minute walk we hold a Screen Wake Lock and re-acquire it if the page was
// backgrounded and comes back. No-op where the API is unavailable.

let lock = null;
let want = false;

async function request() {
  if (!want || lock) return;
  try {
    if ("wakeLock" in navigator) {
      lock = await navigator.wakeLock.request("screen");
      lock.addEventListener?.("release", () => { lock = null; });
    }
  } catch (_) { /* denied or unsupported — ignore */ }
}

export async function acquireWakeLock() {
  want = true;
  await request();
}

export function releaseWakeLock() {
  want = false;
  try { lock?.release?.(); } catch (_) {}
  lock = null;
}

// The lock is auto-released when the tab is hidden; re-acquire on return.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") request();
});
