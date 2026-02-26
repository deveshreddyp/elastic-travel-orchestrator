/**
 * BudgetMeter — SVG arc progress bar showing spent / total budget.
 * Turns orange > 75%, red > 90%. Includes compact mode for the top nav.
 */

import type { Itinerary } from "../types/index";
import { motion } from "framer-motion";

interface BudgetMeterProps {
    itinerary: Itinerary | null;
    compact?: boolean;
}

function formatCents(cents: number): string {
    return `$${(cents / 100).toFixed(0)}`; // Design shows whole dollars mostly
}

export function BudgetMeter({ itinerary, compact = false }: BudgetMeterProps) {
    const spent = itinerary?.totalCost ?? 0;
    const budget = itinerary?.user?.budgetCents ?? 0;
    const percentage = budget > 0 ? Math.min(100, (spent / budget) * 100) : 0;

    // Determine color based on usage
    let color = "var(--accent-electric)";

    if (percentage > 90) {
        color = "var(--accent-danger)";
    } else if (percentage > 75) {
        color = "var(--accent-warning)";
    }

    if (compact) {
        const size = 32;
        const radius = 12;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (percentage / 100) * circumference;

        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ position: 'relative', width: size, height: size }}>
                    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
                        <circle
                            cx={size / 2} cy={size / 2} r={radius}
                            fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="3"
                        />
                        <motion.circle
                            cx={size / 2} cy={size / 2} r={radius}
                            fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
                            strokeDasharray={circumference}
                            initial={{ strokeDashoffset: circumference }}
                            animate={{ strokeDashoffset }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            style={{ filter: `drop-shadow(0 0 4px ${color})` }}
                        />
                    </svg>
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px' }}>
                        $
                    </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '13px', fontWeight: 700, lineHeight: 1 }}>
                        {formatCents(spent)}
                    </span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '10px', color: 'var(--text-dim)', lineHeight: 1, marginTop: '2px' }}>
                        OF {formatCents(budget)}
                    </span>
                </div>
            </div>
        );
    }

    // Full version (arcs)
    const size = 160;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const cy = size / 2;
    const circumference = Math.PI * radius; // Semi-circle
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    return (
        <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: size, height: size / 2 + strokeWidth }}>
                <svg width={size} height={size / 2 + strokeWidth} viewBox={`0 0 ${size} ${size / 2 + strokeWidth}`}>
                    {/* Background Arc */}
                    <path
                        d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
                        fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth} strokeLinecap="round"
                    />
                    {/* Progress Arc */}
                    <motion.path
                        d={`M ${strokeWidth / 2} ${cy} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${cy}`}
                        fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round"
                        strokeDasharray={circumference}
                        initial={{ strokeDashoffset: circumference }}
                        animate={{ strokeDashoffset }}
                        transition={{ duration: 1.5, ease: "easeOut" }}
                        style={{ filter: `drop-shadow(0 0 8px ${color})` }}
                    />
                </svg>

                <div style={{ position: 'absolute', bottom: '0', left: '0', width: '100%', textAlign: 'center', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', textShadow: `0 0 12px ${color}` }}>
                        {formatCents(spent)}
                    </span>
                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: 'var(--text-secondary)' }}>
                        of {formatCents(budget)} spent
                    </span>
                </div>
            </div>
        </div>
    );
}
