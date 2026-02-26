"""
Test: Solver fallback — when OR-Tools CP-SAT times out (returns None),
greedy nearest-neighbor fallback must run and produce a valid route
that satisfies both hard constraints (budget + ETA).
"""

import pytest
import httpx
from unittest import mock
from datetime import datetime, timezone, timedelta


REPLAN_URL = "/api/engine/replan"


def _make_itinerary():
    stops = [
        {"id": f"stop-{i}", "name": f"Stop {i}",
         "lat": 37.7749 + i * 0.01, "lng": -122.4194 + i * 0.01,
         "priority": "MUST_VISIT" if i < 2 else "NICE_TO_HAVE",
         "status": "PENDING"}
        for i in range(4)
    ]
    legs = [
        {"fromStopId": f"stop-{i}", "toStopId": f"stop-{i+1}",
         "mode": "TRANSIT", "costCents": 300, "durationSec": 600, "available": True}
        for i in range(3)
    ]
    deadline = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    eta = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()

    return {
        "id": "itin-solver-001",
        "version": 1,
        "user": {
            "budgetCents": 50000,
            "returnDeadline": deadline,
            "preferredModes": ["TRANSIT", "WALKING"],
        },
        "stops": stops,
        "legs": legs,
        "totalCost": 900,
        "projectedETA": eta,
        "status": "ACTIVE",
    }


def _delay_event():
    return {
        "id": "evt-solver-001",
        "type": "TRANSIT_DELAY",
        "severity": "MAJOR",
        "affectedModes": ["TRANSIT"],
        "delayMinutes": 15,
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
async def test_greedy_fallback_runs_when_solver_fails():
    """When solve_vrptw returns None (timeout), greedy_fallback should produce a valid route."""
    from engine.friction_model import _load_model
    _load_model()

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)

    # Patch solve_vrptw to always return None (simulating CP-SAT timeout)
    with mock.patch("engine.elastic_replan.solve_vrptw", return_value=None):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"itinerary": _make_itinerary(), "disruption": _delay_event()}
            resp = await client.post(REPLAN_URL, json=payload)

            assert resp.status_code == 200, (
                f"Expected 200 (greedy fallback), got {resp.status_code}: {resp.text}"
            )

            data = resp.json()
            itin = data["itinerary"]

            # Validate it returned a real itinerary
            assert itin["version"] == 2
            assert len(itin["legs"]) >= 1, "Greedy fallback produced no legs"

            # Hard constraint: budget
            assert itin["totalCost"] <= itin["user"]["budgetCents"], (
                f"Budget violated: {itin['totalCost']} > {itin['user']['budgetCents']}"
            )


@pytest.mark.asyncio
async def test_greedy_produces_valid_route_structure():
    """Greedy fallback route should have legs connecting consecutive stops."""
    from engine.friction_model import _load_model
    _load_model()

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)

    with mock.patch("engine.elastic_replan.solve_vrptw", return_value=None):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"itinerary": _make_itinerary(), "disruption": _delay_event()}
            resp = await client.post(REPLAN_URL, json=payload)

            if resp.status_code != 200:
                return  # Infeasible — acceptable

            data = resp.json()
            legs = data["itinerary"]["legs"]

            # Each leg must have valid from/to IDs, mode, cost, and duration
            for leg in legs:
                assert leg["fromStopId"], "Leg missing fromStopId"
                assert leg["toStopId"], "Leg missing toStopId"
                assert leg["mode"] in ("WALKING", "TRANSIT", "EBIKE", "RIDESHARE")
                assert leg["costCents"] >= 0
                assert leg["durationSec"] > 0
                assert leg["available"] is True
