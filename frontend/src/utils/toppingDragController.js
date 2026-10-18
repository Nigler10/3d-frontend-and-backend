import * as THREE from "three";
import { constrainToppingPosition, findToppingPosition, getToppingDragClientPoint, getToppingSurfaceHeight, getTransformedToppingBox, isToppingPositionValid, projectToppingDrag } from "./toppingDragPlacement.js";

// All coordinates below are local to the existing cake group. Nothing changes
// the cake transform, geometry, materials, or camera configuration.
function readSurface(scene, parent, round) {
    parent.updateWorldMatrix(true, true);
    const inverse = parent.matrixWorld.clone().invert();
    const meshes = [];
    scene.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.visible) return;
        const name = mesh.name.toLowerCase();
        if (/candle|chandel|nut|bar|ball|cherry|sprinkle|plate/.test(name)) return;
        if (/cake|icing|round|rect|cube/.test(name)) meshes.push(mesh);
    });
    const bounds = new THREE.Box3();
    meshes.forEach((mesh) => bounds.union(getTransformedToppingBox(mesh, parent)));
    const top = new THREE.Box3();
    const outlinePoints = new Map();
    const vertex = new THREE.Vector3();
    meshes.forEach((mesh) => {
        const transform = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 1) {
            mesh.getVertexPosition(i, vertex).applyMatrix4(transform);
            if (vertex.y >= bounds.max.y - 0.08) {
                top.expandByPoint(vertex);
                outlinePoints.set(`${vertex.x.toFixed(5)}:${vertex.z.toFixed(5)}`, { x: vertex.x, z: vertex.z });
            }
        }
    });
    if (top.isEmpty()) top.copy(bounds);
    const points = [...outlinePoints.values()].sort((a, b) => a.x - b.x || a.z - b.z);
    const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const halfHull = (vertices) => {
        const hull = [];
        vertices.forEach((point) => {
            while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
            hull.push(point);
        });
        hull.pop();
        return hull;
    };
    const outline = [...halfHull(points), ...halfHull([...points].reverse())];
    return { minX: top.min.x, maxX: top.max.x, minZ: top.min.z, maxZ: top.max.z, topY: bounds.max.y, round, meshes, outline };
}

