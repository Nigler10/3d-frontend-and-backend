// src/components/CakeInscription.jsx
import { useMemo, useCallback } from "react";
import * as THREE from "three";
import { Text as ThreeText } from "three-text/mesh/react";
import { TEXT_FONT_OPTIONS } from "../contexts/Customization";
import { normalizeCakeMessage } from "../utils/cakeMessage";

ThreeText.setHarfBuzzPath("/hb/hb.wasm");

const TEXT_LAYOUT_BY_TIER = [
    { y: 2.35, radius: 1, size: 0.22, z: 0.22 },
    { y: 1.80, radius: 0.72, size: 0.18, z: 0.18 },
    { y: 2.30, radius: 0.52, size: 0.16, z: 0.12 },
    { y: 2.75, radius: 0.40, size: 0.13, z: 0.10 },
];

const FONT_PATHS = Object.fromEntries(
    TEXT_FONT_OPTIONS.map((fontOption) => [fontOption.value, fontOption.path])
);

export function CakeInscription({ selectedTierIndex, text = "", font = "classic", color = "#EF4444", topY }) {
    const safeText = normalizeCakeMessage(text);
    const layout = TEXT_LAYOUT_BY_TIER[selectedTierIndex] ?? TEXT_LAYOUT_BY_TIER[0];
    const maxWidth = layout.radius * 2 * 0.8;
    const fontPath = FONT_PATHS[font] ?? TEXT_FONT_OPTIONS[0].path;

    const material = useMemo(
        () =>
            new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.08,
                roughness: 0.42,
                metalness: 0.02,
                side: THREE.DoubleSide,
            }),
        [color]
    );

    const fitGeometry = useCallback((geometry) => {
        geometry.center();
        geometry.computeBoundingBox();
        const bounds = geometry.boundingBox.getSize(new THREE.Vector3());

        // Fit the entire text footprint, including long words and extra lines,
        // inside the top tier with room for its offset and an icing margin.
        const availableRadius = layout.radius * 0.9 - Math.abs(layout.z);
        const footprintDiameter = Math.hypot(bounds.x, bounds.y);
        const scale = Math.min(1, (availableRadius * 2) / footprintDiameter);

        if (scale < 1) {
            geometry.scale(scale, scale, 1);
            geometry.computeBoundingBox();
        }
        geometry.computeBoundingSphere();
    }, [layout.radius, layout.z]);

    if (!safeText) return null;

    return (
        <ThreeText
            font={fontPath}
            size={layout.size}
            depth={0.018}
            lineHeight={0.82}
            letterSpacing={0.01}
            removeOverlaps
            layout={{
                width: maxWidth,
                align: "center",
                respectExistingBreaks: true,
            }}
            material={material}
            position={[0, topY ?? layout.y, layout.z]}
            rotation={[-Math.PI / 2, 0, 0]}
            onLoad={fitGeometry}
            onError={(error) => console.error("Cake inscription failed:", error)}
        >
            {safeText}
        </ThreeText>
    );
}

export default CakeInscription;
