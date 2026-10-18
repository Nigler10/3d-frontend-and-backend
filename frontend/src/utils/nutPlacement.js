import { Euler, Quaternion, Vector3 } from "three";

export function getGroundedNutY(geometries, scale, rotation, topY) {
    const quaternion = new Quaternion().setFromEuler(new Euler(...rotation));
    const vertex = new Vector3();
    let bottom = Infinity;
    for (const geometry of geometries) {
        const positions = geometry?.getAttribute("position");
        if (!positions) continue;
        for (let index = 0; index < positions.count; index += 1) {
            vertex.fromBufferAttribute(positions, index).multiplyScalar(scale).applyQuaternion(quaternion);
            bottom = Math.min(bottom, vertex.y);
        }
    }
    return topY - (Number.isFinite(bottom) ? bottom : 0);
}
