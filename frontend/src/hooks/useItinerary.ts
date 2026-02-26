/**
 * useItinerary — Itinerary data hook
 *
 * Provides convenience accessors for itinerary state,
 * budget calculations, and time remaining.
 */

import { useMemo } from "react";
import { useElasticStore } from "../store/itineraryStore";

export function useItinerary() {
    const { itinerary, diff, isReplanning, prevItinerary } = useElasticStore();

    const budgetInfo = useMemo(() => {
        if (!itinerary) return null;
        const spent = itinerary.totalCost;
        const budget = itinerary.user.budgetCents;
        const remaining = budget - spent;
        const percentage = budget > 0 ? (spent / budget) * 100 : 0;
        return { spent, budget, remaining, percentage };
    }, [itinerary]);

    const timeInfo = useMemo(() => {
        if (!itinerary) return null;
        const deadline = new Date(itinerary.user.returnDeadline);
        const eta = new Date(itinerary.projectedETA);
        const now = new Date();
        const remainingMs = deadline.getTime() - now.getTime();
        const remainingMin = Math.max(0, Math.floor(remainingMs / 60000));
        const isOnTime = eta <= deadline;
        return { deadline, eta, remainingMin, isOnTime };
    }, [itinerary]);

    const activeStops = useMemo(
        () => itinerary?.stops.filter((s) => s.status === "PENDING") ?? [],
        [itinerary]
    );

    const droppedStops = useMemo(
        () => itinerary?.stops.filter((s) => s.status === "DROPPED") ?? [],
        [itinerary]
    );

    return {
        itinerary,
        prevItinerary,
        diff,
        isReplanning,
        budgetInfo,
        timeInfo,
        activeStops,
        droppedStops,
        hasUndo: prevItinerary !== null,
    };
}
