import test from "node:test";
import assert from "node:assert/strict";
import { BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from "three";
import { createToppingDragController } from "../src/utils/toppingDragController.js";
import { getTransformedToppingBox, TOPPING_PLACEMENT_GAP } from "../src/utils/toppingDragPlacement.js";

function setup() {
    const parent = new Group();
    parent.position.set(2, -0.8, -1);
    parent.rotation.y = 0.8;
    const scene = new Group();
    const cake = new Mesh(new BoxGeometry(4, 1, 4));
    cake.name = "cake_rectangle";
    cake.position.y = 0.5;
    scene.add(cake);
    parent.add(scene);
    let frames = 0;
    const dragEvents = [];
    const rejectedAdditions = [];
    const store = { publish() {}, clear() {}, controller: null, setDragging: (isDragging, point) => dragEvents.push({ isDragging, ...point }) };
    const current = {
        scene, cakeGroupRef: { current: parent }, controlsRef: { current: { enabled: true } },
        state: {
            form: 2, selectedTierIndex: 0, toppingLayout: {}, cherryLayouts: [],
            setToppingPosition(id, x, y, position) {
                current.state = { ...current.state, toppingLayout: { ...current.state.toppingLayout, [id]: { ...current.state.toppingLayout[id], x, y, position: [...position] } } };
            },
        },
    };
    const controller = createToppingDragController({ getCurrent: () => current, store, invalidate: () => frames++, onPlacementRejected: (ids) => rejectedAdditions.push(ids), eventTarget: new EventTarget(), scheduleFrame: queueMicrotask });
    store.controller = controller;
    controller.reconcile();
    const register = (id, x, z = 0, width = 0.4, depth = 0.4) => {
        const anchor = new Vector3(x, 1, z);
        const object = new Group();
        object.matrixAutoUpdate = false;
        const mesh = new Mesh(new BoxGeometry(width, 0.4, depth));
        mesh.position.copy(anchor).add(new Vector3(0, 0.2, 0));
        object.add(mesh);
        parent.add(object);
        const box = getTransformedToppingBox(object, parent).translate(anchor.clone().negate());
        const layout = { x: (x + 2) * 25, y: (z + 2) * 25, size: "medium" };
        current.state = { ...current.state, toppingLayout: { ...current.state.toppingLayout, [id]: layout } };
        controller.register(id, { id, object, anchor, box, layout, insertionDepth: 0, position: null });
        return { object, mesh, anchor, box, layout };
    };
    const camera = new PerspectiveCamera(45, 4 / 3, 0.1, 100);
    camera.position.set(2, 6, 5);
    camera.lookAt(2, 0.2, -1);
    camera.updateWorldMatrix(true, false);
    const body = { scrollLeft: 0, scrollTop: 0 };
    const canvas = { ownerDocument: { body }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
    const dataAt = (position) => {
        const screen = parent.localToWorld(position.clone()).project(camera);
        return { node: canvas, x: (screen.x + 1) * 400, y: (1 - screen.y) * 300 };
    };
    const start = (id) => {
        const position = controller.entries.get(id).position;
        assert.equal(controller.begin(id), true);
        assert.equal(controller.startPointer(id, dataAt(position), camera, canvas), true);
    };
    const drag = (id, target) => controller.drag(id, dataAt(target), camera, canvas);
    return { controller, current, store, parent, register, start, drag, dragEvents, rejectedAdditions, frames: () => frames };
}

test("a topping registered after the parent placement effect appears without another state update", async () => {
    const fixture = setup();
    const topping = fixture.register("chocolate", 0);
    await Promise.resolve();
    assert.equal(topping.object.visible, true);
    assert.ok(fixture.controller.entries.get("chocolate").position);
    assert.ok(fixture.frames() > 0, "placement must invalidate the canvas");
});

test("registration preserves accepted positions and replaces registry snapshots immutably", () => {
    const { controller, register } = setup();
    const empty = controller.entries;
    register("chocolate", -0.8);
    controller.reconcile();
    const before = controller.entries;
    const entry = before.get("chocolate");
    const accepted = entry.position.clone();
    controller.register("chocolate", { ...entry, position: null, layout: { ...entry.layout } });
    assert.equal(empty.size, 0);
    assert.notEqual(controller.entries, before);
    assert.ok(controller.entries.get("chocolate").position.equals(accepted));
    assert.ok(entry.position.equals(accepted));
});

test("toppings added in one commit immediately occupy separate geometry-based placements", async () => {
    const { controller, register, parent } = setup();
    const first = register("chocolate", 0);
    const second = register("candle", 0);
    await Promise.resolve();
    assert.equal(first.object.visible, true);
    assert.equal(second.object.visible, true);
    assert.ok(controller.entries.get("chocolate").position);
    assert.ok(controller.entries.get("candle").position);
    assert.equal(getTransformedToppingBox(first.object, parent).intersectsBox(getTransformedToppingBox(second.object, parent)), false);
});

test("a fast pointer drag stops the chocolate at the edge of remeasured nuts without tunneling", () => {
    const { controller, register, start, drag, parent, current } = setup();
    const moving = register("chocolate", -1.2);
    const obstacle = register("nuts", 0, 0, 0.8, 0.8);
    controller.reconcile();
    const saved = controller.entries.get("nuts");
    const obstaclePosition = saved.position.clone();
    controller.register("nuts", { ...saved, layout: { ...saved.layout }, position: null });
    start("chocolate");
    drag("chocolate", new Vector3(2, controller.entries.get("chocolate").position.y, 0));
    for (let frame = 0; frame < 60; frame++) {
        controller.update(1 / 60);
        assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(getTransformedToppingBox(obstacle.object, parent)), false);
    }
    const separation = getTransformedToppingBox(obstacle.object, parent).min.x - getTransformedToppingBox(moving.object, parent).max.x;
    assert.ok(Math.abs(separation - TOPPING_PLACEMENT_GAP) < 2e-6, `stop at the geometry edge with only the configured clearance: ${separation}`);
    controller.end();
    const finalSeparation = getTransformedToppingBox(obstacle.object, parent).min.x - getTransformedToppingBox(moving.object, parent).max.x;
    assert.ok(Math.abs(finalSeparation - TOPPING_PLACEMENT_GAP) < 1e-7);
    assert.ok(current.state.toppingLayout.chocolate.x < 50);
    assert.ok(controller.entries.get("nuts").position.equals(obstaclePosition));
});

test("dragging into another topping clamps continuously without a release or reconciliation jump", () => {
    const { controller, register, start, parent, current } = setup();
    const moving = register("chocolate", -1.2);
    const obstacle = register("candle", 0);
    controller.reconcile();
    start("chocolate");
    const target = controller.entries.get("candle").position.clone();
    controller.move("chocolate", target);
    for (let frame = 0; frame < 60; frame++) {
        controller.update(1 / 60);
        assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(getTransformedToppingBox(obstacle.object, parent)), false);
    }
    const touching = controller.entries.get("chocolate").position.clone();
    controller.end();
    const released = controller.entries.get("chocolate").position.clone();
    assert.ok(released.distanceTo(touching) < 2e-6, `release changed ${touching.toArray()} to ${released.toArray()}`);
    controller.reconcile();
    const placed = controller.entries.get("chocolate").position;
    assert.ok(!placed.equals(target));
    assert.ok(placed.distanceTo(released) < 1e-7);
    assert.deepEqual(current.state.toppingLayout.chocolate.position, placed.toArray());
    assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(getTransformedToppingBox(obstacle.object, parent)), false);
});

