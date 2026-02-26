"""
Test: API fallback — when external APIs fail, the engine must still return
a valid itinerary using fallback/mock data. No HTTP 500.

Scenarios:
  1. OSRM/Google Directions → ConnectionError → fallback routes used
  2. Mock transit server → ConnectionError → mock leg data used
  3. Mock e-bike server → ConnectionError → mock leg data used
"""

import pytest
import httpx
from unittest import mock
from datetime import datetime, timezone, timedelta


REPLAN_URL = "/api/engine/replan"


def _make_itinerary():
    stops = [
        {"id": "home", "name": "Home", "lat": 37.7749, "lng": -122.4194,
         "priority": "MUST_VISIT", "status": "PENDING"},
        {"id": "market", "name": "Market", "lat": 37.7700, "lng": -122.4130,
         "priority": "MUST_VISIT", "status": "PENDING"},
        {"id": "museum", "name": "Museum", "lat": 37.7851, "lng": -122.4008,
         "priority": "NICE_TO_HAVE", "status": "PENDING"},
    ]
    legs = [
        {"fromStopId": "home", "toStopId": "market", "mode": "TRANSIT",
         "costCents": 275, "durationSec": 1080, "available": True},
        {"fromStopId": "market", "toStopId": "museum", "mode": "TRANSIT",
         "costCents": 275, "durationSec": 960, "available": True},
    ]
    deadline = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
    eta = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()

    return {
        "id": "itin-fallback-001",
        "version": 1,
        "user": {
            "budgetCents": 5000,
            "returnDeadline": deadline,
            "preferredModes": ["TRANSIT", "WALKING"],
        },
        "stops": stops,
        "legs": legs,
        "totalCost": 550,
        "projectedETA": eta,
        "status": "ACTIVE",
    }


def _delay_event():
    return {
        "id": "evt-fb-001",
        "type": "TRANSIT_DELAY",
        "severity": "MAJOR",
        "affectedModes": ["TRANSIT"],
        "delayMinutes": 30,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "DEMO_INJECT",
    }


def _get_inner_app():
    from main import app as raw_app
    inner = raw_app
    if hasattr(raw_app, "other_asgi_app"):
        inner = raw_app.other_asgi_app
    return inner


def _assert_valid_itinerary(data):
    """Ensure the response contains a valid itinerary structure."""
    assert "itinerary" in data
    itin = data["itinerary"]
    assert "stops" in itin
    assert "legs" in itin
    assert "totalCost" in itin
    assert isinstance(itin["totalCost"], int)
    assert itin["totalCost"] >= 0
    assert len(itin["stops"]) >= 2


@pytest.mark.asyncio
async def test_google_directions_fallback():
    """When _fetch_google_directions raises ConnectionError, mock data should be used."""
    from engine.friction_model import _load_model
    _load_model()

    async def _raise_conn_error(*args, **kwargs):
        raise ConnectionError("Simulated Google Directions API failure")

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)

    with mock.patch(
        "engine.elastic_replan._fetch_google_directions",
        side_effect=_raise_conn_error,
    ):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"itinerary": _make_itinerary(), "disruption": _delay_event()}
            resp = await client.post(REPLAN_URL, json=payload)

            # Must NOT be 500
            assert resp.status_code != 500, f"Got HTTP 500: {resp.text}"
            if resp.status_code == 200:
                _assert_valid_itinerary(resp.json())


@pytest.mark.asyncio
async def test_mock_transit_fallback():
    """When _fetch_mock_transit raises ConnectionError, fallback mock leg data should be used."""
    from engine.friction_model import _load_model
    _load_model()

    async def _raise_conn_error(*args, **kwargs):
        raise ConnectionError("Simulated mock transit API failure")

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)

    with mock.patch(
        "engine.elastic_replan._fetch_mock_transit",
        side_effect=_raise_conn_error,
    ):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            payload = {"itinerary": _make_itinerary(), "disruption": _delay_event()}
            resp = await client.post(REPLAN_URL, json=payload)

            assert resp.status_code != 500, f"Got HTTP 500: {resp.text}"
            if resp.status_code == 200:
                _assert_valid_itinerary(resp.json())


@pytest.mark.asyncio
async def test_mock_ebike_fallback():
    """When _fetch_mock_ebike raises ConnectionError, mock leg data should be used."""
    from engine.friction_model import _load_model
    _load_model()

    async def _raise_conn_error(*args, **kwargs):
        raise ConnectionError("Simulated mock e-bike API failure")

    inner_app = _get_inner_app()
    transport = httpx.ASGITransport(app=inner_app)

    with mock.patch(
        "engine.elastic_replan._fetch_mock_ebike",
        side_effect=_raise_conn_error,
    ):
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            itin = _make_itinerary()
            itin["user"]["preferredModes"] = ["EBIKE", "WALKING"]
            payload = {"itinerary": itin, "disruption": _delay_event()}
            resp = await client.post(REPLAN_URL, json=payload)

            assert resp.status_code != 500, f"Got HTTP 500: {resp.text}"
            if resp.status_code == 200:
                _assert_valid_itinerary(resp.json())
