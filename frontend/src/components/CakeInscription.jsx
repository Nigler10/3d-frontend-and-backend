// src/components/CakeInscription.jsx
import { useMemo, useCallback, useRef, useEffect, useState } from "react";
import { DragControls } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Text as ThreeText } from "three-text/mesh/react";
import { TEXT_FONT_OPTIONS } from "../contexts/Customization";
import { normalizeCakeMessage, normalizeCakeMessageLayout, wrapCakeMessage } from "../utils/cakeMessage";
import { clampCakeMessagePosition, curveCakeMessageGeometry, fitCakeMessageGeometry, getCakeMessageDragPosition, getCakeMessageSurface } from "../utils/cakeMessagePlacement";

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

export function CakeInscription({ selectedTierIndex, text = "", font = "classic", color = "#EF4444", topY, messageLayout, textSize, onLayoutChange, surfaceBounds, surfaceScene, controlsRef, draggingRef, round = true, readOnly = false }) {
    const safeText = normalizeCakeMessage(text);
    const layout = TEXT_LAYOUT_BY_TIER[selectedTierIndex] ?? TEXT_LAYOUT_BY_TIER[0];
    const settings = normalizeCakeMessageLayout({ ...messageLayout, textSize: textSize ?? messageLayout?.textSize });
    const diameter = surfaceBounds ? Math.min(surfaceBounds.max.x - surfaceBounds.min.x, surfaceBounds.max.z - surfaceBounds.min.z) : layout.radius * 2;
    const relativeScale = settings.textSize / 100 * (diameter / (2 * TEXT_LAYOUT_BY_TIER[0].radius));
    const fontSize = TEXT_LAYOUT_BY_TIER[0].size * relativeScale;
    const maxWidth = diameter * settings.width / 100;
    const fontPath = FONT_PATHS[font] ?? TEXT_FONT_OPTIONS[0].path;
    const wrapKey = `${fontPath}:${fontSize}:${maxWidth}:${safeText}`;
    const [wrapped, setWrapped] = useState(null);
    const renderedText = wrapped?.key === wrapKey ? wrapped.text : safeText;
    const renderWidth = wrapped?.key === wrapKey ? wrapped.width : undefined;
    const geometryLayoutKey = `${wrapKey}:${renderWidth}:${renderedText}`;
    const rootRef = useRef(null);
    const dragRef = useRef(null);
    const geometryRef = useRef(null);
    const geometryLayoutRef = useRef(null);
    const pendingReclampRef = useRef(null);
    const placementRef = useRef(null);
    const interactionRef = useRef(null);
    const dragStart = useRef({ local: new THREE.Vector3(), world: new THREE.Vector3() });
    const matrix = useMemo(() => new THREE.Matrix4(), []);
    const invalidate = useThree((state) => state.invalidate);
    const canvas = useThree((state) => state.gl.domElement);

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
    useEffect(() => () => material.dispose(), [material]);

    const fitGeometry = useCallback((geometry, saveLayout) => {
        if (!geometry.attributes.position?.count) return;
        const bounds = surfaceBounds || new THREE.Box3(
            new THREE.Vector3(-layout.radius, 0, -layout.radius),
            new THREE.Vector3(layout.radius, topY ?? layout.y, layout.radius)
        );
        const surface = getCakeMessageSurface(surfaceScene, rootRef.current, bounds, round);
        const boundaryKey = `${selectedTierIndex}:${round}:${surface.minX}:${surface.maxX}:${surface.minZ}:${surface.maxZ}:${surface.topY}`;
        if (!readOnly && placementRef.current && placementRef.current.boundaryKey !== boundaryKey) {
            pendingReclampRef.current = new THREE.Vector3().setFromMatrixPosition(matrix);
        }
        curveCakeMessageGeometry(geometry, settings.curve);
        const box = fitCakeMessageGeometry(geometry, maxWidth, surface);
        const requested = pendingReclampRef.current ?? new THREE.Vector3(
            THREE.MathUtils.lerp(surface.minX, surface.maxX, settings.x / 100),
            0,
            THREE.MathUtils.lerp(surface.minZ, surface.maxZ, settings.y / 100)
        );
        const position = clampCakeMessagePosition(requested, box, surface);
        placementRef.current = { box, surface, boundaryKey };
        matrix.makeTranslation(position.x, position.y, position.z);
        if (dragRef.current) dragRef.current.matrix.copy(matrix);
        // Keep the current X/Z position across a boundary change. Commit its
        // clamped coordinates only after the new size and wrapping have loaded.
        if (pendingReclampRef.current && geometryLayoutRef.current === geometryLayoutKey && renderWidth !== undefined) {
            pendingReclampRef.current = null;
            const x = 100 * (position.x - surface.minX) / (surface.maxX - surface.minX);
            const y = 100 * (position.z - surface.minZ) / (surface.maxZ - surface.minZ);
            if (!readOnly && (Math.abs(x - settings.x) > 1e-5 || Math.abs(y - settings.y) > 1e-5)) saveLayout?.({ x, y });
        }
        invalidate();
    }, [surfaceBounds, surfaceScene, round, selectedTierIndex, layout.radius, layout.y, topY, settings.curve, settings.x, settings.y, maxWidth, matrix, invalidate, geometryLayoutKey, renderWidth, readOnly]);

    const onLoad = useCallback((geometry, textInfo) => {
        if (textInfo) {
            const scale = fontSize / textInfo.getLoadedFont().upem;
            const measure = (value) => textInfo.measureTextWidth(value, 0.01) * scale;
            const wrappedText = wrapCakeMessage(safeText, maxWidth, measure);
            // Give the renderer enough width for every explicit line so its
            // automatic wrapping cannot split our whole words into letters.
            const wrappedWidth = Math.max(maxWidth, ...wrappedText.split("\n").map(measure)) * (1 + 1e-6);
            if (wrappedText !== renderedText || wrappedWidth !== renderWidth) setWrapped({ key: wrapKey, text: wrappedText, width: wrappedWidth });
        }
        geometryRef.current = geometry;
        geometryLayoutRef.current = geometryLayoutKey;
        fitGeometry(geometry, onLayoutChange);
    }, [fitGeometry, fontSize, maxWidth, renderedText, renderWidth, safeText, wrapKey, geometryLayoutKey, onLayoutChange]);
    useEffect(() => {
        // Parent layout effects update the visible cake shape first, so the
        // surface outline measured here belongs to the newly selected shape.
        if (geometryRef.current) fitGeometry(geometryRef.current, onLayoutChange);
    }, [fitGeometry, onLayoutChange]);

    const beginInteraction = () => {
        if (readOnly || interactionRef.current) return;
        interactionRef.current = { controls: controlsRef?.current, enabled: controlsRef?.current?.enabled, canvas, cursor: canvas.style.cursor };
        canvas.style.cursor = "grabbing";
        if (controlsRef?.current) controlsRef.current.enabled = false;
        if (draggingRef) draggingRef.current = true;
    };
    const restoreInteraction = useCallback(() => {
        const interaction = interactionRef.current;
        interactionRef.current = null;
        if (interaction?.controls) interaction.controls.enabled = interaction.enabled;
        if (interaction) interaction.canvas.style.cursor = interaction.cursor;
        if (draggingRef) draggingRef.current = false;
        return interaction;
    }, [draggingRef]);
    const endInteraction = () => {
        if (!restoreInteraction()) return;
        const surface = placementRef.current?.surface;
        if (surface) {
            const position = new THREE.Vector3().setFromMatrixPosition(matrix);
            onLayoutChange?.({ x: 100 * (position.x - surface.minX) / (surface.maxX - surface.minX), y: 100 * (position.z - surface.minZ) / (surface.maxZ - surface.minZ) });
        }
    };
    useEffect(() => () => { restoreInteraction(); }, [restoreInteraction]);
    useEffect(() => { if (!safeText) restoreInteraction(); }, [safeText, restoreInteraction]);
    useEffect(() => {
        if (typeof window === "undefined") return;
        window.addEventListener("blur", endInteraction);
        return () => window.removeEventListener("blur", endInteraction);
    });

    if (!safeText) return null;

    const message = (
        <ThreeText
            font={fontPath}
            size={fontSize}
            depth={0.018 * relativeScale}
            lineHeight={0.82}
            letterSpacing={0.01}
            removeOverlaps
            perGlyphAttributes
            layout={{
                width: renderWidth,
                align: "center",
                respectExistingBreaks: true,
                hyphenate: false,
            }}
            material={material}
            rotation={[-Math.PI / 2, 0, 0]}
            onLoad={onLoad}
            onError={(error) => console.error("Cake inscription failed:", error)}
        >
            {renderedText}
        </ThreeText>
    );
    return (
        <group ref={rootRef} onPointerDown={readOnly ? undefined : (event) => {
            if (event.button !== 0 || event.isPrimary === false) return;
            event.stopPropagation();
            beginInteraction();
        }} onPointerUp={readOnly ? undefined : endInteraction} onPointerCancel={readOnly ? undefined : endInteraction}>
            {readOnly ? <group ref={dragRef} matrix={matrix} matrixAutoUpdate={false}>{message}</group> : (
                <DragControls ref={dragRef} matrix={matrix} autoTransform={false} axisLock="y"
                    onDragStart={() => {
                        beginInteraction();
                        dragStart.current.local.setFromMatrixPosition(matrix);
                        rootRef.current.updateWorldMatrix(true, false);
                        dragStart.current.world.copy(dragStart.current.local).applyMatrix4(rootRef.current.matrixWorld);
                    }}
                    onDrag={(proposed) => {
                        const placement = placementRef.current;
                        if (!placement) return;
                        const local = getCakeMessageDragPosition(proposed, dragStart.current.local, dragStart.current.world, rootRef.current);
                        const position = clampCakeMessagePosition(local, placement.box, placement.surface);
                        matrix.setPosition(position);
                        dragRef.current.matrix.copy(matrix);
                    }}
                    onDragEnd={endInteraction}
                >{message}</DragControls>
            )}
        </group>
    );
}

export default CakeInscription;
