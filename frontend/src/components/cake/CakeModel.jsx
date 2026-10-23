import { lazy, useLayoutEffect } from "react";
import { Html } from "@react-three/drei";
import { getTierLoadingPosition } from "./tierConfig";

// Keep the scene and its draggable message mounted while the tier model changes.
const Tier = lazy(() => import("./CakeTierScene").then((module) => ({ default: module.CakeTierScene })));

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
    const index = Number.isInteger(props.selectedTierIndex) && props.selectedTierIndex >= 0 && props.selectedTierIndex < 4 ? props.selectedTierIndex : 0;
    return <Tier {...props} selectedTierIndex={index} />;
}
