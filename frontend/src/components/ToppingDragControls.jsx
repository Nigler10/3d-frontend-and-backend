import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import Draggable from "react-draggable-3d";
import { HandGrab } from "lucide-react";
import { toast } from "react-toastify";
import * as THREE from "three";
import { getTransformedToppingBox } from "../utils/toppingDragPlacement";
import { createToppingDragController } from "../utils/toppingDragController.js";

const DragPlacementContext = createContext(null);
const DraggableCore = Draggable.DraggableCore;

export function ToppingDragProvider({ children }) {
    const [store] = useState(() => {
        const listeners = new Set();
        let positions = new Map();
        let dragging = { isDragging: false, x: 0, y: 0 };
        return {
            controller: null,
            subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
            get: (id) => positions.get(id),
            getDragging: () => dragging,
            setDragging(isDragging, point = dragging) {
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
    const { isDragging, x, y } = useSyncExternalStore(store.subscribe, store.getDragging, store.getDragging);
    if (!isDragging) return null;
    return (
        <div
            aria-hidden="true"
            data-topping-drag-indicator="true"
            style={{ position: "fixed", left: 0, top: 0, transform: `translate3d(${x - 48}px, ${y - 48}px, 0)`, pointerEvents: "none", zIndex: 9999, filter: "drop-shadow(0 2px 4px #0008)" }}
        >
            <HandGrab color="#ffffff" size={50} strokeWidth={2.75} />
        </div>
    );
}

export function useToppingDragPlacement({ scene, cakeGroupRef, controlsRef, state, readOnly = false }) {
    const store = useToppingDragStore();
    const enabled = Boolean(store && cakeGroupRef && controlsRef);
    const latest = useRef(null);
    latest.current = { scene, cakeGroupRef, controlsRef, state };
    const invalidate = useThree((canvas) => canvas.invalidate);
    const [controller] = useState(() => createToppingDragController({
        getCurrent: () => latest.current, store, invalidate,
        onPlacementRejected: (ids) => {
            latest.current.state.rejectToppingAdditions(ids);
            toast.warning("No more space for this topping. Try arranging the other toppings");
        },
    }));
    controller.enabled = enabled;
    controller.interactive = !readOnly;
    useFrame((_, delta) => { if (enabled) controller.update(delta); });
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
    const canvasRef = useMemo(() => ({ current: gl.domElement }), [gl.domElement]);
    useLayoutEffect(() => {
        if (!controller.enabled) return;
        const measure = () => {
            const object = ref.current;
            if (!object) return;
            object.matrix.identity();
            object.visible = true;
            const parent = object.parent;
            const position = new THREE.Vector3(...anchor);
            const box = getTransformedToppingBox(object, parent).translate(position.clone().negate());
            const depth = insertionDepth === "existing" ? Math.max(0, Math.min(0.15, anchor[1] + 0.01 - (position.y + box.min.y))) : insertionDepth;
            controller.register(id, { id, object, anchor: position, box, layout, insertionDepth: depth, position: null });
        };
        if (controller.isDragging.current) controller.defer(id, measure);
        else measure();
    });
    useLayoutEffect(() => () => { if (controller.enabled) controller.unregister(id); }, [controller, id]);
    if (!controller.enabled) return children;
    if (!controller.interactive) return <group ref={ref} matrixAutoUpdate={false}>{children}</group>;
    return (
        <DraggableCore
            nodeRef={canvasRef}
            enableUserSelectHack={false}
            onStart={(_, data) => controller.startPointer(id, data, camera, gl.domElement)}
            onDrag={(_, data) => controller.drag(id, data, camera, gl.domElement)}
            onStop={(_, data) => { controller.drag(id, data, camera, gl.domElement); controller.end(id); }}
        >
            <ToppingDragHandle objectRef={ref} canvas={gl.domElement} id={id} controller={controller}>
                {children}
            </ToppingDragHandle>
        </DraggableCore>
    );
}

// DraggableCore normally clones DOM children. Here its real native start events
// come from the canvas, while R3F's pointer picking chooses the topping group.
// No HTML overlay, CSS transform, or extra visible mesh is introduced.
function ToppingDragHandle({ objectRef, canvas, id, controller, onMouseDown, onTouchStart, children }) {
    useEffect(() => {
        canvas.addEventListener("mousedown", onMouseDown);
        canvas.addEventListener("touchstart", onTouchStart, { passive: false });
        return () => {
            canvas.removeEventListener("mousedown", onMouseDown);
            canvas.removeEventListener("touchstart", onTouchStart);
        };
    }, [canvas, onMouseDown, onTouchStart]);
    return (
        <group
            ref={objectRef}
            matrixAutoUpdate={false}
            userData={{ toppingId: id }}
            onPointerDown={(event) => {
                if (event.button !== 0 || event.isPrimary === false) return;
                event.stopPropagation();
                controller.begin(id);
            }}
        >
            {children}
        </group>
    );
}
