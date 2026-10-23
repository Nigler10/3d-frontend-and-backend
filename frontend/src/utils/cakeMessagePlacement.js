import { Box3, Matrix4, Vector3 } from "three";
import { constrainToppingPosition, isToppingPositionValid } from "./toppingDragPlacement.js";

export const MESSAGE_SURFACE_GAP = 0.1;
export const MESSAGE_EDGE_GAP = 0.1;
export const MESSAGE_MAX_ARC_SWEEP = 2 * Math.PI - Math.PI / 18;
export const MESSAGE_HEIGHT_OFFSET = 0.002;
const originalGeometry = new WeakMap();
const messageFootprints = new WeakMap();

export function getCakeMessageSurface(scene, parent, bounds, round) {
    const surface = { minX: bounds.min.x, maxX: bounds.max.x, minZ: bounds.min.z, maxZ: bounds.max.z, topY: bounds.max.y, round };
    if (!scene || !parent) return surface;
    parent.updateWorldMatrix(true, true);
    const inverse = parent.matrixWorld.clone().invert();
    const points = new Map();
    const vertex = new Vector3();
    scene.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.visible || !/cake|icing|round|rect|cube/i.test(mesh.name) || /candle|chandel|nut|bar|ball|cherry|sprinkle|plate/i.test(mesh.name)) return;
        const transform = new Matrix4().multiplyMatrices(inverse, mesh.matrixWorld);
        const positions = mesh.geometry.attributes.position;
        for (let index = 0; index < positions.count; index++) {
            mesh.getVertexPosition(index, vertex).applyMatrix4(transform);
            if (vertex.y >= surface.topY - 0.08) points.set(`${vertex.x.toFixed(5)}:${vertex.z.toFixed(5)}`, { x: vertex.x, z: vertex.z });
        }
    });
    const sorted = [...points.values()].sort((a, b) => a.x - b.x || a.z - b.z);
    const cross = (a, b, c) => (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x);
    const half = (vertices) => {
        const hull = [];
        vertices.forEach((point) => {
            while (hull.length > 1 && cross(hull.at(-2), hull.at(-1), point) <= 0) hull.pop();
            hull.push(point);
        });
        hull.pop();
        return hull;
    };
    surface.outline = [...half(sorted), ...half([...sorted].reverse())];
    return surface;
}

