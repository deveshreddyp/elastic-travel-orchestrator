"""
Friction Model Training Script (TRD §5)

Trains a gradient-boosted classifier on synthetic/historical data
to predict congestion risk per leg.

Usage:
    python -m ml.train_friction

Output:
    ml/models/friction_model.pkl
"""

import os
import numpy as np
import pandas as pd
import joblib
from sklearn.ensemble import GradientBoostingClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, roc_auc_score


FEATURE_NAMES = [
    "hour_of_day",
    "day_of_week",
    "mode_walk",
    "mode_transit",
    "mode_ebike",
    "mode_rideshare",
    "historical_delay_p50",
    "weather_precip_mm",
    "weather_temp_celsius",
    "local_event_flag",
    "crowd_density_score",
]

MODEL_DIR = os.path.join(os.path.dirname(__file__), "models")
MODEL_PATH = os.path.join(MODEL_DIR, "friction_model.pkl")


def generate_synthetic_data(n_samples: int = 5000) -> pd.DataFrame:
    """
    Generate synthetic training data for the friction classifier.
    In production, replace with real GTFS historical data.
    """
    np.random.seed(42)

    data = pd.DataFrame({
        "hour_of_day": np.random.randint(0, 24, n_samples),
        "day_of_week": np.random.randint(0, 7, n_samples),
        "mode_walk": np.random.binomial(1, 0.25, n_samples),
        "mode_transit": np.random.binomial(1, 0.4, n_samples),
        "mode_ebike": np.random.binomial(1, 0.2, n_samples),
        "mode_rideshare": np.random.binomial(1, 0.15, n_samples),
        "historical_delay_p50": np.random.exponential(3.0, n_samples),
        "weather_precip_mm": np.random.exponential(1.5, n_samples),
        "weather_temp_celsius": np.random.normal(18, 8, n_samples),
        "local_event_flag": np.random.binomial(1, 0.1, n_samples),
        "crowd_density_score": np.random.beta(2, 5, n_samples),
    })

    # Generate target: probability of ≥ 10 min delay
    # Higher during peak hours, transit mode, rain, and events
    logit = (
        -2.0
        + 0.15 * ((data["hour_of_day"] >= 7) & (data["hour_of_day"] <= 9)).astype(float)
        + 0.15 * ((data["hour_of_day"] >= 17) & (data["hour_of_day"] <= 19)).astype(float)
        + 0.3 * data["mode_transit"]
        + 0.1 * data["historical_delay_p50"]
        + 0.2 * data["weather_precip_mm"]
        + 0.5 * data["local_event_flag"]
        + 0.4 * data["crowd_density_score"]
        - 0.1 * data["mode_walk"]
    )
    prob = 1 / (1 + np.exp(-logit))
    data["delayed"] = (np.random.random(n_samples) < prob).astype(int)

    return data


def train_model():
    """Train and save the friction classifier."""
    print("[TRAIN] Generating synthetic training data...")
    data = generate_synthetic_data(n_samples=10000)

    X = data[FEATURE_NAMES]
    y = data["delayed"]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    print("[TRAIN] Training GradientBoostingClassifier...")
    model = GradientBoostingClassifier(
        n_estimators=100,
        max_depth=4,
        learning_rate=0.1,
        random_state=42,
        n_iter_no_change=10,
    )
    model.fit(X_train, y_train)

    # Evaluation
    y_pred = model.predict(X_test)
    y_proba = model.predict_proba(X_test)[:, 1]

    print("\n[TRAIN] Classification Report:")
    print(classification_report(y_test, y_pred, target_names=["No Delay", "Delayed"]))
    print(f"[TRAIN] ROC-AUC: {roc_auc_score(y_test, y_proba):.4f}")

    # Save model
    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(model, MODEL_PATH)
    print(f"\n[TRAIN] Model saved to {MODEL_PATH}")


if __name__ == "__main__":
    train_model()
