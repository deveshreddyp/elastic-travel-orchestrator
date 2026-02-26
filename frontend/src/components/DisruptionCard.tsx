/**
 * DisruptionCard — Animated slide-in overlay explaining what changed.
 * Redesigned with Framer Motion, structured grid narrative, and circular SVG countdown.
 */

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useElasticStore } from "../store/itineraryStore";
import type { Itinerary, ItineraryDiff } from "../types/index";
import { format } from "date-fns";

interface DisruptionCardProps {
    diff: ItineraryDiff;
    itinerary: Itinerary | null;
}

const DISRUPTION_LABELS: Record<string, string> = {
    TRANSIT_DELAY: "MAJOR DELAY",
    LINE_CANCELLATION: "TRANSIT STRIKE",
    VENUE_CLOSED: "VENUE CLOSED",
    WEATHER: "WEATHER EVENT",
};

export function DisruptionCard({ diff, itinerary }: DisruptionCardProps) {
    const { undo, clearDiff, disruption } = useElasticStore();
    const [elapsedTime, setElapsedTime] = useState(0);
    const [dismissed, setDismissed] = useState(false);
    const [undoTimer, setUndoTimer] = useState(30);

    // Performance timing: log how long from disruption → DisruptionCard render
    useEffect(() => {
        const t0 = useElasticStore.getState().disruptionT0;
        if (t0) {
            const elapsed = performance.now() - t0;
            console.log(`[ELASTIC] DisruptionCard rendered: ${elapsed.toFixed(0)}ms`);
            // Clear t0 so it doesn't re-log on subsequent re-renders
            useElasticStore.getState().setDisruptionT0(null);
        }
    }, [diff]);

    // Live elapsed timer for the top right
    useEffect(() => {
        const startTime = Date.now();
        const interval = setInterval(() => {
            setElapsedTime((Date.now() - startTime) / 1000);
        }, 100);
        return () => clearInterval(interval);
    }, [diff]);

    // Format elapsed time string e.g. "2.4s ago"
    const formattedElapsed = `${elapsedTime.toFixed(1)}s ago`;

    // 30s countdown logic is now purely CSS animation driven for the stroke-dashoffset
    // We just need a timeout to disable the button after 30s
    const [canUndo, setCanUndo] = useState(true);
    useEffect(() => {
        setCanUndo(true);
        setUndoTimer(30);
        const timer = setTimeout(() => {
            setCanUndo(false);
        }, 30000);

        const interval = setInterval(() => {
            setUndoTimer((t) => Math.max(0, t - 1));
        }, 1000);

        return () => {
            clearTimeout(timer);
            clearInterval(interval);
        }
    }, [diff]);

    const handleUndo = () => {
        undo();
        setDismissed(true);
    };

    const handleDismiss = () => {
        clearDiff();
        setDismissed(true);
    };

    const disruptionType = disruption?.type || "LINE_CANCELLATION";
    const disruptionLabel = DISRUPTION_LABELS[disruptionType] || "ROUTE UPDATED";

    // Narrative Title
    let narrativeTitle = "Elastic rerouted your day to keep you on schedule.";
    if (disruptionType === "LINE_CANCELLATION") narrativeTitle = "All bus routes suspended. Elastic rerouted your day.";
    if (disruptionType === "WEATHER") narrativeTitle = "Severe weather detected. E-bikes restricted, rerouted to transit.";
    if (disruptionType === "VENUE_CLOSED") narrativeTitle = "A planned stop is closed. Elastic found an alternative plan.";

    if (dismissed) return null;

    return (
        <AnimatePresence>
            {!dismissed && (
                <motion.div
                    className="disruption-card-container"
                    initial={{ y: 120, opacity: 0, scale: 0.95 }}
                    animate={{ y: 0, opacity: 1, scale: 1 }}
                    exit={{ y: 120, opacity: 0, scale: 0.95 }}
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                    style={{
                        position: 'fixed',
                        bottom: '24px',
                        left: '50%',
                        transform: 'translateX(-50%)',
                        width: 'min(520px, calc(100vw - 48px))',
                        zIndex: 1000,
                        background: 'var(--bg-glass)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        borderLeft: '4px solid var(--accent-warning)',
                        boxShadow: 'var(--glow-warning), 0 24px 48px rgba(0,0,0,0.6)',
                        borderRadius: '20px',
                        padding: '20px 24px',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {/* Top Row */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <motion.span
                                style={{ color: 'var(--accent-warning)', fontSize: '18px' }}
                                animate={{ scale: [1, 1.2, 1] }}
                                transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
                            >
                                ⚡
                            </motion.span>
                            <span style={{
                                fontFamily: 'Syne, sans-serif',
                                fontWeight: 700,
                                color: 'var(--accent-warning)',
                                letterSpacing: '0.1em',
                                fontSize: '13px'
                            }}>
                                {disruptionLabel}
                            </span>
                        </div>
                        <div style={{
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: '12px',
                            color: 'var(--text-secondary)'
                        }}>
                            {formattedElapsed}
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

                    {/* Narrative Section */}
                    <div>
                        <h3 style={{
                            fontFamily: 'DM Sans, sans-serif',
                            fontWeight: 500,
                            fontSize: '18px',
                            color: 'var(--text-primary)',
                            lineHeight: 1.4,
                            margin: '0 0 12px 0'
                        }}>
                            {narrativeTitle}
                        </h3>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {/* Dropped Stops */}
                            {diff.droppedStops.map((stop, i) => (
                                <motion.div
                                    key={stop.id}
                                    initial={{ opacity: 0, x: -12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: i * 0.12 }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontFamily: 'DM Sans, sans-serif' }}
                                >
                                    <span style={{ color: 'var(--accent-danger)' }}>🔴</span>
                                    <span style={{ color: 'var(--text-primary)' }}>
                                        {stop.name} removed <span style={{ color: 'var(--text-secondary)' }}>— {stop.dropReason || "budget protected"}</span>
                                    </span>
                                </motion.div>
                            ))}

                            {/* New Legs */}
                            {diff.newLegs.map((leg, i) => (
                                <motion.div
                                    key={`new-${i}`}
                                    initial={{ opacity: 0, x: -12 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: (diff.droppedStops.length + i) * 0.12 }}
                                    style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontFamily: 'DM Sans, sans-serif' }}
                                >
                                    <span style={{ color: 'var(--accent-safe)' }}>🟢</span>
                                    <span style={{ color: 'var(--text-primary)' }}>
                                        {leg.mode.charAt(0) + leg.mode.slice(1).toLowerCase()} added: ${(leg.costCents / 100).toFixed(2)} · {Math.round(leg.durationSec / 60)} min
                                    </span>
                                </motion.div>
                            ))}

                            {/* Budget/Schedule Summary (Mocked for demo purposes, could be derived from itinerary diff) */}
                            <motion.div
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: (diff.droppedStops.length + diff.newLegs.length) * 0.12 }}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontFamily: 'DM Sans, sans-serif' }}
                            >
                                <span style={{ color: 'var(--accent-electric)' }}>✅</span>
                                <span style={{ color: 'var(--text-primary)' }}>
                                    Budget safe: ${(itinerary?.totalCost || 0) / 100} of ${(itinerary?.user.budgetCents || 0) / 100} used
                                </span>
                            </motion.div>

                            <motion.div
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: (diff.droppedStops.length + diff.newLegs.length + 1) * 0.12 }}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', fontFamily: 'DM Sans, sans-serif' }}
                            >
                                <span style={{ color: 'var(--accent-electric)' }}>✅</span>
                                <span style={{ color: 'var(--text-primary)' }}>
                                    Home by {itinerary?.projectedETA ? format(new Date(itinerary.projectedETA), "h:mm a") : "deadline"}
                                </span>
                            </motion.div>
                        </div>
                    </div>

                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '14px 0' }} />

                    {/* Bottom Row Actions */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        {/* Action button visibility assumes we just want a standard way to undo from notification */}
                        {undoTimer > 0 && (
                            <div style={{ position: 'relative', opacity: canUndo ? 1 : 0.3, pointerEvents: canUndo ? 'auto' : 'none', transition: 'opacity 0.3s' }}>
                                {canUndo && (
                                    <svg style={{ position: 'absolute', top: '-6px', left: '-5%', width: '110%', height: '110%', pointerEvents: 'none', zIndex: 0 }}>
                                        <circle
                                            cx="50%" cy="50%" r="20"
                                            fill="none"
                                            stroke="var(--accent-pulse)"
                                            strokeWidth="2"
                                            strokeDasharray="125.6" /* 2 * pi * 20 */
                                            style={{
                                                strokeDashoffset: 0,
                                                animation: 'countdown-ring 30s linear forwards',
                                                transformOrigin: '50% 50%',
                                                transform: 'rotate(-90deg)'
                                            }}
                                        />
                                    </svg>
                                )}
                                <button
                                    onClick={handleUndo}
                                    disabled={!canUndo}
                                    style={{
                                        position: 'relative',
                                        zIndex: 1,
                                        background: 'transparent',
                                        border: '1px dashed var(--accent-pulse)',
                                        borderRadius: '100px',
                                        padding: '8px 16px',
                                        color: 'var(--accent-pulse)',
                                        fontFamily: 'DM Sans, sans-serif',
                                        fontSize: '13px',
                                        fontWeight: 600,
                                        cursor: 'pointer'
                                    }}
                                >
                                    UNDO (30s)
                                </button>
                            </div>
                        )}

                        {/* Accept Button */}
                        <button
                            onClick={handleDismiss}
                            style={{
                                background: 'linear-gradient(135deg, #00D4FF, #0066FF)',
                                color: 'white',
                                fontFamily: 'Syne, sans-serif',
                                fontSize: '14px',
                                fontWeight: 600,
                                padding: '10px 20px',
                                borderRadius: '10px',
                                cursor: 'pointer',
                                border: 'none',
                                transition: 'all 0.2s',
                                boxShadow: 'var(--glow-electric)'
                            }}
                            onMouseOver={(e) => {
                                e.currentTarget.style.filter = 'brightness(1.1)';
                                e.currentTarget.style.transform = 'scale(1.02)';
                            }}
                            onMouseOut={(e) => {
                                e.currentTarget.style.filter = 'brightness(1)';
                                e.currentTarget.style.transform = 'scale(1)';
                            }}
                        >
                            GOT IT →
                        </button>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
