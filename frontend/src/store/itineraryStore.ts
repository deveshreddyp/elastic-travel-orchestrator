import { create } from "zustand";
import type { Socket } from "socket.io-client";
import type { Itinerary, ItineraryDiff, DisruptionEvent } from "../types/index";

export interface ElasticStore {
    itinerary: Itinerary | null;
    prevItinerary: Itinerary | null;
    diff: ItineraryDiff | null;
    isReplanning: boolean;
    sessionId: string;
    socket: Socket | null;
    isConnected: boolean;
    disruption: DisruptionEvent | null;
    disruptionLog: DisruptionEvent[];
    showDemo: boolean;
    demoRunCount: number;
    disruptionT0: number | null;

    setItinerary: (i: Itinerary) => void;
    setReplanning: (b: boolean) => void;
    applyDiff: (itinerary: Itinerary, diff: ItineraryDiff) => void;
    undo: () => void;
    undoReplan: () => void;
    clearDiff: () => void;
    setSocket: (socket: Socket) => void;
    setConnected: (connected: boolean) => void;
    setSessionId: (id: string) => void;
    clearPrevItinerary: () => void;
    setDisruption: (d: DisruptionEvent | null) => void;
    addDisruptionLog: (d: DisruptionEvent) => void;
    toggleDemo: () => void;
    incrementDemoRun: () => void;
    setDisruptionT0: (t: number | null) => void;
}

let undoTimeout: ReturnType<typeof setTimeout> | null = null;
let diffClearTimeout: ReturnType<typeof setTimeout> | null = null;

export const useElasticStore = create<ElasticStore>((set, get) => ({
    itinerary: null,
    prevItinerary: null,
    diff: null,
    isReplanning: false,
    sessionId: "",
    socket: null,
    isConnected: false,
    disruption: null,
    disruptionLog: [],
    showDemo: false,
    demoRunCount: 0,
    disruptionT0: null,

    setItinerary: (itinerary) =>
        set({ itinerary, prevItinerary: null, diff: null }),

    setReplanning: (isReplanning) => set({ isReplanning }),

    applyDiff: (itinerary, diff) => {
        const currentItinerary = get().itinerary;

        set({
            prevItinerary: currentItinerary,
            itinerary,
            diff,
            isReplanning: false,
        });

        // Auto-clear prevItinerary after 30 seconds (undo window)
        if (undoTimeout) clearTimeout(undoTimeout);
        undoTimeout = setTimeout(() => {
            get().clearPrevItinerary();
        }, 30_000);

        // Auto-clear diff highlight after 5 seconds
        if (diffClearTimeout) clearTimeout(diffClearTimeout);
        diffClearTimeout = setTimeout(() => {
            set({ diff: null });
        }, 5_000);
    },

    undo: () => {
        const { prevItinerary } = get();
        if (prevItinerary) {
            set({ itinerary: prevItinerary, prevItinerary: null, diff: null, disruption: null });
            if (undoTimeout) clearTimeout(undoTimeout);
        }
    },

    // Alias for undo — used by DisruptionCard
    undoReplan: () => {
        get().undo();
    },

    clearDiff: () => {
        set({ diff: null, disruption: null });
    },

    setSocket: (socket) => set({ socket }),
    setConnected: (isConnected) => set({ isConnected }),
    setSessionId: (sessionId) => set({ sessionId }),
    clearPrevItinerary: () => set({ prevItinerary: null }),

    setDisruption: (disruption) => set({ disruption }),

    addDisruptionLog: (d) =>
        set((state) => ({
            disruptionLog: [d, ...state.disruptionLog].slice(0, 5),
        })),

    toggleDemo: () => set((state) => ({ showDemo: !state.showDemo })),

    incrementDemoRun: () =>
        set((state) => ({ demoRunCount: state.demoRunCount + 1 })),

    setDisruptionT0: (disruptionT0) => set({ disruptionT0 }),
}));