// Place rigid glyphs in separate angular sectors on concentric planar arcs.
// Keeping the extrusion axis unchanged seats every letter on the cake surface.
export function curveCakeMessageGeometry(geometry, curve) {
    const positions = geometry.attributes.position;
    const normals = geometry.attributes.normal;
    if (!originalGeometry.has(geometry)) originalGeometry.set(geometry, {
        positions: positions.array.slice(), normals: normals?.array.slice(),
    });
    const source = originalGeometry.get(geometry);
    positions.array.set(source.positions);
    if (normals && source.normals) normals.array.set(source.normals);
    geometry.computeBoundingBox();
    const center = geometry.boundingBox.getCenter(new Vector3());
    const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
    const safeCurve = Number.isFinite(curve) ? curve : 0;
    const sweep = Math.min(Math.abs(safeCurve) / 100 * Math.PI * 0.9, MESSAGE_MAX_ARC_SWEEP);
    const direction = Math.sign(safeCurve);
    const centers = geometry.attributes.glyphCenter;
    const glyphIndices = geometry.attributes.glyphIndex;
    const lineIndices = geometry.attributes.glyphLineIndex;
    const glyphs = new Map();
    const lines = new Map();
    if (sweep && width && centers && glyphIndices && lineIndices) {
        for (let index = 0; index < positions.count; index++) {
            const id = glyphIndices.getX(index);
            if (!glyphs.has(id)) {
                const lineId = lineIndices.getX(index);
                if (!lines.has(lineId)) lines.set(lineId, { glyphs: [], minY: Infinity, maxY: -Infinity });
                const glyph = { anchorX: centers.getX(index), minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
                glyphs.set(id, glyph);
                lines.get(lineId).glyphs.push(glyph);
            }
            const glyph = glyphs.get(id);
            glyph.minX = Math.min(glyph.minX, positions.getX(index));
            glyph.maxX = Math.max(glyph.maxX, positions.getX(index));
            glyph.minY = Math.min(glyph.minY, positions.getY(index));
            glyph.maxY = Math.max(glyph.maxY, positions.getY(index));
        }
        const orderedLines = [...lines.entries()].sort(([a], [b]) => a - b).map(([, line]) => line);
        for (const line of orderedLines) {
            line.glyphs.sort((a, b) => a.anchorX - b.anchorX);
            line.minY = Math.min(...line.glyphs.map((glyph) => glyph.minY));
            line.maxY = Math.max(...line.glyphs.map((glyph) => glyph.maxY));
            line.anchorY = (line.minY + line.maxY) / 2;
            line.extent = Math.max(...line.glyphs.map((glyph) => Math.hypot(
                (glyph.maxX - glyph.minX) / 2,
                Math.max(line.anchorY - glyph.minY, glyph.maxY - line.anchorY)
            )));
        }
        const gap = Math.max(...orderedLines.map((line) => line.maxY - line.minY)) * 0.06;
        orderedLines.forEach((line, index) => {
            const previous = orderedLines[index - 1];
            // Bounding circles keep even wide glyphs in disjoint radial bands.
            line.offset = previous ? previous.offset + Math.max(previous.anchorY - line.anchorY, previous.extent + line.extent + gap) : 0;
            const arcLength = line.glyphs.reduce((length, glyph, glyphIndex) => length + glyph.maxX - glyph.minX +
                (glyphIndex ? Math.max(gap, glyph.minX - line.glyphs[glyphIndex - 1].maxX) : 0), 0);
            // Reserve the end gap in the circumference of each concentric line,
            // rather than letting long strings wind around a smaller radius.
            line.minimumRadius = arcLength / MESSAGE_MAX_ARC_SWEEP;
        });
        const halfAngle = (glyph, line, radius) => Math.atan2(
            (glyph.maxX - glyph.minX) / 2,
            radius + Math.min(direction * (glyph.minY - line.anchorY), direction * (glyph.maxY - line.anchorY))
        );
        const angularGap = (previous, glyph, radius) => Math.max(gap, glyph.minX - previous.maxX) / radius;
        const lineSweep = (line, radius) => line.glyphs.reduce((total, glyph, index) =>
            total + 2 * halfAngle(glyph, line, radius) + (index ? angularGap(line.glyphs[index - 1], glyph, radius) : 0), 0);
        // Reserve room for every inner line before fitting the angular sweep,
        // so no radius can reach zero or fold a long line back over itself.
        // Reversing the bend changes which side of the circle is used. Reverse
        // the radial step as well to retain the typed top-to-bottom line order.
        const lineRadius = (radius, line) => radius - direction * line.offset;
        let low = (direction > 0 ? orderedLines.at(-1).offset : 0) + Math.max(...orderedLines.map((line) => line.extent)) + gap;
        let high = low + width / sweep;
        const fits = (radius) => orderedLines.every((line) => {
            const currentRadius = lineRadius(radius, line);
            return currentRadius >= line.minimumRadius && lineSweep(line, currentRadius) <= sweep;
        });
        while (!fits(high)) high *= 2;
        for (let step = 0; step < 32; step++) {
            const mid = (low + high) / 2;
            if (fits(mid)) high = mid;
            else low = mid;
        }
        for (const line of orderedLines) {
            const radius = lineRadius(high, line);
            let cursor = -lineSweep(line, radius) / 2;
            line.glyphs.forEach((glyph, index) => {
                if (index) cursor += angularGap(line.glyphs[index - 1], glyph, radius);
                const half = halfAngle(glyph, line, radius);
                // Horizontal progress always increases; the sign only changes
                // the vertical bend and tangent rotation, never string order.
                const angle = cursor + half;
                glyph.angle = -direction * angle;
                glyph.anchorY = line.anchorY;
                glyph.x = radius * Math.sin(angle);
                glyph.y = direction * (radius - high - 2 * radius * Math.sin(angle / 2) ** 2);
                cursor += 2 * half;
            });
        }
    }
    for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index) - center.x;
        const y = positions.getY(index) - center.y;
        const z = positions.getZ(index) - center.z;
        const glyph = glyphIndices && glyphs.get(glyphIndices.getX(index));
        const radius = sweep && width ? width / sweep : Infinity;
        const anchorX = glyph ? glyph.anchorX - center.x : x;
        const anchorY = glyph ? glyph.anchorY - center.y : 0;
        const angle = glyph ? glyph.angle : -direction * anchorX / radius;
        const sin = Math.sin(angle), cos = Math.cos(angle);
        positions.setXYZ(index,
            glyph ? glyph.x + (x - anchorX) * cos - (y - anchorY) * sin : Number.isFinite(radius) ? radius * Math.sin(anchorX / radius) : x,
            glyph ? glyph.y + (x - anchorX) * sin + (y - anchorY) * cos : Number.isFinite(radius) ? y - direction * radius * (1 - cos) : y,
            z
        );
        if (normals) {
            const nx = normals.getX(index), ny = normals.getY(index);
            normals.setXY(index, nx * cos - ny * sin, nx * sin + ny * cos);
        }
    }
    geometry.center();
    positions.needsUpdate = true;
    if (normals) normals.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
}

