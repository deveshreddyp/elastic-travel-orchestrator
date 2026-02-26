/**
 * ChecklistPanel — System health checklist overlay.
 * Polls /api/health every 3s. Toggled with Ctrl+Shift+C.
 *
 * Shows: Redis, Mock transit API, Maya's session, ML model, OSRM route cache
 * Banner: "🏆 READY TO WIN" (all green) or "⚠️ FIX BEFORE PRESENTING" (any red)
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useElasticStore } from "../store/itineraryStore";

interface HealthDetails {
    redis: boolean;
    mock_api: boolean;
    maya_session: boolean;
    ml_model: boolean;
    route_cache: boolean;
}

interface HealthResponse {
    status: "green" | "degraded" | "red";
    details: HealthDetails;
}

const API_BASE = import.meta.env.VITE_API_URL || "";

const CHECK_LABELS: Record<keyof HealthDetails, string> = {
    redis: "Redis connected",
    mock_api: "Mock transit API (port 4001)",
    maya_session: "Maya's session seeded",
    ml_model: "ML model loaded",
    route_cache: "OSRM route cache warm",
};

export function ChecklistPanel() {
    const [visible, setVisible] = useState(false);
    const [health, setHealth] = useState<HealthResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const demoRunCount = useElasticStore((s) => s.demoRunCount);

    // Poll /api/health every 3s while visible
    const fetchHealth = useCallback(async () => {
        try {
            setLoading(true);
            const resp = await fetch(`${API_BASE}/api/health`);
            const data = await resp.json();
            setHealth(data);
        } catch {
            setHealth({
                status: "red",
                details: {
                    redis: false,
                    mock_api: false,
                    maya_session: false,
                    ml_model: false,
                    route_cache: false,
                },
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!visible) return;
        fetchHealth();
        const interval = setInterval(fetchHealth, 3000);
        return () => clearInterval(interval);
    }, [visible, fetchHealth]);

    // Ctrl+Shift+C toggle
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.code === "KeyC") {
                e.preventDefault();
                setVisible((v) => !v);
            }
        };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, []);

    const allGreen = health?.status === "green";
    const details = health?.details;

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    style={{
                        position: "fixed",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        zIndex: 600,
                        width: "min(440px, calc(100vw - 48px))",
                        background: "var(--bg-glass, rgba(12, 12, 20, 0.85))",
                        backdropFilter: "blur(24px)",
                        WebkitBackdropFilter: "blur(24px)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "20px",
                        padding: "28px 32px",
                        boxShadow: "0 24px 64px rgba(0,0,0,0.6)",
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginBottom: "20px",
                        }}
                    >
                        <span
                            style={{
                                fontFamily: "Syne, sans-serif",
                                fontWeight: 700,
                                fontSize: "15px",
                                color: "var(--text-primary, #EAEAEA)",
                                letterSpacing: "0.08em",
                            }}
                        >
                            SYSTEM CHECKLIST
                        </span>
                        <button
                            onClick={() => setVisible(false)}
                            style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--text-secondary, #999)",
                                fontSize: "18px",
                                cursor: "pointer",
                                padding: "4px 8px",
                                lineHeight: 1,
                            }}
                        >
                            ✕
                        </button>
                    </div>

                    {/* Check Items */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {details &&
                            (Object.keys(CHECK_LABELS) as (keyof HealthDetails)[]).map(
                                (key, i) => (
                                    <motion.div
                                        key={key}
                                        initial={{ opacity: 0, x: -12 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.06 }}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "10px",
                                            fontFamily: "DM Sans, sans-serif",
                                            fontSize: "14px",
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: "16px",
                                                width: "22px",
                                                textAlign: "center",
                                            }}
                                        >
                                            {details[key] ? "✅" : "❌"}
                                        </span>
                                        <span
                                            style={{
                                                color: details[key]
                                                    ? "var(--text-primary, #EAEAEA)"
                                                    : "var(--accent-danger, #FF4444)",
                                                fontWeight: details[key] ? 400 : 600,
                                            }}
                                        >
                                            {CHECK_LABELS[key]}
                                        </span>
                                    </motion.div>
                                )
                            )}

                        {!details && (
                            <div
                                style={{
                                    color: "var(--text-secondary, #999)",
                                    fontFamily: "DM Sans, sans-serif",
                                    fontSize: "14px",
                                    textAlign: "center",
                                    padding: "12px 0",
                                }}
                            >
                                {loading ? "Checking..." : "Unable to reach backend"}
                            </div>
                        )}
                    </div>

                    {/* Divider */}
                    <div
                        style={{
                            height: "1px",
                            background: "rgba(255,255,255,0.06)",
                            margin: "18px 0",
                        }}
                    />

                    {/* Demo Run Count */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: "13px",
                            color: "var(--text-secondary, #999)",
                            marginBottom: "18px",
                        }}
                    >
                        <span style={{ fontSize: "16px" }}>🔢</span>
                        <span>
                            Demo runs:{" "}
                            <span
                                style={{
                                    color: "var(--accent-electric, #00D4FF)",
                                    fontWeight: 700,
                                }}
                            >
                                {demoRunCount}
                            </span>
                        </span>
                    </div>

                    {/* Status Banner */}
                    <motion.div
                        key={allGreen ? "ready" : "fix"}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        style={{
                            background: allGreen
                                ? "var(--accent-safe, #00C853)"
                                : "var(--accent-danger, #FF4444)",
                            borderRadius: "12px",
                            padding: "14px 20px",
                            textAlign: "center",
                            fontFamily: "Syne, sans-serif",
                            fontWeight: 700,
                            fontSize: "16px",
                            color: allGreen ? "#0A0A14" : "#FFFFFF",
                            letterSpacing: "0.04em",
                        }}
                    >
                        {allGreen ? "🏆 READY TO WIN" : "⚠️ FIX BEFORE PRESENTING"}
                    </motion.div>

                    {/* Footer */}
                    <div
                        style={{
                            marginTop: "14px",
                            textAlign: "center",
                            fontFamily: "JetBrains Mono, monospace",
                            fontSize: "11px",
                            color: "var(--text-tertiary, #666)",
                        }}
                    >
                        Ctrl+Shift+C to dismiss
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
