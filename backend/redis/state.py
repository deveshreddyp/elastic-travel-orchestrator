"""
Redis State Manager (TRD §7)
Exact key schema with TTL = 86400 (24h).

Key patterns:
  - HSET itinerary:{session_id}           → serialized Itinerary JSON
  - HSET graph:{session_id}:leg:{from}:{to}:{mode} → costCents, durationSec, available, polyline
  - LPUSH disruptions:{session_id}        → serialized DisruptionEvent JSON
  - HSET position:{session_id}            → lat, lng, timestamp
  - EXPIRE all keys TTL = 86400 (24h)
"""

import os
import json
import logging
from typing import Optional, List

import redis.asyncio as aioredis

logger = logging.getLogger("redis_state")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
TTL_SECONDS = 86400  # 24 hours


class RedisStateManager:
    """Async Redis state manager following the exact requested key schema."""

    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None

    async def connect(self):
        """Initialize the Redis connection pool."""
        self._redis = aioredis.from_url(
            REDIS_URL, encoding="utf-8", decode_responses=True
        )
        logger.info(f"[REDIS] Connected to {REDIS_URL}")

    async def disconnect(self):
        """Close the Redis connection."""
        if self._redis:
            await self._redis.close()

    @property
    def client(self) -> aioredis.Redis:
        if self._redis is None:
            raise RuntimeError("Redis not connected. Call connect() first.")
        return self._redis

    # ─── Itinerary: HSET itinerary:{session_id} ──────────────────────

    async def save_itinerary(self, session_id: str, itinerary: dict) -> None:
        """HSET itinerary:{session_id} → serialized Itinerary JSON"""
        key = f"itinerary:{session_id}"
        await self.client.hset(key, "data", json.dumps(itinerary))
        await self.client.expire(key, TTL_SECONDS)

    async def get_itinerary(self, session_id: str) -> Optional[dict]:
        """Retrieve the active itinerary for a session."""
        key = f"itinerary:{session_id}"
        data = await self.client.hget(key, "data")
        return json.loads(data) if data else None

    # ─── Leg Graph: HSET graph:{session_id}:leg:{from}:{to}:{mode} ────

    async def save_leg_graph(
        self,
        session_id: str,
        from_id: str,
        to_id: str,
        mode: str,
        cost_cents: int,
        duration_sec: int,
        available: bool,
        polyline: str = "",
    ) -> None:
        """HSET graph:{session_id}:leg:{from}:{to}:{mode} → costCents, durationSec, available, polyline"""
        key = f"graph:{session_id}:leg:{from_id}:{to_id}:{mode}"
        await self.client.hset(
            key,
            mapping={
                "costCents": str(cost_cents),
                "durationSec": str(duration_sec),
                "available": str(available).lower(),
                "polyline": polyline,
            },
        )
        await self.client.expire(key, TTL_SECONDS)

    async def get_leg_graph(
        self, session_id: str, from_id: str, to_id: str, mode: str
    ) -> Optional[dict]:
        """Retrieve a single leg from the routing graph."""
        key = f"graph:{session_id}:leg:{from_id}:{to_id}:{mode}"
        data = await self.client.hgetall(key)
        if not data:
            return None
        return {
            "costCents": int(data["costCents"]),
            "durationSec": int(data["durationSec"]),
            "available": data["available"] == "true",
            "polyline": data.get("polyline", ""),
        }

    async def save_all_legs(
        self, session_id: str, legs: List[dict]
    ) -> None:
        """Batch-save all legs using a Redis pipeline for performance."""
        pipe = self.client.pipeline()
        for leg in legs:
            key = f"graph:{session_id}:leg:{leg['fromStopId']}:{leg['toStopId']}:{leg['mode']}"
            pipe.hset(
                key,
                mapping={
                    "costCents": str(leg.get("costCents", 0)),
                    "durationSec": str(leg.get("durationSec", 0)),
                    "available": str(leg.get("available", True)).lower(),
                    "polyline": leg.get("polyline", ""),
                },
            )
            pipe.expire(key, TTL_SECONDS)
        await pipe.execute()

    async def invalidate_mode(self, session_id: str, mode: str) -> None:
        """Mark all legs of a given mode as unavailable."""
        pattern = f"graph:{session_id}:leg:*:*:{mode}"
        async for key in self.client.scan_iter(match=pattern):
            await self.client.hset(key, "available", "false")

    # ─── Disruptions: LPUSH disruptions:{session_id} ─────────────────

    async def push_disruption(self, session_id: str, event: dict) -> None:
        """LPUSH disruptions:{session_id} → serialized DisruptionEvent JSON"""
        key = f"disruptions:{session_id}"
        await self.client.lpush(key, json.dumps(event))
        await self.client.expire(key, TTL_SECONDS)

    async def get_disruptions(self, session_id: str) -> List[dict]:
        """Retrieve all disruption events for a session (newest first)."""
        key = f"disruptions:{session_id}"
        items = await self.client.lrange(key, 0, -1)
        return [json.loads(item) for item in items]

    # ─── Position: HSET position:{session_id} ────────────────────────

    async def update_position(
        self, session_id: str, lat: float, lng: float, timestamp: str
    ) -> None:
        """HSET position:{session_id} → lat, lng, timestamp"""
        key = f"position:{session_id}"
        await self.client.hset(
            key,
            mapping={
                "lat": str(lat),
                "lng": str(lng),
                "timestamp": timestamp,
            },
        )
        await self.client.expire(key, TTL_SECONDS)

    async def get_position(self, session_id: str) -> Optional[dict]:
        """Retrieve the user's current position."""
        key = f"position:{session_id}"
        data = await self.client.hgetall(key)
        if not data:
            return None
        return {
            "lat": float(data["lat"]),
            "lng": float(data["lng"]),
            "timestamp": data["timestamp"],
        }

    # ─── Session Cleanup ──────────────────────────────────────────────

    async def clear_session(self, session_id: str) -> None:
        """Delete all keys for a given session."""
        patterns = [
            f"itinerary:{session_id}",
            f"disruptions:{session_id}",
            f"position:{session_id}",
        ]
        # Delete exact keys
        for key in patterns:
            await self.client.delete(key)
        # Delete graph legs by scan
        async for key in self.client.scan_iter(
            match=f"graph:{session_id}:leg:*"
        ):
            await self.client.delete(key)


# ─── Singleton Instance ──────────────────────────────────────────────────────
state_manager = RedisStateManager()
