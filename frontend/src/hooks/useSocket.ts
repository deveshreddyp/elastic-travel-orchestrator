import { useEffect, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { useElasticStore } from "../store/itineraryStore";

const WS_URL = import.meta.env.VITE_WS_URL || "";

interface QueuedEvent {
    event: string;
    payload: any;
}

export function useSocket() {
    const {
        socket: storeSocket,
        setSocket,
        setConnected,
        setReplanning,
    } = useElasticStore();

    const socketRef = useRef<Socket | null>(null);
    const eventQueue = useRef<QueuedEvent[]>([]);
    const wasConnected = useRef(false);

    useEffect(() => {
        const socket = io(WS_URL, {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: Infinity,
        });

        socketRef.current = socket;
        setSocket(socket);

        socket.on("connect", () => {
            console.log("[WS] Connected with ID:", socket.id);
            setConnected(true);

            // Rejoin session if we have one
            const currentSession = useElasticStore.getState().sessionId;
            if (currentSession) {
                socket.emit("session:join", { sessionId: currentSession });
            }

            // Replay queued events on reconnect
            if (wasConnected.current && eventQueue.current.length > 0) {
                console.log(`[WS] Replaying ${eventQueue.current.length} queued events`);
                eventQueue.current.forEach(({ event, payload }) => {
                    handleEvent(event, payload);
                });
                eventQueue.current = [];
            }

            wasConnected.current = true;
        });

        socket.on("disconnect", () => {
            console.log("[WS] Disconnected. Attempting reconnect...");
            setConnected(false);
        });

        socket.on("connect_error", (err) => {
            console.error("[WS] Connection Error:", err.message);
            setConnected(false);
        });

        // Event: Disruption acknowledged → replanning starts
        socket.on("disruption:acknowledged", (payload) => {
            const t0 = performance.now();
            console.log(`[ELASTIC] Disruption received`);
            useElasticStore.getState().setDisruptionT0(t0);
            setReplanning(true);
            if (payload) {
                const event = {
                    id: payload.id || `evt-${Date.now()}`,
                    type: payload.type || "LINE_CANCELLATION",
                    severity: payload.severity || "MAJOR",
                    timestamp: payload.timestamp || new Date().toISOString(),
                    source: payload.source || ("DEMO_INJECT" as const),
                    summary: payload.summary,
                    ...(payload.affectedModes && { affectedModes: payload.affectedModes }),
                    ...(payload.delayMinutes && { delayMinutes: payload.delayMinutes }),
                    ...(payload.affectedStopId && { affectedStopId: payload.affectedStopId }),
                };
                useElasticStore.getState().setDisruption(event);
                useElasticStore.getState().addDisruptionLog(event);
            }
        });

        // Event: Replanning completed — new itinerary + diff
        socket.on("itinerary:updated", (payload) => {
            if (!socket.connected) {
                eventQueue.current.push({ event: "itinerary:updated", payload });
                return;
            }
            handleEvent("itinerary:updated", payload);
        });

        function handleEvent(event: string, payload: any) {
            if (event === "itinerary:updated") {
                const { itinerary, diff } = payload;
                if (payload.action === "undo") {
                    useElasticStore.getState().setItinerary(itinerary);
                    useElasticStore.getState().setReplanning(false);
                } else {
                    useElasticStore.getState().applyDiff(itinerary, diff);
                    useElasticStore.getState().incrementDemoRun();
                }
            }
        }

        return () => {
            socket.disconnect();
            setSocket(null as any);
            setConnected(false);
        };
    }, []);

    return storeSocket || socketRef.current;
}