test("drag clamping is symmetric at all four bounding box edges", () => {
    for (const axis of ["x", "z"]) {
        for (const sign of [-1, 1]) {
            const { controller, register, parent } = setup();
            const moving = register("chocolate", axis === "x" ? sign : 0, axis === "z" ? sign : 0);
            const obstacle = register("nuts", 0, 0, 0.8, 0.8);
            controller.reconcile();
            controller.begin("chocolate");
            controller.move("chocolate", new Vector3());
            controller.end();
            const movedBox = getTransformedToppingBox(moving.object, parent);
            const obstacleBox = getTransformedToppingBox(obstacle.object, parent);
            const gap = sign < 0 ? obstacleBox.min[axis] - movedBox.max[axis] : movedBox.min[axis] - obstacleBox.max[axis];
            assert.ok(Math.abs(gap - TOPPING_PLACEMENT_GAP) < 1e-7);
            assert.equal(movedBox.intersectsBox(obstacleBox), false);
        }
    }
});

test("several pointer events before a frame cannot make smoothing cut through a topping", () => {
    const { controller, register, parent } = setup();
    const moving = register("chocolate", -0.8, -0.8);
    const obstacle = register("nuts", 0, 0, 0.6, 0.6);
    controller.reconcile();
    controller.begin("chocolate");
    controller.move("chocolate", new Vector3(-0.8, 1, 0.8));
    controller.move("chocolate", new Vector3(0.8, 1, 0.8));
    for (let frame = 0; frame < 90; frame++) {
        controller.update(1 / 60);
        assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(getTransformedToppingBox(obstacle.object, parent)), false);
    }
    controller.end();
    assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(getTransformedToppingBox(obstacle.object, parent)), false);
});

