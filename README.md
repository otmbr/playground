# LOW NOISE

**A playable sound ritual for a world that is too loud.**
*Play less. Feel more. — Music from below the noise.*

LOW NOISE is an interactive music game where you don't get **louder** — you make
the world **quieter**. Your environment becomes the raw material; your job is to
pull a clean signal out of the chaos and **drop into LOW**.

See [`CONCEPT.md`](CONCEPT.md) for the full vision. This repo contains a playable
**MVP** with two modes:

- **LOW RUN** — the 90-second focus run. Five interactions, synth sound set,
  shareable loop + Noise Report.
- **CITY DUB** — walk for 5 minutes; the app **auto-detects** your surroundings
  (tempo from your footstep cadence, key from ambient pitch, events from
  onsets) and composes evolving dub loops in real time — fully automatic.

Runs in any modern browser, **including Safari / iOS** (uses `webkitAudioContext`,
mp4/aac recording fallback, prefixed CSS).

## Run it

It's a static web app (no build step), but it needs to be **served over HTTP**
(ES modules + microphone + device sensors don't work from `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000 on your phone or desktop
```

Best on a **phone with headphones** — tilt, touch, and stillness are the
controls. On desktop, drag = tilt, click = tap, drag = swipe.

> Microphone access powers the **SCAN** phase. Audio is analysed *locally* into
> an abstract "noiseprint" and the stream is dropped immediately — nothing is
> recorded or uploaded. If you deny the mic, the game falls back to a neutral
> profile.

## How to play (LOW RUN)

1. Press **REDUCE**. The app briefly scans your surroundings → `NOISEPRINT`.
2. You **DESCEND** into a noisy sound tunnel.
3. **FILTER** the noise with five interactions — stillness is an action:

   | Gesture | Effect |
   | --- | --- |
   | Tilt L/R | move the filter lens |
   | Tilt F/B | change the depth / resonance |
   | Hold still | stabilise the signal |
   | Slow swipe | pull interference out |
   | Tap | remove a digital artifact |
   | Two fingers | open dub echo |

4. Hold the signal clean (~78%) long enough and you **DROP INTO LOW** — the
   highs fall away, the sub blooms: `LOW FOUND`.
5. After 90s you get a **LOW NOISE REPORT** and a shareable loop.

## CITY DUB (auto)

Tap **CITY DUB**, allow the mic, put headphones in, and walk. No gestures —
the street plays it:

- **Tempo** comes from your **walking cadence** (onset-interval histogram).
- **Key** comes from the dominant **ambient pitch** (autocorrelation).
- **Events** (footsteps, traffic, voices, beeps) are detected as **onsets**
  (spectral flux) and routed by frequency band → kick / snare / hat.
- Onsets feed an **evolving per-band loop grid**: patterns reinforce as you
  repeat them and slowly fade, so the track keeps morphing with the city.

After 5 minutes you get a **track** + a shareable loop. Analysis is local and
realtime; the mic stream is never stored or uploaded.

> Semantic labels ("that's a bus / a bird") would need an on-device ML model
> (e.g. TF.js / YAMNet) — not in this MVP. The musical autodetection above runs
> with plain DSP.

## Project layout

```
index.html        screens + HUD + report
css/style.css     neon / radar visual language
js/audio.js       LOW RUN Web Audio engine — Kick, Sub, Pad, Noise, Echo, Glitch
js/input.js       tilt / hold / swipe / tap / stillness
js/scan.js        local mic analysis → noiseprint (never stored)
js/analysis.js    CITY DUB autodetection — onsets, tempo, pitch/key, band energy
js/dub.js         CITY DUB generative engine — evolving loops, bass, pad, dub echo
js/visual.js      canvas field — signal core, particles, bass waves, radar
js/game.js        LOW RUN state machine: SCAN → DESCEND → FILTER → LOW → REPORT
js/citydub.js     CITY DUB controller: LISTEN → BUILD → SETTLE → TRACK
js/main.js        bootstrap, mode select + share
```

## Status

MVP with **LOW RUN** + **CITY DUB**. Planned next from the concept: Deep Room,
Night Signal, Noise Duel.
