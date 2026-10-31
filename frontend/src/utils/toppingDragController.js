import * as THREE from "three";
import { canCherryFitOnLedge, constrainToppingPosition, findToppingPosition, getToppingDragClientPoint, getToppingSurfaceHeight, getTransformedToppingBox, isToppingPositionValid, projectToppingDrag, TOPPING_PLACEMENT_GAP, TOPPING_SURFACE_OFFSET } from "./toppingDragPlacement.js";
import { getNumberCandleAbsolutePosition, getNumberCandleRelativePlacement, getNumberCandleResizePlacement, isNumberCandleRelativePlacement } from "./numberCandlePlacement.js";

function setCherryRefPosition(entry, position) {
    entry.object.position.set(
        position.x - entry.anchor.x,
        position.y - entry.anchor.y,
        position.z - entry.anchor.z
    );
    // The child mesh alone owns the cherry's fixed size.
    entry.object.scale.setScalar(1);
    entry.object.updateMatrix();
}

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

export function createToppingDragController({ getCurrent, store, invalidate = () => {}, onPlacementRejected = () => {}, onLowerLedgeRestricted = () => {}, onCherryFitRejected = () => {}, onNumberCandleResizeRejected = () => {}, onNumberCandleSizeRejected = () => {}, eventTarget = globalThis.window, scheduleFrame = globalThis.requestAnimationFrame }) {
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
    const isSingleCandle = (entry) => entry?.id === "candle" &&
        (getCurrent().state.toppingLayout?.candle?.mode || getCurrent().state.candleMode || entry.layout?.mode) !== "number";
    const candlePositionAllowed = (entry, position) => {
        if (entry?.id !== "candle") return true;
        if (position.y + entry.messageBox.min.y + (entry.insertionDepth || 0) >= surface.topY - 0.08) return true;
        if (isSingleCandle(entry)) return false;
        const view = active?.candleView;
        if (!view || view.direction.lengthSq() <= 1e-8) return true;
        const x = position.x + (view.direction.x >= 0 ? entry.messageBox.min.x : entry.messageBox.max.x) - view.centerX;
        const z = position.z + (view.direction.z >= 0 ? entry.messageBox.min.z : entry.messageBox.max.z) - view.centerZ;
        return x * view.direction.x + z * view.direction.z >= TOPPING_PLACEMENT_GAP - 1e-8;
    };
    const candleTopPosition = (entry, target) => {
        const center = new THREE.Vector3(
            (surface.minX + surface.maxX - entry.messageBox.min.x - entry.messageBox.max.x) / 2,
            surface.topY - entry.messageBox.min.y - (entry.insertionDepth || 0) + TOPPING_SURFACE_OFFSET,
            (surface.minZ + surface.maxZ - entry.messageBox.min.z - entry.messageBox.max.z) / 2
        );
        const goal = target.clone();
        goal.x = THREE.MathUtils.clamp(goal.x,
            surface.minX + TOPPING_PLACEMENT_GAP - entry.messageBox.min.x,
            surface.maxX - TOPPING_PLACEMENT_GAP - entry.messageBox.max.x);
        goal.z = THREE.MathUtils.clamp(goal.z,
            surface.minZ + TOPPING_PLACEMENT_GAP - entry.messageBox.min.z,
            surface.maxZ - TOPPING_PLACEMENT_GAP - entry.messageBox.max.z);
        goal.y = center.y;
        return constrainToppingPosition({ box: entry.box, surfaceBox: entry.messageBox, from: center, to: goal, surface });
    };
    const updateCherryView = (camera) => {
        const parent = getCurrent().cakeGroupRef.current;
        const cameraPosition = parent.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
        const centerX = (surface.ledges.minX + surface.ledges.maxX) / 2;
        const centerZ = (surface.ledges.minZ + surface.ledges.maxZ) / 2;
        const direction = new THREE.Vector3(cameraPosition.x - centerX, 0, cameraPosition.z - centerZ);
        // Directly overhead, both halves are visible.
        if (direction.lengthSq() < 1e-8) { active.cherryView = null; return; }
        direction.normalize();
        const previous = active.cherryView;
        if (previous && previous.centerX === centerX && previous.centerZ === centerZ && previous.direction.distanceToSquared(direction) < 1e-16) return;
        active.cherryView = { centerX, centerZ, direction, surfaces: new WeakMap() };
    };
    const cherryOnTop = (entry, position) => position.y + entry.messageBox.min.y + (entry.insertionDepth || 0) >= surface.topY - 0.08;
    const clampCherryDepth = (entry, position) => {
        const view = active?.cherryView;
        if (!view || cherryOnTop(entry, position)) return false;
        const x = position.x + (view.direction.x >= 0 ? entry.messageBox.min.x : entry.messageBox.max.x) - view.centerX;
        const z = position.z + (view.direction.z >= 0 ? entry.messageBox.min.z : entry.messageBox.max.z) - view.centerZ;
        const correction = Math.max(0, TOPPING_PLACEMENT_GAP - x * view.direction.x - z * view.direction.z);
        if (correction > 1e-8 && cherryOnTop(entry, entry.position)) {
            // Reject a hidden lower-ledge drop at the rear top rim, not the midpoint.
            position.y = entry.position.y;
            return true;
        }
        position.addScaledVector(view.direction, correction);
        return correction > 1e-8;
    };
    const cherryFrontSurface = (bounds) => {
        if (!bounds.tiers && bounds.topY >= surface.topY - 0.08) return bounds;
        const view = active.cherryView;
        if (view.surfaces.has(bounds)) return view.surfaces.get(bounds);
        const depth = point => (point.x - view.centerX) * view.direction.x + (point.z - view.centerZ) * view.direction.z;
        const outline = [];
        bounds.outline.forEach((point, index) => {
            const next = bounds.outline[(index + 1) % bounds.outline.length];
            const a = depth(point), b = depth(next);
            if (a >= 0) outline.push(point);
            if ((a >= 0) !== (b >= 0)) {
                const fraction = a / (a - b);
                outline.push({ x: point.x + (next.x - point.x) * fraction, z: point.z + (next.z - point.z) * fraction });
            }
        });
        const front = { ...bounds, outline, ...(outline.length < 3 ? { minX: 1, maxX: 0 } : {}) };
        if (bounds.tiers) front.tiers = bounds.tiers.map(cherryFrontSurface);
        view.surfaces.set(bounds, front);
        return front;
    };
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
            if (id === "candle" && !isSingleCandle(registered) && old?.position && entry.layout.size !== "small" &&
                old.layout.size !== entry.layout.size && old.position.y + old.messageBox.min.y + (old.insertionDepth || 0) < surface.topY - 0.08) {
                registered.numberCandleSizeRestore = old.numberCandleSizeRestore || old;
            }
            if (registered.position) {
                const delta = registered.position.clone().sub(registered.anchor);
                if (/^cherry(?:-\d+)?$/.test(id)) setCherryRefPosition(registered, registered.position);
                else registered.object.matrix.makeTranslation(delta.x, delta.y, delta.z);
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
            if (isSingleCandle(entry)) return false;
            return /^cherry(?:-\d+)?$/.test(entry?.id) || (entry?.id === "candle" &&
                (getCurrent().state.toppingLayout?.candle?.mode || getCurrent().state.candleMode || entry.layout?.mode) === "number");
        },
        placementBounds(entry) {
            const ledges = controller.canUseLowerLedges(entry);
            const physicalBounds = /^(candle|cherry(?:-\d+)?|chocolate(?:-\d+)?|balls)$/.test(entry?.id);
            const tierFromHeight = (/^cherry(?:-\d+)?$/.test(entry?.id) &&
                (active?.id === entry.id ? active.surfaceHit : entry.layout.position)) || (entry?.id === "candle" && ledges &&
                    (active?.id === entry.id ? active.candlePointer : entry.layout.position));
            const candleY = active?.id === entry.id ? active.requestedTarget.y : entry.layout.position?.[1];
            // Keep the top cap as the rear boundary through frames and release.
            const candleOnTop = entry?.id === "candle" && (isSingleCandle(entry) ||
                active?.id === entry.id && active.candleBackRim ||
                (active?.id !== entry.id || active.candlePointer) &&
                    candleY + entry.messageBox.min.y + (entry.insertionDepth || 0) >= surface.topY - 0.08);
            let bounds = ledges && !candleOnTop ? surface.ledges : surface;
            if (/^cherry(?:-\d+)?$/.test(entry?.id) && active?.id === entry.id && active.cherryView) bounds = cherryFrontSurface(bounds);
            return { surface: tierFromHeight ? { ...bounds, tierFromHeight: true } : bounds, surfaceBox: physicalBounds ? entry.messageBox : entry.box };
        },
        fromLayout(layout, y = 0, entry) {
            const current = getCurrent().state;
            if (entry?.id === "candle" && !isSingleCandle(entry) && isNumberCandleRelativePlacement(layout.relativePlacement) &&
                (layout.relativePlacement.tierCount !== current.selectedTierIndex + 1 || layout.relativePlacement.form !== current.form || !layout.position)) {
                return getNumberCandleAbsolutePosition({ relativePlacement: layout.relativePlacement,
                    footprint: entry.messageBox, box: entry.box, surface, insertionDepth: entry.insertionDepth });
            }
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
                ...(entry?.id === "candle" && !isSingleCandle(entry) ? {
                    relativePlacement: getNumberCandleRelativePlacement({ position, footprint: entry.messageBox, surface,
                        insertionDepth: entry.insertionDepth, tierCount: getCurrent().state.selectedTierIndex + 1, form: getCurrent().state.form }),
                } : {}),
            };
        },
        height(entry, position) {
            const { surface: bounds, surfaceBox } = controller.placementBounds(entry);
            const height = getToppingSurfaceHeight({
                box: surfaceBox, position, surface: bounds, insertionDepth: entry.insertionDepth,
                parent: getCurrent().cakeGroupRef.current, raycaster,
            });
            if (entry.id !== "candle" || !isSingleCandle(entry) && !active?.candlePointer && !active?.candleBackRim) return height;
            const bottomY = position.y + surfaceBox.min.y + (entry.insertionDepth || 0);
            const tier = bounds.tiers?.reduce((nearest, candidate) => Math.abs(candidate.topY - bottomY) < Math.abs(nearest.topY - bottomY) ? candidate : nearest) || bounds;
            // A missed cap ray must not drop the candle below its selected tier.
            return Math.max(height, tier.topY - surfaceBox.min.y - (entry.insertionDepth || 0) + TOPPING_SURFACE_OFFSET);
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
            const current = getCurrent();
            let cherryFrom;
            if (/^cherry(?:-\d+)?$/.test(entry.id) && active?.id === entry.id) {
                if (!active.surfaceHit && current.camera) updateCherryView(current.camera);
                target = target.clone();
                if (clampCherryDepth(entry, target)) target.y = Math.max(target.y, entry.position.y);
                active.requestedTarget.copy(target);
                const origin = entry.position.clone();
                if (clampCherryDepth(entry, origin)) cherryFrom = origin;
            }
            if (entry.id === "candle" && active?.id === entry.id && !active.candlePointer && current.camera) {
                const view = current.cakeGroupRef.current.worldToLocal(current.camera.getWorldPosition(new THREE.Vector3()));
                const centerX = (surface.minX + surface.maxX) / 2, centerZ = (surface.minZ + surface.maxZ) / 2;
                const direction = new THREE.Vector3(view.x - centerX, 0, view.z - centerZ).normalize();
                if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
                active.candleView = { centerX, centerZ, direction };
                const x = target.x + (direction.x >= 0 ? entry.messageBox.min.x : entry.messageBox.max.x) - centerX;
                const z = target.z + (direction.z >= 0 ? entry.messageBox.min.z : entry.messageBox.max.z) - centerZ;
                active.candleBackRim = x * direction.x + z * direction.z < TOPPING_PLACEMENT_GAP - 1e-8;
                if (isSingleCandle(entry) || active.candleBackRim) {
                    const boundary = candleTopPosition(entry, target);
                    if (!active.warnedLowerLedge && surface.ledges.tiers?.length > 1 &&
                        (Math.abs(boundary.x - target.x) > 1e-7 || Math.abs(boundary.z - target.z) > 1e-7)) {
                        active.warnedLowerLedge = true;
                        onLowerLedgeRestricted(entry.id);
                    }
                    target = boundary;
                    active.requestedTarget.copy(boundary);
                }
            }
            const bounds = controller.placementBounds(entry);
            const topCandle = entry.id === "candle" && (active?.candlePointer || active?.candleBackRim) && !bounds.surface.tiers;
            const obstacles = controller.obstacles(entry.id, false);
            const from = cherryFrom ? findToppingPosition({ box: entry.box, ...bounds, position: cherryFrom, obstacles }) || entry.position
                : topCandle && !isToppingPositionValid({ box: entry.box, ...bounds, position: entry.position, obstacles }) ? findToppingPosition({
                box: entry.box, ...bounds, position: candleTopPosition(entry, entry.position), obstacles,
            }) || entry.position : entry.position;
            return constrainToppingPosition({
                box: entry.box, from, to: target, ...bounds, obstacles,
                allowTunneling: true,
            });
        },
        valid(entry, position, obstacles = controller.obstacles(entry.id)) {
            return candlePositionAllowed(entry, position) &&
                isToppingPositionValid({ box: entry.box, position, ...controller.placementBounds(entry), obstacles });
        },
        apply(entry, position, publish = true) {
            const accepted = position.clone();
            const next = { ...entry, position: accepted };
            entries = new Map(entries).set(entry.id, next);
            if (/^cherry(?:-\d+)?$/.test(entry.id)) setCherryRefPosition(entry, accepted);
            else entry.object.matrix.makeTranslation(accepted.x - entry.anchor.x, accepted.y - entry.anchor.y, accepted.z - entry.anchor.z);
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
            const relativeChanged = controller.interactive !== false && layout.relativePlacement && (!isNumberCandleRelativePlacement(saved?.relativePlacement) ||
                ["angle", "normalizedRadius", "ledgeIndex", "tierCount", "form"].some((key) =>
                    Math.abs(layout.relativePlacement[key] - saved.relativePlacement[key]) > 1e-8));
            entries = new Map(entries).set(entry.id, { ...entry, layout: { ...entry.layout, ...layout } });
            if (saved && (Math.abs(saved.x - layout.x) > 0.0001 || Math.abs(saved.y - layout.y) > 0.0001 ||
                !saved.position || saved.position.some((value, index) => Math.abs(value - layout.position[index]) > 0.00001) || relativeChanged)) {
                if (layout.relativePlacement) current.setToppingPosition(entry.id, layout.x, layout.y, layout.position, layout.relativePlacement);
                else current.setToppingPosition(entry.id, layout.x, layout.y, layout.position);
                return true;
            }
            return false;
        },
        reconcile(surfaceReady = true) {
            if (controller.isDragging.current) return;
            const current = getCurrent();
            const key = `${current.scene.uuid}:${current.state.form}:${current.state.selectedTierIndex}:${current.state.selectedSize || ""}`;
            const surfaceChanged = surfaceKey !== key;
            if (surfaceChanged) {
                if (!surfaceReady) return;
                surface = readSurface(current.scene, current.cakeGroupRef.current, current.state.form === 1, current.state.selectedTierIndex + 1);
                surfaceKey = key;
            }
            if (!Number.isFinite(surface.topY)) return;
            const obstacles = [];
            // Keep existing placements first when adding or resizing a topping.
            // Read-only previews use the exact finalized XYZ from the main canvas.
            const needsNumberResize = (entry) => entry?.id === "candle" && !isSingleCandle(entry) && isNumberCandleRelativePlacement(entry.layout.relativePlacement) &&
                (entry.layout.relativePlacement.tierCount !== current.state.selectedTierIndex + 1 || entry.layout.relativePlacement.form !== current.state.form ||
                    !entry.layout.position || surfaceChanged && Boolean(entry.position));
            const resizingNumber = controller.interactive !== false &&
                (needsNumberResize(entries.get("candle")) || entries.get("candle")?.numberCandleSizeRestore);
            const ordered = [...entries.values()].sort((a, b) => (resizingNumber ? Number(a.id === "candle") - Number(b.id === "candle") : 0) ||
                Number(!a.position) - Number(!b.position) || Number(a.changed) - Number(b.changed));
            for (let entry of ordered) {
                if (controller.interactive !== false && entry.numberCandleSizeRestore && !needsNumberResize(entry)) {
                    const previous = entry.numberCandleSizeRestore;
                    const relative = previous.layout.relativePlacement || controller.toLayout(previous.position, previous).relativePlacement;
                    const tiers = surface.ledges.tiers || [surface];
                    const tier = tiers[Math.min(relative.ledgeIndex, tiers.length - 1)];
                    const position = previous.position.clone().setY(tier.topY - entry.messageBox.min.y + TOPPING_SURFACE_OFFSET);
                    const message = controller.messageObstacle(entry);
                    const placement = { box: entry.box, surfaceBox: entry.messageBox,
                        surface: { ...surface.ledges, tiers, tierFromHeight: true },
                        obstacles: message ? [...obstacles, message] : obstacles };
                    let fits = isToppingPositionValid({ ...placement, position });
                    // The exposed lower ledges have room to move radially as the
                    // footprint grows, without changing the selected ledge.
                    if (!fits && (tiers.length === 2 || relative.ledgeIndex >= 2)) {
                        const resized = getNumberCandleResizePlacement({ relativePlacement: relative,
                            footprint: entry.messageBox, box: entry.box, surface });
                        if (resized?.position && isToppingPositionValid({ ...placement, position: resized.position })) {
                            position.copy(resized.position);
                            fits = true;
                        }
                    }
                    if (!fits) {
                        const layout = { ...previous.layout, ...controller.toLayout(previous.position, previous), size: "small" };
                        const restored = controller.apply({ ...previous, object: entry.object, anchor: entry.anchor.clone(),
                            layout, changed: false, numberCandleSizeRestore: undefined }, previous.position, false);
                        rejected.delete(entry.id);
                        store.clear(entry.id);
                        obstacles.push(restored.box.clone().translate(restored.position));
                        onNumberCandleSizeRejected(layout);
                        continue;
                    }
                    position.y -= entry.insertionDepth || 0;
                    entry = { ...entry, numberCandleSizeRestore: undefined, layout: { ...entry.layout, position: position.toArray() } };
                }
                const relativeNumber = entry.id === "candle" && !isSingleCandle(entry) && isNumberCandleRelativePlacement(entry.layout.relativePlacement);
                const remapped = needsNumberResize(entry);
                const twoTierLedgeTransfer = controller.interactive !== false && remapped && current.state.selectedTierIndex === 1 &&
                    entry.layout.relativePlacement.tierCount > 2 && entry.layout.relativePlacement.ledgeIndex > 0;
                if (remapped && entry.numberCandleSizeRestore) entry = { ...entry, numberCandleSizeRestore: undefined };
                const resize = remapped ? getNumberCandleResizePlacement({ relativePlacement: entry.layout.relativePlacement,
                    footprint: entry.messageBox, box: entry.box, surface, insertionDepth: entry.insertionDepth }) : null;
                const strictOutward = controller.interactive !== false && resize?.shiftedOutward;
                let desired = resize ? resize.position : controller.fromLayout(entry.layout, entry.anchor.y, entry);
                if (remapped && desired) entry = { ...entry, layout: { ...entry.layout, position: desired.toArray() } };
                const message = controller.messageObstacle(entry);
                const exactPreview = controller.interactive === false && entry.layout.position && !remapped;
                const support = desired?.clone();
                if (relativeNumber && support) support.y += entry.insertionDepth || 0;
                const placement = { box: entry.box, position: support, ...controller.placementBounds(entry),
                    obstacles: message ? [...obstacles, message] : obstacles };
                let position = exactPreview ? desired
                    : strictOutward ? (support && isToppingPositionValid(placement) ? support : null)
                    : support ? findToppingPosition(placement) : null;
                if (!position && twoTierLedgeTransfer) {
                    rejected.delete(entry.id);
                    store.clear(entry.id);
                    if (entry.layout.size !== "small") {
                        // Keep the candle registered while React renders and
                        // remeasures Small before retrying the tier transfer.
                        if (current.state.toppingLayout.candle.size !== "small") current.state.setToppingSize("candle", "small");
                        continue;
                    }
                    const tiers = surface.ledges.tiers || [surface];
                    for (const tier of [tiers.at(-1), tiers[0]]) {
                        const preferred = (support || entry.position || entry.anchor).clone();
                        preferred.y = tier.topY - entry.messageBox.min.y + TOPPING_SURFACE_OFFSET;
                        position = findToppingPosition({ ...placement, position: preferred,
                            surface: { ...surface.ledges, tiers, tierFromHeight: true } });
                        if (position) {
                            desired = position.clone();
                            desired.y -= entry.insertionDepth || 0;
                            entry = { ...entry, layout: { ...entry.layout, position: desired.toArray() } };
                            break;
                        }
                    }
                }
                if (!position) {
                    entry.object.visible = false;
                    entries = new Map(entries);
                    if (strictOutward) {
                        entries.delete(entry.id);
                        deferred.delete(entry.id);
                        rejected.delete(entry.id);
                    } else entries.set(entry.id, { ...entry, position: null });
                    store.clear(entry.id);
                    invalidate();
                    if (strictOutward) onNumberCandleResizeRejected();
                    else controller.rejectAddition(entry.id);
                    continue;
                }
                if (!exactPreview) position.y = remapped ? desired.y : controller.height(entry, position);
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
            if (active.surfaceHit) active.pointerSettled = false;
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
            // Pointer-driven cherries already move their ref to the accepted
            // target. Re-solving it here repeats raycasts even while stationary.
            if (active.surfaceHit && active.pointerSettled) return;
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
            controller.apply(entry, position, false);
        },
        startPointer(id, data, camera, canvas, clientPoint) {
            // R3F selects the mesh; native pointer events move that same ref.
            if (active?.id !== id) return false;
            active.candlePointer = id === "candle";
            const parent = getCurrent().cakeGroupRef.current;
            parent.updateWorldMatrix(true, true);
            active.plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                new THREE.Vector3(0, 1, 0).transformDirection(parent.matrixWorld),
                parent.localToWorld(new THREE.Vector3(0, surface.topY, 0))
            );
            const cherry = /^cherry(?:-\d+)?$/.test(id);
            active.cherryMeshes = cherry ? [...new Set((surface.ledges.tiers || [surface]).flatMap((tier) => tier.meshes))] : null;
            const point = projectToppingDrag({ data, clientPoint, canvas, camera, parent, plane: active.plane, meshes: active.cherryMeshes || surface.meshes, raycaster, topSurfacesOnly: true });
            if (!point) { controller.cancel(); return false; }
            active.grabOffset = active.position.clone().sub(point);
            active.pointerId = clientPoint?.pointerId;
            active.surfaceHit = cherry;
            if (cherry) active.grabOffset.y = -entries.get(id).messageBox.min.y;
            if (cherry) active.plane.setFromNormalAndCoplanarPoint(active.plane.normal, parent.localToWorld(new THREE.Vector3(0, point.y, 0)));
            store.setDragging?.(true, clientPoint || getToppingDragClientPoint(data));
            return true;
        },
        pointerMove(event, camera, canvas) {
            if (!active?.grabOffset || !Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return;
            if (active.pointerId !== undefined && event.pointerId !== active.pointerId) return;
            controller.drag(active.id, null, camera, canvas, { x: event.clientX, y: event.clientY });
        },
        pointerUp(event, camera, canvas) {
            if (!active?.grabOffset || event.isPrimary === false) return;
            if (active.pointerId !== undefined && event.pointerId !== active.pointerId) return;
            controller.pointerMove(event, camera, canvas);
            controller.end();
        },
        drag(id, data, camera, canvas, clientPoint) {
            if (active?.id !== id) return;
            store.setDragging?.(true, clientPoint || getToppingDragClientPoint(data));
            const parent = getCurrent().cakeGroupRef.current;
            const entry = entries.get(id);
            let point, target, isBackHalf;
            let backLedge = false;
            const singleCandle = isSingleCandle(entry);
            if (active.candlePointer && active.grabOffset) {
                if (!singleCandle) {
                    parent.updateWorldMatrix(true, true);
                    const cameraPosition = camera.getWorldPosition(new THREE.Vector3());
                    const tierCenter = parent.localToWorld(new THREE.Vector3(
                        (surface.minX + surface.maxX) / 2, 0, (surface.minZ + surface.maxZ) / 2
                    ));
                    // Compare both angles in the tier parent's coordinate frame.
                    // Cosine also handles negative angles and complete turns.
                    if (parent.parent) {
                        parent.parent.worldToLocal(cameraPosition);
                        parent.parent.worldToLocal(tierCenter);
                    }
                    const dx = cameraPosition.x - tierCenter.x, dz = cameraPosition.z - tierCenter.z;
                    const cameraAngle = Math.atan2(dx, dz);
                    const epsilon = 1e-8;
                    active.numberCandleInverted = dx * dx + dz * dz > epsilon * epsilon &&
                        Math.cos(parent.rotation.y - cameraAngle) < -epsilon;
                    if (active.numberCandleInverted) {
                        active.target.copy(active.lastValidPosition);
                        active.requestedTarget.copy(active.lastValidPosition);
                        controller.apply(entry, active.lastValidPosition, false);
                        return;
                    }
                }
                const view = parent.worldToLocal(camera.getWorldPosition(new THREE.Vector3()));
                const centerX = (surface.minX + surface.maxX) / 2;
                const centerZ = (surface.minZ + surface.maxZ) / 2;
                const direction = new THREE.Vector3(view.x - centerX, 0, view.z - centerZ).normalize();
                if (direction.lengthSq() < 1e-8) direction.set(0, 0, 1);
                active.candleView = { centerX, centerZ, direction };
                isBackHalf = (position) => {
                    const x = position.x + (direction.x >= 0 ? entry.messageBox.min.x : entry.messageBox.max.x) - centerX;
                    const z = position.z + (direction.z >= 0 ? entry.messageBox.min.z : entry.messageBox.max.z) - centerZ;
                    return x * direction.x + z * direction.z < TOPPING_PLACEMENT_GAP - 1e-8;
                };
                // Classify depth on the top plane first. A hidden-back pointer
                // must never choose a lower tier through the cake raycast.
                const topPoint = projectToppingDrag({ data, clientPoint, canvas, camera, parent, plane: active.plane, raycaster });
                const topTarget = topPoint?.clone().add(active.grabOffset);
                if (topTarget && (singleCandle || isBackHalf(topTarget))) {
                    point = topPoint;
                    target = topTarget;
                    backLedge = isBackHalf(topTarget);
                }
            }
            if (!point) {
                point = projectToppingDrag({ data, clientPoint, canvas, camera, parent, plane: active.plane, meshes: active.cherryMeshes || surface.meshes, raycaster, topSurfacesOnly: true });
                target = point && active.grabOffset ? point.clone().add(active.grabOffset) : null;
                if (target && isBackHalf) backLedge = isBackHalf(target);
            }
            if (active.candlePointer && target) active.candleBackRim = backLedge;
            const topBoundary = active.candlePointer && (singleCandle || backLedge) && target ? candleTopPosition(entry, target) : null;
            const lowerLedge = point && surface.ledges.tiers?.length > 1 && point.y < surface.topY - 0.08;
            const outsideTop = topBoundary && (Math.abs(topBoundary.x - target.x) > 1e-7 || Math.abs(topBoundary.z - target.z) > 1e-7);
            let hiddenLowerLedge = false;
            if (active.candlePointer && outsideTop && surface.ledges.tiers?.length > 1) {
                // Probe the real surface only for the warning. Placement still
                // uses the top-plane clamp, so a probe cannot lower the candle.
                const hit = projectToppingDrag({ data, clientPoint, canvas, camera, parent, meshes: surface.meshes, raycaster, topSurfacesOnly: true });
                if (hit && hit.y < surface.topY - 0.08) {
                    hiddenLowerLedge = singleCandle || !candlePositionAllowed(entry, hit.clone().add(active.grabOffset));
                }
            }
            const restricted = active.candlePointer ? hiddenLowerLedge : lowerLedge && !controller.canUseLowerLedges(entry);
            if (restricted && !active.warnedLowerLedge) {
                active.warnedLowerLedge = true;
                onLowerLedgeRestricted(id);
            }
            if (target) {
                if (active.candlePointer) {
                    target.y = point.y - entry.messageBox.min.y - (entry.insertionDepth || 0) + TOPPING_SURFACE_OFFSET;
                    if (topBoundary) target.copy(topBoundary);
                }
                // Seat the cherry from this frame's tier hit, independently of
                // the height at which its stem or fruit was initially grabbed.
                if (active.surfaceHit) {
                    updateCherryView(camera);
                    target.y = point.y - entry.messageBox.min.y + TOPPING_SURFACE_OFFSET;
                    if (clampCherryDepth(entry, target)) target.y = Math.max(target.y, entry.position.y);
                    const cherrySurface = controller.placementBounds(entry).surface;
                    if (cherrySurface.tiers && target.y + entry.messageBox.min.y < surface.topY - 0.08) {
                        const fits = canCherryFitOnLedge({ box: entry.messageBox, position: target, surface: cherrySurface });
                        if (!fits) {
                            // Keep the held cherry on its current support and
                            // clamp X/Z at that tier's edge, without teleporting.
                            target.y = entry.position.y;
                            if (!active.warnedCherryFit) {
                                active.warnedCherryFit = true;
                                onCherryFitRejected(id);
                            }
                        }
                    }
                    active.plane.setFromNormalAndCoplanarPoint(active.plane.normal, parent.localToWorld(new THREE.Vector3(0, target.y + entry.messageBox.min.y - TOPPING_SURFACE_OFFSET, 0)));
                }
                controller.move(id, target);
                if (active.candlePointer && !candlePositionAllowed(entry, active.target)) {
                    controller.move(id, candleTopPosition(entry, active.target));
                }
                if (active.surfaceHit) {
                    // The referenced group holds an already positioned mesh;
                    // mutate its transform until pointerup commits state.
                    entry.position.copy(active.target);
                    setCherryRefPosition(entry, active.target);
                    entry.object.updateWorldMatrix(false, true);
                    active.pointerSettled = true;
                    invalidate();
                } else {
                    controller.apply(entry, active.target, false);
                    if (active.candlePointer && !singleCandle) active.lastValidPosition.copy(active.target);
                }
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
                const visibility = active.candlePointer ? { isPositionAllowed: (position) => candlePositionAllowed(entry, position) } : {};
                const position = controller.valid(entry, active.target, obstacles)
                    ? active.target.clone()
                    // Resolve from the drop point so exact edge candidates pick
                    // the shortest X/Z separation from the message and toppings.
                    : findToppingPosition({ box: entry.box, position: active.target, ...controller.placementBounds(entry), obstacles, ...visibility })
                        || findToppingPosition({ box: entry.box, position: active.lastValidPosition, ...controller.placementBounds(entry), obstacles, ...visibility })
                        || findToppingPosition({ box: entry.box, position: active.position, ...controller.placementBounds(entry), obstacles, ...visibility });
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
                active.cherryView = null;
                active.candleView = null;
                active.candleBackRim = false;
                if (active.candlePointer) active.requestedTarget.copy(active.position);
                const entry = entries.get(active.id);
                if (entry) active.target.copy(active.position);
            }
            controller.end();
        },
    };
    return controller;
}
