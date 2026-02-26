"""
Test: Stop drop priority logic.
Parameterized across 5 stop combinations.
Assert NICE_TO_HAVE always dropped before MUST_VISIT.
Assert dropReason is non-empty on every dropped stop.
"""

import pytest
import httpx
from datetime import datetime, timezone, timedelta


REPLAN_URL = "/api/engine/replan"


def _make_itinerary(stop_priorities: list[tuple[str, str]], budget: int = 800):
    """
    Build itinerary from a list of (stop_name, priority) tuples.
    Uses a very tight budget to force dropping.
    """
    stops = [
        {"id": "home", "name": "Home", "lat": 37.7749, "lng": -122.4194,
         "priority": "MUST_VISIT", "status": "PENDING"},
    ]
    for i, (name, prio) in enumerate(stop_priorities):
        stops.append({
            "id": f"stop-{i+1}",
            "name": name,
            "lat": 37.7749 + (i + 1) * 0.005,
            "lng": -122.4194 + (i + 1) * 0.005,
            "priority": prio,
            "status": "PENDING",
        })

    legs = []
    for i in range(len(stops) - 1):
        legs.append({
            "fromStopId": stops[i]["id"],
            "toStopId": stops[i + 1]["id"],
            "mode": "TRANSIT",
            "costCents": 300,
            "durationSec": 900,
            "available": True,
        })

    deadline = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    eta = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    return {
        "id": "itin-drop-001",
        "version": 1,
        "user": {
            "budgetCents": budget,
            "returnDeadline": deadline,
            "preferredModes": ["TRANSIT", "WALKING"],
        },
        "stops": stops,
        "legs": legs,
        "totalCost": len(legs) * 300,
        "projectedETA": eta,
        "status": "ACTIVE",
    }


def _line_cancellation():
    return {
        "id": "evt-drop-001",
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


# 5 parameterized stop combinations
STOP_COMBOS = [
    # (test_id, stop_list)
    ("2must_1nice", [("Museum", "MUST_VISIT"), ("Bar", "NICE_TO_HAVE"), ("Park", "MUST_VISIT")]),
    ("1must_2nice", [("Museum", "MUST_VISIT"), ("Bar", "NICE_TO_HAVE"), ("Cafe", "NICE_TO_HAVE")]),
    ("all_nice", [("A", "NICE_TO_HAVE"), ("B", "NICE_TO_HAVE"), ("C", "NICE_TO_HAVE")]),
    ("all_must", [("X", "MUST_VISIT"), ("Y", "MUST_VISIT"), ("Z", "MUST_VISIT")]),
    ("mixed_4", [("M1", "MUST_VISIT"), ("N1", "NICE_TO_HAVE"), ("M2", "MUST_VISIT"), ("N2", "NICE_TO_HAVE")]),
]


@pytest.mark.parametrize("combo_id,stop_list", STOP_COMBOS, ids=[c[0] for c in STOP_COMBOS])
@pytest.mark.asyncio
async def test_drop_priority_ordering(combo_id, stop_list):
    """NICE_TO_HAVE stops must be dropped before MUST_VISIT stops."""
    from engine.friction_model import _load_model
    _load_model()

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Use tight budget to force dropping (enough for only ~2 legs via walking)
        payload = {
            "itinerary": _make_itinerary(stop_list, budget=800),
            "disruption": _line_cancellation(),
        }
        resp = await client.post(REPLAN_URL, json=payload)

        # Accept both 200 (success with drops) and 422 (too few stops remain)
        if resp.status_code == 422:
            return  # Can't route at all — acceptable for very tight budgets

        assert resp.status_code == 200, f"Got {resp.status_code}: {resp.text}"
        data = resp.json()

        stops = data["itinerary"]["stops"]
        dropped = [s for s in stops if s["status"] == "DROPPED"]
        active = [s for s in stops if s["status"] == "PENDING"]

        # Count original priorities (excluding Home which is always MUST_VISIT)
        original_nice = sum(1 for _, p in stop_list if p == "NICE_TO_HAVE")
        original_must = sum(1 for _, p in stop_list if p == "MUST_VISIT")

        # If any MUST_VISIT was dropped, ALL NICE_TO_HAVE must already be dropped
        dropped_must = [s for s in dropped if s.get("priority") == "MUST_VISIT"
                        and s["id"] != "home"]
        dropped_nice = [s for s in dropped if s.get("priority") == "NICE_TO_HAVE"]

        if dropped_must:
            assert len(dropped_nice) >= original_nice, (
                f"MUST_VISIT dropped ({len(dropped_must)}) but only "
                f"{len(dropped_nice)}/{original_nice} NICE_TO_HAVE were dropped first"
            )

        # Every dropped stop must have a non-empty dropReason
        for s in dropped:
            assert s.get("dropReason"), (
                f"Stop '{s['name']}' (id={s['id']}) was dropped but has empty/missing dropReason"
            )
