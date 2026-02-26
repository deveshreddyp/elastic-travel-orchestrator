/**
 * ActiveDayView — Mission Control Layout
 * 
 * Desktop: Split screen — Left sidebar (timeline) / Right full map
 * Mobile: Map top / Timeline scrollable below
 * Top Bar: Sticky header, full width, wordmark, status, inline budget/deadline.
 */

import { useElasticStore } from "../store/itineraryStore";
import { MapLayer } from "./MapLayer";
import { BudgetMeter } from "./BudgetMeter";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { ItineraryTimeline } from "./ItineraryTimeline";
import { DisruptionCard } from "./DisruptionCard";

export function ActiveDayView() {
    const { itinerary, isReplanning, isConnected, diff } = useElasticStore();

    // Determine current/next stop name simply from timeline state
    const currentStop = itinerary?.stops.find(s => s.status === 'PENDING')?.name || 'Arriving at Destination';

    return (
        <div className="active-day-root">

            {/* ─── Sticky Top Bar ─────────────────────────────────────── */}
            <header className="mission-top-bar glass-card">

                {/* Brand & Status */}
                <div className="top-bar-brand">
                    <span className="brand-logo heading-display" style={{ fontFamily: 'Syne, sans-serif' }}>ELASTIC</span>
                    <div className="status-indicator">
                        <span className={`status-dot ${isReplanning ? 'replanning' : isConnected ? 'nominal' : 'disconnected'}`} aria-hidden="true" />
                        <span className="status-text label-caps">
                            {isReplanning ? 'RECALCULATING' : isConnected ? 'NOMINAL' : 'RECONNECTING'}
                        </span>
                    </div>
                </div>

                {/* Now Traveling To */}
                <div className="top-bar-now heading-display" style={{ fontFamily: 'Syne, sans-serif' }}>
                    {isReplanning ? <span className="text-warning" style={{ color: 'var(--accent-gold)' }}>Rerouting...</span> : `Now: ${currentStop}`}
                </div>

                {/* Flight Instruments (Budget / Deadline) */}
                <div className="top-bar-instruments">
                    <div className="instrument-group">
                        <span className="label-caps">BUDGET</span>
                        <div className="instrument-value">
                            <BudgetMeter itinerary={itinerary} compact />
                        </div>
                    </div>
                    <div className="instrument-divider" />
                    <div className="instrument-group">
                        <span className="label-caps">RETURN</span>
                        <div className="instrument-value">
                            <DeadlineCountdown itinerary={itinerary} />
                        </div>
                    </div>
                </div>
            </header>

            {/* ─── Main Content Grid ──────────────────────────────────── */}
            <div className="mission-grid">

                {/* Left: Timeline Sidebar */}
                <aside className="mission-sidebar glass-card">
                    <ItineraryTimeline itinerary={itinerary} diff={diff} />
                </aside>

                {/* Right: Map View */}
                <main className="mission-map">
                    <MapLayer itinerary={itinerary} />

                    {/* Map Replanning Overlay */}
                    {isReplanning && (
                        <div className="replanning-overlay" role="status" aria-label="Recalculating route">
                            <div className="spinner-large" />
                        </div>
                    )}
                </main>
            </div>

            {/* ─── Disruption Card Overlay ──────────────────────────── */}
            {diff && <DisruptionCard diff={diff} itinerary={itinerary} />}
        </div>
    );
}

