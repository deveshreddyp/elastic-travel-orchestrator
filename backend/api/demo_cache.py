"""
Pre-Warm Cache — Maya's Demo Scenario

Pre-fetches and caches ALL Google Maps Directions API results for
the demo itinerary. Falls back to hardcoded JSON when GOOGLE_MAPS_API_KEY
is not set.

Cache key pattern: directions:{origin_hash}:{dest_hash}:{mode}
TTL: 86400 (24h)

Stops:
  - Home:           37.7749, -122.4194
  - Farmers Market: 37.7700, -122.4130
  - Art Museum:     37.7851, -122.4008
  - Rooftop Bar:    37.7899, -122.4104

Usage:
    python -m api.demo_cache          # from backend/
    python api/demo_cache.py          # standalone
"""

import os
import sys
import json
import hashlib
import asyncio
import logging
from pathlib import Path

import httpx

logger = logging.getLogger("demo_cache")

# ─── Environment ──────────────────────────────────────────────────────────────

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY", "")
GOOGLE_MAPS_DIRECTIONS_URL = os.getenv(
    "GOOGLE_MAPS_DIRECTIONS_URL",
    "https://maps.googleapis.com/maps/api/directions/json",
)
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
TTL_SECONDS = 86400  # 24 hours

FALLBACK_PATH = Path(__file__).parent / "demo_fallback.json"

# ─── Maya's Demo Scenario Stops ──────────────────────────────────────────────

MAYA_STOPS = {
    "home":           {"name": "Home",           "lat": 37.7749, "lng": -122.4194},
    "farmers_market": {"name": "Farmers Market", "lat": 37.7700, "lng": -122.4130},
    "art_museum":     {"name": "Art Museum",     "lat": 37.7851, "lng": -122.4008},
    "rooftop_bar":    {"name": "Rooftop Bar",    "lat": 37.7899, "lng": -122.4104},
}

# Each leg: (from, to, [modes])
MAYA_LEGS = [
    ("home",           "farmers_market", ["TRANSIT"]),
    ("farmers_market", "art_museum",     ["TRANSIT", "EBIKE"]),
    ("art_museum",     "rooftop_bar",    ["TRANSIT", "RIDESHARE"]),
    ("rooftop_bar",    "home",           ["TRANSIT", "RIDESHARE"]),
]


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _coord_hash(lat: float, lng: float) -> str:
    """Deterministic hash of coordinates for cache keys."""
    raw = f"{lat:.6f},{lng:.6f}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


def _fallback_key(from_name: str, to_name: str, mode: str) -> str:
    """Build the key used in demo_fallback.json."""
    return f"{from_name}_to_{to_name}_{mode.lower()}"


def _estimate_cost(mode: str, distance_meters: int) -> int:
    rates = {"WALKING": 0.0, "TRANSIT": 0.003, "EBIKE": 0.005, "RIDESHARE": 0.012}
    return int(distance_meters * rates.get(mode, 0.005))


async def _fetch_from_google(
    client: httpx.AsyncClient,
    origin_lat: float, origin_lng: float,
    dest_lat: float, dest_lng: float,
    mode: str,
) -> dict | None:
    """Try to fetch directions from Google Maps API."""
    gmode = {
        "WALKING": "walking",
        "TRANSIT": "transit",
        "EBIKE": "bicycling",
        "RIDESHARE": "driving",
    }.get(mode, "transit")

    try:
        resp = await client.get(
            GOOGLE_MAPS_DIRECTIONS_URL,
            params={
                "origin": f"{origin_lat},{origin_lng}",
                "destination": f"{dest_lat},{dest_lng}",
                "mode": gmode,
                "key": GOOGLE_MAPS_API_KEY,
            },
            timeout=5.0,
        )
        data = resp.json()
        if data.get("status") == "OK" and data.get("routes"):
            leg = data["routes"][0]["legs"][0]
            return {
                "costCents": _estimate_cost(mode, leg["distance"]["value"]),
                "durationSec": leg["duration"]["value"],
                "polyline": data["routes"][0].get("overview_polyline", {}).get("points", ""),
                "available": True,
            }
    except Exception as e:
        logger.warning(f"Google API failed for {mode}: {e}")

    return None


# ─── Main Cache Builder ──────────────────────────────────────────────────────

async def prewarm_cache():
    """
    Pre-fetch and cache all directions for Maya's demo scenario.
    If GOOGLE_MAPS_API_KEY is not set, load from demo_fallback.json.
    """
    # Load fallback data
    fallback_data = {}
    if FALLBACK_PATH.exists():
        with open(FALLBACK_PATH, "r") as f:
            fallback_data = json.load(f)
        logger.info(f"[CACHE] Loaded fallback data from {FALLBACK_PATH}")

    # Try to connect to Redis
    redis_client = None
    try:
        import redis.asyncio as aioredis
        redis_client = aioredis.from_url(
            REDIS_URL, encoding="utf-8", decode_responses=True
        )
        await redis_client.ping()
        logger.info(f"[CACHE] Redis connected at {REDIS_URL}")
    except Exception as e:
        logger.warning(f"[CACHE] Redis unavailable ({e}) — caching to console only")
        redis_client = None

    cached_count = 0

    async with httpx.AsyncClient() as http_client:
        for from_key, to_key, modes in MAYA_LEGS:
            origin = MAYA_STOPS[from_key]
            dest = MAYA_STOPS[to_key]

            for mode in modes:
                cache_key = f"directions:{_coord_hash(origin['lat'], origin['lng'])}:{_coord_hash(dest['lat'], dest['lng'])}:{mode}"

                # Try Google Maps API first
                result = None
                if GOOGLE_MAPS_API_KEY:
                    result = await _fetch_from_google(
                        http_client,
                        origin["lat"], origin["lng"],
                        dest["lat"], dest["lng"],
                        mode,
                    )
                    if result:
                        logger.info(
                            f"[CACHE] ✓ Google API: {origin['name']} → {dest['name']} ({mode}) "
                            f"= {result['costCents']}¢, {result['durationSec']}s"
                        )

                # Fall back to JSON
                if not result:
                    fb_key = _fallback_key(from_key, to_key, mode)
                    result = fallback_data.get(fb_key)
                    if result:
                        logger.info(
                            f"[CACHE] ✓ Fallback: {origin['name']} → {dest['name']} ({mode}) "
                            f"= {result['costCents']}¢, {result['durationSec']}s"
                        )
                    else:
                        logger.warning(
                            f"[CACHE] ✗ No data for {origin['name']} → {dest['name']} ({mode})"
                        )
                        continue

                # Store in Redis
                if redis_client:
                    try:
                        await redis_client.set(cache_key, json.dumps(result), ex=TTL_SECONDS)
                        cached_count += 1
                    except Exception as e:
                        logger.warning(f"[CACHE] Redis SET failed: {e}")
                else:
                    print(f"  {cache_key} → {json.dumps(result)}")
                    cached_count += 1

    if redis_client:
        await redis_client.close()

    logger.info(f"[CACHE] Pre-warm complete: {cached_count} directions cached (TTL={TTL_SECONDS}s)")
    return cached_count


# ─── CLI Entry Point ─────────────────────────────────────────────────────────

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    count = asyncio.run(prewarm_cache())
    print(f"\n✓ Cached {count} direction results for Maya's demo scenario.")
