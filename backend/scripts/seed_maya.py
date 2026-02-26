"""
Seed Script: Maya's Demo Scenario (demo-maya-001)

Seeds the canonical demo itinerary into Redis:
  - Session: demo-maya-001
  - 4 stops: Home → Ferry Building Farmers Market → SFMOMA → Rooftop Bar
  - Budget: 2000¢ ($20)
  - Deadline: 20:00
  - Preferred modes: TRANSIT, EBIKE, RIDESHARE, WALKING
  - OSRM GeoJSON geometries embedded from fallback_routes.json

Usage:
    python backend/scripts/seed_maya.py
"""

import os
import sys
import json
import asyncio
import logging
from pathlib import Path

# Allow imports from backend root
backend_root = str(Path(__file__).resolve().parent.parent)
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("seed_maya")

try:
    from dotenv import load_dotenv
    load_dotenv(Path(backend_root) / ".env")
except ImportError:
    pass

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
SESSION_ID = "demo-maya-001"
FALLBACK_ROUTES_PATH = Path(__file__).resolve().parent / "fallback_routes.json"


def _load_fallback_routes() -> dict:
    """Load pre-computed OSRM-style GeoJSON routes from fallback file."""
    with open(FALLBACK_ROUTES_PATH, "r") as f:
        return json.load(f)


def build_maya_itinerary() -> dict:
    """Build the exact demo itinerary for Maya with embedded OSRM geometries."""

    # Load fallback routes for geometry embedding
    fallback = _load_fallback_routes()
    pre = fallback["pre_disruption"]

    return {
        "id": SESSION_ID,
        "version": 1,
        "user": {
            "budgetCents": 2000,
            "returnDeadline": "20:00",
            "preferredModes": ["TRANSIT", "EBIKE", "RIDESHARE", "WALKING"],
        },
        "stops": [
            {
                "id": "home",
                "name": "Maya's Home",
                "lat": 37.7749,
                "lng": -122.4194,
                "priority": "MUST_VISIT",
                "status": "COMPLETED",
            },
            {
                "id": "farmers-market",
                "name": "Ferry Building Farmers Market",
                "lat": 37.7955,
                "lng": -122.3937,
                "priority": "MUST_VISIT",
                "status": "PENDING",
            },
            {
                "id": "art-museum",
                "name": "SFMOMA",
                "lat": 37.7857,
                "lng": -122.4011,
                "priority": "MUST_VISIT",
                "status": "PENDING",
            },
            {
                "id": "rooftop-bar",
                "name": "Rooftop Bar",
                "lat": 37.7890,
                "lng": -122.4090,
                "priority": "NICE_TO_HAVE",
                "status": "PENDING",
            },
        ],
        "legs": [
            {
                "fromStopId": "home",
                "toStopId": "farmers-market",
                "mode": "TRANSIT",
                "costCents": 250,
                "durationSec": 1080,  # 18 min
                "available": True,
                "frictionLevel": "LOW",
                "frictionScore": 0.15,
                "polyline": "mfr~FnechVq@yBkAeCgBkDoAoCy@iBu@cBi@cBa@aBa@gBc@kCY_CQyBIqB",
                "geometry": pre["home_to_farmers_market"]["geometry"],
            },
            {
                "fromStopId": "farmers-market",
                "toStopId": "art-museum",
                "mode": "TRANSIT",
                "costCents": 0,
                "durationSec": 720,  # 12 min
                "available": True,
                "frictionLevel": "LOW",
                "frictionScore": 0.12,
                "polyline": "ier~F~achVdBnCjBjCdBrB~@pAdAlBr@tAn@xAf@|A`@fB",
                "geometry": pre["farmers_market_to_art_museum"]["geometry"],
            },
            {
                "fromStopId": "art-museum",
                "toStopId": "rooftop-bar",
                "mode": "TRANSIT",
                "costCents": 250,
                "durationSec": 900,  # 15 min
                "available": True,
                "frictionLevel": "LOW",
                "frictionScore": 0.18,
                "polyline": "qmr~Ft_chVa@gAi@cAo@_As@y@w@q@{@k@}@c@_Aa@_A]",
                "geometry": pre["art_museum_to_rooftop_bar"]["geometry"],
            },
            {
                "fromStopId": "rooftop-bar",
                "toStopId": "home",
                "mode": "TRANSIT",
                "costCents": 250,
                "durationSec": 1200,  # 20 min
                "available": True,
                "frictionLevel": "LOW",
                "frictionScore": 0.20,
                "polyline": "wor~FjlchVn@p@v@j@x@`@z@X|@Pz@F~@C|@Kz@Ux@]v@c@",
                "geometry": pre["rooftop_bar_to_home"]["geometry"],
            },
        ],
        "totalCost": 750,
        "projectedETA": "19:45",
        "status": "ACTIVE",
    }


async def seed():
    import redis.asyncio as aioredis

    logger.info("🌱 Seeding Maya's demo itinerary...")
    logger.info(f"   Redis: {REDIS_URL}")
    logger.info(f"   Session: {SESSION_ID}")

    client = aioredis.from_url(REDIS_URL, encoding="utf-8", decode_responses=True)

    try:
        await client.ping()
        logger.info("   Redis: PONG ✓")
    except Exception as e:
        logger.error(f"   ❌ Redis not available: {e}")
        sys.exit(1)

    itinerary = build_maya_itinerary()

    # Save itinerary
    key = f"itinerary:{SESSION_ID}"
    await client.hset(key, "data", json.dumps(itinerary))
    await client.expire(key, 86400)
    logger.info(f"   HSET {key} ✓")

    # Cache fallback routes in Redis (OSRM route cache warm)
    fallback = _load_fallback_routes()
    cached = 0
    for section_key in ("pre_disruption", "post_disruption"):
        section = fallback[section_key]
        for route_key, route_data in section.items():
            redis_key = f"directions:{route_key}"
            await client.set(redis_key, json.dumps(route_data), ex=86400)
            cached += 1
    logger.info(f"   Cached {cached} OSRM fallback routes in Redis ✓")

    # Verify
    stored = await client.hget(key, "data")
    parsed = json.loads(stored)
    assert parsed["id"] == SESSION_ID
    assert len(parsed["stops"]) == 4
    assert parsed["totalCost"] == 750
    # Verify geometries are embedded
    assert parsed["legs"][0].get("geometry") is not None, "Geometry not embedded in leg 0"
    assert parsed["legs"][0]["geometry"]["type"] == "LineString"

    logger.info(f"""
   ✅ Maya's itinerary seeded successfully!
      Stops: {len(parsed['stops'])} (Home → Farmers Market → SFMOMA → Rooftop Bar)
      Budget: ${parsed['user']['budgetCents'] / 100:.2f}
      Cost: ${parsed['totalCost'] / 100:.2f}
      Deadline: {parsed['user']['returnDeadline']}
      ETA: {parsed['projectedETA']}
      Geometries: All {len(parsed['legs'])} legs have OSRM GeoJSON embedded
      Route cache: {cached} routes warm in Redis
""")

    await client.close()


if __name__ == "__main__":
    asyncio.run(seed())
