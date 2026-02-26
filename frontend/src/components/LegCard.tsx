/**
 * LegCard — Per-leg display: mode icon, stop, cost, friction badge.
 * Indented 24px from the timeline line, with diff glow animations.
 */

import { useEffect, useState } from "react";
import type { Stop, Leg } from "../types/index";

interface LegCardProps {
    stop: Stop;
    leg: Leg | null;
    isDropped: boolean;
    isNew: boolean;
    isChanged: boolean;
}

const MODE_ICONS: Record<string, string> = {
    WALKING: "🚶",
    TRANSIT: "🚌",
    EBIKE: "🚲",
    RIDESHARE: "🚗",
};

const MODE_CLASSES: Record<string, string> = {
    WALKING: 'mode-walking',
    TRANSIT: 'mode-transit',
    EBIKE: 'mode-ebike',
    RIDESHARE: 'mode-rideshare',
};

function formatCents(cents: number): string {
    if (cents === 0) return "Free";
    return `$${(cents / 100).toFixed(2)}`;
}

function formatDuration(seconds: number): string {
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins} min`;
    const hrs = Math.floor(mins / 60);
    const rem = mins % 60;
    return `${hrs}h ${rem}m`;
}

export function LegCard({ leg, isDropped, isNew, isChanged }: LegCardProps) {
    const [glowClass, setGlowClass] = useState("");

    // Handle animations for new/changed legs
    useEffect(() => {
        if (isNew) {
            setGlowClass("leg-new");
            const timer = setTimeout(() => setGlowClass(""), 3000);
            return () => clearTimeout(timer);
        } else if (isChanged) {
            setGlowClass("leg-changed");
            const timer = setTimeout(() => setGlowClass(""), 500);
            return () => clearTimeout(timer);
        }
    }, [isNew, isChanged]);


    const mode = leg?.mode ?? "WALKING";
    const modeClass = MODE_CLASSES[mode] || 'mode-walking';

    const cardStyle: React.CSSProperties = {
        marginLeft: '24px', // indented from the line
        padding: '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        position: 'relative',
        transition: 'all 0.3s ease',
        opacity: isDropped ? 0.5 : 1,
    };

    // Apply specific CSS animations via class names (defined in index.css)
    const classNames = ["glass-card", "leg-card", glowClass].filter(Boolean).join(" ");

    return (
        <div className={classNames} style={cardStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>

                {/* Left: Mode Icon + Label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{MODE_ICONS[mode] || "🚶"}</span>
                    <span className={modeClass} style={{
                        fontFamily: 'Syne, sans-serif',
                        fontWeight: 700,
                        fontSize: '13px',
                        letterSpacing: '0.05em'
                    }}>
                        {mode.charAt(0) + mode.slice(1).toLowerCase()}
                    </span>
                </div>

                {/* Center: Duration & Distance */}
                <div style={{
                    fontFamily: 'DM Sans, sans-serif',
                    fontSize: '13px',
                    color: 'var(--text-secondary)'
                }}>
                    {leg ? `${formatDuration(leg.durationSec)}` : "Calculating..."}
                </div>

                {/* Right: Cost */}
                <div style={{
                    fontFamily: 'JetBrains Mono, monospace',
                    fontSize: '13px',
                    color: 'var(--text-primary)'
                }}>
                    {leg ? formatCents(leg.costCents) : "-"}
                </div>
            </div>

            {/* Bottom Row: Friction Badge (if applicable) */}
            {leg?.frictionLevel && (
                <div style={{ marginTop: '4px' }}>
                    <FrictionBadge level={leg.frictionLevel} />
                </div>
            )}
        </div>
    );
}

function FrictionBadge({ level }: { level: string }) {
    let color = 'var(--accent-safe)';
    let text = 'LOW RISK';
    let glow = 'none';

    if (level === "MEDIUM") {
        color = 'var(--accent-gold)';
        text = 'MODERATE';
    } else if (level === "HIGH") {
        color = 'var(--accent-warning)';
        text = 'HIGH RISK';
        glow = 'var(--glow-warning)';
    }

    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            color: color,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: '10px',
            fontWeight: 600,
            letterSpacing: '0.05em',
            textShadow: glow !== 'none' ? `0 0 8px ${color}` : 'none'
        }}>
            ● {text}
        </span>
    );
}
