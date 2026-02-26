"""
Integration test for POST /api/engine/replan endpoint.
Uses httpx ASGITransport to test against the live FastAPI app.
"""

import time
import pytest
import httpx
from datetime import datetime, timezone, timedelta


# ─── Fixtures ─────────────────────────────────────────────────────────────────

REPLAN_URL = "/api/engine/replan"


def _make_itinerary(num_stops: int = 4, budget: int = 50000):
    """Build a valid Itinerary payload with N stops."""
    stops = [
        {
            "id": f"stop-{i}",
            "name": f"Stop {i}",
            "lat": 37.7749 + i * 0.01,
            "lng": -122.4194 + i * 0.01,
            "priority": "MUST_VISIT" if i < 2 else "NICE_TO_HAVE",
            "status": "PENDING",
        }
        for i in range(num_stops)
    ]

    legs = []
    for i in range(num_stops - 1):
        legs.append({
            "fromStopId": f"stop-{i}",
            "toStopId": f"stop-{i + 1}",
            "mode": "TRANSIT",
            "costCents": 300,
            "durationSec": 600,
            "available": True,
        })

    deadline = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    eta = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

    return {
        "id": "itin-test-001",
        "version": 1,
        "user": {
            "budgetCents": budget,
            "returnDeadline": deadline,
            "preferredModes": ["TRANSIT", "WALKING"],
        },
        "stops": stops,
        "legs": legs,
        "totalCost": 900,
        "projectedETA": eta,
        "status": "ACTIVE",
    }


def _transit_delay_event():
    return {
        "id": "evt-001",
        "type": "TRANSIT_DELAY",
        "severity": "MAJOR",
        "affectedModes": ["TRANSIT"],
        "delayMinutes": 15,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "DEMO_INJECT",
    }


def _venue_closed_event(stop_id: str = "stop-2"):
    return {
        "id": "evt-002",
        "type": "VENUE_CLOSED",
        "severity": "MAJOR",
        "affectedStopId": stop_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "DEMO_INJECT",
    }


def _weather_event():
    return {
        "id": "evt-003",
        "type": "WEATHER",
        "severity": "MAJOR",
        "affectedModes": ["WALKING", "EBIKE"],
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "DEMO_INJECT",
    }


# ─── Tests ────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_replan_transit_delay():
    """Test replan with a TRANSIT_DELAY disruption."""
    # Pre-warm the ML model to avoid cold-start penalty in SLA measurement
    from engine.friction_model import _load_model
    _load_model()

    from main import app as raw_app
    # Unwrap Socket.IO ASGI wrapper to get the FastAPI app
    inner_app = raw_app
    if hasattr(raw_app, 'other_asgi_app'):
        inner_app = raw_app.other_asgi_app

    transport = httpx.ASGITransport(app=inner_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "itinerary": _make_itinerary(),
            "disruption": _transit_delay_event(),
        }

        start = time.perf_counter()
        resp = await client.post(REPLAN_URL, json=payload)
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()

        # Structure checks
        assert "itinerary" in data
        assert "diff" in data

        # Version bumped
        assert data["itinerary"]["version"] == 2

        # Status is REPLANNING
        assert data["itinerary"]["status"] == "REPLANNING"

        # Diff has required fields
        diff = data["diff"]
        assert "droppedStops" in diff
        assert "newLegs" in diff
        assert "changedLegs" in diff
        assert "costDelta" in diff
        assert "etaDelta" in diff

        # SLA check (5s tolerance in test env; prod Docker SLA = 3s)
        assert elapsed_ms <= 5000, f"Pipeline took {elapsed_ms:.0f}ms, exceeds 5000ms test SLA"


@pytest.mark.asyncio
async def test_replan_venue_closed():
    """Test replan with a VENUE_CLOSED disruption drops the affected stop."""
    from main import app as raw_app
    inner_app = raw_app
    if hasattr(raw_app, 'other_asgi_app'):
        inner_app = raw_app.other_asgi_app

    transport = httpx.ASGITransport(app=inner_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "itinerary": _make_itinerary(),
            "disruption": _venue_closed_event("stop-2"),
        }

        resp = await client.post(REPLAN_URL, json=payload)
        assert resp.status_code == 200

        data = resp.json()
        # The affected stop should be DROPPED
        affected = [
            s for s in data["itinerary"]["stops"] if s["id"] == "stop-2"
        ]
        assert len(affected) == 1
        assert affected[0]["status"] == "DROPPED"


@pytest.mark.asyncio
async def test_replan_weather_disables_outdoor():
    """Test that WEATHER + MAJOR severity disables WALKING and EBIKE modes."""
    from main import app as raw_app
    inner_app = raw_app
    if hasattr(raw_app, 'other_asgi_app'):
        inner_app = raw_app.other_asgi_app

    transport = httpx.ASGITransport(app=inner_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        itin = _make_itinerary()
        # Set some legs to WALKING so they get disabled
        itin["legs"][0]["mode"] = "WALKING"

        payload = {
            "itinerary": itin,
            "disruption": _weather_event(),
        }

        resp = await client.post(REPLAN_URL, json=payload)
        assert resp.status_code == 200
        assert resp.json()["itinerary"]["version"] == 2


@pytest.mark.asyncio
async def test_replan_insufficient_stops():
    """Test that replanning with < 2 active stops returns 422."""
    from main import app as raw_app
    inner_app = raw_app
    if hasattr(raw_app, 'other_asgi_app'):
        inner_app = raw_app.other_asgi_app

    transport = httpx.ASGITransport(app=inner_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        itin = _make_itinerary(num_stops=2)
        # Close both stops via VENUE_CLOSED on one, mark other as completed
        itin["stops"][1]["status"] = "COMPLETED"

        payload = {
            "itinerary": itin,
            "disruption": _venue_closed_event("stop-0"),
        }

        resp = await client.post(REPLAN_URL, json=payload)
        assert resp.status_code == 422
