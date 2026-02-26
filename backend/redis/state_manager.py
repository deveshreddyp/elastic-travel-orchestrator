"""
Redis State Manager — Key Schema (TRD §7)

Redis is the single source of truth for the live routing graph.
All keys use session-scoped namespacing and expire after 8 hours.
"""

import os
import json
from typing import Optional
import redis.asyncio as aioredis


REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
TTL_SECONDS = 28800  # 8 hours — max travel day


class RedisStateManager:
    """Async Redis state manager for the Elastic routing graph."""

    def __init__(self):
        self._redis: Optional[aioredis.Redis] = None

    async def connect(self):
        """Initialize the Redis connection pool."""
        self._redis = aioredis.from_url(
            REDIS_URL, encoding="utf-8", decode_responses=True
        )
        print(f"[REDIS] Connected to {REDIS_URL}")

    async def disconnect(self):
        """Close the Redis connection."""
        if self._redis:
            await self._redis.close()

    @property
    def client(self) -> aioredis.Redis:
        if self._redis is None:
            raise RuntimeError("Redis not connected. Call connect() first.")
        return self._redis

    # ─── Itinerary State ──────────────────────────────────────────────

    async def save_itinerary(self, session_id: str, itinerary: dict):
        """Store the active itinerary for a session."""
        key = f"itinerary:{session_id}"
        await self.client.set(key, json.dumps(itinerary))
        await self.client.expire(key, TTL_SECONDS)

    async def get_itinerary(self, session_id: str) -> Optional[dict]:
        """Retrieve the active itinerary for a session."""
        key = f"itinerary:{session_id}"
        data = await self.client.get(key)
        return json.loads(data) if data else None

    # ─── Routing Graph Legs ───────────────────────────────────────────

    async def save_leg(
        self, session_id: str, from_id: str, to_id: str, mode: str, leg_data: dict
    ):
        """Store a single leg in the routing graph."""
        key = f"graph:{session_id}:leg:{from_id}:{to_id}:{mode}"
        await self.client.hset(key, mapping=leg_data)
        await self.client.expire(key, TTL_SECONDS)

    async def invalidate_mode(self, session_id: str, mode: str):
        """Mark all legs of a given mode as unavailable."""
        pattern = f"graph:{session_id}:leg:*:*:{mode}"
        async for key in self.client.scan_iter(match=pattern):
            await self.client.hset(key, "available", "false")

    # ─── Disruption Events ────────────────────────────────────────────

    async def push_disruption(self, session_id: str, event: dict):
        """Append a disruption event to the session log."""
        key = f"disruptions:{session_id}"
        await self.client.lpush(key, json.dumps(event))
        await self.client.expire(key, TTL_SECONDS)

    async def get_disruptions(self, session_id: str) -> list[dict]:
        """Get all disruption events for a session."""
        key = f"disruptions:{session_id}"
        items = await self.client.lrange(key, 0, -1)
        return [json.loads(item) for item in items]

    # ─── User Position ────────────────────────────────────────────────

    async def update_position(
        self, session_id: str, lat: float, lng: float, current_leg_id: str
    ):
        """Update the user's real-time position."""
        key = f"position:{session_id}"
        import datetime
        await self.client.hset(key, mapping={
            "lat": str(lat),
            "lng": str(lng),
            "timestamp": datetime.datetime.now().isoformat(),
            "currentLegId": current_leg_id,
        })
        await self.client.expire(key, TTL_SECONDS)

    async def get_position(self, session_id: str) -> Optional[dict]:
        """Get the user's current position."""
        key = f"position:{session_id}"
        data = await self.client.hgetall(key)
        return data if data else None

    # ─── ML Friction Scores ───────────────────────────────────────────

    async def save_friction(self, session_id: str, leg_id: str, score_data: dict):
        """Cache friction score for a leg."""
        key = f"friction:{session_id}:leg:{leg_id}"
        await self.client.hset(key, mapping=score_data)
        await self.client.expire(key, TTL_SECONDS)

    async def get_friction(self, session_id: str, leg_id: str) -> Optional[dict]:
        """Get cached friction score for a leg."""
        key = f"friction:{session_id}:leg:{leg_id}"
        data = await self.client.hgetall(key)
        return data if data else None

    # ─── Pub/Sub for Disruption Events ────────────────────────────────

    async def publish_disruption(self, session_id: str, event: dict):
        """Publish a disruption event to the session channel."""
        channel = f"disruption:events:{session_id}"
        await self.client.publish(channel, json.dumps(event))

    async def subscribe_disruptions(self, session_id: str):
        """Subscribe to disruption events for a session."""
        pubsub = self.client.pubsub()
        channel = f"disruption:events:{session_id}"
        await pubsub.subscribe(channel)
        return pubsub


# ─── Singleton Instance ──────────────────────────────────────────────
state_manager = RedisStateManager()
