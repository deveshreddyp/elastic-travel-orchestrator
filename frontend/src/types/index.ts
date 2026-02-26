/**
 * Core Data Models — TypeScript interfaces (frontend/src/types/index.ts)
 */

export type TransportMode = 'WALKING' | 'TRANSIT' | 'EBIKE' | 'RIDESHARE';
export type StopPriority = 'MUST_VISIT' | 'NICE_TO_HAVE';
export type StopStatus = 'PENDING' | 'COMPLETED' | 'DROPPED';
export type FrictionLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface UserConstraints {
    budgetCents: number;
    returnDeadline: string; // ISO8601
    preferredModes: TransportMode[];
    startLocation?: { lat: number; lng: number };
}

export interface Stop {
    id: string;
    name: string;
    lat: number;
    lng: number;
    priority: StopPriority;
    status: StopStatus;
    dropReason?: string;
}

export interface Leg {
    fromStopId: string;
    toStopId: string;
    mode: TransportMode;
    costCents: number;
    durationSec: number;
    available: boolean;
    polyline?: string;
    frictionScore?: number;
    frictionLevel?: FrictionLevel;
}

export interface Itinerary {
    id: string;
    version: number;
    user: UserConstraints;
    stops: Stop[];
    legs: Leg[];
    totalCost: number;
    projectedETA: string; // ISO8601
    status: 'ACTIVE' | 'REPLANNING' | 'COMPLETED';
    disruptions?: DisruptionEvent[];
    createdAt?: string;
    updatedAt?: string;
}

export interface DisruptionEvent {
    id: string;
    type: 'TRANSIT_DELAY' | 'LINE_CANCELLATION' | 'VENUE_CLOSED' | 'WEATHER';
    severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
    affectedRoutes?: string[];
    affectedModes?: string[];
    affectedStopId?: string;
    delayMinutes?: number;
    timestamp: string;
    source: 'LIVE_API' | 'DEMO_INJECT';
    summary?: string;
}

export interface ItineraryDiff {
    droppedStops: Stop[];
    newLegs: Leg[];
    changedLegs: Leg[];
    costDelta: number;
    etaDelta: number;
    summary?: string;
}
