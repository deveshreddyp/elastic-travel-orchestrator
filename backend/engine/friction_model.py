"""
Predictive Friction ML Engine (TRD §5)

Lightweight gradient-boosted classifier that produces a congestion risk
score per leg. Pre-trained, deterministic, no GPU required.

Features:
  - hour_of_day, day_of_week, transport_mode (one-hot)
  - historical_delay_p50, weather_precip_mm, weather_temp_celsius
  - local_event_flag, crowd_density_score

Output per leg:
  - frictionScore: Float [0.0 – 1.0]
  - frictionLevel: LOW (< 0.3) | MEDIUM (0.3–0.7) | HIGH (> 0.7)

Functions:
  - predict_friction(legs, weather) → List[dict] of per-leg scores
  - score_itinerary(itinerary)     → scored itinerary + proactive alerts
  - classify_friction_level(score) → FrictionLevel enum
"""

import os
import time
import logging
import joblib
import numpy as np
from typing import Optional
from copy import deepcopy
from enum import Enum
from datetime import datetime, timezone, timedelta

logger = logging.getLogger("friction_model")


class FrictionLevel(str, Enum):
    LOW = "LOW"
    MEDIUM = "MEDIUM"
    HIGH = "HIGH"


# Path to pre-trained model artifact
MODEL_PATH = os.path.join(os.path.dirname(__file__), "..", "ml", "models", "friction_model.pkl")

# Lazy-loaded model singleton
_model = None


def _load_model():
    """Load the pre-trained friction model from disk."""
    global _model
    if _model is None:
        if os.path.exists(MODEL_PATH):
            _model = joblib.load(MODEL_PATH)
            logger.info(f"[ML] Friction model loaded from {MODEL_PATH}")
        else:
            logger.info(f"[ML] No model found at {MODEL_PATH} — using mock predictions")
    return _model


def classify_friction_level(score: float) -> FrictionLevel:
    """Map a friction score to its categorical level."""
    if score < 0.3:
        return FrictionLevel.LOW
    elif score <= 0.7:
        return FrictionLevel.MEDIUM
    else:
        return FrictionLevel.HIGH


def predict_friction(legs: list[dict], weather: dict = None) -> list[dict]:
    """
    Score all legs in an itinerary for congestion risk.

    Args:
        legs: List of Leg dicts from the itinerary.
        weather: Current weather data (precip_mm, temp_celsius).

    Returns:
        List of dicts with frictionScore and frictionLevel per leg.
    """
    model = _load_model()
    results = []

    for leg in legs:
        if model is not None:
            features = _extract_features(leg, weather)
            score = float(model.predict_proba(features.reshape(1, -1))[0][1])
        else:
            # Mock prediction based on mode heuristic
            score = _mock_friction_score(leg)

        level = classify_friction_level(score)
        results.append({
            "legId": f"{leg.get('fromStopId', '?')}->{leg.get('toStopId', '?')}",
            "frictionScore": round(score, 3),
            "frictionLevel": level.value,
        })

    return results


def score_itinerary(itinerary: dict, weather: dict = None) -> dict:
    """
    Score all legs in an itinerary and return the itinerary with
    frictionScore + frictionLevel added to each leg.

    Also generates proactive alerts when frictionLevel == 'HIGH'
    and departure is >= 5 minutes in the future.

    Must complete in < 200ms.

    Args:
        itinerary: Full Itinerary dict (matching TypeScript Itinerary interface).
        weather: Optional current weather data.

    Returns:
        {
            "itinerary": <itinerary with friction fields on each leg>,
            "alerts": [{ legId, frictionScore, frictionLevel, message, departureIn }]
        }
    """
    t0 = time.perf_counter()
    scored_itin = deepcopy(itinerary)
    legs = scored_itin.get("legs", [])

    # Score all legs
    friction_results = predict_friction(legs, weather)

    # Apply scores to legs
    for leg, fr in zip(legs, friction_results):
        leg["frictionScore"] = fr["frictionScore"]
        leg["frictionLevel"] = fr["frictionLevel"]

    # Generate proactive alerts
    alerts = []
    now = datetime.now(timezone.utc)

    # Estimate departure time for each leg based on cumulative duration
    cumulative_sec = 0
    for i, (leg, fr) in enumerate(zip(legs, friction_results)):
        departure_time = now + timedelta(seconds=cumulative_sec)
        time_until_departure = (departure_time - now).total_seconds()
        minutes_until = time_until_departure / 60

        if fr["frictionLevel"] == "HIGH" and minutes_until >= 5:
            alerts.append({
                "legId": fr["legId"],
                "legIndex": i,
                "frictionScore": fr["frictionScore"],
                "frictionLevel": fr["frictionLevel"],
                "departureIn": f"{int(minutes_until)} min",
                "message": (
                    f"⚠ High congestion risk on {leg.get('mode', 'TRANSIT')} leg "
                    f"{leg.get('fromStopId', '?')} → {leg.get('toStopId', '?')}. "
                    f"Departing in ~{int(minutes_until)} min. "
                    f"Consider switching to an alternative mode."
                ),
            })

        cumulative_sec += leg.get("durationSec", 0)

    scored_itin["legs"] = legs

    elapsed_ms = (time.perf_counter() - t0) * 1000
    logger.info(
        f"[ML] Scored {len(legs)} legs in {elapsed_ms:.1f}ms "
        f"({'✓ WITHIN SLA' if elapsed_ms < 200 else '⚠ SLA EXCEEDED'}), "
        f"{len(alerts)} proactive alerts"
    )

    return {
        "itinerary": scored_itin,
        "alerts": alerts,
        "scored_in_ms": round(elapsed_ms),
    }


def _extract_features(leg: dict, weather: dict = None) -> np.ndarray:
    """Build the feature vector for a single leg."""
    now = datetime.now()

    mode_encoding = {
        "WALKING": [1, 0, 0, 0],
        "WALK": [1, 0, 0, 0],
        "TRANSIT": [0, 1, 0, 0],
        "EBIKE": [0, 0, 1, 0],
        "RIDESHARE": [0, 0, 0, 1],
    }
    mode_vec = mode_encoding.get(leg.get("mode", "WALKING"), [1, 0, 0, 0])

    weather = weather or {}

    features = [
        now.hour,                                     # hour_of_day
        now.weekday(),                                # day_of_week
        *mode_vec,                                    # transport_mode (one-hot)
        leg.get("historical_delay_p50", 0.0),         # historical_delay_p50
        weather.get("precip_mm", 0.0),                # weather_precip_mm
        weather.get("temp_celsius", 20.0),            # weather_temp_celsius
        weather.get("local_event_flag", 0),           # local_event_flag
        leg.get("crowd_density_score", 0.3),          # crowd_density_score
    ]

    return np.array(features, dtype=np.float64)


def _mock_friction_score(leg: dict) -> float:
    """
    Deterministic mock scorer for demo reliability.
    Returns slightly elevated scores for transit during peak hours.
    """
    hour = datetime.now().hour
    mode = leg.get("mode", "WALKING")

    base = 0.15
    if mode == "TRANSIT" and (7 <= hour <= 9 or 17 <= hour <= 19):
        base = 0.55  # Peak transit congestion
    elif mode == "EBIKE":
        base = 0.25
    elif mode == "RIDESHARE":
        base = 0.35

    # Add slight deterministic variation based on stop IDs
    hash_val = hash(f"{leg.get('fromStopId', '')}{leg.get('toStopId', '')}") % 100
    variation = (hash_val - 50) * 0.004  # ±0.2

    return max(0.0, min(1.0, base + variation))
