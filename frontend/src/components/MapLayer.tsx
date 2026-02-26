
import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Itinerary, Stop } from '../types/index';

// Fix Leaflet's default icon path issues with Webpack/Vite
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png",
    iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png",
    shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png",
});

interface MapLayerProps {
    itinerary: Itinerary | null;
}

// Global cache for OSRM routes so repeated renders don't re-fetch
const osrmCache: Record<string, [number, number][]> = {};

// Component to dynamically adjust map bounds
function BoundsUpdater({ itinerary }: { itinerary: Itinerary | null }) {
    const map = useMap();

    useEffect(() => {
        if (!itinerary || itinerary.stops.length === 0) return;

        const bounds = L.latLngBounds(itinerary.stops.map((s: Stop) => [s.lat, s.lng]));
        if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [40, 40], maxZoom: 16, duration: 1.5 });
        }
    }, [itinerary?.version, map]); // use version to trigger flyToBounds

    return null;
}

export function MapLayer({ itinerary }: MapLayerProps) {
    const [fetchedRoutes, setFetchedRoutes] = useState<Record<string, [number, number][]>>({});

    const defaultCenter: [number, number] = [37.7749, -122.4194];

    // Fetch OSRM routes
    useEffect(() => {
        if (!itinerary) return;

        const fetchAllMissingOsrm = async () => {
            const newRoutes: Record<string, [number, number][]> = {};
            let changed = false;

            for (const leg of itinerary.legs) {
                const fromStop = itinerary.stops.find(s => s.id === leg.fromStopId);
                const toStop = itinerary.stops.find(s => s.id === leg.toStopId);
                if (!fromStop || !toStop) continue;

                // For transit, don't fetch OSRM (use straight line)
                if (leg.mode === "TRANSIT") {
                    const straightLine: [number, number][] = [[fromStop.lat, fromStop.lng], [toStop.lat, toStop.lng]];
                    const cacheKey = `${leg.fromStopId} -${leg.toStopId} -${leg.mode} `;
                    osrmCache[cacheKey] = straightLine;
                    if (!fetchedRoutes[cacheKey]) {
                        newRoutes[cacheKey] = straightLine;
                        changed = true;
                    }
                    continue;
                }

                const cacheKey = `${leg.fromStopId} -${leg.toStopId} -${leg.mode} `;
                if (osrmCache[cacheKey]) {
                    if (!fetchedRoutes[cacheKey]) {
                        newRoutes[cacheKey] = osrmCache[cacheKey];
                        changed = true;
                    }
                    continue; // Already fetched
                }

                try {
                    let osrmMode = "driving";
                    if (leg.mode === "EBIKE") osrmMode = "cycling";
                    if (leg.mode === "WALKING") osrmMode = "foot";

                    const url = `https://router.project-osrm.org/route/v1/${osrmMode}/${fromStop.lng},${fromStop.lat};${toStop.lng},${toStop.lat}?overview=full&geometries=geojson`;
                    const response = await fetch(url);
                    const data = await response.json();

                    if (data.routes && data.routes[0]) {
                        const coords = data.routes[0].geometry.coordinates.map((c: any) => [c[1], c[0]] as [number, number]);
                        osrmCache[cacheKey] = coords;
                        newRoutes[cacheKey] = coords;
                        changed = true;
                    }
                } catch (error) {
                    console.error("OSRM fetch failed:", error);
                    // Fallback to straight line
                    const straightLine: [number, number][] = [[fromStop.lat, fromStop.lng], [toStop.lat, toStop.lng]];
                    osrmCache[cacheKey] = straightLine;
                    newRoutes[cacheKey] = straightLine;
                    changed = true;
                }
            }

            if (changed) {
                setFetchedRoutes(prev => ({ ...prev, ...newRoutes }));
            }
        };

        fetchAllMissingOsrm();
    }, [itinerary]);

    // Live position dot icon
    const livePositionIcon = L.divIcon({
        html: '<div class="live-position-dot"></div>',
        className: "",
        iconSize: [16, 16],
        iconAnchor: [8, 8],
    });

    return (
        <MapContainer
            center={defaultCenter}
            zoom={13}
            zoomControl={false}
            style={{ width: "100%", height: "100%", background: "var(--bg-void)", zIndex: 1 }}
        >
            <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://carto.com/attributions">CARTO</a>'
            />
            {/* Custom Zoom Control could eventually go here */}

            <BoundsUpdater itinerary={itinerary} />

            {/* Render Legs as Polylines */}
            {itinerary?.legs.map((leg) => {
                const isDropped = itinerary.stops.find(s => s.id === leg.toStopId)?.status === "DROPPED";
                const cacheKey = `${leg.fromStopId}-${leg.toStopId}-${leg.mode}`;
                const positions = fetchedRoutes[cacheKey] || osrmCache[cacheKey] || [];
                if (positions.length === 0) return null;

                let color = "#8896B3";
                let weight = 2;
                let opacity = 0.7;
                let dashArray: string | undefined = undefined;

                if (isDropped) {
                    color = "#FF2B5E";
                    weight = 2;
                    dashArray = "4, 4";
                    opacity = 0.35;
                } else if (leg.mode === "TRANSIT") {
                    color = "#60A5FA";
                    weight = 3;
                    dashArray = "8, 4";
                    opacity = 0.9;
                } else if (leg.mode === "EBIKE") {
                    color = "#00FF94";
                    weight = 3;
                    opacity = 0.9;
                } else if (leg.mode === "RIDESHARE") {
                    color = "#A78BFA";
                    weight = 3;
                    opacity = 0.9;
                } else if (leg.mode === "WALKING") {
                    color = "#8896B3";
                    weight = 2;
                    dashArray = "3, 5";
                    opacity = 0.7;
                }

                return (
                    <div key={cacheKey}>
                        {leg.mode === "EBIKE" && !isDropped && (
                            <Polyline
                                positions={positions}
                                pathOptions={{ color: "#00FF94", weight: 10, opacity: 0.08, lineCap: "round", lineJoin: "round" }}
                                className="leaflet-polyline-glow fade-in"
                            />
                        )}
                        <Polyline
                            positions={positions}
                            pathOptions={{ color, weight, opacity, dashArray, lineCap: "round", lineJoin: "round" }}
                            className={`leaflet-polyline-main fade-in ${isDropped ? "leg-dropped" : "leg-active"}`}
                        // Need global CSS to animate opacity/color on `.leaflet-polyline-main` path elements
                        />
                    </div>
                );
            })}

            {/* Render Stops as Markers */}
            {itinerary?.stops.map((stop, index) => {
                const isDropped = stop.status === "DROPPED";
                const isCompleted = stop.status === "COMPLETED";
                const isMust = stop.priority === "MUST_VISIT";

                let ringStyle = "border: 2px dashed #0066FF;";
                if (isMust && !isDropped) {
                    ringStyle = "border: 2px solid #00D4FF; box-shadow: 0 0 12px rgba(0,212,255,0.4);";
                } else if (isDropped) {
                    ringStyle = "border: 2px dashed #FF2B5E; opacity: 0.5;";
                }

                let circleBg = "#151C2E";
                let circleColor = "#F0F4FF";
                let iconContent = String(index + 1);
                let shadow = "none";

                if (isCompleted) {
                    circleBg = "#00FF94";
                    circleColor = "#080B12";
                    iconContent = "✓";
                } else if (isDropped) {
                    circleBg = "#FF2B5E";
                    circleColor = "white";
                    iconContent = "✕";
                    shadow = "0 0 16px rgba(255,43,94,0.5)";
                }

                const htmlContent = `
                    <div class="custom-marker-wrapper ${isDropped ? "marker-dropped" : ""}" style="position: absolute; left: -22px; top: -22px;">
                        <div class="marker-ring" style="width: 44px; height: 44px; border-radius: 50%; ${ringStyle} position: absolute; left: 0; top: 0; display: flex; align-items: center; justify-content: center; box-sizing: border-box;">
                            <div class="marker-circle" style="width: 28px; height: 28px; border-radius: 50%; background: ${circleBg}; color: ${circleColor}; box-shadow: ${shadow}; display: flex; align-items: center; justify-content: center; font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: bold; box-sizing: border-box;">
                                ${iconContent}
                            </div>
                        </div>
                        <div class="marker-label" style="position: absolute; top: 48px; left: 50%; transform: translateX(-50%); background: var(--bg-surface); padding: 4px 10px; border-radius: 100px; border: 1px solid var(--border-subtle); color: var(--text-secondary); font-family: 'DM Sans', sans-serif; font-size: 11px; white-space: nowrap; font-weight: 500;">
                            ${stop.name}
                        </div>
                    </div>
                `;

                const customIcon = L.divIcon({
                    html: htmlContent,
                    className: "",
                    iconSize: [0, 0], // Sized by wrapper
                });

                return (
                    <Marker
                        key={stop.id}
                        position={[stop.lat, stop.lng]}
                        icon={customIcon}
                    />
                );
            })}

            {/* Live Position Dot (mocked as the first stop of the itinerary if exists) */}
            {itinerary && itinerary.stops.length > 0 && (
                <Marker
                    position={[itinerary.stops[0].lat, itinerary.stops[0].lng]}
                    icon={livePositionIcon}
                />
            )}
        </MapContainer>
    );
}
