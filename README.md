# ⚡ Elastic — Travel Orchestrator

> **AMD Slingshot Hackathon · Theme 7: Consumer**  
> *Plan your day. We'll protect it.*

Elastic is an intelligent travel companion that eliminates cascading schedule failure. When disruption strikes — transit strikes, venue closures, weather events — Elastic silently recalculates your entire day in under 3 seconds, staying within your budget and getting you home on time. Every time.

---

## 🎬 Live Demo

| Before Disruption | After Elastic Replan |
|---|---|
| 4 stops · $7.50 · All routes clear | 3 stops · $15.00 · Home by 7:50 PM |
| Bus routes: ✅ | Transit strike: ❌ |
| Rooftop Bar: ✅ | Rooftop Bar: dropped (budget protected) |
| E-bike: — | E-bike added: Farmers Market → SFMOMA |
| Rideshare: — | Rideshare added: SFMOMA → Home |

**End-to-end replan: < 3 seconds. Zero manual intervention.**

---

## 🧠 How It Works

```
Disruption Event
      ↓
Redis Routing Graph Update       [≤ 50ms]
      ↓
Parallel API Fan-out             [≤ 800ms]
      ↓
OR-Tools CP-SAT Solver           [≤ 1200ms]
  (budget + ETA hard constraints)
      ↓
Priority-Weighted Stop Drop      [≤ 100ms]
  (Nice-to-Have first)
      ↓
Diff Computation                 [≤ 50ms]
      ↓
WebSocket Push → UI Update       [≤ 400ms]
──────────────────────────────────────────
Total: < 3,000ms guaranteed
```

---

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Zustand + Vite (PWA) |
| Styling | Tailwind CSS + Framer Motion |
| Map | Leaflet.js + CartoDB Dark Tiles |
| Routing | OSRM (open source, no API key) |
| Geocoding | Nominatim / OpenStreetMap |
| Backend | FastAPI (Python 3.11) |
| Solver | Google OR-Tools (CP-SAT) |
| ML | scikit-learn + joblib |
| State | Redis 7 |
| Realtime | Socket.io (WebSocket) |
| Infra | Docker Compose |

---

## 🚀 Setup — Step by Step

### Step 1 — Install Docker

**Windows (recommended — one command):**

Open **PowerShell as Administrator** and run:
```bash
winget install Docker.DockerDesktop
```
After install → **restart your PC** → open Docker Desktop → let it initialize.

> ⚠️ If Docker asks you to install WSL 2, run this in PowerShell as Administrator:
> ```bash
> wsl --install
> ```
> Then restart and reopen Docker Desktop.

**Or download directly:**
```
https://docs.docker.com/desktop/install/windows-install/
```

**Verify Docker is working:**
```bash
docker --version
docker run hello-world
```
You should see `Hello from Docker!` — you're good to go.

---

### Step 2 — Start Redis

```bash
docker run -d -p 6379:6379 --name elastic-redis redis
```

Verify Redis is running:
```bash
docker ps
```
You should see `elastic-redis` in the list with status `Up`.

---

