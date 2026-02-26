"""
Elastic Travel Orchestrator — Backend Entry Point
FastAPI + Socket.IO server with health checks, CORS, and performance middleware.
"""

import os
import time
import logging
import socketio
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import Response
from dotenv import load_dotenv

from api.routes import router as api_router

load_dotenv()

perf_logger = logging.getLogger("elastic_perf")

# ─── Socket.IO Server ────────────────────────────────────────────────
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins="*",
    logger=False,
    engineio_logger=False,
)

# ─── FastAPI App ──────────────────────────────────────────────────────
app = FastAPI(
    title="Elastic Travel Orchestrator",
    description="Real-time multi-stop travel itinerary replanning engine",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount REST routes
app.include_router(api_router, prefix="/api")

# Mount Engine routes 
from engine.elastic_replan import router as engine_router
app.include_router(engine_router, prefix="/api/engine", tags=["engine"])


# ─── Performance Timing Middleware ────────────────────────────────────
@app.middleware("http")
async def perf_timing_middleware(request: Request, call_next):
    """
    Times all requests. For /api/engine/replan calls, logs per-step warnings
    with specific SLA thresholds, and CRITICAL if total exceeds 3000ms SLA.

    Step SLA thresholds:
      Step 1 graph update:        warn if > 50ms
      Step 2 leg invalidation:    warn if > 50ms
      Step 3 parallel API fan-out: warn if > 800ms
      Step 4 OR-Tools solver:     warn if > 1200ms
      Step 5 stop drop logic:     warn if > 100ms
      Step 6 diff computation:    warn if > 50ms
      Step 7 WebSocket emit:      warn if > 100ms
      TOTAL:                      CRITICAL if > 3000ms
    """
    import json as _json

    t0 = time.perf_counter()
    response = await call_next(request)
    elapsed_ms = (time.perf_counter() - t0) * 1000

    path = request.url.path
    method = request.method

    if "replan" in path:
        # Log overall SLA
        level = logging.CRITICAL if elapsed_ms > 3000 else logging.INFO
        perf_logger.log(
            level,
            f"[PERF] {method} {path} — TOTAL {elapsed_ms:.0f}ms"
            + (f" ⚠️  EXCEEDS 3000ms SLA" if elapsed_ms > 3000 else " ✓"),
        )

        # Per-step timing warnings (read from response body if available)
        # The replan endpoint returns meta.stepTimings in the JSON body
        try:
            # Read body chunks to inspect step timings
            body_chunks = []
            async for chunk in response.body_iterator:
                body_chunks.append(chunk if isinstance(chunk, bytes) else chunk.encode())
            body_bytes = b"".join(body_chunks)
            body_data = _json.loads(body_bytes)

            step_timings = body_data.get("meta", {}).get("stepTimings", {})
            STEP_THRESHOLDS = {
                "step1_graph_update": 50,
                "step2_leg_invalidation": 50,
                "step3_api_fanout": 800,
                "step4_solver": 1200,
                "step5_stop_drop": 100,
                "step6_diff": 50,
                "step7_emit": 100,
            }
            for step_name, threshold in STEP_THRESHOLDS.items():
                step_ms = step_timings.get(step_name, 0)
                if step_ms > threshold:
                    perf_logger.warning(
                        f"[PERF] {step_name}: {step_ms:.0f}ms ⚠️  exceeds {threshold}ms threshold"
                    )
                else:
                    perf_logger.debug(
                        f"[PERF] {step_name}: {step_ms:.0f}ms ✓"
                    )

            # Rebuild response with the same body
            from starlette.responses import Response as StarletteResponse
            response = StarletteResponse(
                content=body_bytes,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )
        except Exception:
            pass  # If body parsing fails, skip step-level logging

    elif elapsed_ms > 500:
        perf_logger.warning(f"[PERF] {method} {path} — {elapsed_ms:.0f}ms (slow)")

    # Add timing header for frontend observability
    response.headers["X-Pipeline-Ms"] = f"{elapsed_ms:.0f}"
    return response


# ─── Health Check ─────────────────────────────────────────────────────
@app.get("/api/health")
async def health_check():
    """
    Comprehensive health check. Returns:
      status: "green" (all OK) | "degraded" (some failures) | "red" (critical failures)
      details: per-subsystem boolean checks
    Never raises — catches all errors internally.
    """
    import time as _time
    details = {
        "redis": False,
        "mock_api": False,
        "ml_model": False,
        "route_cache": False,
        "maya_session": False,
    }

    # 1. Redis PING → PONG
    try:
        from redis.state import state_manager
        if state_manager._redis is not None:
            pong = await state_manager.client.ping()
            details["redis"] = bool(pong)
    except Exception:
        pass

    # 2. Mock API — GET localhost:4001/transit/status → 200
    try:
        import httpx as _httpx
        async with _httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get("http://localhost:4001/health")
            details["mock_api"] = resp.status_code == 200
    except Exception:
        pass

    # 3. ML Model — friction_model.pkl loaded + scores one leg < 200ms
    try:
        from engine.friction_model import _load_model, predict_friction
        model = _load_model()
        t0 = _time.perf_counter()
        test_leg = {
            "fromStopId": "test-a", "toStopId": "test-b",
            "mode": "TRANSIT", "costCents": 275, "durationSec": 900,
        }
        predict_friction([test_leg])
        elapsed = (_time.perf_counter() - t0) * 1000
        details["ml_model"] = elapsed < 200
    except Exception:
        pass

    # 4. Route cache — at least 4 OSRM routes cached in Redis
    try:
        from redis.state import state_manager
        if state_manager._redis is not None:
            count = 0
            async for _key in state_manager.client.scan_iter(match="directions:*"):
                count += 1
                if count >= 4:
                    break
            details["route_cache"] = count >= 4
    except Exception:
        pass

    # 5. Maya session — itinerary:demo-maya-001 exists in Redis
    try:
        from redis.state import state_manager
        if state_manager._redis is not None:
            data = await state_manager.client.hget("itinerary:demo-maya-001", "data")
            details["maya_session"] = data is not None
    except Exception:
        pass

    # Determine overall status
    all_ok = all(details.values())
    critical_down = not details["redis"]
    if all_ok:
        status = "green"
    elif critical_down:
        status = "red"
    else:
        status = "degraded"

    return {"status": status, "details": details}


# Backward-compatible alias for Docker healthcheck (uses /health)
@app.get("/health")
async def health_check_alias():
    return await health_check()


# ─── Socket.IO Events ────────────────────────────────────────────────
@sio.event
async def connect(sid, environ):
    print(f"[WS] Client connected: {sid}")


@sio.event
async def disconnect(sid):
    print(f"[WS] Client disconnected: {sid}")


@sio.on("disruption:trigger")
async def handle_disruption_trigger(sid, data):
    """
    Receives a disruption event from the Demo Control Panel,
    runs the elastic recalculation engine, and pushes the
    updated itinerary back to the client.
    """
    from engine.elastic_replan import elastic_replan

    print(f"[WS] Disruption triggered by {sid}: {data}")
    try:
        result = await elastic_replan(data)
        await sio.emit("itinerary:updated", result, room=sid)
    except Exception as e:
        print(f"[WS] Replan error: {e}")
        await sio.emit("disruption:error", {"error": str(e)}, room=sid)


# ─── Startup / Shutdown Lifecycle ─────────────────────────────────────
@app.on_event("startup")
async def on_startup():
    """Attempt Redis connection; continue with in-memory fallback if unavailable."""
    try:
        from redis.state import state_manager
        await state_manager.connect()
        print("[STARTUP] Redis connected ✓")
    except Exception as e:
        print(f"[STARTUP] Redis unavailable — running with in-memory fallback: {e}")


@app.on_event("shutdown")
async def on_shutdown():
    try:
        from redis.state import state_manager
        await state_manager.disconnect()
    except Exception:
        pass


# ─── Mount Socket.IO as ASGI sub-app ─────────────────────────────────
socket_app = socketio.ASGIApp(sio, other_asgi_app=app)

# Uvicorn will import `main:socket_app` (or `main:app` for REST-only)
app = socket_app


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
