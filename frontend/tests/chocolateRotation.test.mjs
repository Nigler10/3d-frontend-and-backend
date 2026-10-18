import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Euler, Group, Mesh, Quaternion, Vector3 } from "three";
import { getChocolateQuaternion, normalizeChocolateRotation, updateChocolateRotation } from "../src/utils/chocolateRotation.js";
import { hydrateChocolateLayouts } from "../src/utils/chocolateQuantity.js";
import { createToppingDragController } from "../src/utils/toppingDragController.js";
import { getToppingCollisionBox, getTransformedToppingBox, TOPPING_SURFACE_OFFSET } from "../src/utils/toppingDragPlacement.js";

const baseRotation = [2.87, -0.55, -2.38];
const baseQuaternion = new Quaternion().setFromEuler(new Euler(...baseRotation));
const samePose = (actual, expected) => assert.ok(1 - Math.abs(actual.dot(expected)) < 1e-10);

test("zero X/Y angles preserve the existing chocolate pose and no Z control is applied", () => {
    samePose(getChocolateQuaternion(undefined, baseRotation), baseQuaternion);
    samePose(getChocolateQuaternion({ x: 360, y: 360 }, baseRotation), baseQuaternion);
    samePose(getChocolateQuaternion({ x: 35, y: 65, z: 240 }, baseRotation), getChocolateQuaternion({ x: 35, y: 65 }, baseRotation));
    assert.deepEqual(normalizeChocolateRotation(90), { x: 0, y: 90 });
});

test("the X and Y sliders rotate about the cake axes after the existing mesh orientation", () => {
    const initial = new Vector3(0.2, 0.5, 0.7).applyQuaternion(baseQuaternion);
    for (const [axis, direction] of [["x", new Vector3(1, 0, 0)], ["y", new Vector3(0, 1, 0)]]) {
        const actual = new Vector3(0.2, 0.5, 0.7).applyQuaternion(getChocolateQuaternion({ [axis]: 90 }, baseRotation));
        const expected = initial.clone().applyAxisAngle(direction, Math.PI / 2);
        assert.ok(actual.distanceTo(expected) < 1e-10);
    }
});

test("rotation updates only the selected chocolate and survives saving its placement", () => {
    const layouts = [
        { x: 25, y: 40, size: "small", position: [-0.5, 1.1, -0.2] },
        { x: 65, y: 60, size: "large", position: [0.3, 1.1, 0.2], rotation: { x: 15, y: 30 } },
    ];
    let updated = updateChocolateRotation(layouts, 1, "x", "65");
    updated = updateChocolateRotation(updated, 1, "y", "110");
    assert.equal(updated[0], layouts[0]);
    assert.deepEqual(updated[1].rotation, { x: 65, y: 110 });
    assert.deepEqual(updated[1].position, layouts[1].position);
    assert.equal(updated[1].x, layouts[1].x);
    assert.equal(updated[1].y, layouts[1].y);
    assert.equal(updated[1].size, layouts[1].size);
    assert.deepEqual(layouts[1].rotation, { x: 15, y: 30 });
    const restored = hydrateChocolateLayouts(JSON.parse(JSON.stringify(updated)));
    assert.deepEqual(restored, updated);
    samePose(getChocolateQuaternion(restored[1].rotation, baseRotation), getChocolateQuaternion(updated[1].rotation, baseRotation));
    assert.equal(updateChocolateRotation(layouts, 1, "z", 45), layouts);
    assert.equal(updateChocolateRotation(layouts, 3, "x", 45), layouts);
    assert.equal(updateChocolateRotation(layouts, 0, "x", NaN), layouts);
    assert.equal(updateChocolateRotation(layouts, 0, "x", -5)[0].rotation.x, 0);
    assert.equal(updateChocolateRotation(layouts, 0, "y", 400)[0].rotation.y, 360);
});

test("static nuts occupy no drag space while chocolate rotates and passes through them", async () => {
    const parent = new Group();
    const scene = new Group();
    const cake = new Mesh(new BoxGeometry(4, 1, 4));
    cake.name = "cake_rectangle";
    cake.position.y = 0.5;
    scene.add(cake);
    parent.add(scene);
    // Like sprinkles, the static nuts are rendered directly, without a drag entry.
    const nuts = new Mesh(new BoxGeometry(5, 0.4, 5));
    nuts.position.set(0, 1.2, 0);
    parent.add(nuts);
    const originalNuts = nuts.position.clone();
    const rejected = [];
    const current = {
        scene, cakeGroupRef: { current: parent }, controlsRef: { current: { enabled: true } },
        state: {
            form: 2, selectedTierIndex: 0, toppingLayout: {}, cherryLayouts: [],
            chocolateLayouts: [{ x: 50, y: 50, size: "medium", rotation: { x: 0, y: 0 } }],
            setToppingPosition(id, x, y, position) {
                current.state.chocolateLayouts[0] = { ...current.state.chocolateLayouts[0], x, y, position: [...position] };
            },
        },
    };
    const store = { publish() {}, clear() {}, controller: null };
    const controller = createToppingDragController({ getCurrent: () => current, store, onPlacementRejected: (ids) => rejected.push(ids), eventTarget: new EventTarget(), scheduleFrame: queueMicrotask });
    store.controller = controller;
    controller.reconcile();
    const object = new Group();
    object.matrixAutoUpdate = false;
    const mesh = new Mesh(new BoxGeometry(0.6, 0.04, 0.3));
    mesh.position.set(0, 1, 0);
    object.add(mesh);
    parent.add(object);
    const anchor = new Vector3(0, 1, 0);
    for (const rotation of [{ x: 0, y: 0 }, { x: 35, y: 65 }, { x: 90, y: 180 }]) {
        object.matrix.identity();
        mesh.quaternion.copy(getChocolateQuaternion(rotation, baseRotation));
        current.state.chocolateLayouts[0] = { ...current.state.chocolateLayouts[0], rotation };
        const box = getToppingCollisionBox(object, parent).translate(anchor.clone().negate());
        controller.register("chocolate-0", { id: "chocolate-0", object, anchor, box, layout: current.state.chocolateLayouts[0], insertionDepth: 0 });
        controller.reconcile();
        assert.equal(controller.entries.has("nuts"), false);
        assert.equal(controller.hasUnplacedToppings, false);
        assert.equal(controller.obstacles("chocolate-0").length, 0);
        assert.ok(Math.abs(getTransformedToppingBox(object, parent).min.y - (1 + TOPPING_SURFACE_OFFSET)) < 1e-8);
    }
    assert.equal(controller.begin("nuts"), false);
    assert.equal(controller.begin("chocolate-0"), true);
    controller.move("chocolate-0", new Vector3(0.5, 1, 0.5));
    controller.end("chocolate-0");
    await Promise.resolve();
    assert.ok(nuts.position.equals(originalNuts));
    assert.equal(nuts.visible, true);
    assert.deepEqual(rejected, []);
    assert.equal(controller.entries.size, 1);
});
