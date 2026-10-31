import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { HandGrab } from "lucide-react";
import { toast } from "react-toastify";
import * as THREE from "three";
import { getToppingCollisionBox, getTransformedToppingBox } from "../utils/toppingDragPlacement";
import { createToppingDragController } from "../utils/toppingDragController.js";

const DragPlacementContext = createContext(null);

export function ToppingDragProvider({ children }) {
    const [store] = useState(() => {
        const listeners = new Set();
        const dragPositionListeners = new Set();
        let positions = new Map();
        let dragging = { isDragging: false, x: 0, y: 0 };
        let dragPosition = { x: 0, y: 0 };
        return {
            controller: null,
            subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
            get: (id) => positions.get(id),
            getDragging: () => dragging,
            getDragPosition: () => dragPosition,
            subscribeDragPosition: (listener) => { dragPositionListeners.add(listener); return () => dragPositionListeners.delete(listener); },
            setDragging(isDragging, point = dragPosition) {
                dragPosition = { x: point.x, y: point.y };
                dragPositionListeners.forEach((listener) => listener());
                if (dragging.isDragging === isDragging) return;
                dragging = { isDragging, x: point.x, y: point.y };
                listeners.forEach((listener) => listener());
            },
            publish(id, position) {
                const old = positions.get(id);
                if (old && Math.abs(old.x - position.x) < 0.00001 && Math.abs(old.y - position.y) < 0.00001) return;
                positions = new Map(positions).set(id, { ...position });
                listeners.forEach((listener) => listener());
            },
            clear(id) {
                if (!positions.has(id)) return;
                positions = new Map(positions);
                positions.delete(id);
                listeners.forEach((listener) => listener());
            },
        };
    });
    return <DragPlacementContext.Provider value={store}>{children}</DragPlacementContext.Provider>;
}

export function useToppingDragStore() {
    return useContext(DragPlacementContext);
}

export function useToppingDragMarker(id) {
    const store = useToppingDragStore();
    return useSyncExternalStore(store.subscribe, () => store.get(id), () => undefined);
}

export function ToppingDragIndicator() {
    const store = useToppingDragStore();
    const ref = useRef(null);
    const { isDragging, x, y } = useSyncExternalStore(store.subscribe, store.getDragging, store.getDragging);
    useLayoutEffect(() => {
        if (!isDragging) return;
        const updatePosition = () => {
            const point = store.getDragPosition();
            if (ref.current) ref.current.style.transform = `translate3d(${point.x - 48}px, ${point.y - 48}px, 0)`;
        };
        updatePosition();
        return store.subscribeDragPosition(updatePosition);
    }, [store, isDragging]);
    if (!isDragging) return null;
    return (
        <div
            ref={ref}
            aria-hidden="true"
            data-topping-drag-indicator="true"
            style={{ position: "fixed", left: 0, top: 0, transform: `translate3d(${x - 48}px, ${y - 48}px, 0)`, pointerEvents: "none", zIndex: 9999, filter: "drop-shadow(0 2px 4px #0008)" }}
        >
            <HandGrab color="#DDD8C6" size={40} strokeWidth={2.25} />
        </div>
    );
}

