import test from "node:test";
import assert from "node:assert/strict";
import { Box3, Vector3 } from "three";
import { getNumberCandleAbsolutePosition, getNumberCandleRelativePlacement, getNumberCandleResizePlacement } from "../src/utils/numberCandlePlacement.js";
import { isToppingPositionValid, TOPPING_SURFACE_OFFSET } from "../src/utils/toppingDragPlacement.js";

function makeSurface(round, radii = [[1, 0.6], [2, 1.2]], heights = [4.7, 1.3]) {
    const tiers = radii.map(([x, z], index) => ({ minX: -x, maxX: x, minZ: -z, maxZ: z, topY: heights[index], round }));
    return { ...tiers[0], ledges: { ...tiers.at(-1), topY: heights[0], tiers } };
}

test("number-candle angle and normalized radius use the selected ellipse or rectangle and the physical footprint center", () => {
    for (const round of [false, true]) {
        const surface = makeSurface(round);
        const footprint = new Box3(new Vector3(0.08, -0.04, -0.12), new Vector3(0.18, 0.3, -0.02));
        const x = 1.4, z = 0.55;
        const position = new Vector3(x - 0.13, 1.3 - footprint.min.y - 0.1 + TOPPING_SURFACE_OFFSET, z + 0.07);
        const relative = getNumberCandleRelativePlacement({ position, footprint, surface, insertionDepth: 0.1, tierCount: 2, form: round ? 1 : 2 });
        assert.equal(relative.ledgeIndex, 1);
        assert.ok(Math.abs(relative.angle - Math.atan2(z, x)) < 1e-12);
        const normalized = round ? Math.hypot(x / 2, z / 1.2) : Math.max(Math.abs(x) / 2, Math.abs(z) / 1.2);
        assert.ok(Math.abs(relative.normalizedRadius - normalized) < 1e-12);
        const destination = makeSurface(round, [[1.2, 0.8], [3.4, 2.2]], [5.3, 1.9]);
        const restored = getNumberCandleAbsolutePosition({ relativePlacement: relative, footprint, box: footprint, surface: destination, insertionDepth: 0.1 });
        const dx = restored.x + 0.13, dz = restored.z - 0.07;
        assert.ok(Math.abs(Math.atan2(dz, dx) - relative.angle) < 1e-12);
        const restoredRadius = round ? Math.hypot(dx / 3.4, dz / 2.2) : Math.max(Math.abs(dx) / 3.4, Math.abs(dz) / 2.2);
        assert.ok(Math.abs(restoredRadius - normalized) < 1e-12);
        assert.ok(Math.abs(restored.y + footprint.min.y + 0.1 - 1.9 - TOPPING_SURFACE_OFFSET) < 1e-12);
    }
});

test("a changed upper-tier radius clamps along the saved angle instead of placing a number candle inside the tier wall", () => {
    for (const round of [false, true]) {
        const surface = makeSurface(round, [[1.8, 1.8], [2, 2]], [4, 1]);
        const footprint = new Box3(new Vector3(-0.04, 0, -0.03), new Vector3(0.04, 0.4, 0.03));
        const relativePlacement = { angle: Math.PI / 3, normalizedRadius: 0.6, ledgeIndex: 3, tierCount: 4, form: round ? 1 : 2 };
        const position = getNumberCandleAbsolutePosition({ relativePlacement, footprint, box: footprint, surface });
        assert.ok(Math.abs(Math.atan2(position.z, position.x) - relativePlacement.angle) < 1e-8);
        assert.equal(isToppingPositionValid({ box: footprint, position, surface: { ...surface.ledges, tierFromHeight: true } }), true);
        assert.ok(Math.abs(position.y - 1.001) < 1e-12, "a removed ledge must use the bottom available support height");
    }
});

test("an outward wall adjustment reports no position when clearing the wall would cross the outer rim", () => {
    for (const round of [false, true]) {
        const surface = makeSurface(round, [[1.97, 1.97], [2, 2]], [4, 1]);
        const footprint = new Box3(new Vector3(-0.07, 0, -0.05), new Vector3(0.07, 0.4, 0.05));
        const relativePlacement = { angle: Math.PI / 2, normalizedRadius: 0.6, ledgeIndex: 1, tierCount: 2, form: round ? 1 : 2 };
        const result = getNumberCandleResizePlacement({ relativePlacement, footprint, box: footprint, surface });
        assert.equal(result.shiftedOutward, true);
        assert.equal(result.position, null, "a blocked outward move must not fall back to a different ledge location");
    }
});

test("malformed relative number-candle metadata cannot produce invalid coordinates", () => {
    const surface = makeSurface(true);
    const footprint = new Box3(new Vector3(-0.04, 0, -0.03), new Vector3(0.04, 0.4, 0.03));
    const valid = { angle: 0.5, normalizedRadius: 0.9, ledgeIndex: 1, tierCount: 2, form: 1 };
    for (const relativePlacement of [null, {}, { ...valid, angle: NaN }, { ...valid, normalizedRadius: Infinity }, { ...valid, normalizedRadius: -0.1 }, { ...valid, ledgeIndex: -1 }, { ...valid, ledgeIndex: 0.5 }]) {
        assert.equal(getNumberCandleAbsolutePosition({ relativePlacement, footprint, box: footprint, surface }), null);
    }
});
