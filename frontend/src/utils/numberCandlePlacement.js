import { Vector3 } from "three";
import { constrainToppingPath, isToppingPositionValid, TOPPING_SURFACE_OFFSET } from "./toppingDragPlacement.js";

export function isNumberCandleRelativePlacement(value) {
    return value && Number.isFinite(value.angle) && Number.isFinite(value.normalizedRadius) &&
        value.normalizedRadius >= 0 && value.normalizedRadius <= 1 &&
        Number.isInteger(value.ledgeIndex) && value.ledgeIndex >= 0 &&
        Number.isInteger(value.tierCount) && value.tierCount > 0 && (value.form === 1 || value.form === 2);
}

function radiusAtAngle(tier, angle) {
    const x = Math.cos(angle), z = Math.sin(angle);
    const centerX = (tier.minX + tier.maxX) / 2, centerZ = (tier.minZ + tier.maxZ) / 2;
    const radiusX = (tier.maxX - tier.minX) / 2, radiusZ = (tier.maxZ - tier.minZ) / 2;
    if (tier.outline?.length >= 3) {
        const area = tier.outline.reduce((sum, point, index) => {
            const next = tier.outline[(index + 1) % tier.outline.length];
            return sum + point.x * next.z - next.x * point.z;
        }, 0);
        let radius = Infinity;
        tier.outline.forEach((point, index) => {
            const next = tier.outline[(index + 1) % tier.outline.length];
            const dx = next.x - point.x, dz = next.z - point.z;
            const depth = Math.sign(area) * (dx * (centerZ - point.z) - dz * (centerX - point.x));
            const direction = Math.sign(area) * (dx * z - dz * x);
            if (direction < -1e-12) radius = Math.min(radius, -depth / direction);
        });
        if (Number.isFinite(radius)) return Math.max(0, radius);
    }
    return tier.round ? 1 / Math.hypot(x / radiusX, z / radiusZ)
        : 1 / Math.max(Math.abs(x) / radiusX, Math.abs(z) / radiusZ);
}

// Ledge zero is the top cap. Radius is a fraction of that ledge's outline
// distance along the saved angle, including rectangular and elliptical tiers.
export function getNumberCandleRelativePlacement({ position, footprint, surface, insertionDepth = 0, tierCount, form }) {
    const tiers = surface.ledges.tiers || [surface];
    const bottom = position.y + footprint.min.y + insertionDepth - TOPPING_SURFACE_OFFSET;
    const ledgeIndex = tiers.reduce((nearest, tier, index) =>
        Math.abs(tier.topY - bottom) < Math.abs(tiers[nearest].topY - bottom) ? index : nearest, 0);
    const tier = tiers[ledgeIndex];
    const x = position.x + (footprint.min.x + footprint.max.x) / 2 - (tier.minX + tier.maxX) / 2;
    const z = position.z + (footprint.min.z + footprint.max.z) / 2 - (tier.minZ + tier.maxZ) / 2;
    const angle = Math.atan2(z, x);
    const radius = radiusAtAngle(tier, angle);
    return { angle, normalizedRadius: radius > 0 ? Math.min(1, Math.hypot(x, z) / radius) : 0, ledgeIndex, tierCount, form };
}

export function getNumberCandleResizePlacement({ relativePlacement, footprint, box, surface, insertionDepth = 0 }) {
    if (!isNumberCandleRelativePlacement(relativePlacement)) return null;
    const tiers = surface.ledges.tiers || [surface];
    const ledgeIndex = Math.min(relativePlacement.ledgeIndex, tiers.length - 1);
    const tier = tiers[ledgeIndex];
    const direction = new Vector3(Math.cos(relativePlacement.angle), 0, Math.sin(relativePlacement.angle));
    const center = new Vector3(
        (tier.minX + tier.maxX - footprint.min.x - footprint.max.x) / 2,
        tier.topY - footprint.min.y - insertionDepth + TOPPING_SURFACE_OFFSET,
        (tier.minZ + tier.maxZ - footprint.min.z - footprint.max.z) / 2
    );
    const radius = radiusAtAngle(tier, relativePlacement.angle);
    const desiredRadius = relativePlacement.normalizedRadius * radius;
    const bounds = { ...surface.ledges, tiers, tierFromHeight: true };
    // Validate ledges at their actual support height, independently of how far
    // the candle is embedded into the icing.
    const supportPosition = (position) => position.clone().setY(tier.topY - footprint.min.y + TOPPING_SURFACE_OFFSET);
    const valid = (position) => isToppingPositionValid({ box, surfaceBox: footprint, position: supportPosition(position), surface: bounds });
    const desired = center.clone().addScaledVector(direction, desiredRadius);
    if (valid(desired)) return { position: desired, shiftedOutward: false };

    // Test upper walls independently of the outer rim. An unbounded selected
    // cap leaves only the existing upper-tier footprint exclusions in effect.
    const wallBounds = { ...bounds, tiers: tiers.map((candidate, index) => index === ledgeIndex ? {
        ...candidate, minX: -Infinity, maxX: Infinity, minZ: -Infinity, maxZ: Infinity, outline: undefined, round: false,
    } : candidate) };
    const shiftedOutward = ledgeIndex > 0 && !isToppingPositionValid({ box, surfaceBox: footprint,
        position: supportPosition(desired), surface: wallBounds });

    // Keep the saved angle when a changed tier ratio puts the desired radius
    // into an upper-tier wall or beyond the physical outer edge.
    const outer = constrainToppingPath(box, center, center.clone().addScaledVector(direction, radius * 2), tier, [], undefined, footprint);
    outer.y = center.y;
    if (!valid(outer)) return { position: shiftedOutward ? null : desired, shiftedOutward };
    const maximum = Math.hypot(outer.x - center.x, outer.z - center.z);
    let minimum = 0, high = maximum;
    if (!valid(center)) {
        for (let iteration = 0; iteration < 40; iteration++) {
            const middle = (minimum + high) / 2;
            if (valid(center.clone().addScaledVector(direction, middle))) high = middle;
            else minimum = middle;
        }
        minimum = high;
    }
    return { position: center.addScaledVector(direction, Math.max(minimum, Math.min(maximum, desiredRadius))), shiftedOutward };
}

export function getNumberCandleAbsolutePosition(options) {
    return getNumberCandleResizePlacement(options)?.position || null;
}