### Step 3 — Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/elastic-travel-orchestrator.git
cd elastic-travel-orchestrator
```

---

### Step 4 — Set up environment

```bash
cp backend/.env.example backend/.env
```
Open `backend/.env` and add your OpenWeatherMap API key:
```
OPENWEATHER_API_KEY=your_key_here
```
> Get a free key at **openweathermap.org** — email signup only, no card required.  
> ⏳ Note: new keys take ~2 hours to activate. Get this early.

---

### Step 5 — Start the project

```bash
docker compose up --build
```
Wait until all services say `started` or `ready`. Keep this terminal running.

---

### Step 6 — Seed Maya's demo itinerary

Open a **new terminal** (keep Step 5 running) and run:
```bash
python backend/scripts/seed_maya.py
```
You should see:
```
✅ Maya's itinerary seeded into Redis (session: demo-maya-001)
```

---

### Step 7 — Open the app

Open your browser and go to:
```
http://localhost:5173
```

---

### Step 8 — Verify everything is green

Press **`Ctrl + Shift + C`** inside the app to open the system checklist:

```
✅ Redis connected
✅ Mock transit API (port 4001)
✅ Maya's session seeded
✅ ML model loaded
✅ OSRM route cache warm
```

When all 5 are green → **🏆 READY TO WIN** banner appears.

---

### ❗ If something is red

| Red item | Fix |
|---|---|
| Redis connected ❌ | Run Step 2 again. Check `docker ps` |
| Mock transit API ❌ | Make sure `docker compose up` is still running |
| Maya's session ❌ | Run Step 6 again |
| ML model ❌ | Check `backend/ml/friction_model.pkl` exists |
| Route cache ❌ | Run `python backend/scripts/demo_cache.py` |

---

## 🎮 Demo Mode

After first-time setup, every subsequent session just needs one command:

```bash
bash backend/scripts/demo_warmup.sh
```

This automatically:
- ✅ Starts all Docker services
- ✅ Seeds Maya's demo itinerary into Redis
- ✅ Pre-caches all OSRM routes (works fully offline)
- ✅ Runs the full test suite
- ✅ Prints **ELASTIC IS DEMO-READY** on success

### Triggering a disruption (live demo)
- Click the **⚡ floating button** (bottom-right corner)
- Hit **TRANSIT STRIKE**
- Watch Elastic replan in < 3 seconds

### Keyboard shortcuts
| Shortcut | Action |
|---|---|
| `Ctrl+Shift+D` | Toggle Demo Control Panel |
| `Ctrl+Shift+C` | Toggle Pre-Demo Checklist |

---

## 📁 Project Structure

```
elastic-travel-orchestrator/
├── docker-compose.yml
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── OnboardingFlow.tsx
│   │   │   ├── ActiveDayView.tsx
│   │   │   ├── MapLayer.tsx
│   │   │   ├── ItineraryTimeline.tsx
│   │   │   ├── BudgetMeter.tsx
│   │   │   ├── DeadlineCountdown.tsx
│   │   │   ├── DisruptionCard.tsx
│   │   │   ├── DemoControlPanel.tsx
│   │   │   ├── ChecklistPanel.tsx
│   │   │   └── AnimatedBackground.tsx
│   │   ├── store/
│   │   │   └── itineraryStore.ts
│   │   ├── hooks/
│   │   │   └── useSocket.ts
│   │   ├── types/
│   │   │   └── index.ts
│   │   └── styles/
│   │       ├── design-tokens.css
│   │       └── globals.css
│   └── package.json
├── backend/
│   ├── api/
│   │   └── routes.py
│   ├── engine/
│   │   └── elastic_replan.py
│   ├── ml/
│   │   └── friction_model.py
│   ├── redis/
│   │   └── state.py
│   ├── scripts/
│   │   ├── seed_maya.py
│   │   ├── demo_cache.py
│   │   ├── demo_warmup.sh
│   │   └── fallback_routes.json
│   ├── tests/
│   │   ├── test_constraint_budget.py
│   │   ├── test_constraint_eta.py
│   │   ├── test_drop_logic.py
│   │   ├── test_replan_latency.py
│   │   ├── test_api_fallback.py
│   │   └── test_solver_fallback.py
│   ├── requirements.txt
│   └── .env.example
└── mock-api/
    └── server.js
```

---

## ⚙️ Environment Variables

```env
# Weather (only external API key required)
OPENWEATHER_API_KEY=your_key_here
OPENWEATHER_CITY_ID=5391959

# Routing (no key — open source)
OSRM_BASE_URL=https://router.project-osrm.org
NOMINATIM_BASE_URL=https://nominatim.openstreetmap.org

# Redis
REDIS_URL=redis://localhost:6379

# Mock APIs (local)
MOCK_TRANSIT_URL=http://localhost:4001
MOCK_EBIKE_URL=http://localhost:4001

# Demo
DEMO_MODE=true
DEMO_SESSION_ID=demo-maya-001
```

---

## 🧪 Running Tests

```bash
# Backend tests
pytest backend/tests/ -v

# E2E tests
cd frontend && npx playwright test
```

---

## 📊 Performance SLAs

| Metric | Target | How Measured |
|---|---|---|
| End-to-end replan | < 3,000ms | Server timer: event → WebSocket push |
| UI notification | < 1,000ms | Client: event → DisruptionCard visible |
| Initial route gen | < 5,000ms | Submit → itinerary rendered |
| ML friction scoring | < 200ms | Full itinerary benchmark |
| Budget constraint | 100% — zero violations | Automated assertion on every replan |
| ETA constraint | 100% — zero violations | Automated assertion on every replan |

---

## 🛡️ Hard Constraints (Never Violated)

1. Recalculated total cost **must never exceed** user's stated budget
2. Projected arrival **must never exceed** user's stated return deadline
3. **Must Visit** stops dropped only after all **Nice to Have** stops are dropped AND hard constraints still cannot be satisfied

---

## 🗺️ The Elastic Day — Maya's Story

Maya plans a San Francisco day trip:
- 🏪 Ferry Building Farmers Market *(Must Visit)*
- 🎨 SFMOMA *(Must Visit)*
- 🍹 Rooftop Bar *(Nice to Have)*
- 💰 Budget: $20 · 🕗 Home by 8:00 PM

A transit strike hits. Every bus in the city goes down.

Elastic detects the disruption, silently recalculates, and within 3 seconds presents Maya with a new plan — e-bike to the museum, rideshare home, Rooftop Bar dropped to protect the budget. Still $15 of $20. Still home by 7:50 PM.

Maya never had to think about it.

---

## 👥 Team Orbit

| | Name |
|---|---|
| 🧑‍💻 | Harshith |
| 🧑‍💻 | Rohan |
| 🧑‍💻 | Devesh |

Built for the **AMD Slingshot Hackathon 2025** · Theme 7: Consumer

---

## 📄 License

MIT
