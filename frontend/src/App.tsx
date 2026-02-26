/**
 * App — Root Component
 * Session-based routing: OnboardingFlow → ActiveDayView
 * DemoControlPanel always mounted (hidden by default, Ctrl+Shift+D).
 * ChecklistPanel always mounted (hidden by default, Ctrl+Shift+C).
 */

import { useSocket } from "./hooks/useSocket";
import { useElasticStore } from "./store/itineraryStore";
import { OnboardingFlow } from "./components/OnboardingFlow";
import { ActiveDayView } from "./components/ActiveDayView";
import { DemoControlPanel } from "./components/DemoControlPanel";
import { ChecklistPanel } from "./components/ChecklistPanel";
import { AnimatedBackground } from "./components/AnimatedBackground";
import { AnimatePresence } from "framer-motion";

export default function App() {
    useSocket();
    const { sessionId, isReplanning } = useElasticStore();

    return (
        <>
            <AnimatedBackground isDisrupted={isReplanning} />
            <AnimatePresence mode="wait">
                {sessionId ? (
                    <ActiveDayView key="active-day" />
                ) : (
                    <OnboardingFlow key="onboarding" />
                )}
            </AnimatePresence>
            <DemoControlPanel />
            <ChecklistPanel />
        </>
    );
}

