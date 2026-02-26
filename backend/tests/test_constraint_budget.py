"""
Test: Budget constraint is respected after replan.
Budget = $20 (2000 cents), 3 stops, transit strike forces e-bike + rideshare reroute.
Assert totalCost <= 2000 cents after replan.
"""

import pytest
import httpx
from datetime import datetime, timezone, timedelta


REPLAN_URL = "/api/engine/replan"


def _make_tight_budget_itinerary():
    """3 stops, $20 budget, all-transit legs — transit strike will force reroute."""
    stops = [
        {"id": "home", "name": "Home", "lat": 37.7749, "lng": -122.4194,
         "priority": "MUST_VISIT", "status": "PENDING"},
        {"id": "farmers-market", "name": "Farmers Market", "lat": 37.7700, "lng": -122.4130,
         "priority": "MUST_VISIT", "status": "PENDING"},
        {"id": "rooftop-bar", "name": "Rooftop Bar", "lat": 37.7899, "lng": -122.4104,
         "priority": "NICE_TO_HAVE", "status": "PENDING"},
    ]
    legs = [
        {"fromStopId": "home", "toStopId": "farmers-market", "mode": "TRANSIT",
         "costCents": 275, "durationSec": 1080, "available": True},
        {"fromStopId": "farmers-market", "toStopId": "rooftop-bar", "mode": "TRANSIT",
         "costCents": 275, "durationSec": 840, "available": True},
    ]
    deadline = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    eta = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    return {
        "id": "itin-budget-001",
        "version": 1,
        "user": {
            "budgetCents": 2000,
            "returnDeadline": deadline,
            "preferredModes": ["TRANSIT", "EBIKE", "RIDESHARE"],
        },
        "stops": stops,
        "legs": legs,
        "totalCost": 550,
        "projectedETA": eta,
        "status": "ACTIVE",
    }


def _transit_strike():
    return {
        "id": "evt-budget-001",
        "type": "LINE_CANCELLATION",
        "severity": "CRITICAL",
        "affectedModes": ["TRANSIT"],
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
async def test_budget_respected_after_transit_strike():
    """After a transit strike forces e-bike/rideshare reroute, total cost must stay ≤ budget."""
    # Pre-warm ML model
    from engine.friction_model import _load_model
    _load_model()

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        payload = {
            "itinerary": _make_tight_budget_itinerary(),
            "disruption": _transit_strike(),
        }
        resp = await client.post(REPLAN_URL, json=payload)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"

        data = resp.json()
        new_cost = data["itinerary"]["totalCost"]
        budget = data["itinerary"]["user"]["budgetCents"]

        assert new_cost <= budget, (
            f"Budget violated: totalCost={new_cost}¢ exceeds budget={budget}¢"
        )


@pytest.mark.asyncio
async def test_budget_constraint_with_multiple_replans():
    """Budget must hold even after 3 consecutive replans."""
    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        itin = _make_tight_budget_itinerary()
        budget = itin["user"]["budgetCents"]

        for i in range(3):
            payload = {
                "itinerary": itin,
                "disruption": {
                    "id": f"evt-multi-{i}",
                    "type": "TRANSIT_DELAY",
                    "severity": "MAJOR",
                    "affectedModes": ["TRANSIT"],
                    "delayMinutes": 30,
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                    "source": "DEMO_INJECT",
                },
            }
            resp = await client.post(REPLAN_URL, json=payload)
            assert resp.status_code == 200
            data = resp.json()
            itin = data["itinerary"]

            assert itin["totalCost"] <= budget, (
                f"Replan #{i+1}: cost {itin['totalCost']}¢ > budget {budget}¢"
            )
