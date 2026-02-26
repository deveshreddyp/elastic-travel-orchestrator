import { useState, useCallback, useEffect } from "react";
import { useElasticStore } from "../store/itineraryStore";
import type { TransportMode } from "../types/index";
import { motion, AnimatePresence } from "framer-motion";

interface StopInput {
    name: string;
    lat: number;
    lng: number;
    priority: "MUST_VISIT" | "NICE_TO_HAVE";
}

interface NominatimResult {
    display_name: string;
    lat: string;
    lon: string;
}

const TRANSPORT_MODES: { key: TransportMode; label: string; icon: string }[] = [
    { key: "WALKING", label: "Walking", icon: "🚶" },
    { key: "TRANSIT", label: "Transit", icon: "🚌" },
    { key: "EBIKE", label: "E-Bike", icon: "🚲" },
    { key: "RIDESHARE", label: "Rideshare", icon: "🚗" },
];

const EMPTY_STOP: StopInput = { name: "", lat: 0, lng: 0, priority: "MUST_VISIT" };
const API_BASE = import.meta.env.VITE_API_URL || "";

// Custom hook for debounced search
function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
}

export function OnboardingFlow() {
    const { setItinerary, setSessionId } = useElasticStore();

    // Start Location
    const [startName, setStartName] = useState("");
    const [startLat, setStartLat] = useState<number | null>(null);
    const [startLng, setStartLng] = useState<number | null>(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [startConfirmed, setStartConfirmed] = useState(false);

    // Start Location Search
    const [startSearchOpen, setStartSearchOpen] = useState(false);
    const [startResults, setStartResults] = useState<NominatimResult[]>([]);
    const debouncedStartName = useDebounce(startName, 400);

    // Stops
    const [stops, setStops] = useState<StopInput[]>([{ ...EMPTY_STOP }]);
    const [activeStopIndex, setActiveStopIndex] = useState<number | null>(null);
    const [stopResults, setStopResults] = useState<Record<number, NominatimResult[]>>({});

    // Budget & Deadline
    const [budgetDollars, setBudgetDollars] = useState("50");
    const [returnTime, setReturnTime] = useState("18:00");

    // Modes
    const [selectedModes, setSelectedModes] = useState<TransportMode[]>(["TRANSIT"]);

    // Submit state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingStep, setLoadingStep] = useState(0);
    const [error, setError] = useState("");

    // --- Search Effects ---

    useEffect(() => {
        if (!startName || startConfirmed || !startSearchOpen) {
            setStartResults([]);
            return;
        }
        fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(debouncedStartName)}&format=json&limit=5`)
            .then(res => res.json())
            .then(data => setStartResults(data))
            .catch(console.error);
    }, [debouncedStartName, startConfirmed, startSearchOpen]);

    const handleStopSearch = useCallback(async (query: string, index: number) => {
        if (!query.trim() || query.length < 3) {
            setStopResults(prev => ({ ...prev, [index]: [] }));
            return;
        }
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5`);
            const data = await res.json();
            setStopResults(prev => ({ ...prev, [index]: data }));
        } catch (e) {
            console.error(e);
        }
    }, []);

    // --- Actions ---

    const detectGPS = useCallback(() => {
        if (!navigator.geolocation) {
            setError("Geolocation not supported");
            return;
        }
        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                try {
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
                    const data = await res.json();
                    setStartName(data.display_name.split(",").slice(0, 3).join(","));
                    setStartLat(lat);
                    setStartLng(lng);
                    setStartConfirmed(true);
                    setStartSearchOpen(false);
                } catch (e) {
                    setStartName("Current Location (GPS)");
                    setStartLat(lat);
                    setStartLng(lng);
                    setStartConfirmed(true);
                } finally {
                    setGpsLoading(false);
                }
            },
            (err) => {
                setError(err.message);
                setGpsLoading(false);
            },
            { timeout: 10000 }
        );
    }, []);

    const selectStartResult = (res: NominatimResult) => {
        setStartName(res.display_name.split(",").slice(0, 3).join(","));
        setStartLat(parseFloat(res.lat));
        setStartLng(parseFloat(res.lon));
        setStartConfirmed(true);
        setStartSearchOpen(false);
    };

    const updateStopName = (index: number, val: string) => {
        const newStops = [...stops];
        newStops[index].name = val;
        // clear lat/lng to force re-selection
        newStops[index].lat = 0;
        newStops[index].lng = 0;
        setStops(newStops);
        setActiveStopIndex(index);

        // rudimentary inline debounce
        setTimeout(() => {
            if (val === newStops[index].name) {
                handleStopSearch(val, index);
            }
        }, 400);
    };

    const selectStopResult = (index: number, res: NominatimResult) => {
        const newStops = [...stops];
        newStops[index].name = res.display_name.split(",").slice(0, 3).join(",");
        newStops[index].lat = parseFloat(res.lat);
        newStops[index].lng = parseFloat(res.lon);
        setStops(newStops);
        setActiveStopIndex(null);
        setStopResults(prev => ({ ...prev, [index]: [] }));
    };

    const updateStopPriority = (index: number, p: "MUST_VISIT" | "NICE_TO_HAVE") => {
        const newStops = [...stops];
        newStops[index].priority = p;
        setStops(newStops);
    };

    const toggleMode = (mode: TransportMode) => {
        setSelectedModes(prev => {
            if (prev.includes(mode)) {
                return prev.length > 1 ? prev.filter(m => m !== mode) : prev;
            }
            return [...prev, mode];
        });
    };

    const handleSubmit = async () => {
        setError("");

        const validStops = stops.filter(s => s.name.trim() && s.lat !== 0);
        if (!startConfirmed || startLat === null) return setError("Please confirm your start location.");
        if (validStops.length === 0) return setError("Add at least one valid stop.");
        if (selectedModes.length === 0) return setError("Select at least one transport mode.");

        setIsSubmitting(true);

        // Fake loading sequence updates
        setTimeout(() => setLoadingStep(1), 800);
        setTimeout(() => setLoadingStep(2), 1600);
        setTimeout(() => setLoadingStep(3), 2400);

        const today = new Date();
        const [hours, minutes] = returnTime.split(":").map(Number);
        today.setHours(hours, minutes, 0, 0);

        const body = {
            start_lat: startLat,
            start_lng: startLng,
            start_name: startName,
            stops: validStops.map(s => ({
                name: s.name,
                lat: s.lat,
                lng: s.lng,
                priority: s.priority,
            })),
            budget_cents: Math.round(parseFloat(budgetDollars) * 100),
            return_deadline: today.toISOString(),
            preferred_modes: selectedModes,
        };

        try {
            const res = await fetch(`${API_BASE}/api/itinerary`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            // Hold loading screen a beat longer for effect
            setTimeout(() => {
                setItinerary(data);
                setSessionId(data.id);
            }, 800);
        } catch (err: any) {
            setError(err.message || "Failed to create itinerary");
            setIsSubmitting(false);
            setLoadingStep(0);
        }
    };

    // --- Render ---

    if (isSubmitting) {
        return (
            <motion.div
                className="loading-sequence"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
            >
                <div className="spinner-large" />
                <h2 className="heading-display-xl" style={{ fontSize: '32px', marginBottom: '32px' }}>
                    Building your day...
                </h2>

                <div className="loading-steps">
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={loadingStep >= 0 ? 'active' : 'dim'}>
                        📍 Mapping your stops
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={loadingStep >= 1 ? { opacity: 1, y: 0 } : {}} className={loadingStep >= 1 ? 'active' : 'dim'}>
                        🚌 Checking transit routes
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={loadingStep >= 2 ? { opacity: 1, y: 0 } : {}} className={loadingStep >= 2 ? 'active' : 'dim'}>
                        💰 Optimizing for your budget
                    </motion.div>
                    <motion.div initial={{ opacity: 0, y: 10 }} animate={loadingStep >= 3 ? { opacity: 1, y: 0 } : {}} className={loadingStep >= 3 ? 'active' : 'dim'}>
                        🧠 Training friction sensors
                    </motion.div>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="onboarding-root">
            <div className="cinematic-container">

                {/* Top Brand */}
                <div className="brand-header">
                    <span className="brand-logo" style={{ fontFamily: 'Syne, sans-serif', color: 'var(--accent-electric)' }}>ELASTIC</span>
                    <span className="brand-dot" aria-label="System active" />
                </div>

                {/* Hero Text */}
                <div className="cinematic-hero">
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                        className="hero-line1 heading-display-xl"
                        style={{ fontFamily: 'Syne, sans-serif', fontWeight: 700, color: 'var(--text-primary)' }}
                    >
                        Plan your day.
                    </motion.h1>
                    <motion.h1
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4, delay: 0.4 }}
                        className="hero-line2 heading-display-xl"
                        style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, color: 'var(--accent-electric)', textShadow: 'var(--glow-electric)' }}
                    >
                        We'll protect it.
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.6, delay: 0.6 }}
                        className="hero-subtitle"
                        style={{ fontFamily: '"DM Sans", sans-serif', color: 'var(--text-secondary)' }}
                    >
                        Add your stops. Set your budget. Elastic handles the rest — even when the world doesn't cooperate.
                    </motion.p>
                </div>

                <div className="cinematic-form">
                    {/* Section 01 */}
                    <div className="cinematic-form-section glass-card">
                        <div className="section-badge label-caps">01</div>
                        <h2 className="section-title">Where does your day begin?</h2>

                        <div className="start-location-input-group">
                            <div className="input-with-button">
                                <input
                                    type="text"
                                    className={`cinematic-input ${startConfirmed ? 'confirmed' : ''}`}
                                    placeholder="Address or place..."
                                    value={startName}
                                    onChange={(e) => {
                                        setStartName(e.target.value);
                                        setStartConfirmed(false);
                                        setStartSearchOpen(true);
                                    }}
                                    onFocus={() => setStartSearchOpen(true)}
                                />
                                {!startConfirmed && (
                                    <button
                                        type="button"
                                        className="btn-gps-cinematic"
                                        onClick={detectGPS}
                                        disabled={gpsLoading}
                                    >
                                        {gpsLoading ? "..." : "📍 Use GPS"}
                                    </button>
                                )}
                                {startConfirmed && <div className="confirm-check">✓</div>}
                            </div>

                            {startSearchOpen && startResults.length > 0 && (
                                <div className="nominatim-results glass-card">
                                    {startResults.map(res => (
                                        <button key={res.lat + res.lon} type="button" onClick={() => selectStartResult(res)}>
                                            {res.display_name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Section 02 */}
                    <div className="cinematic-form-section glass-card">
                        <div className="section-badge label-caps">02</div>
                        <h2 className="section-title">Where are you headed?</h2>

                        <div className="stops-list">
                            <AnimatePresence>
                                {stops.map((stop, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, height: 0, y: -10 }}
                                        animate={{ opacity: 1, height: 'auto', y: 0 }}
                                        exit={{ opacity: 0, height: 0, scale: 0.95 }}
                                        className="stop-row"
                                    >
                                        <div className="stop-drag-handle">⋮⋮</div>
                                        <div className="stop-input-wrapper">
                                            <input
                                                type="text"
                                                className={`cinematic-input ${stop.lat !== 0 ? 'confirmed' : ''}`}
                                                placeholder="Search destination..."
                                                value={stop.name}
                                                onChange={(e) => updateStopName(i, e.target.value)}
                                                onFocus={() => setActiveStopIndex(i)}
                                            />
                                            {activeStopIndex === i && stopResults[i]?.length > 0 && (
                                                <div className="nominatim-results glass-card">
                                                    {stopResults[i].map(res => (
                                                        <button key={res.lat + res.lon} type="button" onClick={() => selectStopResult(i, res)}>
                                                            {res.display_name}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>

                                        <div className="priority-pills">
                                            <button
                                                type="button"
                                                className={`pill ${stop.priority === 'MUST_VISIT' ? 'must' : ''}`}
                                                onClick={() => updateStopPriority(i, "MUST_VISIT")}
                                            >
                                                MUST VISIT
                                            </button>
                                            <button
                                                type="button"
                                                className={`pill ${stop.priority === 'NICE_TO_HAVE' ? 'nice' : ''}`}
                                                onClick={() => updateStopPriority(i, "NICE_TO_HAVE")}
                                            >
                                                NICE TO HAVE
                                            </button>
                                        </div>

                                        {stops.length > 1 && (
                                            <button type="button" className="btn-remove-stop" onClick={() => setStops(s => s.filter((_, idx) => idx !== i))}>
                                                ✕
                                            </button>
                                        )}
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </div>

                        {stops.length < 5 && (
                            <button type="button" className="btn-add-stop-cinematic" onClick={() => setStops([...stops, { ...EMPTY_STOP }])}>
                                + Add Stop
                            </button>
                        )}
                    </div>

                    {/* Section 03 & 04 Grid */}
                    <div className="cinematic-grid-2">
                        <div className="cinematic-form-section glass-card">
                            <div className="section-badge label-caps">03</div>
                            <h2 className="section-title">What's your budget?</h2>
                            <div className="budget-wrapper">
                                <span className="budget-prefix mono-data" style={{ fontFamily: '"JetBrains Mono", monospace' }}>$</span>
                                <input
                                    type="number"
                                    className="cinematic-input mono-data huge-input"
                                    style={{ fontFamily: '"JetBrains Mono", monospace', textAlign: 'center' }}
                                    value={budgetDollars}
                                    onChange={(e) => setBudgetDollars(e.target.value)}
                                />
                            </div>
                            <p className="input-hint">We'll never exceed this.</p>
                            <p className="input-hint" style={{ marginTop: '4px', color: 'var(--accent-electric)' }}>
                                Enough for approximately {Math.floor(parseFloat(budgetDollars || "0") / 2.5)} bus rides
                            </p>
                        </div>

                        <div className="cinematic-form-section glass-card">
                            <div className="section-badge label-caps">04</div>
                            <h2 className="section-title">When must you be home?</h2>
                            <input
                                type="time"
                                className="cinematic-input mono-data huge-input"
                                style={{ fontFamily: '"JetBrains Mono", monospace', textAlign: 'center' }}
                                value={returnTime}
                                onChange={(e) => setReturnTime(e.target.value)}
                            />
                            <p className="input-hint">Your hard deadline.</p>
                            <p className="input-hint" style={{ marginTop: '4px' }}>Elastic will always get you home by this time.</p>
                        </div>
                    </div>

                    {/* Section 05 */}
                    <div className="cinematic-form-section glass-card">
                        <div className="section-badge label-caps">05</div>
                        <h2 className="section-title">How do you want to travel?</h2>
                        <div className="modes-grid">
                            {TRANSPORT_MODES.map(m => (
                                <button
                                    key={m.key}
                                    type="button"
                                    className={`mode-chip glass-card ${selectedModes.includes(m.key) ? 'active' : ''}`}
                                    onClick={() => toggleMode(m.key)}
                                >
                                    <span className="mode-chip-icon">{m.icon}</span>
                                    {m.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && <div className="error-banner">{error}</div>}

                    {/* Submit */}
                    <button type="button" className="btn-electric cinematic-submit" onClick={handleSubmit} style={{ fontFamily: 'Syne, sans-serif' }}>
                        Build My Day →
                    </button>
                </div>
            </div>
        </div>
    );
}
