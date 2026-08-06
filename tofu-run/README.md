# TOFU RUN — Alpine Delivery ❄️

A playable 3D downhill snowboarding game for the browser, built with **three.js and vanilla JavaScript only** — no game engine, no build step, and **every asset (art and sound) is generated procedurally** at runtime.

Deliver the tofu down an endless alpine mountain. Carve the groomed piste, launch off glowing kickers, chain snow orbs into boost combos, thread the delivery gates — and never, ever let the rival catch you.

## Run locally

Any static file server works (ES modules require `http://`, not `file://`):

```bash
cd tofu-run

# option 1 — Python
python3 -m http.server 8080

# option 2 — Node
npx serve .
```

Then open **http://localhost:8080** in a modern browser (Chrome, Edge, Safari, Firefox).

No install, no dependencies to fetch — three.js is vendored in `js/vendor/`.

## Controls

| Input | Action |
| --- | --- |
| `A` / `←` | Carve onto the heel edge |
| `D` / `→` | Carve onto the toe edge |
| `SPACE` ×2 (double-tap) | Boost (needs ≥ 25% meter) |
| `R` | Restart |
| `P` / `Esc` | Pause |
| `M` | Mute |
| Touch | Hold left/right half of the screen to carve, double-tap to boost |

## How to play

- **Deliver tofu** — glowing gate pairs span the piste every ~500 m. Ride between the pylons to make the drop. Missing a gate lets the rival close in.
- **Snowboard feel** — steering is momentum-based: you lean onto an edge and the carve builds. Sharper carving scrubs more speed and throws a bigger fan of snow spray. No input gives you a clean downhill glide.
- **Boost** — collect glowing snow orbs to fill the meter, chain them fast for combo multipliers, then double-tap `SPACE`.
- **Kickers** — ramps on the piste launch you; airborne physics preserve your momentum while gravity brings you back.
- **Powder** — the deep snow beside the piste is slow and heavy. Escape route, not race line.
- **Hazards** — slow weaving skiers and pine trees end the run on contact. The rival snowboarder chasing you ends it another way.

Personal-best distance is stored locally, so the mountain remembers.

## Project structure

```
tofu-run/
├── index.html          # shell, HUD DOM, screens, import map
├── css/
│   └── style.css       # glass HUD, cinematic menus, animations
├── js/
│   ├── main.js         # game states, loop, chase camera, input, boost logic
│   ├── config.js       # all tuning constants + math helpers
│   ├── world.js        # endless terrain chunks, kickers, piste rails,
│   │                   #   village scenery, peaks, sky shader, lighting, snowfall
│   ├── player.js       # momentum carve physics + procedural rider mesh
│   ├── rival.js        # rubber-band chaser that follows your recorded line
│   ├── entities.js     # boost orbs, slow skiers, delivery gates, collisions
│   ├── particles.js    # pooled snow-spray / spark systems, speed lines
│   ├── audio.js        # 100% procedural WebAudio (wind, carve, chimes, pad…)
│   ├── hud.js          # HUD/DOM bindings
│   └── vendor/
│       └── three.module.js   # three.js r160 (vendored, no CDN needed)
└── README.md
```

## Technical notes

- The slope is an **analytic height field** — physics queries it exactly (no raycasts), and terrain chunks, kickers, glow rails and tree placement are all generated deterministically from it as you descend, then recycled behind you.
- Kickers are part of the height field: ride up the ramp and the ground simply falls away at the lip — launches come from real vertical velocity, not scripted jumps.
- The rival records your actual line and rides it a gap behind you, rubber-banding on your downhill speed; boosting stretches the gap, sloppy riding shrinks it.
- Audio is synthesized live: filtered-noise wind that follows your speed, carve scrape tied to edge pressure, pentatonic orb chimes that rise with your combo, and a quiet ambient pad underneath.
