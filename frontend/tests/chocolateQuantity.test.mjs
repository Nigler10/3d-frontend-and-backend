import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Group, Mesh, Vector3 } from "three";
import { hydrateChocolateLayouts, normalizeChocolateCount, resizeChocolateLayouts } from "../src/utils/chocolateQuantity.js";
import { createToppingDragController } from "../src/utils/toppingDragController.js";
import { getToppingCollisionBox, getTransformedToppingBox, TOPPING_SURFACE_OFFSET } from "../src/utils/toppingDragPlacement.js";

test("chocolate quantity accepts exactly one to three whole pieces", () => {
    for (const [input, expected] of [[0, 1], [-1, 1], [1, 1], [2, 2], [3, 3], [4, 3], [99, 3], [2.9, 2], ["3", 3], ["", 1], [NaN, 1], [Infinity, 1]]) {
        assert.equal(normalizeChocolateCount(input), expected);
        assert.equal(resizeChocolateLayouts([], input).length, expected);
    }
});

test("chocolate hydration supports old singleton layouts and restores up to three saved pieces", () => {
    const legacy = { x: 20, y: 70, size: "large", position: [-0.6, 1, 0.4], rotation: { x: 0, y: 45, z: 0 } };
    assert.deepEqual(hydrateChocolateLayouts(legacy), [legacy]);
    assert.equal(hydrateChocolateLayouts().length, 1);
    assert.equal(hydrateChocolateLayouts([]).length, 1);
    const saved = [legacy, { ...legacy, x: 50 }, { ...legacy, x: 80 }];
    assert.deepEqual(hydrateChocolateLayouts(JSON.parse(JSON.stringify(saved))), saved);
    assert.equal(hydrateChocolateLayouts([...saved, legacy]).length, 3);
});

test("changing quantity keeps existing poses and gives added pieces independent layouts", () => {
    const first = { x: 20, y: 70, size: "small", position: [-0.6, 1, 0.4] };
    const three = resizeChocolateLayouts([first], 3);
    assert.equal(three[0], first);
    assert.notEqual(three[1], three[2]);
    assert.notDeepEqual([three[1].x, three[1].y], [three[2].x, three[2].y]);
    assert.equal(three[1].position, undefined);
    assert.deepEqual(resizeChocolateLayouts(three, 1), [first]);
    assert.equal(resizeChocolateLayouts(resizeChocolateLayouts(three, 2), 3)[2].position, undefined);
});

function setup(layouts, readOnly = false) {
    const parent = new Group();
    parent.position.set(2, -0.8, -1);
    parent.rotation.y = 0.8;
    const scene = new Group();
    const cake = new Mesh(new BoxGeometry(4, 1, 4));
    cake.name = "cake_rectangle";
    cake.position.y = 0.5;
    scene.add(cake);
    parent.add(scene);
    const current = {
        scene, cakeGroupRef: { current: parent }, controlsRef: { current: { enabled: true } },
        state: {
            form: 2, selectedTierIndex: 0, toppingLayout: {}, cherryLayouts: [], chocolateLayouts: layouts,
            setToppingPosition(id, x, y, position) {
                const index = Number(id.slice(10));
                current.state.chocolateLayouts = current.state.chocolateLayouts.map((layout, piece) => (
                    piece === index ? { ...layout, x, y, position: [...position] } : layout
                ));
            },
        },
    };
    const store = { publish() {}, clear() {}, controller: null };
    const controller = createToppingDragController({ getCurrent: () => current, store, eventTarget: new EventTarget(), scheduleFrame: queueMicrotask });
    controller.interactive = !readOnly;
    store.controller = controller;
    controller.reconcile();
    const objects = layouts.map((layout, index) => {
        const object = new Group();
        object.matrixAutoUpdate = false;
        const anchor = new Vector3(0, 1, 0);
        const mesh = new Mesh(new BoxGeometry(0.4, 0.04, 0.25));
        mesh.position.copy(anchor).add(new Vector3(0, 0.02, 0));
        object.add(mesh);
        parent.add(object);
        const box = getToppingCollisionBox(object, parent).translate(anchor.clone().negate());
        controller.register(`chocolate-${index}`, { id: `chocolate-${index}`, object, anchor, box, layout, insertionDepth: 0 });
        return object;
    });
    controller.reconcile();
    return { controller, current, parent, objects };
}

test("three chocolates spawn separately, drag independently, and restore all saved positions", () => {
    const { controller, current, parent, objects } = setup(Array.from({ length: 3 }, () => ({ x: 50, y: 50, size: "medium" })));
    assert.equal(controller.entries.size, 3);
    assert.equal(controller.hasUnplacedToppings, false);
    assert.ok(objects.every((object) => object.visible));
    for (let first = 0; first < 3; first += 1) {
        const a = getToppingCollisionBox(objects[first], parent);
        for (let second = first + 1; second < 3; second += 1) {
            assert.equal(a.intersectsBox(getToppingCollisionBox(objects[second], parent)), false);
        }
    }
    const before = current.state.chocolateLayouts.map((layout) => structuredClone(layout));
    assert.equal(controller.begin("chocolate-1"), true);
    controller.move("chocolate-1", new Vector3(1, 1, 1));
    controller.end("chocolate-1");
    assert.deepEqual(current.state.chocolateLayouts[0], before[0]);
    assert.deepEqual(current.state.chocolateLayouts[2], before[2]);
    assert.notDeepEqual(current.state.chocolateLayouts[1].position, before[1].position);
    assert.ok(Math.abs(getTransformedToppingBox(objects[1], parent).min.y - (1 + TOPPING_SURFACE_OFFSET)) < 1e-8);
    assert.equal(controller.moveMarker("chocolate-2", 25, 25), true);
    controller.end("chocolate-2");
    assert.deepEqual(current.state.chocolateLayouts[0], before[0]);
    const saved = hydrateChocolateLayouts(JSON.parse(JSON.stringify(current.state.chocolateLayouts)));
    const preview = setup(saved, true);
    assert.equal(preview.controller.entries.size, 3);
    for (let index = 0; index < 3; index += 1) {
        assert.deepEqual(preview.controller.entries.get(`chocolate-${index}`).position.toArray(), saved[index].position);
    }
    assert.deepEqual(current.state.toppingLayout, {}, "indexed positions must commit to the chocolate list");
});
