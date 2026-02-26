/**
 * DeadlineCountdown — Live countdown to return time.
 * Updates every second. Turns red when < 30 min remain or ETA exceeds deadline.
 */

import { useState, useEffect } from "react";
import type { Itinerary } from "../types/index";

interface DeadlineCountdownProps {
    itinerary: Itinerary | null;
    compact?: boolean;
}

export function DeadlineCountdown({ itinerary, compact = false }: DeadlineCountdownProps) {
    const [now, setNow] = useState(() => Date.now());

    // Tick every second
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    if (!itinerary) return null;

    const deadline = new Date(itinerary.user.returnDeadline);
    const eta = new Date(itinerary.projectedETA || deadline); // fallback to deadline if projecting fails

    const remainingMs = deadline.getTime() - now;
    const totalRemainingSeconds = Math.max(0, Math.floor(remainingMs / 1000));

    // Status Logic
    const isOnTime = eta <= deadline;
    const bufferMin = Math.floor((deadline.getTime() - eta.getTime()) / 60000);
    const remainingMin = Math.floor(totalRemainingSeconds / 60);

    let color = "var(--text-primary)";
    let glow = "none";

    if (!isOnTime || remainingMs <= 0) {
        color = "var(--accent-danger)";
        glow = "var(--glow-danger)";
    } else if (remainingMin < 30 || bufferMin < 15) {
        color = "var(--accent-warning)";
        glow = "var(--glow-warning)";
    }

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    };

    if (compact) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', marginLeft: '12px' }}>
                <div style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '13px',
                    fontWeight: 700,
                    color,
                    textShadow: glow !== "none" ? `0 0 8px ${color}` : 'none',
                    lineHeight: 1
                }}>
                    {formatTime(eta)}
                </div>
                <div style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: '10px',
                    color: 'var(--text-dim)',
                    lineHeight: 1,
                    marginTop: '2px'
                }}>
                    ETA HOME
                </div>
            </div>
        );
    }

    // Full Layout
    const pad = (n: number) => n.toString().padStart(2, "0");
    const hours = Math.floor(totalRemainingSeconds / 3600);
    const minutes = Math.floor((totalRemainingSeconds % 3600) / 60);
    const seconds = totalRemainingSeconds % 60;

    return (
        <div style={{
            padding: '16px',
            background: 'var(--bg-plate)',
            borderRadius: '16px',
            border: '1px solid var(--border-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
        }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    RETURN DEADLINE
                </span>
                <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {formatTime(deadline)}
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                <span style={{ fontFamily: 'Syne, sans-serif', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {isOnTime ? 'ON TIME' : 'RUNNING LATE'}
                </span>
                <span style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '24px',
                    fontWeight: 700,
                    color,
                    textShadow: glow !== "none" ? `0 0 8px ${color}` : 'none',
                    fontVariantNumeric: 'tabular-nums'
                }}>
                    -{hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`}
                </span>
            </div>
        </div>
    );
}
