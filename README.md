# LOW NOISE

**A playable sound ritual for a world that is too loud.**
*Play less. Feel more. — Music from below the noise.*

LOW NOISE is an interactive music game where you don't get **louder** — you make
the world **quieter**. Your environment becomes the raw material; your job is to
pull a clean signal out of the chaos and **drop into LOW**.

See [`CONCEPT.md`](CONCEPT.md) for the full vision. This repo contains the
playable **MVP**: a single screen, the 90-second **LOW RUN** mode, five
interactions, the synth sound set, and a shareable loop + Noise Report.

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

## Project layout

```
index.html        screen + HUD + report
css/style.css     neon / radar visual language
js/audio.js       Web Audio engine — Kick, Sub, Pad, Noise, Echo, Glitch + recording
js/input.js       tilt / hold / swipe / tap / stillness
js/scan.js        local mic analysis → noiseprint (never stored)
js/visual.js      canvas field — signal core, particles, bass waves, radar
js/game.js        LOW RUN state machine: SCAN → DESCEND → FILTER → LOW → REPORT
js/main.js        bootstrap + share
```

## Status

MVP / LOW RUN only. Planned modes from the concept: Deep Room, City Dub,
Night Signal, Noise Duel.
