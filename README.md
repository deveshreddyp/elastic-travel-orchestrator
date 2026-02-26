# 🚀 Elastic Travel Orchestrator

> **AMD Slingshot Hackathon — Theme 7: Consumer**
>
> A real-time travel companion that dynamically replans multi-stop itineraries when disruptions occur — within budget and time constraints, in under 3 seconds.

---

## Quick Start

```bash
# Clone and start everything with one command
docker compose up --build
```

| Service       | URL                          | Description                       |
|---------------|------------------------------|-----------------------------------|
| **Frontend**  | http://localhost:5173        | React PWA — main app UI           |
| **Backend**   | http://localhost:8000        | FastAPI — routing + replan engine  |
| **Mock API**  | http://localhost:4001        | Express — transit & e-bike mocks  |
| **Redis**     | redis://localhost:6379       | In-memory state store             |

## Configuration

1. Copy the env template:
   ```bash
   cp backend/.env.example backend/.env
   ```
2. Add your API keys to `backend/.env`:
   - `GOOGLE_MAPS_API_KEY` — [Google Maps Platform](https://console.cloud.google.com/)
   - `OPENWEATHER_API_KEY` — [OpenWeatherMap](https://openweathermap.org/api)

## Architecture

```
┌──────────────┐    WebSocket     ┌──────────────────┐     ┌──────────────┐
│   Frontend   │◄────────────────►│     Backend      │────►│    Redis 7   │
│  React + Vite│                  │  FastAPI + OR-Tools│    │  State Store │
└──────────────┘                  │  + scikit-learn   │    └──────────────┘
                                  └────────┬─────────┘
                                           │
                          ┌────────────────┼────────────────┐
                          ▼                ▼                ▼
                   Google Maps API   OpenWeather API   Mock API (4001)
```

## Tech Stack

| Layer            | Technology                        |
|------------------|-----------------------------------|
| Frontend         | React 18, Zustand, Vite, Socket.io |
| Backend          | FastAPI, Python 3.11, uvicorn      |
| Routing Solver   | Google OR-Tools (CP-SAT)           |
| State Store      | Redis 7                            |
| ML Inference     | scikit-learn, joblib               |
| Real-time        | Socket.io (WebSocket)              |
| Maps             | Google Maps JavaScript API v3      |
| Containerization | Docker Compose                     |

## Project Structure

```
elastic-travel-orchestrator/
├── docker-compose.yml
├── frontend/
│   └── src/
│       ├── components/       # React UI components
│       ├── store/            # Zustand state management
│       ├── hooks/            # Custom hooks (socket, itinerary)
│       └── types/            # Shared TypeScript interfaces
├── backend/
│   ├── api/                  # FastAPI route handlers
│   ├── engine/               # Replan algorithm + routing solver
│   ├── ml/                   # Friction ML model
│   └── redis/                # Redis state management
├── mock-api/                 # Express mock server (transit + e-bike)
└── tests/                    # pytest + Playwright E2E
```

## Demo Script (60-Second Knockout)

1. **T+0:00** — Show Maya's loaded itinerary. Budget: $7.50/$20. All friction: LOW.
2. **T+0:10** — "A transit strike hits the city."
3. **T+0:12** — Click the **🔴 TRIGGER DISRUPTION** button.
4. **T+0:13** — DisruptionCard animates in: *"Recalculating..."*
5. **T+0:15** — New itinerary snaps in. Rooftop Bar struck through. E-bike leg appears. Budget: $15/$20.
6. **T+0:20** — Read the Disruption Card: *"Rooftop Bar removed — budget preserved."*
7. **T+0:30** — 🎉 Applause.

## License

MIT — AMD Slingshot Hackathon 2025
