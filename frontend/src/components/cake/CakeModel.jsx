import { lazy, useLayoutEffect } from "react";
import { Html } from "@react-three/drei";
import { getTierLoadingPosition } from "./tierConfig";

const TIERS = [
    lazy(() => import("./CakeTierScene").then((module) => ({ default: module.Tier1Cake }))),
    lazy(() => import("./CakeTierScene").then((module) => ({ default: module.Tier2Cake }))),
    lazy(() => import("./CakeTierScene").then((module) => ({ default: module.Tier3Cake }))),
    lazy(() => import("./CakeTierScene").then((module) => ({ default: module.Tier4Cake }))),
];

export function TierLoadingFallback({ selectedTierIndex = 0, onReady }) {
    useLayoutEffect(() => { onReady?.(false); }, [onReady]);
    return (
        <Html center position={getTierLoadingPosition(selectedTierIndex)} style={{ pointerEvents: "none" }}>
            <div role="status" aria-live="polite" data-tier-loading={selectedTierIndex + 1} className="h-14 w-14 animate-spin rounded-full border-[5px] border-[#F3E5D0] border-l-[#C05A11]">
                <span className="sr-only">Loading tier {selectedTierIndex + 1} cake assets</span>
            </div>
        </Html>
    );
}

export default function CakeModel(props) {
    const index = TIERS[props.selectedTierIndex] ? props.selectedTierIndex : 0;
    const Tier = TIERS[index];
    return <Tier {...props} />;
}
