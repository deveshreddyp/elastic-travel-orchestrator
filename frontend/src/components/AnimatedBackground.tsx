/**
 * AnimatedBackground — Living, breathing orb canvas
 *
 * Three radial-gradient orbs drift slowly behind all content.
 * When `isDisrupted` is true, the orange warning orb fades in
 * and all orbs pulse faster — the first visual signal of a disruption.
 */

import { useMemo } from "react";

interface AnimatedBackgroundProps {
    isDisrupted?: boolean;
}

export function AnimatedBackground({ isDisrupted = false }: AnimatedBackgroundProps) {
    const speed = isDisrupted ? "8s" : "60s";

    const containerStyle: React.CSSProperties = useMemo(
        () => ({
            position: "fixed" as const,
            inset: 0,
            zIndex: 0,
            pointerEvents: "none" as const,
            overflow: "hidden",
        }),
        []
    );

    return (
        <div style={containerStyle} aria-hidden="true">
            {/* Cyan orb — top-left */}
            <div
                className="orb orb-cyan"
                style={{
                    position: "absolute",
                    top: "-15%",
                    left: "-10%",
                    width: "600px",
                    height: "600px",
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle, rgba(0,212,255,0.04) 0%, transparent 70%)",
                    animation: `orbDrift1 ${speed} ease-in-out infinite`,
                    willChange: "transform",
                }}
            />

            {/* Blue orb — bottom-right */}
            <div
                className="orb orb-blue"
                style={{
                    position: "absolute",
                    bottom: "-20%",
                    right: "-10%",
                    width: "500px",
                    height: "500px",
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle, rgba(0,102,255,0.05) 0%, transparent 70%)",
                    animation: `orbDrift2 ${speed} ease-in-out infinite`,
                    willChange: "transform",
                }}
            />

            {/* Orange orb — center, only visible during disruption */}
            <div
                className="orb orb-warning"
                style={{
                    position: "absolute",
                    top: "30%",
                    left: "35%",
                    width: "400px",
                    height: "400px",
                    borderRadius: "50%",
                    background:
                        "radial-gradient(circle, rgba(255,107,43,0.06) 0%, transparent 70%)",
                    opacity: isDisrupted ? 1 : 0,
                    transition: "opacity 800ms ease-in-out",
                    animation: `orbDrift3 ${speed} ease-in-out infinite`,
                    willChange: "transform, opacity",
                }}
            />

            <style>{`
        @keyframes orbDrift1 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25%      { transform: translate(40px, 30px) scale(1.05); }
          50%      { transform: translate(-20px, 60px) scale(0.95); }
          75%      { transform: translate(30px, -20px) scale(1.02); }
        }
        @keyframes orbDrift2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25%      { transform: translate(-30px, -40px) scale(0.97); }
          50%      { transform: translate(50px, -20px) scale(1.04); }
          75%      { transform: translate(-40px, 30px) scale(1); }
        }
        @keyframes orbDrift3 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(25px, -35px) scale(1.06); }
          66%      { transform: translate(-30px, 25px) scale(0.96); }
        }
      `}</style>
        </div>
    );
}
