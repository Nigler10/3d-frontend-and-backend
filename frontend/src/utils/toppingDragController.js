import * as THREE from "three";
import { constrainToppingPosition, findToppingPosition, getToppingDragClientPoint, getToppingSurfaceHeight, getTransformedToppingBox, isToppingPositionValid, projectToppingDrag } from "./toppingDragPlacement.js";

// All coordinates below are local to the existing cake group. Nothing changes
// the cake transform, geometry, materials, or camera configuration.
function makeSurface(vertices, topY, round, meshes) {
    const bounds = new THREE.Box3().setFromPoints(vertices);
    const outlinePoints = new Map(vertices.map((point) => [`${point.x.toFixed(5)}:${point.z.toFixed(5)}`, { x: point.x, z: point.z }]));
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
    return { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z, topY, round, meshes, outline };
}

function readSurface(scene, parent, round, tierCount) {
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
    const top = [];
    const faces = [];
    const vertex = new THREE.Vector3();
    const triangle = Array.from({ length: 3 }, () => new THREE.Vector3());
    const normal = new THREE.Vector3();
    const edge = new THREE.Vector3();
    meshes.forEach((mesh) => {
        const transform = new THREE.Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        const positions = mesh.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 1) {
            mesh.getVertexPosition(i, vertex).applyMatrix4(transform);
            if (vertex.y >= bounds.max.y - 0.08) {
                top.push(vertex.clone());
            }
        }
        if (tierCount <= 1) return;
        // Lower tiers may share one mesh. Read upward-facing caps rather than
        // treating mesh bounds (which include vertical walls) as usable ledges.
        const indices = mesh.geometry.index;
        for (let i = 0; i < (indices?.count ?? positions.count); i += 3) {
            triangle.forEach((point, corner) => mesh.getVertexPosition(indices ? indices.getX(i + corner) : i + corner, point).applyMatrix4(transform));
            normal.subVectors(triangle[1], triangle[0]).cross(edge.subVectors(triangle[2], triangle[0]));
            const heights = triangle.map((point) => point.y);
            const y = Math.max(...heights);
            if (normal.y > normal.length() * 0.5 && y - Math.min(...heights) <= 0.08) {
                faces.push({ y, vertices: triangle.map((point) => point.clone()) });
            }
        }
    });
    if (!top.length) top.push(bounds.min.clone(), bounds.max.clone());
    const surface = makeSurface(top, bounds.max.y, round, meshes);
    const levels = [];
    faces.sort((a, b) => b.y - a.y).forEach((face) => {
        let level = levels.at(-1);
        if (!level || level.y - face.y > 0.08) {
            level = { y: face.y, vertices: [] };
            levels.push(level);
        }
        level.vertices.push(...face.vertices);
    });
    const tiers = [surface];
    for (const level of levels) {
        const previous = tiers.at(-1);
        const candidate = makeSurface(level.vertices, level.y, round, meshes);
        if (tiers.length < tierCount && candidate.topY < previous.topY - 0.08 &&
            candidate.maxX - candidate.minX > previous.maxX - previous.minX + 0.04 &&
            candidate.maxZ - candidate.minZ > previous.maxZ - previous.minZ + 0.04) tiers.push(candidate);
    }
    surface.ledges = { ...tiers.at(-1), topY: surface.topY, ...(tiers.length > 1 ? { tiers } : {}) };
    return surface;
}

