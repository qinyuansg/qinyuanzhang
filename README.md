# 🏠 HomeHero — Daily Tasks for House Helpers

A simple, warm, mobile-first web app that helps a house helper know **what to do today**, tick tasks as done, and explain (in one tap) when something cannot be done — while giving the household full transparency on progress.

**Zero install, zero backend, zero cost.** Open `index.html` in any phone browser (or host it on GitHub Pages) and it just works. All data is saved on the device.

---

## Product vision (CPO perspective)

### The problem
Households coordinate daily chores with helpers through memory, paper lists, or long chat messages. Helpers — often with limited literacy and low tech confidence — struggle with text-heavy apps, and employers lack visibility into what got done and *why* something didn't.

### The users
| Persona | Need |
|---|---|
| **The Helper** (primary) | "Show me clearly what to do *now*, let me finish tasks with one tap, and make it feel good." |
| **The Employer** (secondary) | "Set up the routine once, then see progress and reasons transparently — without nagging." |

### Design principles
1. **Zero reading required to succeed.** Every task has a big emoji; every action is one large tap; reasons for "cannot do" are picture buttons, and typing is always optional.
2. **Time is the navigation.** The day flows visually Morning → Noon → Afternoon → Night with a colored timeline, a pulsing **NOW** badge, and auto-scroll to the current period. The helper never asks "what's next?"
3. **Every action gets a reward.** Apple-style spring animations, a drawn checkmark, a flying ⭐ +1, confetti bursts, haptic vibration, and a full celebration when the day is complete. Positive loops, never guilt.
4. **Honesty is a feature, not a failure.** "Cannot 😕" is a first-class button. Reporting a blocker (no supplies, machine broken…) earns a friendly "thank you for telling" — because a true status is more valuable than a fake tick.
5. **Transparency without surveillance.** The 7-day history shows completion bars and remarks for both parties. No GPS, no photos, no timers — trust-building, not policing.

---

## MVP features

- **⏰ Time-flow timeline** — tasks grouped Morning 🌅 / Noon ☀️ / Afternoon 🌤️ / Night 🌙 with a gradient timeline, current-period highlight, and auto-scroll.
- **✓ One-tap completion** — giant 58px tick button, springy checkmark draw, confetti, star reward, done timestamp. Tap again to undo mistakes.
- **😕 "Cannot do" flow** — bottom sheet with four picture reasons (🧴 no supplies, ⏰ no time, 🤒 not well, 🔧 broken) + optional free-text remark.
- **🎮 Gamification** — daily progress ring (Apple-Fitness style), ⭐ stars per task, 🔥 day streak for days where every task is actioned (done *or* honestly reported), escalating encouragement messages, full-screen celebration with confetti rain.
- **🔔 Reminders** — one tap on the bell enables browser notifications at the start of each period listing what's pending (fires while the app is open; see roadmap for push).
- **📅 Transparency** — 7-day history with completion bars, trophies for perfect days, and every "cannot do" reason surfaced with its remark.
- **⚙️ Employer setup** — manage the task list in-app: emoji picker, task name, time period. Changes apply instantly, persisted on-device.
- **📱 Installable** — web-app manifest lets it live on the home screen like a native app.

## Deliberate MVP cuts (roadmap)

| Next | Why later |
|---|---|
| Multi-language (Bahasa, Tagalog, Burmese, Sinhala…) | Highest-impact v1.1; the emoji-first UI keeps v1 usable meanwhile |
| Cloud sync + employer's own phone view | Needs accounts/backend; MVP proves the loop on one shared device |
| True push reminders (service worker / server push) | Browser limitations; in-app notifications validate the habit first |
| Photo proof (optional per task) | Useful but risks a surveillance feel — needs careful design |
| Weekly/rotating schedules (e.g. "change bedsheets — Mondays") | Data model supports it; UI simplicity first |
| Rewards marketplace (stars → real treats agreed with employer) | Requires employer buy-in mechanics |

## Success metrics
- **Activation:** helper completes ≥1 task on day one.
- **Habit:** ≥5 of 7 days with ≥80% tasks actioned (done *or* honestly skipped).
- **Trust:** share of skipped tasks carrying a reason (target: 100% — it's mandatory by design).
- **Delight proxy:** streak length distribution.

---

## Run & share it

**Easiest — share one file (works 100% offline):**
Send **`HomeHero.html`** to anyone over WhatsApp, email, or USB. They open it in any browser — no internet, no install, no other files needed. Progress saves on their own device. Rebuild it after changing the app:

```bash
python3 tools/build_single_file.py
```

**Hosted — GitHub Pages (offline after first visit):**
Enable Pages on this repo (Settings → Pages → deploy from branch), open the URL on the helper's phone, and "Add to Home Screen". A service worker (`sw.js`) caches the app, so it launches and works fully offline from then on.

**Local dev:**
```bash
python3 -m http.server 8000   # then visit http://localhost:8000
```

> Note: each device keeps its own data (tasks, progress, remarks) in `localStorage` — sharing the file shares the app, not the data. Cross-device sync is on the roadmap.

## Tech notes

- Vanilla HTML/CSS/JS — no build step, no dependencies, works offline after first load.
- Apple-inspired design system: iOS system palette, SF font stack, frosted-glass top bar, spring easing (`cubic-bezier(0.34, 1.56, 0.64, 1)`), 44pt+ touch targets, `prefers-reduced-motion` respected.
- State in `localStorage`: task list, per-day completion log (status/reason/remark/time), streak, reminder preference.
