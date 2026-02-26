/**
 * DemoControlPanel — Admin overlay for disruption injection.
 * Redesigned as a sleek operator console with explicit buttons and Framer Motion.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useElasticStore } from "../store/itineraryStore";

type DisruptionType =
    | "LINE_CANCELLATION"
    | "TRANSIT_DELAY"
    | "VENUE_CLOSED"
    | "WEATHER";

const API_BASE = import.meta.env.VITE_API_URL || "";

export function DemoControlPanel() {
    const { showDemo, toggleDemo, sessionId, disruptionLog } = useElasticStore();
    const [isFiring, setIsFiring] = useState<DisruptionType | null>(null);
    const [systemHealth, setSystemHealth] = useState({ redis: true, api: true, ml: true, cache: true });

    // Keyboard shortcut: Ctrl+Shift+D
    const handleKeyDown = useCallback(
        (e: KeyboardEvent) => {
            if (e.ctrlKey && e.shiftKey && e.key === "D") {
                e.preventDefault();
                toggleDemo();
            }
        },
        [toggleDemo]
    );

    useEffect(() => {
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [handleKeyDown]);

    // Mock system health polling
    useEffect(() => {
        const interval = setInterval(() => {
            // Keep healthy for demo, occasionally flicker ML or Cache to yellow?
            // For now, static healthy to match prompt requirements unless API actually fails.
            setSystemHealth({ redis: true, api: true, ml: true, cache: true });
        }, 5000);
        return () => clearInterval(interval);
    }, []);


    const handleTrigger = async (type: DisruptionType) => {
        if (!sessionId) {
            console.warn("[DEMO] No active session — cannot trigger disruption");
            return;
        }

        setIsFiring(type);

        let body: any = { session_id: sessionId, type };

        if (type === "LINE_CANCELLATION") {
            body.severity = "CRITICAL";
        } else if (type === "TRANSIT_DELAY") {
            body.severity = "MAJOR";
            body.delay_minutes = 45;
        } else if (type === "VENUE_CLOSED") {
            body.severity = "MINOR";
            body.affectedStopId = "rooftop-bar"; // Mock
        } else if (type === "WEATHER") {
            body.severity = "MAJOR";
        }

        try {
            const res = await fetch(`${API_BASE}/api/disruption`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) {
                console.error("[DEMO] Failed to trigger disruption:", res.status);
            }
        } catch (err) {
            console.error("[DEMO] Disruption error:", err);
        } finally {
            setTimeout(() => setIsFiring(null), 2000);
        }
    };

    return (
        <>
            {/* FLOATING TRIGGER */}
            <motion.button
                onClick={toggleDemo}
                style={{
                    position: 'fixed',
                    bottom: '32px',
                    right: '24px',
                    zIndex: 500,
                    width: '52px',
                    height: '52px',
                    borderRadius: '50%',
                    background: 'var(--bg-glass)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    border: '1px solid rgba(255,107,43,0.4)',
                    color: 'var(--accent-warning)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '24px',
                    cursor: 'pointer',
                    boxShadow: showDemo ? 'var(--glow-warning)' : '0 8px 16px rgba(0,0,0,0.4)',
                    transition: 'all 0.3s ease',
                    transform: showDemo ? 'scale(1.08)' : 'scale(1)',
                }}
                whileHover={{ scale: 1.08, boxShadow: 'var(--glow-warning)' }}
            >
                ⚡
            </motion.button>

            {/* EXPANDED PANEL */}
            <AnimatePresence>
                {showDemo && (
                    <motion.div
                        initial={{ opacity: 0, y: 20, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 20, scale: 0.95 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                        style={{
                            position: 'fixed',
                            bottom: '96px',
                            right: '24px',
                            width: '300px',
                            background: 'var(--bg-glass)',
                            backdropFilter: 'blur(16px)',
                            WebkitBackdropFilter: 'blur(16px)',
                            border: '1px solid rgba(255,107,43,0.2)',
                            borderRadius: '16px',
                            zIndex: 499,
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden'
                        }}
                    >
                        {/* HEADER */}
                        <div style={{ padding: '16px', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)', letterSpacing: '0.15em' }}>
                                MISSION CONTROL
                            </span>
                            <span style={{ background: 'rgba(255, 184, 0, 0.15)', color: 'var(--accent-warning)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em' }}>
                                DEMO MODE
                            </span>
                        </div>

                        <SectionHeader>INJECT DISRUPTION</SectionHeader>
                        <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>

                            {/* Transit Strike */}
                            <DisruptionButton
                                type="LINE_CANCELLATION"
                                title="⚡ TRANSIT STRIKE"
                                subtitle="Suspends all bus routes citywide"
                                color="var(--accent-warning)"
                                isFiring={isFiring === "LINE_CANCELLATION"}
                                onClick={() => handleTrigger("LINE_CANCELLATION")}
                                disabled={!sessionId}
                            />

                            {/* Major Delay */}
                            <DisruptionButton
                                type="TRANSIT_DELAY"
                                title="⏱ MAJOR DELAY"
                                subtitle="Adds 45 min delay to all routes"
                                color="var(--accent-gold)"
                                isFiring={isFiring === "TRANSIT_DELAY"}
                                onClick={() => handleTrigger("TRANSIT_DELAY")}
                                disabled={!sessionId}
                            />

                            {/* Venue Closed */}
                            <DisruptionButton
                                type="VENUE_CLOSED"
                                title="🔒 VENUE CLOSED"
                                subtitle="Drops Rooftop Bar from itinerary"
                                color="var(--accent-pulse)"
                                isFiring={isFiring === "VENUE_CLOSED"}
                                onClick={() => handleTrigger("VENUE_CLOSED")}
                                disabled={!sessionId}
                            />

                            {/* Weather Event */}
                            <DisruptionButton
                                type="WEATHER"
                                title="🌧 WEATHER EVENT"
                                subtitle="Restricts e-bikes, reroutes to transit"
                                color="#60A5FA" // Transit blue
                                isFiring={isFiring === "WEATHER"}
                                onClick={() => handleTrigger("WEATHER")}
                                disabled={!sessionId}
                            />

                        </div>

                        {/* EVENT LOG */}
                        <div style={{ padding: '12px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(0,0,0,0.2)' }}>
                            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--text-dim)', letterSpacing: '0.1em', marginBottom: '8px' }}>
                                EVENT LOG
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '100px', overflowY: 'auto' }}>
                                <AnimatePresence initial={false}>
                                    {disruptionLog.length === 0 ? (
                                        <div style={{ fontSize: '12px', color: 'var(--text-dim)' }}>No events yet.</div>
                                    ) : (
                                        disruptionLog.slice(0, 5).map((evt, i) => (
                                            <motion.div
                                                key={evt.id || i}
                                                initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                                animate={{ opacity: 1, height: 'auto', marginTop: 4 }}
                                                style={{ display: 'flex', gap: '8px', fontSize: '11px', fontFamily: 'DM Sans, sans-serif' }}
                                            >
                                                <span style={{ fontFamily: 'JetBrains Mono, monospace', color: 'var(--text-dim)' }}>
                                                    {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <span style={{ color: 'var(--text-secondary)' }}>{evt.type}</span>
                                                <span style={{ color: evt.severity === 'CRITICAL' ? 'var(--accent-danger)' : 'var(--accent-gold)', marginLeft: 'auto' }}>
                                                    {evt.severity}
                                                </span>
                                            </motion.div>
                                        ))
                                    )}
                                </AnimatePresence>
                            </div>
                        </div>

                        {/* SYSTEM STATUS ROW */}
                        <div style={{ padding: '8px 12px', borderTop: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', fontFamily: 'JetBrains Mono, monospace', fontSize: '10px', color: 'var(--text-dim)' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Redis <span style={{ color: systemHealth.redis ? 'var(--accent-safe)' : 'var(--accent-danger)' }}>●</span></span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Mock API <span style={{ color: systemHealth.api ? 'var(--accent-safe)' : 'var(--accent-danger)' }}>●</span></span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>ML <span style={{ color: systemHealth.ml ? 'var(--accent-safe)' : 'var(--accent-danger)' }}>●</span></span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>Cache <span style={{ color: systemHealth.cache ? 'var(--accent-safe)' : 'var(--accent-danger)' }}>●</span></span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
}

function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <div style={{
            fontFamily: 'Syne, sans-serif',
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.1em',
            color: 'var(--text-dim)',
            textTransform: 'uppercase',
            marginBottom: '12px',
            borderBottom: '1px solid rgba(255,255,255,0.05)',
            paddingBottom: '8px'
        }}>
            {children}
        </div>
    );
}

// Sub-component for individual disruption buttons
function DisruptionButton({ title, subtitle, color, isFiring, onClick, disabled }: any) {
    return (
        <motion.button
            onClick={onClick}
            disabled={disabled || isFiring}
            style={{
                background: isFiring ? 'rgba(255,255,255,0.1)' : 'var(--bg-surface)',
                border: '1px solid var(--border-subtle)',
                borderLeft: `3px solid ${color}`,
                borderRadius: '8px',
                padding: '10px 12px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                cursor: (disabled || isFiring) ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
                transition: 'background 0.2s',
                width: '100%',
                textAlign: 'left'
            }}
            whileHover={!disabled && !isFiring ? { backgroundColor: 'var(--bg-elevated)' } : {}}
            whileTap={!disabled && !isFiring ? { scale: 0.98 } : {}}
        >
            <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, fontSize: '12px', color: isFiring ? 'white' : 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                {title}
                {isFiring && <span style={{ color: 'var(--accent-safe)' }}>FIRED ✓</span>}
            </div>
            <div style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                {subtitle}
            </div>
        </motion.button>
    );
}
