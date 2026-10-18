import { Euler, MathUtils, Quaternion } from "three";

export function normalizeChocolateRotation(rotation) {
    const angles = Number.isFinite(rotation) ? { y: rotation } : rotation;
    return Object.fromEntries(["x", "y"].map((axis) => [
        axis, Number.isFinite(angles?.[axis]) ? MathUtils.clamp(angles[axis], 0, 360) : 0,
    ]));
}

export function updateChocolateRotation(layouts, index, axis, value) {
    const angle = Number(value);
    if (!["x", "y"].includes(axis) || !Number.isInteger(index) || index < 0 || index >= layouts.length || !Number.isFinite(angle)) return layouts;
    return layouts.map((layout, piece) => piece === index ? {
        ...layout,
        rotation: {
            ...(typeof layout.rotation === "object" ? layout.rotation : {}),
            ...normalizeChocolateRotation(layout.rotation),
            [axis]: MathUtils.clamp(angle, 0, 360),
        },
    } : layout);
}

export function getChocolateQuaternion(rotation, baseRotation) {
    const angles = normalizeChocolateRotation(rotation);
    // Apply only customer X/Y rotation in cake coordinates; preserve the model's
    // existing orientation when both sliders are zero, including its Z angle.
    return new Quaternion().setFromEuler(new Euler(
        MathUtils.degToRad(angles.x), MathUtils.degToRad(angles.y), 0, "XYZ"
    )).multiply(new Quaternion().setFromEuler(new Euler(...baseRotation)));
}
