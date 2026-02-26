"""
Elastic Travel Orchestrator — REST API Routes
Handles itinerary CRUD, disruption injection, undo, and state queries.
All routes are wired to Redis state + Socket.IO + elastic replan engine.
"""

import os
import uuid
import time
import json
import hashlib
import logging
from copy import deepcopy
from typing import Optional, List, Literal
from datetime import datetime, timezone, timedelta

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("api.routes")
router = APIRouter()

# ─── Environment ──────────────────────────────────────────────────────────────
OSRM_BASE_URL = os.getenv("OSRM_BASE_URL", "https://router.project-osrm.org")
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

# ─── Request / Response Models ────────────────────────────────────────────────

TransportMode = Literal["WALKING", "TRANSIT", "EBIKE", "RIDESHARE"]
StopPriority = Literal["MUST_VISIT", "NICE_TO_HAVE"]


class StopInput(BaseModel):
    name: str
    lat: float
    lng: float
    priority: StopPriority = "MUST_VISIT"


class ItineraryRequest(BaseModel):
    session_id: Optional[str] = None
    start_lat: float
    start_lng: float
    start_name: str = "Start"
    stops: List[StopInput]
    budget_cents: int = Field(ge=0, description="Total budget in USD cents")
    return_deadline: str = Field(description="ISO 8601 datetime string")
    preferred_modes: List[TransportMode] = ["WALKING", "TRANSIT"]


class DisruptionRequest(BaseModel):
    session_id: str
    type: Literal["TRANSIT_DELAY", "LINE_CANCELLATION", "VENUE_CLOSED", "WEATHER"]
    severity: Literal["MINOR", "MAJOR", "CRITICAL"]
    affected_routes: Optional[List[str]] = None
    affected_modes: Optional[List[str]] = None
    affected_stop_id: Optional[str] = None
    delay_minutes: Optional[int] = None


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_redis():
    """Lazy import to avoid circular and allow in-memory fallback."""
    try:
        from redis.state import state_manager
        if state_manager._redis is not None:
            return state_manager
    except Exception:
        pass
    return None


def _get_sio():
    """Get the Socket.IO server instance from main module."""
    try:
        from main import sio
        return sio
    except Exception:
        return None


def _coord_hash(lat: float, lng: float) -> str:
    """Deterministic hash of coordinates for cache keys."""
    raw = f"{lat:.6f},{lng:.6f}"
    return hashlib.md5(raw.encode()).hexdigest()[:12]


async def _fetch_directions(
    origin_lat: float, origin_lng: float,
    dest_lat: float, dest_lng: float,
    mode: str,
) -> dict:
    """
    Fetch directions from OSRM public server or demo cache.
    Falls back to mock data if OSRM is unreachable.
    No API key required.
    """
    # Check Redis cache first
    redis = _get_redis()
    cache_key = f"directions:{_coord_hash(origin_lat, origin_lng)}:{_coord_hash(dest_lat, dest_lng)}:{mode}"

    if redis:
        try:
            cached = await redis.client.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

    # Try OSRM public route API (no key needed)
    if not DEMO_MODE:
        try:
            # OSRM uses driving profile; map modes to OSRM profiles
            osrm_profile = {
                "WALKING": "foot",
                "TRANSIT": "car",  # OSRM has no transit, approximate with car
                "EBIKE": "bike",
                "RIDESHARE": "car",
            }.get(mode, "car")

            url = f"{OSRM_BASE_URL}/route/v1/{osrm_profile}/{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
            async with httpx.AsyncClient(timeout=3.0) as client:
                resp = await client.get(url, params={"overview": "full", "geometries": "geojson"})
                data = resp.json()
                if data.get("code") == "Ok" and data.get("routes"):
                    route = data["routes"][0]
                    result = {
                        "costCents": _estimate_cost(mode, int(route["distance"])),
                        "durationSec": int(route["duration"]),
                        "polyline": "",
                        "available": True,
                    }
                    # Cache result
                    if redis:
                        try:
                            await redis.client.set(cache_key, json.dumps(result), ex=86400)
                        except Exception:
                            pass
                    return result
        except Exception as e:
            logger.warning(f"OSRM route API error: {e}")

    # Mock fallback
    result = _mock_directions(origin_lat, origin_lng, dest_lat, dest_lng, mode)
    if redis:
        try:
            await redis.client.set(cache_key, json.dumps(result), ex=86400)
        except Exception:
            pass
    return result


def _estimate_cost(mode: str, distance_meters: int) -> int:
    rates = {"WALKING": 0.0, "TRANSIT": 0.003, "EBIKE": 0.005, "RIDESHARE": 0.012}
    return int(distance_meters * rates.get(mode, 0.005))


