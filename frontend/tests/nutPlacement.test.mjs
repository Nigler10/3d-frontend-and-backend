import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, Vector3 } from "three";
import { getGroundedNutY } from "../src/utils/nutPlacement.js";
import { CAKE_GROUP_POSITION, TIER_TOP_Y, getTierLoadingPosition } from "../src/components/cake/tierConfig.js";

const modelUrl = new URL("../public/models/tier1/tier1.gltf", import.meta.url);
const model = JSON.parse(readFileSync(modelUrl, "utf8"));
const nuts = model.nodes.find((node) => node.name === "nuts");
const accessor = model.accessors[model.meshes[nuts.mesh].primitives[0].attributes.POSITION];
const view = model.bufferViews[accessor.bufferView];
const buffer = readFileSync(new URL(model.buffers[view.buffer].uri, modelUrl));
const vertices = [];
for (let index = 0; index < accessor.count; index += 1) {
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0) + index * (view.byteStride || 12);
    for (let axis = 0; axis < 3; axis += 1) vertices.push(buffer.readFloatLE(offset + axis * 4));
}
const geometry = new BufferGeometry().setAttribute("position", new Float32BufferAttribute(vertices, 3)).center();
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test("the shipped nuts rest flush on every tier after scale and rotation", () => {
    const original = [...geometry.attributes.position.array];
    for (const topY of TIER_TOP_Y) {
        for (const scale of [0.04, 0.1, 0.18, -0.18]) {
            for (const rotation of [[Math.PI / 2, 0, -2.81], [0.6, 0.3, -1.2]]) {
                const mesh = new Mesh(geometry);
                mesh.rotation.set(...rotation);
                mesh.scale.setScalar(scale);
                mesh.position.y = getGroundedNutY([geometry], scale, rotation, topY);
                near(new Box3().setFromObject(mesh, true).min.y, topY);
            }
        }
    }
    assert.deepEqual([...geometry.attributes.position.array], original, "grounding must not alter the model vertices");
});

test("multipart nuts use the lowest transformed vertex across both meshes", () => {
    const parts = [new BoxGeometry(1, 2, 0.3).translate(2, 1, 0.2), new BoxGeometry(0.4, 1, 0.8).translate(-1, 0.5, -0.4)];
    const rotation = [Math.PI / 2, 0, -2.81];
    const group = new Group();
    group.rotation.set(...rotation);
    group.scale.setScalar(0.18);
    group.add(...parts.map((part) => new Mesh(part)));
    group.position.y = getGroundedNutY(parts, 0.18, rotation, 2.35);
    near(new Box3().setFromObject(group, true).min.y, 2.35);
    assert.equal(getGroundedNutY([null], 0.18, rotation, 2.35), 2.35);
});

test("loading indicators occupy the selected tier surface in the cake's rendered coordinates", () => {
    for (let index = 0; index < 4; index += 1) {
        const position = getTierLoadingPosition(index);
        const root = new Group();
        root.position.fromArray(CAKE_GROUP_POSITION);
        const surface = root.localToWorld(new Vector3(0, TIER_TOP_Y[index], 0));
        near(position[0], surface.x);
        near(position[1], surface.y);
        near(position[2], surface.z);
    }
    assert.deepEqual(getTierLoadingPosition(99), getTierLoadingPosition(0));
});