export function useToppingDragPlacement({ scene, cakeGroupRef, controlsRef, state, readOnly = false }) {
    const store = useToppingDragStore();
    const enabled = Boolean(store && cakeGroupRef && controlsRef);
    const latest = useRef(null);
    latest.current = { scene, cakeGroupRef, controlsRef, state };
    const { camera, gl, invalidate } = useThree();
    latest.current.camera = camera;
    const [controller] = useState(() => createToppingDragController({
        getCurrent: () => latest.current, store, invalidate,
        onPlacementRejected: (ids) => {
            latest.current.state.rejectToppingAdditions(ids);
            toast.warning("No more space for this topping. Try arranging the other toppings");
        },
        onNumberCandleResizeRejected: () => {
            latest.current.state.setCandle(false);
            latest.current.state.setToppingPosition("candle", 50, 50, null);
            toast.error("No more space in these ledge.", { toastId: "number-candle-ledge-space" });
        },
        onNumberCandleSizeRejected: (layout) => {
            latest.current.state.setToppingSize("candle", "small");
            latest.current.state.setToppingPosition("candle", layout.x, layout.y, layout.position, layout.relativePlacement);
            toast.error("Choose Small to fit the candle on this ledge.", { toastId: "number-candle-size-fit" });
        },
        onLowerLedgeRestricted: (id) => toast.warn(
            id === "candle"
                ? "Single candle must stay on the top tier. Number candles can only use lower ledges facing the camera"
                : "Chocolates and balls must stay on the top tier.",
            { toastId: id === "candle" ? "candle-tier-restriction" : "topping-lower-ledge-restriction" }
        ),
        onCherryFitRejected: () => toast.error(
            "This topping does not fit on this lower ledge. Please place it on another tier.",
            { toastId: "cherry-fit-warning" }
        ),
    }));
    controller.enabled = enabled;
    controller.interactive = !readOnly;
    useFrame((_, delta) => { if (enabled) controller.update(delta); });
    useEffect(() => {
        if (!enabled || readOnly) return;
        const canvas = gl.domElement;
        const pointerTarget = canvas.ownerDocument || canvas;
        const onPointerMove = (event) => controller.pointerMove(event, camera, canvas);
        const onPointerUp = (event) => controller.pointerUp(event, camera, canvas);
        pointerTarget.addEventListener("pointermove", onPointerMove);
        pointerTarget.addEventListener("pointerup", onPointerUp);
        return () => {
            pointerTarget.removeEventListener("pointermove", onPointerMove);
            pointerTarget.removeEventListener("pointerup", onPointerUp);
        };
    }, [controller, enabled, readOnly, gl, camera]);
    useLayoutEffect(() => { if (enabled) controller.reconcile(false); });
    useEffect(() => {
        if (!enabled) return;
        store.controller = controller;
        controller.reconcile();
    });
    useEffect(() => () => {
        if (!enabled) return;
        controller.end();
        if (store.controller === controller) store.controller = null;
    }, [controller, store, enabled]);
    return controller;
}

export function DraggableCakeTopping({ id, controller, anchor, layout, insertionDepth = 0, children }) {
    const ref = useRef(null);
    const { camera, gl } = useThree();
    useLayoutEffect(() => {
        if (!controller.enabled) return;
        const measure = () => {
            const object = ref.current;
            if (!object) return;
            object.matrix.identity();
            object.visible = true;
            const parent = object.parent;
            const position = new THREE.Vector3(...anchor);
            const box = getToppingCollisionBox(object, parent).translate(position.clone().negate());
            const messageBox = getTransformedToppingBox(object, parent).translate(position.clone().negate());
            const depth = insertionDepth === "existing" ? Math.max(0, Math.min(0.15, anchor[1] + 0.01 - (position.y + box.min.y))) : insertionDepth;
            controller.register(id, { id, object, anchor: position, box, messageBox, layout, insertionDepth: depth, position: null });
        };
        if (controller.isDragging.current) controller.defer(id, measure);
        else measure();
    });
    useLayoutEffect(() => () => { if (controller.enabled) controller.unregister(id); }, [controller, id]);
    if (!controller.enabled) return children;
    if (!controller.interactive) return <group ref={ref} matrixAutoUpdate={false}>{children}</group>;
    return (
        <group
            ref={ref}
            matrixAutoUpdate={false}
            userData={{ toppingId: id }}
            onPointerDown={(event) => {
                if (event.button !== 0 || event.isPrimary === false) return;
                event.stopPropagation();
                if (!controller.begin(id)) return;
                controller.startPointer(id, null, camera, gl.domElement, {
                    x: event.clientX, y: event.clientY, pointerId: event.pointerId,
                });
            }}
        >
            {children}
        </group>
    );
}