def _mock_directions(
    olat: float, olng: float, dlat: float, dlng: float, mode: str
) -> dict:
    dist_deg = ((olat - dlat) ** 2 + (olng - dlng) ** 2) ** 0.5
    dist_m = dist_deg * 111_320

    speed = {"WALKING": 1.4, "TRANSIT": 12.0, "EBIKE": 5.5, "RIDESHARE": 10.0}.get(mode, 5.0)
    cost_per_m = {"WALKING": 0.0, "TRANSIT": 0.003, "EBIKE": 0.005, "RIDESHARE": 0.012}.get(mode, 0.005)

    return {
        "costCents": max(0, int(dist_m * cost_per_m)),
        "durationSec": max(60, int(dist_m / speed)),
        "polyline": "",
        "available": True,
    }


# ─── POST /api/itinerary ─────────────────────────────────────────────────────

@router.post("/itinerary")
async def create_itinerary(request: ItineraryRequest):
    """
    Create a new itinerary, fetch Google Maps Directions for each leg,
    store in Redis, return full Itinerary.
    """
    t0 = time.perf_counter()
    session_id = request.session_id or str(uuid.uuid4())

    # Build stops list (start + user stops)
    stops = [
        {
            "id": "start",
            "name": request.start_name,
            "lat": request.start_lat,
            "lng": request.start_lng,
            "priority": "MUST_VISIT",
            "status": "PENDING",
        }
    ]
    for i, s in enumerate(request.stops):
        stops.append({
            "id": f"stop-{i + 1}",
            "name": s.name,
            "lat": s.lat,
            "lng": s.lng,
            "priority": s.priority,
            "status": "PENDING",
        })

    # Fetch directions for each consecutive leg
    legs = []
    total_cost = 0
    total_duration = 0
    mode = request.preferred_modes[0] if request.preferred_modes else "TRANSIT"

    for i in range(len(stops) - 1):
        origin = stops[i]
        dest = stops[i + 1]
        dirs = await _fetch_directions(
            origin["lat"], origin["lng"],
            dest["lat"], dest["lng"],
            mode,
        )
        leg = {
            "fromStopId": origin["id"],
            "toStopId": dest["id"],
            "mode": mode,
            "costCents": dirs["costCents"],
            "durationSec": dirs["durationSec"],
            "available": dirs["available"],
            "polyline": dirs.get("polyline", ""),
        }
        legs.append(leg)
        total_cost += dirs["costCents"]
        total_duration += dirs["durationSec"]

    # Build Itinerary object
    now = datetime.now(timezone.utc)
    itinerary = {
        "id": session_id,
        "version": 1,
        "user": {
            "budgetCents": request.budget_cents,
            "returnDeadline": request.return_deadline,
            "preferredModes": list(request.preferred_modes),
        },
        "stops": stops,
        "legs": legs,
        "totalCost": total_cost,
        "projectedETA": (now + timedelta(seconds=total_duration)).isoformat(),
        "status": "ACTIVE",
    }

    # Store in Redis
    redis = _get_redis()
    if redis:
        try:
            await redis.save_itinerary(session_id, itinerary)
            await redis.save_all_legs(session_id, legs)
        except Exception as e:
            logger.warning(f"Redis store failed: {e}")

    elapsed = (time.perf_counter() - t0) * 1000
    logger.info(f"[API] Itinerary created in {elapsed:.0f}ms — session={session_id}")

    return {
        "itinerary": itinerary,
        "session_id": session_id,
        "elapsed_ms": round(elapsed),
    }


# ─── POST /api/disruption ────────────────────────────────────────────────────