test("contact permits sliding along an edge and then around a topping without clipping", () => {
    const { controller, register, parent } = setup();
    const moving = register("chocolate", -0.8, -0.1);
    const obstacle = register("nuts", 0, 0, 0.6, 0.6);
    controller.reconcile();
    controller.begin("chocolate");
    for (const target of [new Vector3(0, 1, 0.1), new Vector3(0, 1, 0.8), new Vector3(0.8, 1, 0.8)]) {
        for (let frame = 0; frame < 60; frame++) {
            controller.move("chocolate", target);
            controller.update(1 / 60);
            assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(getTransformedToppingBox(obstacle.object, parent)), false);
        }
    }
    controller.end();
    const placed = controller.entries.get("chocolate").position;
    assert.ok(placed.x > 0.79 && placed.z > 0.79);
});

test("pointer drags snap to the cake geometry with a micro-offset and contain the footprint", () => {
    const { controller, register, start, drag, current, parent } = setup();
    const topping = register("chocolate", -0.8);
    controller.reconcile();
    start("chocolate");
    const initial = controller.entries.get("chocolate").position.clone();
    drag("chocolate", new Vector3(0.8, 1, 0.7));
    controller.update(1 / 30);
    assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 1.001) < 1e-8, "interpolated frames also stay on the cake");
    controller.end();
    const snapped = controller.entries.get("chocolate").position;
    assert.ok(Math.abs(snapped.x - 0.8) < 0.003);
    assert.ok(Math.abs(snapped.z - 0.7) < 0.003);
    assert.ok(Math.abs(snapped.y - initial.y) < 1e-8);
    controller.begin("chocolate");
    const target = new Vector3(8, -3, 5);
    controller.move("chocolate", target);
    controller.end();
    controller.reconcile();
    const placed = controller.entries.get("chocolate").position;
    const bounds = getTransformedToppingBox(topping.object, parent);
    assert.ok(bounds.max.x < 2 && bounds.max.z < 2);
    assert.ok(Math.abs(bounds.min.y - 1.001) < 1e-8);
    assert.deepEqual(current.state.toppingLayout.chocolate.position, placed.toArray());
});

test("smoothing depends on elapsed time instead of frame or pointer event counts", () => {
    const results = [];
    for (const frames of [30, 60, 144]) {
        const { controller, register } = setup();
        register("chocolate", 0);
        controller.reconcile();
        controller.begin("chocolate");
        const target = new Vector3(1, 7, -1);
        for (let event = 0; event < frames; event++) controller.move("chocolate", target);
        for (let frame = 0; frame < frames; frame++) controller.update(0.25 / frames);
        results.push(controller.entries.get("chocolate").position.clone());
        controller.end();
        const placed = controller.entries.get("chocolate").position;
        assert.equal(placed.x, target.x, "release flushes the exact surface target");
        assert.equal(placed.z, target.z);
        assert.ok(Math.abs(placed.y - 1.001) < 1e-7);
    }
    assert.ok(results[0].distanceTo(results[1]) < 1e-10);
    assert.ok(results[0].distanceTo(results[2]) < 1e-10);
});

test("a rejected topping is removed from placement state instead of staying selected but invisible", async () => {
    const { controller, register, rejectedAdditions } = setup();
    const oversized = register("chocolate", 0, 0, 10);
    controller.reconcile();
    assert.equal(oversized.object.visible, false);
    assert.equal(controller.hasUnplacedToppings, true);
    assert.equal(controller.begin("chocolate"), false);
    await Promise.resolve();
    assert.deepEqual(rejectedAdditions, [["chocolate"]]);
    assert.equal(controller.entries.has("chocolate"), false);
    assert.equal(controller.hasUnplacedToppings, false);
});

