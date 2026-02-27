# ⚡ Elastic — 3-Minute Demo Script

## 🎬 Demo Flow

```
[0:00–0:30]  Hook         — The Problem
[0:30–1:00]  Onboarding   — Build Maya's Day
[1:00–1:30]  Active View  — Everything is Green
[1:30–2:15]  Disruption   — Transit Strike Hits
[2:15–2:45]  Replan       — < 3 Seconds
[2:45–3:00]  Close        — The Pitch
```

---

## 🎤 Script

### [0:00 – 0:30] The Hook

> *"You've planned the perfect day in San Francisco. Farmers Market in the morning, SFMOMA in the afternoon, Rooftop Bar for sunset. Budget: $20. Home by 8 PM. Everything lines up."*
>
> *"Then — transit strike. Every bus goes down. Most apps tell you: figure it out yourself."*
>
> *"Elastic doesn't. Elastic just fixes it."*

---

### [0:30 – 1:00] Onboarding — Build Maya's Day

> *"Here's Maya — a real user scenario."*

**→** Open `http://localhost:5173`

> *"She drops in her starting point, her stops, and her constraints."*

**→** Field 01: **"Home"**  
**→** Stops:
- "Ferry Building Farmers Market" → **Must Visit**
- "SFMOMA" → **Must Visit**
- "Rooftop Bar" → **Nice to Have**

**→** Budget: `20` · Return: `20:00` · Select **all transport modes**

> *"She hits Build My Day."*

**→** Click **Build My Day**

---

### [1:00 – 1:30] Active Day View — All Clear

> *"In under 5 seconds: full itinerary. 4 stops. $7.50 total. All routes clear."*

**→** Point to:
- 🗺️ **Map** — route plotted across SF
- 📋 **Timeline** — stops with ETAs
- 💰 **Budget Meter** — $7.50 / $20
- ⏱️ **Deadline Countdown** — plenty of buffer

> *"Everything is live. Real time."*

**→** `Ctrl+Shift+C` — show checklist (all 5 green ✅)

---

### [1:30 – 2:15] The Disruption

> *"It's 10 AM. Maya just left the house."*

**→** Click **⚡ floating button** (bottom-right)  
**→** Click **TRANSIT STRIKE**

> *"Every Muni bus in San Francisco just went offline. A normal app? You get a link to 511.org. You're on your own."*
>
> *"Watch what Elastic does."*

**→** Point at the **DisruptionCard** — instant, animated, via WebSocket

---

### [2:15 – 2:45] The Replan

> *"Under 3 seconds — done."*

| Before | After |
|--------|-------|
| 4 stops · $7.50 | 3 stops · $15.00 |
| Bus routes ✅ | Transit ❌ dropped |
| — | E-bike: Farmers Market → SFMOMA ✅ |
| — | Rideshare: SFMOMA → Home ✅ |
| Rooftop Bar ✅ | Rooftop Bar ❌ (budget protected) |

> *"Redis routing graph update. Parallel API fan-out. OR-Tools CP-SAT solver. Priority-weighted stop dropping — Nice to Have first. WebSocket push."*
>
> *"Maya still gets the Museum. Still gets the Market. Still home by 7:50 PM. Still under $20."*
>
> *"She never had to think about it."*

---

### [2:45 – 3:00] The Close

> *"That's Elastic. An AI travel companion that doesn't just plan your day — it protects it."*
>
> *"Plan smart. Travel elastic."*

---

## ✅ Pre-Demo Checklist

Run before going on stage:

```bash
bash backend/scripts/demo_warmup.sh
```

Then press `Ctrl+Shift+C` in the app — all 5 must be green:

- ✅ Redis connected
- ✅ Mock transit API (port 4001)
- ✅ Maya's session seeded
- ✅ ML model loaded
- ✅ OSRM route cache warm

---

## 🔑 Key Numbers

| Stat | Number |
|------|--------|
| End-to-end replan | **< 3 seconds** |
| UI notification | **< 1 second** |
| Budget violations | **Zero — guaranteed** |
| ETA violations | **Zero — guaranteed** |
| External API keys needed | **1** (free OpenWeatherMap) |

---

## ⌨️ Shortcuts

| Key | Action |
|-----|--------|
| `Ctrl+Shift+D` | Toggle Demo Control Panel |
| `Ctrl+Shift+C` | Toggle Pre-Demo Checklist |