@router.post("/disruption")
async def inject_disruption(request: DisruptionRequest):
    """
    Ingest DisruptionEvent, publish to Redis pub/sub,
    trigger elastic_replan pipeline, push result via Socket.IO.
    """
    t0 = time.perf_counter()
    session_id = request.session_id

    # Build DisruptionEvent
    event = {
        "id": f"evt-{uuid.uuid4().hex[:8]}",
        "type": request.type,
        "severity": request.severity,
        "affectedRoutes": request.affected_routes,
        "affectedModes": request.affected_modes,
        "affectedStopId": request.affected_stop_id,
        "delayMinutes": request.delay_minutes,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "DEMO_INJECT",
    }

    # Fetch current itinerary from Redis
    redis = _get_redis()
    itinerary = None
    if redis:
        try:
            await redis.push_disruption(session_id, event)
            itinerary = await redis.get_itinerary(session_id)
        except Exception as e:
            logger.warning(f"Redis ops failed: {e}")

    if not itinerary:
        raise HTTPException(
            status_code=404,
            detail=f"No active itinerary found for session {session_id}",
        )

    # Save current as previous version (for undo)
    if redis:
        try:
            prev_key = f"itinerary:{session_id}:prev"
            await redis.client.hset(prev_key, "data", json.dumps(itinerary))
            await redis.client.expire(prev_key, 86400)
        except Exception as e:
            logger.warning(f"Failed to save previous version: {e}")

    # Trigger elastic replan
    from engine.elastic_replan import ReplanRequest, replan_itinerary, Itinerary, DisruptionEvent

    try:
        replan_req = ReplanRequest(
            itinerary=Itinerary(**itinerary),
            disruption=DisruptionEvent(**event),
        )
        result = await replan_itinerary(replan_req)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Replan failed: {e}")
        raise HTTPException(status_code=500, detail=f"Replan engine error: {str(e)}")

    # Store updated itinerary in Redis
    if redis:
        try:
            await redis.save_itinerary(session_id, result["itinerary"])
        except Exception as e:
            logger.warning(f"Redis store of replanned itinerary failed: {e}")

    # Push result via Socket.IO
    sio = _get_sio()
    if sio:
        try:
            await sio.emit("itinerary:updated", {
                "session_id": session_id,
                "itinerary": result["itinerary"],
                "diff": result["diff"],
                "disruption": event,
            })
        except Exception as e:
            logger.warning(f"Socket.IO emit failed: {e}")

    elapsed = (time.perf_counter() - t0) * 1000
    logger.info(f"[API] Disruption processed in {elapsed:.0f}ms — session={session_id}")

    return {
        "itinerary": result["itinerary"],
        "diff": result["diff"],
        "disruption": event,
        "session_id": session_id,
        "elapsed_ms": round(elapsed),
    }


# ─── GET /api/itinerary/{session_id} ─────────────────────────────────────────

@router.get("/itinerary/{session_id}")
async def get_itinerary(session_id: str):
    """Fetch current itinerary from Redis."""
    redis = _get_redis()
    if not redis:
        raise HTTPException(status_code=503, detail="Redis unavailable")

    try:
        itinerary = await redis.get_itinerary(session_id)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")

    if not itinerary:
        raise HTTPException(
            status_code=404,
            detail=f"No itinerary found for session {session_id}",
        )

    return {"itinerary": itinerary, "session_id": session_id}


# ─── POST /api/undo/{session_id} ─────────────────────────────────────────────

@router.post("/undo/{session_id}")
async def undo_itinerary(session_id: str):
    """Restore previous itinerary version from Redis."""
    redis = _get_redis()
    if not redis:
        raise HTTPException(status_code=503, detail="Redis unavailable")

    prev_key = f"itinerary:{session_id}:prev"

    try:
        prev_data = await redis.client.hget(prev_key, "data")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Redis error: {str(e)}")

    if not prev_data:
        raise HTTPException(
            status_code=404,
            detail=f"No previous version found for session {session_id}",
        )

    prev_itinerary = json.loads(prev_data)

    # Save current as the new "prev" before restoring
    try:
        current = await redis.get_itinerary(session_id)
        if current:
            await redis.client.hset(prev_key, "data", json.dumps(current))
            await redis.client.expire(prev_key, 86400)
    except Exception:
        pass

    # Restore previous
    try:
        await redis.save_itinerary(session_id, prev_itinerary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Redis restore failed: {str(e)}")

    # Push via Socket.IO
    sio = _get_sio()
    if sio:
        try:
            await sio.emit("itinerary:updated", {
                "session_id": session_id,
                "itinerary": prev_itinerary,
                "action": "undo",
            })
        except Exception:
            pass

    return {
        "itinerary": prev_itinerary,
        "session_id": session_id,
        "action": "restored_previous_version",
    }


# ─── GET /api/friction/{session_id} ──────────────────────────────────────────

@router.get("/friction/{session_id}")
async def get_friction_scores(session_id: str):
    """Score all legs in the current itinerary with ML friction model."""
    redis = _get_redis()
    itinerary = None
    if redis:
        try:
            itinerary = await redis.get_itinerary(session_id)
        except Exception:
            pass

    if not itinerary:
        raise HTTPException(
            status_code=404,
            detail=f"No itinerary found for session {session_id}",
        )

    from engine.friction_model import score_itinerary

    t0 = time.perf_counter()
    scored = score_itinerary(itinerary)
    elapsed = (time.perf_counter() - t0) * 1000

    return {
        "itinerary": scored["itinerary"],
        "alerts": scored.get("alerts", []),
        "session_id": session_id,
        "scored_in_ms": round(elapsed),
    }