test("nuts immediately appear when space is available", async () => {
    const { controller, register, rejectedAdditions } = setup();
    const nuts = register("nuts", 0, 0, 2.2, 2.2);
    await Promise.resolve();
    assert.equal(nuts.object.visible, true);
    assert.ok(controller.entries.get("nuts").position);
    assert.deepEqual(rejectedAdditions, []);
});

test("a full cake rejects nuts once without moving existing decorations and accepts them after space is freed", async () => {
    const { controller, register, rejectedAdditions } = setup();
    const decoration = register("balls", 0, 0, 3.8, 3.8);
    controller.reconcile();
    const before = controller.entries.get("balls").position.clone();
    const nuts = register("nuts", 0, 0, 2.2, 2.2);
    controller.reconcile();
    controller.reconcile();
    await Promise.resolve();
    assert.deepEqual(rejectedAdditions, [["nuts"]]);
    assert.equal(nuts.object.visible, false);
    assert.equal(controller.entries.has("nuts"), false);
    assert.ok(controller.entries.get("balls").position.equals(before));
    assert.equal(decoration.object.visible, true);

    controller.unregister("balls");
    const retry = register("nuts", 0, 0, 2.2, 2.2);
    await Promise.resolve();
    assert.equal(retry.object.visible, true);
    assert.equal(rejectedAdditions.length, 1);
});

test("multiple rejected cherries are reported in one batch and canceled registrations do not notify", async () => {
    const { controller, register, rejectedAdditions } = setup();
    register("balls", 0, 0, 3.8, 3.8);
    controller.reconcile();
    register("cherry-1", 0);
    register("cherry-2", 0);
    register("nuts", 0, 0, 2.2, 2.2);
    controller.reconcile();
    controller.unregister("nuts");
    await Promise.resolve();
    assert.deepEqual(rejectedAdditions, [["cherry-1", "cherry-2"]]);
});

test("saved previews never reject selected toppings or emit an addition notification", async () => {
    const { controller, register, rejectedAdditions } = setup();
    controller.interactive = false;
    register("nuts", 0, 0, 10, 10);
    controller.reconcile();
    await Promise.resolve();
    assert.deepEqual(rejectedAdditions, []);
    assert.equal(controller.entries.has("nuts"), true);
});

test("cancel restores the starting placement after a blocked drag", () => {
    const { controller, register, start } = setup();
    register("chocolate", -0.8);
    register("candle", 0);
    controller.reconcile();
    const before = controller.entries.get("chocolate").position.clone();
    start("chocolate");
    controller.move("chocolate", new Vector3(0.8, 1, 0));
    controller.update(0.2);
    controller.cancel();
    assert.ok(controller.entries.get("chocolate").position.equals(before));
});

test("read-only preview restores full XYZ positions without intercepting orbit gestures", () => {
    const { controller, register, current } = setup();
    register("chocolate", 0);
    const entry = controller.entries.get("chocolate");
    const layout = { ...entry.layout, position: [3, 4, -2] };
    current.state = { ...current.state, toppingLayout: { chocolate: layout } };
    controller.register("chocolate", { ...entry, layout });
    controller.interactive = false;
    controller.reconcile();
    assert.deepEqual(controller.entries.get("chocolate").position.toArray(), [3, 4, -2]);
    assert.equal(controller.begin("chocolate"), false);
});

test("drag indicator state tracks package pointer events and clears on drop or cancel", () => {
    const { controller, register, start, drag, dragEvents } = setup();
    register("chocolate", -0.8);
    controller.reconcile();
    start("chocolate");
    assert.equal(dragEvents.at(-1).isDragging, true);
    drag("chocolate", new Vector3(0.8, 1, 0));
    assert.ok(Number.isFinite(dragEvents.at(-1).x));
    assert.ok(Number.isFinite(dragEvents.at(-1).y));
    controller.end();
    assert.equal(dragEvents.at(-1).isDragging, false);
    start("chocolate");
    controller.cancel();
    assert.equal(dragEvents.at(-1).isDragging, false);
});
