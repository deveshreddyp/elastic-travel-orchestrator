/**
 * Elastic Travel Orchestrator — Mock API Server
 *
 * Deterministic, always-valid mock data. All responses < 50ms.
 * Runs on port 4001 — zero external dependency during demo.
 *
 * Endpoints:
 *   GET  /health                    — Health check
 *   GET  /transit/status            — Operational status + route list
 *   GET  /transit/alert             — GTFS-RT style disruption event
 *   GET  /transit/routes            — Available transit routes
 *   GET  /transit/alerts            — All active disruptions
 *   POST /transit/inject-disruption — Inject disruption (broadcasts to store)
 *   POST /transit/disrupt           — Legacy inject endpoint
 *   POST /transit/reset             — Reset all disruptions
 *   GET  /ebike/availability        — Seeded static e-bike station data
 *   GET  /ebike/stations            — All e-bike stations
 *   GET  /rideshare/estimate        — Mock rideshare cost estimate
 *   GET  /transit                   — Directions-style transit response
 *   GET  /ebike                     — Directions-style e-bike response
 */

const express = require("express");
const cors = require("cors");

const app = express();
const PORT = 4001;

app.use(cors());
app.use(express.json());

// ─── In-Memory State ─────────────────────────────────────────────────

let activeDisruptions = [];

const TRANSIT_ROUTES = [
  { id: "route-1", name: "Bus 1 — California", mode: "BUS", active: true },
  { id: "route-5", name: "Bus 5 — Fulton", mode: "BUS", active: true },
  { id: "route-14", name: "Bus 14 — Mission", mode: "BUS", active: true },
  { id: "route-22", name: "Bus 22 — Fillmore", mode: "BUS", active: true },
  { id: "route-38", name: "Bus 38 — Geary", mode: "BUS", active: true },
  { id: "route-N", name: "N-Judah Light Rail", mode: "RAIL", active: true },
  { id: "route-BART", name: "BART — Downtown", mode: "RAIL", active: true },
];

// Seeded static e-bike stations (deterministic, same every run)
const EBIKE_STATIONS = [
  {
    id: "s1",
    name: "Farmers Market Stand",
    lat: 37.77,
    lng: -122.41,
    bikes: 3,
    costPerMin: 0.15,
    bikes_available: 3,
    docks_available: 5,
    cost_per_min_cents: 15,
  },
  {
    id: "s2",
    name: "Museum Row",
    lat: 37.785,
    lng: -122.4008,
    bikes: 5,
    costPerMin: 0.15,
    bikes_available: 5,
    docks_available: 7,
    cost_per_min_cents: 15,
  },
  {
    id: "s3",
    name: "Downtown Hub",
    lat: 37.7879,
    lng: -122.4074,
    bikes: 8,
    costPerMin: 0.15,
    bikes_available: 8,
    docks_available: 2,
    cost_per_min_cents: 15,
  },
  {
    id: "s4",
    name: "Rooftop Bar Zone",
    lat: 37.7899,
    lng: -122.4104,
    bikes: 2,
    costPerMin: 0.15,
    bikes_available: 2,
    docks_available: 8,
    cost_per_min_cents: 15,
  },
];

// ─── Health Check ────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ status: "healthy", service: "elastic-mock-api", port: PORT });
});

// ─── Transit Endpoints ──────────────────────────────────────────────

/**
 * GET /transit/status
 * Returns operational status and short route IDs.
 */
app.get("/transit/status", (req, res) => {
  res.json({
    status: "operational",
    routes: ["1", "5", "14", "38"],
  });
});

/**
 * GET /transit/alert
 * Returns a mock GTFS-RT style disruption event.
 * Always returns a valid, deterministic event.
 */
app.get("/transit/alert", (req, res) => {
  const mockAlert = {
    id: "alert-gtfs-001",
    type: "TRANSIT_DELAY",
    severity: "MINOR",
    affectedRoutes: ["route-14", "route-38"],
    affectedModes: ["TRANSIT"],
    delayMinutes: 8,
    timestamp: new Date().toISOString(),
    source: "LIVE_API",
    gtfsRealtimeHeader: {
      gtfsRealtimeVersion: "2.0",
      incrementality: "FULL_DATASET",
      timestamp: Math.floor(Date.now() / 1000),
    },
    alert: {
      activePeriod: [
        {
          start: Math.floor(Date.now() / 1000),
          end: Math.floor(Date.now() / 1000) + 3600,
        },
      ],
      informedEntity: [
        { routeId: "route-14", routeType: 3 },
        { routeId: "route-38", routeType: 3 },
      ],
      cause: "CONSTRUCTION",
      effect: "SIGNIFICANT_DELAYS",
      headerText: {
        translation: [
          { text: "Delays on routes 14 and 38 due to construction", language: "en" },
        ],
      },
    },
  };

  // If there are injected disruptions, return the latest one instead
  if (activeDisruptions.length > 0) {
    const latest = activeDisruptions[activeDisruptions.length - 1];
    res.json({
      ...latest,
      gtfsRealtimeHeader: mockAlert.gtfsRealtimeHeader,
    });
  } else {
    res.json(mockAlert);
  }
});

app.get("/transit/routes", (req, res) => {
  res.json({
    routes: TRANSIT_ROUTES,
    timestamp: new Date().toISOString(),
  });
});

app.get("/transit/alerts", (req, res) => {
  res.json({
    alerts: activeDisruptions,
    active_count: activeDisruptions.length,
    timestamp: new Date().toISOString(),
  });
});

/**
 * POST /transit/inject-disruption
 * Accepts { type, severity } and stores in-memory.
 * Never fails — always returns valid data.
 */
