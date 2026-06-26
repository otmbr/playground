# GRAVASTAR LAB

**Collapse. Bounce. Universe.**

An interactive Three.js / TypeScript audiovisual toy model exploring **gravastar
formation**, black-hole alternatives, and a *mini Big Bang inside a collapsing
star*. Steer the collapse of a massive star and decide its fate: an ordinary
star, a classical black hole — or a **gravastar**, an ultra-compact object that
looks like a black hole from outside but hides an expanding de Sitter-like
interior.

> Inspired by the theoretical work of **Daniel Jampolski & Luciano Rezzolla**,
> *"Formation of gravastars"*, Phys. Rev. D 113, L121502 (2026)
> ([arXiv:2509.15302](https://arxiv.org/abs/2509.15302)).

## ⚠️ Scientific honesty

This is an **interactive visual model, not a numerical relativity simulation**.
Gravastars are **hypothetical** and have **not been observationally confirmed**.
Every major claim in the UI carries a label (`Accepted` / `Theoretical` /
`Speculative` / `Visual Metaphor`), and the outcome thresholds are artistic
toy-model values inspired by the literature — not physical predictions.

## Run it

```bash
npm install
npm run dev      # local dev server
npm run build    # type-check + production build into dist/
npm run preview  # preview the production build
```

Open the dev URL, press **Enter the Lab** (this also unlocks Web Audio, which
requires a user gesture), then steer the collapse.

## What's implemented

- **Toy physics model** — real Schwarzschild radius & compactness, plus a
  qualitative outcome resolver (`src/core/PhysicsToyModel.ts`).
- **State machine first** — a tiny observable store drives everything visual and
  sonic (`src/core/SimulationState.ts`).
- **Three scenes / outcomes** — collapsing star, classical black hole (event
  horizon + photon ring), and gravastar (vibrating shell + de Sitter core).
- **The Bounce** — the signature mini-Big-Bang moment: silence → flash →
  harmonic bloom → ringing shell.
- **Interior universe** — "inside is bigger than outside" via a scale switch
  (camera dolly through the shell, then a cosmological-scale scene).
- **Audiovisual engine** — Web Audio sub oscillator, collapse heartbeat, vacuum
  pad, quantum-noise glitch, and a bandpass **shell resonator**; an
  `AnalyserNode` feeds FFT bands back into the shaders (audio-reactive visuals).
- **Information Rain** — fragments freeze & fade at a horizon, or stick to the
  gravastar shell.
- **Explore vs Lab modes**, three **observer modes** (external / falling /
  interior), speculation-label legend, captions for accessibility.
- **PWA** — installable, offline shell via a service worker, shareable
  `#universe-seed` permalinks.

## Architecture

```
src/
  core/      App, state store, toy physics, math helpers
  objects/   CollapsingStar, SpacetimeGrid, DustSphere, EventHorizon,
             GravastarShell, DeSitterInterior, InformationRain, InteriorUniverse
  audio/     AudioEngine, ShellResonator, AudioReactiveAnalyser
  ui/        HUD, Controls, scientific-honesty labels
```

Built with [Three.js](https://threejs.org), [GSAP](https://gsap.com) and
[Vite](https://vitejs.dev). Per the concept's developer priorities: the state
machine came first, the shaders came last.