export function createToppingDragController({ getCurrent, store, invalidate = () => {}, onPlacementRejected = () => {}, onLowerLedgeRestricted = () => {}, eventTarget = globalThis.window, scheduleFrame = globalThis.requestAnimationFrame }) {
    let entries = new Map();
    const deferred = new Map();
    const raycaster = new THREE.Raycaster();
    let surface;
    let surfaceKey;
    let active;
    let messageFootprint;
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
                messageBox: (entry.messageBox || entry.box).clone(),
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
        canUseLowerLedges(entry) {
            return /^cherry(?:-\d+)?$/.test(entry?.id) || (entry?.id === "candle" &&
                (getCurrent().state.candleMode || getCurrent().state.toppingLayout?.candle?.mode || entry.layout?.mode) === "number");
        },
        placementBounds(entry) {
            const ledges = controller.canUseLowerLedges(entry);
            const physicalBounds = /^(candle|cherry(?:-\d+)?|chocolate(?:-\d+)?|balls)$/.test(entry?.id);
            const tierFromHeight = /^cherry(?:-\d+)?$/.test(entry?.id) &&
                (active?.id === entry.id ? active.surfaceHit : entry.layout.position);
            const bounds = ledges ? surface.ledges : surface;
            return { surface: tierFromHeight ? { ...bounds, tierFromHeight: true } : bounds, surfaceBox: physicalBounds ? entry.messageBox : entry.box };
        },
        fromLayout(layout, y = 0, entry) {
            if (Array.isArray(layout.position) && layout.position.length === 3 && layout.position.every(Number.isFinite)) return new THREE.Vector3(...layout.position);
            const bounds = entry ? controller.placementBounds(entry).surface : surface;
            return new THREE.Vector3(
                THREE.MathUtils.lerp(bounds.minX, bounds.maxX, layout.x / 100), y,
                THREE.MathUtils.lerp(bounds.minZ, bounds.maxZ, layout.y / 100)
            );
        },
        toLayout(position, entry) {
            const bounds = entry ? controller.placementBounds(entry).surface : surface;
            return {
                x: 100 * (position.x - bounds.minX) / (bounds.maxX - bounds.minX),
                y: 100 * (position.z - bounds.minZ) / (bounds.maxZ - bounds.minZ),
                position: position.toArray(),
            };
        },
        height(entry, position) {
            const { surface: bounds, surfaceBox } = controller.placementBounds(entry);
            return getToppingSurfaceHeight({
                box: surfaceBox, position, surface: bounds, insertionDepth: entry.insertionDepth,
                parent: getCurrent().cakeGroupRef.current, raycaster,
            });
        },
        setMessageFootprint(box, position) {
            messageFootprint = box ? box.clone().translate(position) : null;
        },
        messageObstacle(entry) {
            if (!messageFootprint) return null;
            const obstacle = messageFootprint.clone();
            const fullBox = entry.messageBox || entry.box;
            // Undo only this topping's collision-box inset so its visible edges
            // stop before the text, while topping-to-topping spacing stays intact.
            for (const axis of ["x", "z"]) {
                obstacle.min[axis] -= fullBox.max[axis] - entry.box.max[axis];
                obstacle.max[axis] += entry.box.min[axis] - fullBox.min[axis];
            }
            return obstacle;
        },
        messageObstacles() {
            return [...entries.values()].filter((entry) => entry.position)
                .map((entry) => entry.messageBox.clone().translate(entry.position));
        },
        placeMessage(box, position, messageSurface, { isPositionAllowed, fallback = position } = {}) {
            const obstacles = controller.messageObstacles();
            // The message already clamps its curved outline against the cake.
            // Test collisions here without imposing rectangular corner limits.
            const bounds = { ...messageSurface, round: false, outline: undefined };
            if ((!isPositionAllowed || isPositionAllowed(position)) && isToppingPositionValid({ box, position, surface: bounds, obstacles })) return position;
            // Exact edge candidates give the smallest X/Z separation vector;
            // validate every candidate against the message's cake-edge limits.
            return findToppingPosition({ box, position, surface: isPositionAllowed ? bounds : messageSurface, obstacles, isPositionAllowed }) || fallback;
        },
        obstacles(id, includeMessage = true) {
            // Registration measures the transformed mesh geometry. Translation
            // of those Box3s keeps collision checks inexpensive during dragging.
            const obstacles = [...entries.values()]
                .filter((entry) => entry.id !== id && entry.position)
                .map((entry) => entry.box.clone().translate(entry.position));
            const entry = entries.get(id);
            const message = includeMessage && entry && controller.messageObstacle(entry);
            if (message) obstacles.push(message);
            return obstacles;
        },
        constrain(entry, target) {
            return constrainToppingPosition({
                box: entry.box, from: entry.position, to: target, ...controller.placementBounds(entry),
                obstacles: controller.obstacles(entry.id, false),
                allowTunneling: true,
            });
        },
        valid(entry, position, obstacles = controller.obstacles(entry.id)) {
            return isToppingPositionValid({ box: entry.box, position, ...controller.placementBounds(entry), obstacles });
        },
        apply(entry, position, publish = true) {
            const accepted = position.clone();
            const next = { ...entry, position: accepted };
            entries = new Map(entries).set(entry.id, next);
            entry.object.matrix.makeTranslation(accepted.x - entry.anchor.x, accepted.y - entry.anchor.y, accepted.z - entry.anchor.z);
            entry.object.updateWorldMatrix(false, true);
            entry.object.visible = true;
            if (publish) store.publish(entry.id, controller.toLayout(accepted, entry));
            invalidate();
            return next;
        },
        commit(entry) {
            if (!entry.position) return false;
            const layout = controller.toLayout(entry.position, entry);
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
                surface = readSurface(current.scene, current.cakeGroupRef.current, current.state.form === 1, current.state.selectedTierIndex + 1);
                surfaceKey = key;
            }
            if (!Number.isFinite(surface.topY)) return;
            const obstacles = [];
            // Keep existing placements first when adding or resizing a topping.
            // Read-only previews use the exact finalized XYZ from the main canvas.
            const ordered = [...entries.values()].sort((a, b) => Number(!a.position) - Number(!b.position) || Number(a.changed) - Number(b.changed));
            for (const entry of ordered) {
                const desired = controller.fromLayout(entry.layout, entry.anchor.y, entry);
                const message = controller.messageObstacle(entry);
                const position = controller.interactive === false && entry.layout.position
                    ? desired : findToppingPosition({ box: entry.box, position: desired, ...controller.placementBounds(entry), obstacles: message ? [...obstacles, message] : obstacles });
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
                if (controller.commit(placed)) store.publish(entry.id, controller.toLayout(placed.position, placed));
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
            active.target = controller.constrain(entry, target);
            active.target.y = controller.height(entry, active.target);
            if (controller.valid(entry, active.target, controller.obstacles(id, false))) active.lastValidPosition.copy(active.target);
            invalidate();
        },
        update(delta) {
            if (!active || !Number.isFinite(delta) || delta <= 0) return;
            const entry = entries.get(active.id);
            if (!entry?.position) return;
            // Recheck the pointer goal from the rendered position each frame.
            // Once tangential motion clears an edge, the inward component can
            // resume without requiring another pointer event to release contact.
            active.target = controller.constrain(entry, active.requestedTarget);
            active.target.y = controller.height(entry, active.target);
            if (entry.position.distanceToSquared(active.target) < 1e-12) return;
            // Exponential visual smoothing uses elapsed time, not frame count.
            const position = entry.position.clone().lerp(active.target, -Math.expm1(-24 * delta));
            // Cross cherry tier steps directly; interpolating their height can
            // otherwise seat the cherry inside the taller tier's wall.
            if (active.surfaceHit && Math.abs(entry.position.y - active.target.y) > 0.08) position.copy(active.target);
            // Keep other toppings clear during smoothing. The message can be
            // crossed freely and is checked only when the topping is dropped.
            const obstacles = controller.obstacles(active.id, false);
            if (!controller.valid(entry, position, obstacles)) {
                position.copy(active.target);
                if (!controller.valid(entry, position, obstacles)) return;
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
            const cherry = /^cherry(?:-\d+)?$/.test(id);
            const point = projectToppingDrag({ data, canvas, camera, parent, plane: active.plane, meshes: surface.meshes, raycaster, topSurfacesOnly: true });
            if (!point) { controller.cancel(); return false; }
            active.grabOffset = active.position.clone().sub(point);
            active.surfaceHit = cherry;
            if (cherry) active.grabOffset.y = -entries.get(id).messageBox.min.y;
            if (cherry) active.plane.setFromNormalAndCoplanarPoint(active.plane.normal, parent.localToWorld(new THREE.Vector3(0, point.y, 0)));
            store.setDragging?.(true, getToppingDragClientPoint(data));
            return true;
        },
        pointerMove(event, camera, canvas) {
            if (!active?.grabOffset || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
            controller.drag(active.id, null, camera, canvas, { x: event.clientX, y: event.clientY });
        },
        drag(id, data, camera, canvas, clientPoint) {
            if (active?.id !== id) return;
            store.setDragging?.(true, clientPoint || getToppingDragClientPoint(data));
            const parent = getCurrent().cakeGroupRef.current;
            const entry = entries.get(id);
            const point = projectToppingDrag({ data, clientPoint, canvas, camera, parent, plane: active.plane, meshes: surface.meshes, raycaster, topSurfacesOnly: true });
            const restricted = point && surface.ledges.tiers?.length > 1 && !controller.canUseLowerLedges(entry) && point.y < surface.topY - 0.08;
            if (restricted && !active.warnedLowerLedge) {
                active.warnedLowerLedge = true;
                onLowerLedgeRestricted(id);
            }
            if (point && active.surfaceHit) active.plane.setFromNormalAndCoplanarPoint(active.plane.normal, parent.localToWorld(new THREE.Vector3(0, point.y, 0)));
            if (point && active.grabOffset) {
                const target = point.clone().add(active.grabOffset);
                // Seat the cherry from this frame's tier hit, independently of
                // the height at which its stem or fruit was initially grabbed.
                if (active.surfaceHit) target.y = point.y - entry.messageBox.min.y;
                controller.move(id, target);
                if (restricted) controller.apply(entry, active.target);
            }
        },
        moveMarker(id, x, y) {
            const entry = entries.get(id);
            if (!entry?.position || !surface) return false;
            if (!controller.begin(id)) return false;
            controller.move(id, controller.fromLayout({ x, y }, entry.position.y, entry));
            return true;
        },
        end(id) {
            if (!active || (typeof id === "string" && active.id !== id)) return;
            const entry = entries.get(active.id);
            if (entry) {
                const obstacles = controller.obstacles(entry.id);
                const position = controller.valid(entry, active.target, obstacles)
                    ? active.target.clone()
                    // Resolve from the drop point so exact edge candidates pick
                    // the shortest X/Z separation from the message and toppings.
                    : findToppingPosition({ box: entry.box, position: active.target, ...controller.placementBounds(entry), obstacles })
                        || findToppingPosition({ box: entry.box, position: active.lastValidPosition, ...controller.placementBounds(entry), obstacles })
                        || findToppingPosition({ box: entry.box, position: active.position, ...controller.placementBounds(entry), obstacles });
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
