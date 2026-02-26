/**
 * ItineraryTimeline — Card view of the live itinerary with diff highlights.
 * Redesigned as a vertical mission log with a continuous gradient line.
 */

import { useMemo, useEffect, useRef } from "react";
import type { Itinerary, ItineraryDiff } from "../types/index";
import { LegCard } from "./LegCard";

interface ItineraryTimelineProps {
    itinerary: Itinerary | null;
    diff: ItineraryDiff | null;
}

export function ItineraryTimeline({ itinerary, diff }: ItineraryTimelineProps) {
    const timelineRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to first changed/new leg on diff update
    useEffect(() => {
        if (diff && timelineRef.current) {
            // Find the first element with new-leg or changed-leg class
            const firstChange = timelineRef.current.querySelector('.leg-card.new-leg, .leg-card.changed-leg');
            if (firstChange) {
                firstChange.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }
    }, [diff]);

    if (!itinerary) {
        return (
            <div className="timeline-container">
                <div className="timeline-title heading-display" style={{ fontFamily: 'Syne, sans-serif' }}>Itinerary</div>
                <div className="empty-state">
                    <div className="empty-state-icon">📍</div>
                    <div className="empty-state-title" style={{ fontFamily: 'Syne, sans-serif' }}>No itinerary yet</div>
                    <div className="empty-state-desc" style={{ fontFamily: 'var(--font-body)' }}>
                        Add your destinations, set a budget and return time, then let
                        ELASTIC plan your day.
                    </div>
                </div>
            </div>
        );
    }

    // Build set of new/changed leg keys for highlighting
    const newLegKeys = useMemo(() => {
        const keys = new Set<string>();
        if (!diff) return keys;
        diff.newLegs.forEach((l) => keys.add(`${l.fromStopId}-${l.toStopId}`));
        return keys;
    }, [diff]);

    const changedLegKeys = useMemo(() => {
        const keys = new Set<string>();
        if (!diff) return keys;
        (diff.changedLegs || []).forEach((l) => keys.add(`${l.fromStopId}-${l.toStopId}`));
        return keys;
    }, [diff]);

    const droppedIds = useMemo(
        () => new Set(diff?.droppedStops?.map((s) => s.id) ?? []),
        [diff]
    );

    return (
        <div className="timeline-container" ref={timelineRef} style={{ position: 'relative', padding: '24px' }}>
            <div className="timeline-title heading-display" style={{ fontFamily: 'Syne, sans-serif', marginBottom: '24px' }}>
                Itinerary <span style={{ color: 'var(--text-dim)', fontSize: '14px' }}>v{itinerary.version}</span> · {itinerary.stops.filter((s) => s.status !== "DROPPED").length} stops
            </div>

            <div className="timeline-track-wrapper" style={{ position: 'relative', paddingLeft: '24px' }}>
                {/* Continuous Vertical Gradient Line */}
                <div
                    className="timeline-vertical-line"
                    style={{
                        position: 'absolute',
                        left: '0',
                        top: '0',
                        bottom: '0',
                        width: '2px',
                        background: 'linear-gradient(to bottom, #00D4FF, #0066FF, #A78BFA)',
                        zIndex: 0
                    }}
                />

                {itinerary.stops.map((stop, i) => {
                    const leg = itinerary.legs[i] ?? null;
                    const isDropped = stop.status === "DROPPED" || droppedIds.has(stop.id);
                    const isCompleted = stop.status === "COMPLETED";
                    const legKey = leg ? `${leg.fromStopId}-${leg.toStopId}` : "";
                    const isNew = diff !== null && newLegKeys.has(legKey);
                    const isChanged = diff !== null && changedLegKeys.has(legKey);

                    // Stop Card Styles
                    let stopCardStyle: React.CSSProperties = {
                        position: 'relative',
                        padding: '16px',
                        marginBottom: '16px',
                        marginTop: i > 0 ? '16px' : '0',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        zIndex: 1,
                    };

                    let statusChipStyle: React.CSSProperties = {
                        padding: '4px 10px',
                        borderRadius: '100px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        letterSpacing: '0.05em',
                        border: '1px solid',
                    };

                    let statusText = stop.status;

                    if (isDropped) {
                        stopCardStyle = {
                            ...stopCardStyle,
                            borderLeft: '4px solid var(--accent-danger)',
                            background: 'rgba(255,43,94,0.04)',
                        };
                        statusChipStyle = {
                            ...statusChipStyle,
                            background: 'rgba(255,43,94,0.1)',
                            color: 'var(--accent-danger)',
                            borderColor: 'var(--accent-danger)',
                        };
                        statusText = "DROPPED";
                    } else if (isCompleted) {
                        stopCardStyle = {
                            ...stopCardStyle,
                            borderLeft: '4px solid var(--accent-safe)',
                            opacity: 0.65,
                        };
                        statusChipStyle = {
                            ...statusChipStyle,
                            background: 'rgba(0,255,148,0.1)',
                            color: 'var(--accent-safe)',
                            borderColor: 'var(--accent-safe)',
                        };
                        statusText = "COMPLETED";
                    } else {
                        statusChipStyle = {
                            ...statusChipStyle,
                            color: 'var(--text-dim)',
                            borderColor: 'var(--text-dim)',
                        };
                        statusText = "PENDING";
                    }

                    // Stop Node Connector (Horizontal line)
                    const connectorStyle: React.CSSProperties = {
                        position: 'absolute',
                        left: '-24px',
                        top: '50%',
                        width: '16px',
                        height: '2px',
                        background: 'var(--text-dim)',
                        opacity: 0.3,
                        transform: 'translateY(-50%)',
                        zIndex: 0
                    };

                    // Stop Node Circle (on the vertical line)
                    const nodeCircleStyle: React.CSSProperties = {
                        position: 'absolute',
                        left: '-24px', // 0 position of the track wrapper minus center offset
                        top: '50%',
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        transform: 'translate(-50%, -50%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        fontSize: '14px',
                        zIndex: 2,
                    };

                    const isMust = stop.priority === "MUST_VISIT";
                    if (isDropped) {
                        nodeCircleStyle.background = '#FF2B5E';
                        nodeCircleStyle.color = 'white';
                        nodeCircleStyle.border = '2px dashed #FF2B5E';
                        nodeCircleStyle.boxShadow = '0 0 16px rgba(255,43,94,0.5)';
                    } else if (isCompleted) {
                        nodeCircleStyle.background = '#00FF94';
                        nodeCircleStyle.color = '#080B12';
                        nodeCircleStyle.border = '2px solid transparent';
                    } else {
                        // Pending
                        nodeCircleStyle.background = '#151C2E';
                        nodeCircleStyle.color = '#F0F4FF';
                        if (isMust) {
                            nodeCircleStyle.border = '2px solid #00D4FF';
                            nodeCircleStyle.boxShadow = '0 0 12px rgba(0,212,255,0.4)';
                        } else {
                            nodeCircleStyle.border = '2px dashed #0066FF';
                        }
                    }

                    return (
                        <div key={stop.id} style={{ position: 'relative' }}>
                            {/* Stop Header Card */}
                            <div className="glass-card stop-header-card" style={stopCardStyle}>
                                <div style={connectorStyle} />
                                <div style={nodeCircleStyle}>
                                    {isCompleted ? '✓' : isDropped ? '✕' : (i + 1)}
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent-electric)', fontSize: '11px' }}>
                                            {String(i + 1).padStart(2, '0')}
                                        </span>
                                        <span style={{ fontFamily: 'Syne, sans-serif', fontWeight: 600, fontSize: '16px', color: isDropped ? 'var(--text-secondary)' : 'var(--text-primary)', textDecoration: isDropped ? 'line-through' : 'none' }}>
                                            {stop.name}
                                        </span>
                                    </div>
                                    <span style={{ fontFamily: 'DM Sans, sans-serif', fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '250px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {`${stop.lat.toFixed(4)}, ${stop.lng.toFixed(4)}`}
                                    </span>
                                    {isDropped && stop.dropReason && (
                                        <div style={{ fontFamily: 'DM Sans, sans-serif', fontStyle: 'italic', fontSize: '13px', color: 'var(--accent-warning)', marginTop: '4px' }}>
                                            {stop.dropReason}
                                        </div>
                                    )}
                                </div>

                                <div>
                                    <span style={statusChipStyle}>{statusText}</span>
                                </div>
                            </div>

                            {/* Leg Card (Between Stops) */}
                            {leg && (
                                <LegCard
                                    stop={stop}
                                    leg={leg}
                                    isDropped={isDropped}
                                    isNew={isNew}
                                    isChanged={isChanged}
                                />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
