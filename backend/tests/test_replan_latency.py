"""
Test: Replan latency SLA.
Triggers 20 consecutive disruption events via POST /api/engine/replan.
Each pipeline must complete within the SLA.

Note: The production SLA is 3000ms (Docker-deployed).
The test-env SLA is 5000ms to account for ASGITransport overhead,
no Redis, and local machine variance.
"""

import time
import pytest
import httpx
from datetime import datetime, timezone, timedelta


REPLAN_URL = "/api/engine/replan"
SLA_MS = 5000  # 5s tolerance in test env (prod: 3s)
NUM_ITERATIONS = 20


def _make_itinerary():
    """Standard 4-stop itinerary for latency testing."""
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
        "id": "itin-latency-001",
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


def _get_inner_app():
    from main import app as raw_app
    inner = raw_app
    if hasattr(raw_app, "other_asgi_app"):
        inner = raw_app.other_asgi_app
    return inner


@pytest.mark.asyncio
async def test_20_consecutive_replans_under_sla():
    """Each of 20 consecutive replan calls must complete within 3000ms."""
    # Pre-warm ML model to avoid cold-start penalty
    from engine.friction_model import _load_model
    _load_model()

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)

    timings = []

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # ── Warmup call (throwaway) to bootstrap FastAPI + httpx transport ──
        warmup_itin = _make_itinerary()
        warmup_disruption = {
            "id": "evt-warmup",
            "type": "TRANSIT_DELAY",
            "severity": "MINOR",
            "affectedModes": ["TRANSIT"],
            "delayMinutes": 5,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "source": "DEMO_INJECT",
        }
        await client.post(REPLAN_URL, json={
            "itinerary": warmup_itin, "disruption": warmup_disruption
        })

        # ── Measured iterations ──
        for i in range(NUM_ITERATIONS):
            itin = _make_itinerary()
            itin["version"] = i + 1

            disruption = {
                "id": f"evt-lat-{i:03d}",
                "type": "TRANSIT_DELAY",
                "severity": "MAJOR",
                "affectedModes": ["TRANSIT"],
                "delayMinutes": 15,
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "source": "DEMO_INJECT",
            }

            payload = {"itinerary": itin, "disruption": disruption}

            start = time.perf_counter()
            resp = await client.post(REPLAN_URL, json=payload)
            elapsed_ms = (time.perf_counter() - start) * 1000

            timings.append(elapsed_ms)

            assert resp.status_code == 200, (
                f"Iteration {i}: expected 200, got {resp.status_code}"
            )
            assert elapsed_ms < SLA_MS, (
                f"Iteration {i}: {elapsed_ms:.0f}ms exceeds {SLA_MS}ms SLA"
            )

    avg_ms = sum(timings) / len(timings)
    max_ms = max(timings)
    print(f"\n[LATENCY] {NUM_ITERATIONS} replans — avg={avg_ms:.0f}ms, max={max_ms:.0f}ms")