app.post("/transit/inject-disruption", (req, res) => {
  const { type, severity, affectedRoutes, affectedModes, delayMinutes } = req.body;

  const disruption = {
    id: `disrupt-${Date.now()}`,
    type: type || "TRANSIT_DELAY",
    severity: severity || "MAJOR",
    affectedRoutes: affectedRoutes || ["route-14", "route-38"],
    affectedModes: affectedModes || ["TRANSIT"],
    delayMinutes: delayMinutes || 15,
    timestamp: new Date().toISOString(),
    source: "DEMO_INJECT",
  };

  activeDisruptions.push(disruption);

  // If full line cancellation, mark affected routes inactive
  if (type === "LINE_CANCELLATION") {
    const affected = new Set(disruption.affectedRoutes);
    TRANSIT_ROUTES.forEach((route) => {
      if (affected.has(route.id)) {
        route.active = false;
      }
    });
  }

  res.json({ status: "disruption_injected", disruption });
});

// Legacy inject endpoint (kept for backward compat)
app.post("/transit/disrupt", (req, res) => {
  const { type, affected_routes, severity, delay_minutes } = req.body;

  const disruption = {
    id: `disrupt-${Date.now()}`,
    type: type || "LINE_CANCELLATION",
    severity: severity || "CRITICAL",
    affected_routes: affected_routes || TRANSIT_ROUTES.map((r) => r.id),
    delay_minutes: delay_minutes || null,
    timestamp: new Date().toISOString(),
    source: "DEMO_INJECT",
  };

  activeDisruptions.push(disruption);

  if (type === "LINE_CANCELLATION") {
    const affected = new Set(disruption.affected_routes);
    TRANSIT_ROUTES.forEach((route) => {
      if (affected.has(route.id)) {
        route.active = false;
      }
    });
  }

  res.json({ status: "disruption_injected", disruption });
});

// Reset endpoint for demo re-runs
app.post("/transit/reset", (req, res) => {
  activeDisruptions = [];
  TRANSIT_ROUTES.forEach((route) => (route.active = true));
  res.json({ status: "reset", message: "All disruptions cleared" });
});

/**
 * GET /transit (directions-style)
 * Returns mock transit leg data for route matrix building.
 */
app.get("/transit", (req, res) => {
  const { from_lat, from_lng, to_lat, to_lng } = req.query;
  const dist =
    from_lat && to_lat
      ? haversine(parseFloat(from_lat), parseFloat(from_lng), parseFloat(to_lat), parseFloat(to_lng))
      : 3;
  const durationSec = Math.round(dist * 300); // ~5 min/km by transit
  const costCents = Math.round(275 + dist * 25); // base fare + per-km

  res.json({
    costCents,
    durationSec,
    polyline: "",
    available: true,
    mode: "TRANSIT",
  });
});

// ─── E-Bike / Micro-mobility Endpoints ──────────────────────────────

/**
 * GET /ebike/availability
 * Seeded static JSON — same every time for deterministic demo.
 */
app.get("/ebike/availability", (req, res) => {
  const { lat, lng, radius_km } = req.query;

  let filtered = EBIKE_STATIONS;
  if (lat && lng) {
    const userLat = parseFloat(lat);
    const userLng = parseFloat(lng);
    const maxRadius = parseFloat(radius_km) || 2;
    filtered = EBIKE_STATIONS.filter((station) => {
      const dist = haversine(userLat, userLng, station.lat, station.lng);
      return dist <= maxRadius;
    });
  }

  res.json({
    stations: filtered,
    total_bikes: filtered.reduce((sum, s) => sum + s.bikes, 0),
    timestamp: new Date().toISOString(),
  });
});

app.get("/ebike/stations", (req, res) => {
  res.json({
    stations: EBIKE_STATIONS,
    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /ebike (directions-style)
 * Returns mock e-bike leg data for route matrix building.
 */
app.get("/ebike", (req, res) => {
  const { from_lat, from_lng, to_lat, to_lng } = req.query;
  const dist =
    from_lat && to_lat
      ? haversine(parseFloat(from_lat), parseFloat(from_lng), parseFloat(to_lat), parseFloat(to_lng))
      : 2;
  const durationSec = Math.round(dist * 200); // ~3.3 min/km by e-bike
  const costCents = Math.round(dist * 50); // $0.50 / km

  res.json({
    costCents,
    durationSec,
    polyline: "",
    available: true,
    mode: "EBIKE",
  });
});

// ─── Rideshare Mock ─────────────────────────────────────────────────

app.get("/rideshare/estimate", (req, res) => {
  const { from_lat, from_lng, to_lat, to_lng } = req.query;
  const distance =
    from_lat && to_lat
      ? haversine(parseFloat(from_lat), parseFloat(from_lng), parseFloat(to_lat), parseFloat(to_lng))
      : 5;
  const estimatedCents = Math.round(500 + 150 * distance);

  res.json({
    provider: "MockRide",
    estimated_cost_cents: estimatedCents,
    estimated_duration_sec: Math.round(distance * 180),
    surge_multiplier: 1.0,
    timestamp: new Date().toISOString(),
  });
});

// ─── Helpers ────────────────────────────────────────────────────────

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Start Server ───────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`[MOCK-API] Elastic mock server running on port ${PORT}`);
  console.log(`[MOCK-API] Transit routes: ${TRANSIT_ROUTES.length}`);
  console.log(`[MOCK-API] E-bike stations: ${EBIKE_STATIONS.length}`);
  console.log(`[MOCK-API] All responses are deterministic and < 50ms`);
});
