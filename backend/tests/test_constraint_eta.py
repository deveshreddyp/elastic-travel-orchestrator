"""
Test: ETA constraint is respected after replan.
Return deadline = 20:00 UTC, disruption adds 90-min delay.
Assert new projectedETA <= returnDeadline after replan.
"""

import pytest
import httpx
from datetime import datetime, timezone, timedelta


REPLAN_URL = "/api/engine/replan"


def _make_eta_critical_itinerary():
    """Itinerary with a tight 20:00 UTC deadline and transit legs."""
    today = datetime.now(timezone.utc).replace(hour=20, minute=0, second=0, microsecond=0)
    # If it's already past 20:00 UTC today, use tomorrow
    if datetime.now(timezone.utc) >= today:
        today += timedelta(days=1)

    deadline = today.isoformat()
    eta = (today - timedelta(minutes=30)).isoformat()  # Currently arriving 30 min early

    stops = [
        {"id": "start", "name": "Home", "lat": 37.7749, "lng": -122.4194,
         "priority": "MUST_VISIT", "status": "PENDING"},
        {"id": "stop-1", "name": "Farmers Market", "lat": 37.7700, "lng": -122.4130,
         "priority": "MUST_VISIT", "status": "PENDING"},
        {"id": "stop-2", "name": "Art Museum", "lat": 37.7851, "lng": -122.4008,
         "priority": "NICE_TO_HAVE", "status": "PENDING"},
        {"id": "stop-3", "name": "Rooftop Bar", "lat": 37.7899, "lng": -122.4104,
         "priority": "NICE_TO_HAVE", "status": "PENDING"},
    ]
    legs = [
        {"fromStopId": "start", "toStopId": "stop-1", "mode": "TRANSIT",
         "costCents": 275, "durationSec": 1080, "available": True},
        {"fromStopId": "stop-1", "toStopId": "stop-2", "mode": "TRANSIT",
         "costCents": 275, "durationSec": 960, "available": True},
        {"fromStopId": "stop-2", "toStopId": "stop-3", "mode": "TRANSIT",
         "costCents": 275, "durationSec": 840, "available": True},
    ]

    return {
        "id": "itin-eta-001",
        "version": 1,
        "user": {
            "budgetCents": 5000,
            "returnDeadline": deadline,
            "preferredModes": ["TRANSIT", "EBIKE", "RIDESHARE"],
        },
        "stops": stops,
        "legs": legs,
        "totalCost": 825,
        "projectedETA": eta,
        "status": "ACTIVE",
    }


def _90min_delay():
    return {
        "id": "evt-eta-001",
        "type": "TRANSIT_DELAY",
        "severity": "CRITICAL",
        "affectedModes": ["TRANSIT"],
        "delayMinutes": 90,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "DEMO_INJECT",
    }


def _get_inner_app():
    from main import app as raw_app
    inner = raw_app
    if hasattr(raw_app, "other_asgi_app"):
        inner = raw_app.other_asgi_app
    return inner


@pytest.mark.asyncio
async def test_eta_respected_after_90min_delay():
    """After a 90-min transit delay, the replanned ETA must not exceed the return deadline."""
    from engine.friction_model import _load_model
    _load_model()

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)

    itin = _make_eta_critical_itinerary()
    deadline_str = itin["user"]["returnDeadline"]

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "itinerary": itin,
            "disruption": _90min_delay(),
        }
        resp = await client.post(REPLAN_URL, json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        data = resp.json()
        new_eta_str = data["itinerary"]["projectedETA"]

        # Parse both as datetime for comparison
        def _parse(s):
            return datetime.fromisoformat(s.replace("Z", "+00:00"))

        new_eta = _parse(new_eta_str)
        deadline = _parse(deadline_str)

        assert new_eta <= deadline, (
            f"ETA constraint violated: projectedETA={new_eta.isoformat()} "
            f"exceeds deadline={deadline.isoformat()}"
        )