export function getCakeMessageFootprint(geometry) {
    geometry.computeBoundingBox();
    const { min, max } = geometry.boundingBox;
    const box = new Box3(new Vector3(min.x, min.z, -max.y), new Vector3(max.x, max.z, -min.y));
    // Boundary checks use the rendered, curved outline rather than empty AABB
    // corners. Cache its convex hull once, after the existing fitting/scaling.
    const positions = geometry.attributes.position;
    const unique = new Map();
    for (let index = 0; index < positions.count; index++) {
        const x = positions.getX(index), z = -positions.getY(index);
        unique.set(`${x}:${z}`, { x, z });
    }
    const points = [...unique.values()].sort((a, b) => a.x - b.x || a.z - b.z);
    const half = (vertices) => {
        const hull = [];
        for (const point of vertices) {
            while (hull.length > 1) {
                const a = hull.at(-2), b = hull.at(-1);
                if ((b.x - a.x) * (point.z - a.z) - (b.z - a.z) * (point.x - a.x) > 0) break;
                hull.pop();
            }
            hull.push(point);
        }
        hull.pop();
        return hull;
    };
    messageFootprints.set(box, points.length <= 2 ? points : [...half(points), ...half([...points].reverse())]);
    return box;
}

export function fitCakeMessageGeometry(geometry, maxWidth, surface) {
    const width = geometry.boundingBox.max.x - geometry.boundingBox.min.x;
    if (width > maxWidth) geometry.scale(maxWidth / width, maxWidth / width, 1);
    const box = getCakeMessageFootprint(geometry);
    const center = new Vector3((surface.minX + surface.maxX) / 2, 0, (surface.minZ + surface.maxZ) / 2);
    // Inset the curved message's available radius as well as its drag limits.
    const padding = getCakeMessagePadding(box, surface);
    const fits = (scale) => isToppingPositionValid({ box: new Box3(box.min.clone().multiplyScalar(scale), box.max.clone().multiplyScalar(scale)), position: center, surface, gap: padding });
    if (!fits(1)) {
        let low = 0, high = 1;
        for (let step = 0; step < 32; step++) {
            const mid = (low + high) / 2;
            if (fits(mid)) low = mid;
            else high = mid;
        }
        // Leave room for Float32 vertex rounding at the containment boundary.
        geometry.scale(low * 0.999999, low * 0.999999, 1);
    }
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    return getCakeMessageFootprint(geometry);
}

export function getCakeMessagePadding(box, surface) {
    const center = new Vector3((surface.minX + surface.maxX) / 2, 0, (surface.minZ + surface.maxZ) / 2);
    if (isToppingPositionValid({ box, position: center, surface, gap: MESSAGE_EDGE_GAP })) return MESSAGE_EDGE_GAP;
    // Only cap the absolute margin when this tier cannot fit the text with it.
    // Leave a positive inset and usable space even on the smallest tier.
    const radius = Math.max(0, Math.min(surface.maxX - surface.minX, surface.maxZ - surface.minZ) / 2);
    return Math.min(MESSAGE_EDGE_GAP, radius / 4);
}

