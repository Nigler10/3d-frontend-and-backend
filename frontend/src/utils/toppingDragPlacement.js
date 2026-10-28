import { Box3, Matrix3, Matrix4, Raycaster, Vector2, Vector3 } from "three";

export const TOPPING_PLACEMENT_GAP = 0.002;
export const TOPPING_SURFACE_OFFSET = 0.001;
const TOPPING_COLLISION_FOOTPRINT_SCALE = 0.9;
const EPSILON = 1e-8;

export function getToppingDragClientPoint(data) {
    // Undo DraggableCore's offset-parent coordinates before projecting into R3F.
    const offsetParent = data.node.offsetParent || data.node.ownerDocument.body;
    const offset = offsetParent === data.node.ownerDocument.body ? { left: 0, top: 0 } : offsetParent.getBoundingClientRect();
    return { x: data.x - offsetParent.scrollLeft + offset.left, y: data.y - offsetParent.scrollTop + offset.top };
}

export function projectToppingDrag({ data, clientPoint, canvas, camera, parent, plane, meshes = [], raycaster = new Raycaster(), topSurfacesOnly = false }) {
    const client = clientPoint || getToppingDragClientPoint(data);
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    const pointer = new Vector2(
        ((client.x - rect.left) / rect.width) * 2 - 1,
        -((client.y - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(pointer, camera);
    // Pick the actual cake surface; use the drag plane only beyond its outline.
    const hit = raycaster.intersectObjects(meshes, topSurfacesOnly).find((intersection) => {
        if (!topSurfacesOnly) return true;
        if (!intersection.face) return false;
        const transform = new Matrix4().copy(parent.matrixWorld).invert().multiply(intersection.object.matrixWorld);
        const normal = intersection.face.normal.clone().applyMatrix3(new Matrix3().getNormalMatrix(transform)).normalize();
        return normal.y > 0.5;
    });
    const point = hit?.point.clone() || (plane ? raycaster.ray.intersectPlane(plane, new Vector3()) : null);
    return point ? parent.worldToLocal(point) : null;
}

function getTierAtToppingHeight(box, position, surface) {
    const bottomY = position.y + box.min.y;
    return surface.tiers.reduce((nearest, tier) => Math.abs(tier.topY - bottomY) < Math.abs(nearest.topY - bottomY) ? tier : nearest);
}

export function getToppingSurfaceHeight({ box, position, surface, parent, insertionDepth = 0, raycaster = new Raycaster() }) {
    parent.updateWorldMatrix(true, true);
    let height = -Infinity;
    const tier = surface.tierFromHeight && surface.tiers ? getTierAtToppingHeight(box, position, surface) : null;
    // Sample the actual rendered cake under the footprint, including posed icing.
    const center = surface.tiers ? [(box.min.x + box.max.x) / 2, (box.min.z + box.max.z) / 2] : [0, 0];
    for (const [dx, dz] of [center, [box.min.x, box.min.z], [box.min.x, box.max.z], [box.max.x, box.min.z], [box.max.x, box.max.z]]) {
        const origin = parent.localToWorld(new Vector3(position.x + dx, surface.topY + 2, position.z + dz));
        const direction = new Vector3(0, -1, 0).transformDirection(parent.matrixWorld);
        raycaster.set(origin, direction);
        // A cherry follows its intersected tier, even when an upper tier is
        // beside part of its footprint on a narrow lower ledge.
        const hit = raycaster.intersectObjects(surface.meshes, false).find((intersection) =>
            !tier || parent.worldToLocal(intersection.point.clone()).y <= tier.topY + 0.08
        );
        if (hit) height = Math.max(height, parent.worldToLocal(hit.point.clone()).y);
    }
    return (Number.isFinite(height) ? height : tier?.topY ?? surface.topY) - box.min.y - insertionDepth + TOPPING_SURFACE_OFFSET;
}

// Read vertices after the complete mesh transform. A world-axis Box3 transformed
// back into cake coordinates would overestimate rotated cakes and negative scales.
export function getTransformedToppingBox(object, parent) {
    const box = new Box3();
    if (!object) return box;
    object.updateWorldMatrix(true, true);
    const inverseParent = parent
        ? new Matrix4().copy(parent.matrixWorld).invert()
        : new Matrix4();
    const vertex = new Vector3();
    const matrix = new Matrix4();
    object.traverseVisible((child) => {
        const positions = child.geometry?.getAttribute("position");
        if (!child.isMesh || !positions) return;
        matrix.multiplyMatrices(inverseParent, child.matrixWorld);
        for (let index = 0; index < positions.count; index += 1) {
            // getVertexPosition also respects morph targets on meshes that use them.
            child.getVertexPosition(index, vertex).applyMatrix4(matrix);
            box.expandByPoint(vertex);
        }
    });
    return box;
}

export function getToppingCollisionBox(object, parent) {
    const box = getTransformedToppingBox(object, parent);
    if (box.isEmpty()) return box;
    // Trim horizontal AABB padding around irregular toppings about the measured
    // center, not their often offset pivots. Keep the actual bottom/top for seating.
    const inset = box.getSize(new Vector3()).multiplyScalar((1 - TOPPING_COLLISION_FOOTPRINT_SCALE) / 2);
    box.min.x += inset.x;
    box.max.x -= inset.x;
    box.min.z += inset.z;
    box.max.z -= inset.z;
    return box;
}

function isInsideSurface(box, position, surface, gap) {
    if (!surface || box.isEmpty()) return false;
    if (surface.tiers) {
        if (surface.tierFromHeight) {
            const tier = getTierAtToppingHeight(box, position, surface);
            // Keep the cherry's selected height while applying the same upper-
            // tier footprint exclusion used by the candle's ledge constraints.
            return isInsideSurface(box, position, tier, gap) && surface.tiers.every((upper) =>
                upper.topY <= tier.topY || !overlapsSurface(box, position, upper, gap)
            );
        }
        // The highest tier touching the physical footprint must support all of
        // it. A lower ledge cannot support a topping that straddles a tier wall.
        const tier = surface.tiers.find((candidate) => overlapsSurface(box, position, candidate, gap));
        return Boolean(tier && isInsideSurface(box, position, tier, gap));
    }
    const minX = box.min.x + position.x;
    const maxX = box.max.x + position.x;
    const minZ = box.min.z + position.z;
    const maxZ = box.max.z + position.z;
    if (minX < surface.minX + gap - EPSILON || maxX > surface.maxX - gap + EPSILON ||
        minZ < surface.minZ + gap - EPSILON || maxZ > surface.maxZ - gap + EPSILON) return false;
    if (surface.outline?.length >= 3) {
        const outline = surface.outline;
        const area = outline.reduce((sum, point, index) => {
            const next = outline[(index + 1) % outline.length];
            return sum + point.x * next.z - next.x * point.z;
        }, 0);
        if (Math.abs(area) > EPSILON) {
            const winding = Math.sign(area);
            return outline.every((point, index) => {
                const next = outline[(index + 1) % outline.length];
                const dx = next.x - point.x;
                const dz = next.z - point.z;
                const length = Math.hypot(dx, dz);
                if (length <= EPSILON) return true;
                return [minX, maxX].every((x) => [minZ, maxZ].every((z) =>
                    winding * (dx * (z - point.z) - dz * (x - point.x)) / length >= gap - EPSILON
                ));
            });
        }
    }
    if (!surface.round) return true;

    const centerX = (surface.minX + surface.maxX) / 2;
    const centerZ = (surface.minZ + surface.maxZ) / 2;
    const radiusX = (surface.maxX - surface.minX) / 2 - gap;
    const radiusZ = (surface.maxZ - surface.minZ) / 2 - gap;
    if (radiusX <= 0 || radiusZ <= 0) return false;
    // An ellipse is convex, so checking every AABB corner contains the full box.
    return [minX, maxX].every((x) => [minZ, maxZ].every((z) =>
        ((x - centerX) / radiusX) ** 2 + ((z - centerZ) / radiusZ) ** 2 <= 1 + EPSILON
    ));
}

function overlapsSurface(box, position, surface, gap) {
    const minX = box.min.x + position.x - gap;
    const maxX = box.max.x + position.x + gap;
    const minZ = box.min.z + position.z - gap;
    const maxZ = box.max.z + position.z + gap;
    if (maxX <= surface.minX || minX >= surface.maxX || maxZ <= surface.minZ || minZ >= surface.maxZ) return false;
    if (surface.outline?.length >= 3) {
        const outline = surface.outline;
        const area = outline.reduce((sum, point, index) => {
            const next = outline[(index + 1) % outline.length];
            return sum + point.x * next.z - next.x * point.z;
        }, 0);
        return outline.every((point, index) => {
            const next = outline[(index + 1) % outline.length];
            return [minX, maxX].some((x) => [minZ, maxZ].some((z) =>
                Math.sign(area) * ((next.x - point.x) * (z - point.z) - (next.z - point.z) * (x - point.x)) >= 0
            ));
        });
    }
    if (!surface.round) return true;
    const centerX = (surface.minX + surface.maxX) / 2;
    const centerZ = (surface.minZ + surface.maxZ) / 2;
    const x = Math.max(minX, Math.min(maxX, centerX));
    const z = Math.max(minZ, Math.min(maxZ, centerZ));
    return ((x - centerX) / ((surface.maxX - surface.minX) / 2)) ** 2 +
        ((z - centerZ) / ((surface.maxZ - surface.minZ) / 2)) ** 2 <= 1;
}

export function isToppingPositionValid({ box, surfaceBox = box, position, surface, obstacles = [], gap = TOPPING_PLACEMENT_GAP }) {
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.z) ||
        !isInsideSurface(surfaceBox, position, surface, gap)) return false;
    // Validate footprints regardless of height so no accepted placement overlaps
    // another topping merely because its mesh sits higher above the icing.
    const candidate = box.clone().translate(position);
    candidate.min.x -= gap - EPSILON;
    candidate.max.x += gap - EPSILON;
    candidate.min.z -= gap - EPSILON;
    candidate.max.z += gap - EPSILON;
    candidate.min.y = -Infinity;
    candidate.max.y = Infinity;
    return obstacles.every((obstacle) => !obstacle || obstacle.isEmpty() || !candidate.intersectsBox(obstacle));
}

function sweptObstacleEntry(box, from, to, obstacle, gap) {
    if (!obstacle || obstacle.isEmpty()) return null;
    let entry = 0;
    let exit = 1;
    for (const axis of ["x", "z"]) {
        // Minkowski expansion reduces a moving box to its moving anchor point.
        const min = obstacle.min[axis] - box.max[axis] - gap + EPSILON;
        const max = obstacle.max[axis] - box.min[axis] + gap - EPSILON;
        const velocity = to[axis] - from[axis];
        if (Math.abs(velocity) < EPSILON) {
            // Exact contact at the configured gap permits sliding along an edge.
            if (from[axis] <= min || from[axis] >= max) return null;
            continue;
        }
        const first = (min - from[axis]) / velocity;
        const second = (max - from[axis]) / velocity;
        entry = Math.max(entry, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
        if (entry > exit) return null;
    }
    return exit > 0 && entry < 1 ? Math.max(0, entry) : null;
}

function cherryWallEntry(box, from, to, tier, gap) {
    let outline = tier.outline;
    if (!outline || outline.length < 3) {
        const centerX = (tier.minX + tier.maxX) / 2;
        const centerZ = (tier.minZ + tier.maxZ) / 2;
        outline = tier.round ? Array.from({ length: 64 }, (_, index) => {
            const angle = index * Math.PI / 32;
            return {
                x: centerX + (tier.maxX - tier.minX) / 2 * Math.cos(angle) / Math.cos(Math.PI / 64),
                z: centerZ + (tier.maxZ - tier.minZ) / 2 * Math.sin(angle) / Math.cos(Math.PI / 64),
            };
        }) : [
            { x: tier.minX, z: tier.minZ }, { x: tier.maxX, z: tier.minZ },
            { x: tier.maxX, z: tier.maxZ }, { x: tier.minX, z: tier.maxZ },
        ];
    }
    const axes = [{ x: 1, z: 0 }, { x: 0, z: 1 }];
    outline.forEach((point, index) => {
        const next = outline[(index + 1) % outline.length];
        const length = Math.hypot(next.x - point.x, next.z - point.z);
        if (length > EPSILON) axes.push({ x: (point.z - next.z) / length, z: (next.x - point.x) / length });
    });
    let entry = 0;
    let exit = 1;
    // Sweep the full cherry footprint against the upper tier's convex outline,
    // so a fast drag cannot cross the wall to an otherwise clear destination.
    for (const axis of axes) {
        const projections = outline.map((point) => axis.x * point.x + axis.z * point.z);
        const minBox = axis.x * (axis.x >= 0 ? box.min.x : box.max.x) + axis.z * (axis.z >= 0 ? box.min.z : box.max.z);
        const maxBox = axis.x * (axis.x >= 0 ? box.max.x : box.min.x) + axis.z * (axis.z >= 0 ? box.max.z : box.min.z);
        const padding = gap * (Math.abs(axis.x) + Math.abs(axis.z));
        const min = Math.min(...projections) - maxBox - padding + EPSILON;
        const max = Math.max(...projections) - minBox + padding - EPSILON;
        const origin = axis.x * from.x + axis.z * from.z;
        const velocity = axis.x * (to.x - from.x) + axis.z * (to.z - from.z);
        if (Math.abs(velocity) < EPSILON) {
            if (origin <= min || origin >= max) return null;
            continue;
        }
        const first = (min - origin) / velocity;
        const second = (max - origin) / velocity;
        entry = Math.max(entry, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
        if (entry > exit) return null;
    }
    return exit > 0 && entry < 1 ? Math.max(0, entry) : null;
}

export function constrainToppingPath(box, from, to, surface, obstacles = [], gap = TOPPING_PLACEMENT_GAP, surfaceBox = box) {
    let fraction = 1;
    if (surface && !isInsideSurface(surfaceBox, to, surface, gap)) {
        let low = 0;
        let high = 1;
        const candidate = new Vector3();
        for (let index = 0; index < 40; index += 1) {
            const middle = (low + high) / 2;
            candidate.lerpVectors(from, to, middle);
            if (isInsideSurface(surfaceBox, candidate, surface, gap)) low = middle;
            else high = middle;
        }
        fraction = low;
    }
    if (surface?.tierFromHeight && surface.tiers) {
        const tier = getTierAtToppingHeight(surfaceBox, from, surface);
        if (tier === getTierAtToppingHeight(surfaceBox, to, surface)) {
            for (const upper of surface.tiers.filter((candidate) => candidate.topY > tier.topY)) {
                const entry = cherryWallEntry(surfaceBox, from, to, upper, gap);
                if (entry !== null) fraction = Math.min(fraction, entry);
            }
        }
    }
    for (const obstacle of obstacles) {
        const entry = sweptObstacleEntry(box, from, to, obstacle, gap);
        if (entry !== null) fraction = Math.min(fraction, entry);
    }
    // Stay infinitesimally on the valid side of contact to avoid frame-to-frame
    // floating-point toggles while the pointer is held against another topping.
    if (fraction < 1) fraction = Math.max(0, fraction - EPSILON / Math.max(from.distanceTo(to), EPSILON));
    return new Vector3().lerpVectors(from, to, fraction);
}

export function constrainToppingPosition({ box, surfaceBox = box, from, to, surface, obstacles = [], blockingObstacles = [], gap = TOPPING_PLACEMENT_GAP, allowTunneling = false }) {
    obstacles = [...obstacles, ...blockingObstacles];
    const target = new Vector3(
        Number.isFinite(to.x) ? to.x : from.x,
        Number.isFinite(to.y) ? to.y : from.y,
        Number.isFinite(to.z) ? to.z : from.z
    );
    if (!isToppingPositionValid({ box, surfaceBox, position: from, surface, obstacles, gap })) return from.clone();
    const targetTier = surface?.tiers && (surface.tierFromHeight ? getTierAtToppingHeight(surfaceBox, target, surface) : surface.tiers.at(-1));
    const outsideTier = targetTier && !isInsideSurface(surfaceBox, target, targetTier, gap);
    if (surface?.tiers) {
        // Clamp X/Z to the selected tier minus the full topping extents before
        // choosing a ledge, including diagonal moves against round outlines.
        let clamped;
        if (surface.tierFromHeight) {
            const center = new Vector3(
                (targetTier.minX + targetTier.maxX - surfaceBox.min.x - surfaceBox.max.x) / 2, target.y,
                (targetTier.minZ + targetTier.maxZ - surfaceBox.min.z - surfaceBox.max.z) / 2
            );
            const origin = findToppingPosition({ box, surfaceBox, position: center, surface: targetTier, gap });
            clamped = origin && constrainToppingPath(box, origin, target, targetTier, [], gap, surfaceBox);
            if (clamped && getTierAtToppingHeight(surfaceBox, from, surface) !== targetTier) {
                clamped = findToppingPosition({ box, surfaceBox, position: clamped, surface: { ...targetTier, tiers: surface.tiers, tierFromHeight: true }, gap });
            }
        } else clamped = constrainToppingPath(box, from, target, targetTier, [], gap, surfaceBox);
        if (!clamped) return from.clone();
        target.copy(clamped);
    }
    // An intentional relocation may cross occupied space only when the entire
    // destination footprint is clear and contained by the cake surface.
    const crossesCherryWall = surface?.tierFromHeight && surface.tiers && getTierAtToppingHeight(surfaceBox, from, surface) === targetTier &&
        surface.tiers.some((upper) => upper.topY > targetTier.topY && cherryWallEntry(surfaceBox, from, target, upper, gap) !== null);
    if (allowTunneling && !crossesCherryWall && (!outsideTier || obstacles.every((obstacle) => sweptObstacleEntry(box, from, target, obstacle, gap) === null)) &&
        blockingObstacles.every((obstacle) => sweptObstacleEntry(box, from, target, obstacle, gap) === null) &&
        isToppingPositionValid({ box, surfaceBox, position: target, surface, obstacles, gap })) return target;
    const stopped = constrainToppingPath(box, from, target, surface, obstacles, gap, surfaceBox);
    let nearest = stopped;
    // One-axis sliding keeps contact smooth without teleporting across a blocker.
    for (const axis of ["x", "z"]) {
        const slideTarget = stopped.clone();
        slideTarget[axis] = target[axis];
        const slid = constrainToppingPath(box, stopped, slideTarget, surface, obstacles, gap, surfaceBox);
        // The rendered group moves directly to the result. Sweep that shortcut
        // against every decoration, keeping safe tangential progress up to the
        // next obstacle instead of discarding the entire move.
        const direct = constrainToppingPath(box, from, slid, surface, obstacles, gap, surfaceBox);
        if (isToppingPositionValid({ box, surfaceBox, position: direct, surface, obstacles, gap }) &&
            direct.distanceToSquared(target) < nearest.distanceToSquared(target) - EPSILON ** 2) nearest = direct;
    }
    return isToppingPositionValid({ box, surfaceBox, position: nearest, surface, obstacles, gap }) ? nearest : from.clone();
}

export function findToppingPosition({ box, surfaceBox = box, position, surface, obstacles = [], gap = TOPPING_PLACEMENT_GAP, isPositionAllowed = () => true }) {
    if (isPositionAllowed(position) && isToppingPositionValid({ box, surfaceBox, position, surface, obstacles, gap })) return position.clone();
    if (!surface || box.isEmpty()) return null;
    const minX = surface.minX + gap - surfaceBox.min.x;
    const maxX = surface.maxX - gap - surfaceBox.max.x;
    const minZ = surface.minZ + gap - surfaceBox.min.z;
    const maxZ = surface.maxZ - gap - surfaceBox.max.z;
    if (minX > maxX + EPSILON || minZ > maxZ + EPSILON) return null;

    const coordinates = (axis, min, max) => {
        const clamp = (value) => Math.max(min, Math.min(max, value));
        const values = new Set([min, max, (min + max) / 2, clamp(position[axis])]);
        const span = max - min;
        const size = box.max[axis] - box.min[axis];
        const count = Math.min(64, Math.max(1, Math.ceil(span / Math.max(size / 3, gap, span / 64))));
        for (let index = 1; index < count; index += 1) values.add(min + span * index / count);
        // Include exact contact candidates so a narrow valid slot is not lost to
        // grid resolution. Existing valid placements always win before this search.
        for (const obstacle of obstacles) {
            if (!obstacle || obstacle.isEmpty()) continue;
            values.add(clamp(obstacle.min[axis] - box.max[axis] - gap));
            values.add(clamp(obstacle.max[axis] - box.min[axis] + gap));
        }
        return [...values];
    };
    const candidates = [];
    for (const x of coordinates("x", minX, maxX)) {
        for (const z of coordinates("z", minZ, maxZ)) {
            candidates.push(new Vector3(x, position.y, z));
        }
    }
    candidates.sort((a, b) => a.distanceToSquared(position) - b.distanceToSquared(position) || a.x - b.x || a.z - b.z);
    return candidates.find((candidate) => isPositionAllowed(candidate) && isToppingPositionValid({ box, surfaceBox, position: candidate, surface, obstacles, gap })) || null;
}