export function createToppingDragController({ getCurrent, store, invalidate = () => {}, onPlacementRejected = () => {}, eventTarget = globalThis.window, scheduleFrame = globalThis.requestAnimationFrame }) {
    let entries = new Map();
    const deferred = new Map();
    const raycaster = new THREE.Raycaster();
    let surface;
    let surfaceKey;
    let active;
    let controlsEnabled;
    let reconcileQueued = false;
    const rejected = new Set();
    let rejectionQueued = false;
    const controller = {
        get entries() { return entries; },
        get hasUnplacedToppings() { return [...entries.values()].some((entry) => !entry.position); },
        isDragging: { current: false },
        requestReconcile() {
            if (reconcileQueued) return;
            reconcileQueued = true;
            // Registration can commit after the parent effect. Reconcile all new
            // meshes together without waiting for another React state change.
            queueMicrotask(() => {
                reconcileQueued = false;
                if (store.controller === controller) controller.reconcile(false);
            });
        },
        rejectAddition(id) {
            if (controller.interactive === false) return;
            rejected.add(id);
            if (rejectionQueued) return;
            rejectionQueued = true;
            // Notify after all sibling meshes have registered, outside React's
            // placement effects. Reject a batch once, including extra cherries.
            queueMicrotask(() => {
                rejectionQueued = false;
                const ids = [...rejected].filter((key) => entries.has(key) && !entries.get(key).position);
                rejected.clear();
                if (store.controller !== controller || !ids.length) return;
                entries = new Map(entries);
                ids.forEach((key) => { entries.delete(key); store.clear(key); });
                onPlacementRejected(ids);
                invalidate();
            });
        },
        register(id, entry) {
            const old = entries.get(id);
            const registered = {
                ...entry,
                layout: { ...entry.layout },
                anchor: entry.anchor.clone(),
                box: entry.box.clone(),
                position: old?.position?.clone() || null,
                changed: !old || !old.box.equals(entry.box) || old.layout.size !== entry.layout.size || old.layout.x !== entry.layout.x || old.layout.y !== entry.layout.y,
            };
            if (registered.position) {
                const delta = registered.position.clone().sub(registered.anchor);
                registered.object.matrix.makeTranslation(delta.x, delta.y, delta.z);
                registered.object.updateWorldMatrix(false, true);
            }
            registered.object.visible = Boolean(registered.position);
            entries = new Map(entries).set(id, registered);
            deferred.delete(id);
            controller.requestReconcile();
        },
        defer(id, measure) { deferred.set(id, measure); },
        unregister(id) {
            if (active?.id === id) controller.end();
            entries = new Map(entries);
            entries.delete(id);
            deferred.delete(id);
            rejected.delete(id);
            store.clear(id);
            controller.requestReconcile();
            invalidate();
        },
        fromLayout(layout, y = 0) {
            if (Array.isArray(layout.position) && layout.position.length === 3 && layout.position.every(Number.isFinite)) return new THREE.Vector3(...layout.position);
            return new THREE.Vector3(
                THREE.MathUtils.lerp(surface.minX, surface.maxX, layout.x / 100), y,
                THREE.MathUtils.lerp(surface.minZ, surface.maxZ, layout.y / 100)
            );
        },
        toLayout(position) {
            return {
                x: 100 * (position.x - surface.minX) / (surface.maxX - surface.minX),
                y: 100 * (position.z - surface.minZ) / (surface.maxZ - surface.minZ),
                position: position.toArray(),
            };
        },
        height(entry, position) {
            return getToppingSurfaceHeight({
                box: entry.box, position, surface, insertionDepth: entry.insertionDepth,
                parent: getCurrent().cakeGroupRef.current, raycaster,
            });
        },
        obstacles(id) {
            // Registration measures the transformed mesh geometry. Translation
            // of those Box3s keeps collision checks inexpensive during dragging.
            return [...entries.values()]
                .filter((entry) => entry.id !== id && entry.position)
                .map((entry) => entry.box.clone().translate(entry.position));
        },
        valid(entry, position, obstacles = controller.obstacles(entry.id)) {
            return isToppingPositionValid({ box: entry.box, position, surface, obstacles });
        },
        apply(entry, position, publish = true) {
            const accepted = position.clone();
            const next = { ...entry, position: accepted };
            entries = new Map(entries).set(entry.id, next);
            entry.object.matrix.makeTranslation(accepted.x - entry.anchor.x, accepted.y - entry.anchor.y, accepted.z - entry.anchor.z);
            entry.object.updateWorldMatrix(false, true);
            entry.object.visible = true;
            if (publish) store.publish(entry.id, controller.toLayout(accepted));
            invalidate();
            return next;
        },
        commit(entry) {
            if (!entry.position) return false;
            const layout = controller.toLayout(entry.position);
            const current = getCurrent().state;
            const saved = entry.id.startsWith("chocolate-")
                ? current.chocolateLayouts[Number(entry.id.slice(10))]
                : entry.id.startsWith("cherry-") ? current.cherryLayouts[Number(entry.id.slice(7))] : current.toppingLayout[entry.id];
            entries = new Map(entries).set(entry.id, { ...entry, layout: { ...entry.layout, ...layout } });
            if (saved && (Math.abs(saved.x - layout.x) > 0.0001 || Math.abs(saved.y - layout.y) > 0.0001 ||
                !saved.position || saved.position.some((value, index) => Math.abs(value - layout.position[index]) > 0.00001))) {
                current.setToppingPosition(entry.id, layout.x, layout.y, layout.position);
                return true;
            }
            return false;
        },
        reconcile(surfaceReady = true) {
            if (controller.isDragging.current) return;
            const current = getCurrent();
            const key = `${current.scene.uuid}:${current.state.form}:${current.state.selectedTierIndex}`;
            if (surfaceKey !== key) {
                if (!surfaceReady) return;
                surface = readSurface(current.scene, current.cakeGroupRef.current, current.state.form === 1);
                surfaceKey = key;
            }
            if (!Number.isFinite(surface.topY)) return;
            const obstacles = [];
            // Keep existing placements first when adding or resizing a topping.
            // Read-only previews use the exact finalized XYZ from the main canvas.
            const ordered = [...entries.values()].sort((a, b) => Number(!a.position) - Number(!b.position) || Number(a.changed) - Number(b.changed));
            for (const entry of ordered) {
                const desired = controller.fromLayout(entry.layout, entry.anchor.y);
                const position = controller.interactive === false && entry.layout.position
                    ? desired : findToppingPosition({ box: entry.box, position: desired, surface, obstacles });
                if (!position) {
                    entry.object.visible = false;
                    entries = new Map(entries).set(entry.id, { ...entry, position: null });
                    store.clear(entry.id);
                    invalidate();
                    controller.rejectAddition(entry.id);
                    continue;
                }
                if (controller.interactive !== false || !entry.layout.position) position.y = controller.height(entry, position);
                const placed = controller.apply({ ...entry, changed: false }, position, false);
                obstacles.push(entry.box.clone().translate(position));
                if (controller.commit(placed)) store.publish(entry.id, controller.toLayout(placed.position));
                else store.clear(entry.id);
            }
        },
        begin(id) {
            if (controller.interactive === false) return false;
            if (active) return active.id === id;
            const entry = entries.get(id);
            if (!entry?.position) return false;
            const controls = getCurrent().controlsRef.current;
            controlsEnabled = controls?.enabled;
            if (controls) controls.enabled = false;
            controller.isDragging.current = true;
            active = { id, position: entry.position.clone(), target: entry.position.clone(), requestedTarget: entry.position.clone(), lastValidPosition: entry.position.clone() };
            eventTarget.addEventListener("pointercancel", controller.cancel);
            eventTarget.addEventListener("blur", controller.cancel);
            return true;
        },
        move(id, target) {
            if (active?.id !== id || ![target.x, target.y, target.z].every(Number.isFinite)) return;
            const entry = entries.get(id);
            active.requestedTarget.copy(target);
            // A clear destination can be reached across other toppings. Occupied
            // targets still clamp at contact and slide along the obstacle edge.
            active.target = constrainToppingPosition({
                box: entry.box, from: entry.position, to: target, surface,
                obstacles: controller.obstacles(id), allowTunneling: true,
            });
            active.target.y = controller.height(entry, active.target);
            if (controller.valid(entry, active.target)) active.lastValidPosition.copy(active.target);
            invalidate();
        },
        update(delta) {
            if (!active || !Number.isFinite(delta) || delta <= 0) return;
            const entry = entries.get(active.id);
            if (!entry?.position) return;
            // Recheck the pointer goal from the rendered position each frame.
            // Once tangential motion clears an edge, the inward component can
            // resume without requiring another pointer event to release contact.
            active.target = constrainToppingPosition({
                box: entry.box, from: entry.position, to: active.requestedTarget, surface,
                obstacles: controller.obstacles(active.id), allowTunneling: true,
            });
            active.target.y = controller.height(entry, active.target);
            if (entry.position.distanceToSquared(active.target) < 1e-12) return;
            // Exponential visual smoothing uses elapsed time, not frame count.
            const position = entry.position.clone().lerp(active.target, -Math.expm1(-24 * delta));
            // Skip an occupied interpolation step to the clear destination;
            // tunneling must never leave the rendered topping inside an obstacle.
            if (!controller.valid(entry, position)) {
                position.copy(active.target);
                if (!controller.valid(entry, position)) return;
            }
            position.y = controller.height(entry, position);
            active.lastValidPosition.copy(position);
            controller.apply(entry, position);
        },
        startPointer(id, data, camera, canvas) {
            // R3F selects the mesh on pointerdown; the package's subsequent
            // native mouse/touch start must belong to that same topping.
            if (active?.id !== id) return false;
            const parent = getCurrent().cakeGroupRef.current;
            parent.updateWorldMatrix(true, true);
            active.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                new THREE.Vector3(0, 1, 0).transformDirection(parent.matrixWorld),
                parent.localToWorld(new THREE.Vector3(0, surface.topY, 0))
            );
            const point = projectToppingDrag({ data, canvas, camera, parent, plane: active.plane, meshes: surface.meshes, raycaster });
            if (!point) { controller.cancel(); return false; }
            active.grabOffset = active.position.clone().sub(point);
            store.setDragging?.(true, getToppingDragClientPoint(data));
            return true;
        },
        drag(id, data, camera, canvas) {
            if (active?.id !== id) return;
            store.setDragging?.(true, getToppingDragClientPoint(data));
            const point = projectToppingDrag({ data, canvas, camera, parent: getCurrent().cakeGroupRef.current, plane: active.plane, meshes: surface.meshes, raycaster });
            if (point && active.grabOffset) controller.move(id, point.add(active.grabOffset));
        },
        moveMarker(id, x, y) {
            const entry = entries.get(id);
            if (!entry?.position || !surface) return false;
            if (!controller.begin(id)) return false;
            controller.move(id, controller.fromLayout({ x, y }, entry.position.y));
            return true;
        },
        end(id) {
            if (!active || (typeof id === "string" && active.id !== id)) return;
            const entry = entries.get(active.id);
            if (entry) {
                const obstacles = controller.obstacles(entry.id);
                const position = controller.valid(entry, active.target, obstacles)
                    ? active.target.clone()
                    : findToppingPosition({ box: entry.box, position: active.lastValidPosition, surface, obstacles });
                if (position) {
                    position.y = controller.height(entry, position);
                    controller.commit(controller.apply(entry, position));
                }
            }
            const controls = getCurrent().controlsRef.current;
            if (controls && controlsEnabled !== undefined) controls.enabled = controlsEnabled;
            active = null;
            controller.isDragging.current = false;
            store.setDragging?.(false);
            eventTarget.removeEventListener("pointercancel", controller.cancel);
            eventTarget.removeEventListener("blur", controller.cancel);
            scheduleFrame(() => {
                if (store.controller !== controller) return;
                [...deferred.values()].forEach((measure) => measure());
                deferred.clear();
                controller.reconcile();
            });
        },
        cancel() {
            if (active) {
                const entry = entries.get(active.id);
                if (entry) active.target.copy(active.position);
            }
            controller.end();
        },
    };
    return controller;
}