export function clampCakeMessagePosition(position, box, surface) {
    const center = new Vector3((surface.minX + surface.maxX) / 2, surface.topY - box.min.y + MESSAGE_HEIGHT_OFFSET, (surface.minZ + surface.maxZ) / 2);
    const target = new Vector3(Number.isFinite(position.x) ? position.x : center.x, center.y, Number.isFinite(position.z) ? position.z : center.z);
    const padding = getCakeMessagePadding(box, surface);
    if (!surface.round) {
        // Rectangular tiers clamp the two axes independently. Apply any measured
        // rounded-corner outline below only after finding the Cartesian limit.
        const minX = surface.minX + padding - box.min.x;
        const maxX = surface.maxX - padding - box.max.x;
        const minZ = surface.minZ + padding - box.min.z;
        const maxZ = surface.maxZ - padding - box.max.z;
        target.x = Math.max(minX, Math.min(maxX, target.x));
        target.z = Math.max(minZ, Math.min(maxZ, target.z));
    }
    const points = messageFootprints.get(box) || [
        { x: box.min.x, z: box.min.z }, { x: box.min.x, z: box.max.z },
        { x: box.max.x, z: box.min.z }, { x: box.max.x, z: box.max.z },
    ];
    const dx = target.x - center.x, dz = target.z - center.z;
    const distance = Math.hypot(dx, dz);
    if (!distance) return target;
    if (surface.outline?.length >= 3) {
        const outline = surface.outline;
        const winding = Math.sign(outline.reduce((area, point, index) => {
            const next = outline[(index + 1) % outline.length];
            return area + point.x * next.z - next.x * point.z;
        }, 0));
        if (winding) {
            const ux = dx / distance, uz = dz / distance;
            let maxDragRadius = Infinity;
            outline.forEach((point, index) => {
                const next = outline[(index + 1) % outline.length];
                const length = Math.hypot(next.x - point.x, next.z - point.z);
                if (!length) return;
                const nx = -winding * (next.z - point.z) / length, nz = winding * (next.x - point.x) / length;
                const outward = -(nx * ux + nz * uz);
                if (outward <= 0) return;
                const support = Math.min(...points.map((vertex) => nx * vertex.x + nz * vertex.z));
                const clearance = nx * (center.x - point.x) + nz * (center.z - point.z) + support - padding;
                maxDragRadius = Math.min(maxDragRadius, Math.max(0, clearance / outward));
            });
            const clamped = Math.min(distance, maxDragRadius);
            return target.set(center.x + ux * clamped, center.y, center.z + uz * clamped);
        }
    }
    if (surface.round) {
        const radiusX = (surface.maxX - surface.minX) / 2 - padding;
        const radiusZ = (surface.maxZ - surface.minZ) / 2 - padding;
        const radius = Math.min(radiusX, radiusZ);
        if (radius > 0) {
            const scaleX = radius / radiusX, scaleZ = radius / radiusZ;
            const scaledDistance = Math.hypot(dx * scaleX, dz * scaleZ);
            const ux = dx * scaleX / scaledDistance, uz = dz * scaleZ / scaledDistance;
            // Solve each rendered vertex's circle intersection along the drag
            // direction. Tangential width consumes only the necessary chord,
            // instead of subtracting one oversized radius in every direction.
            let textBoundingRadius = 0;
            for (const point of points) {
                const x = point.x * scaleX, z = point.z * scaleZ;
                const projection = ux * x + uz * z;
                const tangent = ux * z - uz * x;
                textBoundingRadius = Math.max(textBoundingRadius, radius + projection - Math.sqrt(Math.max(0, radius * radius - tangent * tangent)));
            }
            const maxDragRadius = Math.max(0, radius - textBoundingRadius);
            const factor = Math.min(1, maxDragRadius / scaledDistance);
            return target.set(center.x + dx * factor, center.y, center.z + dz * factor);
        }
    }
    return constrainToppingPosition({ box, from: center, to: target, surface, gap: padding });
}

// Drei reports a world-space pointer delta in its proposed translation. Convert
// that delta back into the cake parent's space, including its orbit rotation.
export function getCakeMessageDragPosition(proposedMatrix, startLocal, startWorld, parent) {
    return parent.worldToLocal(new Vector3().setFromMatrixPosition(proposedMatrix).sub(startLocal).add(startWorld));
}
