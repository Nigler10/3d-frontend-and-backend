import test from "node:test";
import assert from "node:assert/strict";
import { Box3, BoxGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from "three";
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

test("an outside pointer destination still clamps at remeasured nuts instead of tunneling", () => {
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

test("a clear pointer destination tunnels across barriers in either direction without overlapping rendered frames", () => {
    for (const axis of ["x", "z"]) {
        for (const sign of [-1, 1]) {
            const { controller, register, start, drag, parent, current } = setup();
            const moving = register("chocolate", axis === "x" ? sign * 1.2 : 0, axis === "z" ? sign * 1.2 : 0);
            const obstacle = register("nuts", 0, 0, axis === "x" ? 0.8 : 3.5, axis === "z" ? 0.8 : 3.5);
            controller.reconcile();
            const obstaclePosition = controller.entries.get("nuts").position.clone();
            const obstacleBox = getTransformedToppingBox(obstacle.object, parent);
            const target = controller.entries.get("chocolate").position.clone();
            target[axis] = -sign * 1.2;
            start("chocolate");
            drag("chocolate", target);
            for (let frame = 0; frame < 120; frame++) {
                controller.update(1 / 60);
                const bounds = getTransformedToppingBox(moving.object, parent);
                assert.equal(bounds.intersectsBox(obstacleBox), false);
                assert.ok(Math.abs(bounds.min.y - 1.001) < 1e-8);
            }
            controller.end();
            const placed = controller.entries.get("chocolate").position;
            assert.ok(placed.distanceTo(target) < 0.003, `a clear pointer destination across the barrier must be reachable: ${placed.toArray()} versus ${target.toArray()}`);
            assert.deepEqual(current.state.toppingLayout.chocolate.position, placed.toArray());
            assert.ok(controller.entries.get("nuts").position.equals(obstaclePosition));
        }
    }
});

test("tunneling skips an overlapping smoothing step and can commit before another rendered frame", () => {
    for (const renderFrame of [false, true]) {
        const { controller, register, parent } = setup();
        const moving = register("chocolate", -0.8);
        const obstacle = register("nuts", 0, 0, 0.8, 0.8);
        controller.reconcile();
        const target = controller.entries.get("chocolate").position.clone();
        target.x = 0.8;
        const obstacleBox = getTransformedToppingBox(obstacle.object, parent);
        const interpolated = controller.entries.get("chocolate").position.clone().lerp(target, -Math.expm1(-24 / 30));
        assert.equal(moving.box.clone().translate(interpolated).intersectsBox(obstacleBox), true);
        controller.begin("chocolate");
        controller.move("chocolate", target);
        if (renderFrame) {
            controller.update(1 / 30);
            assert.ok(controller.entries.get("chocolate").position.distanceTo(target) < 1e-8);
            assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(obstacleBox), false);
        }
        controller.end();
        assert.ok(controller.entries.get("chocolate").position.distanceTo(target) < 1e-8);
        assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(obstacleBox), false);
    }
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

test("several pointer events before a frame keep rendered relocations clear of other toppings", () => {
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

test("one diagonal pointer event reaches a clear destination without overlapping rendered frames", () => {
    const { controller, register, parent } = setup();
    const moving = register("chocolate", -0.8, -0.1);
    const obstacle = register("nuts", 0, 0, 0.6, 0.6);
    controller.reconcile();
    controller.begin("chocolate");
    const target = new Vector3(0.8, 1, 0.8);
    controller.move("chocolate", target);
    const obstacleBox = getTransformedToppingBox(obstacle.object, parent);
    for (let frame = 0; frame < 120; frame++) {
        controller.update(1 / 60);
        assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(obstacleBox), false);
    }
    const placed = controller.entries.get("chocolate").position;
    assert.ok(Math.abs(placed.x - target.x) < 1e-5, "a clear destination must be reached without another pointer event");
    assert.ok(Math.abs(placed.z - target.z) < 1e-5);
    controller.end();
    assert.ok(controller.entries.get("chocolate").position.distanceTo(placed) < 1e-5);
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

test("cancel restores the starting placement after tunneling across another topping", () => {
    const { controller, register, start } = setup();
    register("chocolate", -0.8);
    register("candle", 0);
    controller.reconcile();
    const before = controller.entries.get("chocolate").position.clone();
    start("chocolate");
    controller.move("chocolate", new Vector3(0.8, 1, 0));
    controller.update(0.2);
    assert.ok(controller.entries.get("chocolate").position.x > 0);
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

test("toppings tunnel through text on every X/Z edge and separate only on drop", () => {
    for (const axis of ["x", "z"]) for (const sign of [-1, 1]) for (const cross of [false, true]) {
        const { controller, register, parent, current } = setup();
        const moving = register("balls", axis === "x" ? sign * 1.2 : 0, axis === "z" ? sign * 1.2 : 0);
        const entry = controller.entries.get("balls");
        const inset = entry.box.clone();
        for (const direction of ["x", "z"]) { inset.min[direction] += 0.02; inset.max[direction] -= 0.02; }
        controller.register("balls", { ...entry, box: inset, messageBox: entry.box });
        controller.reconcile();
        // Deliberately separate the heights: collision must use X/Z footprints.
        const message = new Box3(new Vector3(-0.3, -4, -0.3), new Vector3(0.3, -3.9, 0.3));
        controller.setMessageFootprint(message, new Vector3());
        const before = controller.entries.get("balls").position.clone();
        const target = before.clone();
        target[axis] = cross ? -sign * 1.2 : sign * 0.48;
        controller.begin("balls");
        controller.move("balls", target);
        let passedThroughText = false;
        for (let frame = 0; frame < 90; frame++) {
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(moving.object, parent);
            bounds.min.y = -Infinity; bounds.max.y = Infinity;
            if (bounds.intersectsBox(message)) passedThroughText = true;
            assert.equal(controller.entries.get("balls").position.y, before.y);
        }
        assert.equal(passedThroughText, true, `text cannot block the moving pearl on ${axis}`);
        const during = controller.entries.get("balls").position.clone();
        assert.ok(during.distanceTo(target) < 1e-6, "the topping reaches its pointer target within the existing smoothing tolerance before release");
        controller.end();
        const released = controller.entries.get("balls").position.clone();
        const bounds = getTransformedToppingBox(moving.object, parent);
        if (cross) assert.ok(released.distanceTo(target) < 1e-8, "a clear drop beyond the text stays put");
        else {
            const gap = sign < 0 ? message.min[axis] - bounds.max[axis] : bounds.min[axis] - message.max[axis];
            assert.ok(Math.abs(gap - TOPPING_PLACEMENT_GAP) < 1e-7, "an overlapping drop separates at the nearest visible edge");
            assert.equal(released[axis === "x" ? "z" : "x"], target[axis === "x" ? "z" : "x"], "separation follows the shortest collision vector");
        }
        assert.equal(controller.valid(controller.entries.get("balls"), released), true);
        assert.deepEqual(current.state.toppingLayout.balls.position, released.toArray(), "only the resolved position is saved");
        controller.end();
        assert.ok(controller.entries.get("balls").position.equals(released), "duplicate drop events do not adjust twice");
        controller.reconcile();
        assert.ok(controller.entries.get("balls").position.distanceTo(released) < 1e-8, "reconciliation retains the resolved drop");
    }
});

test("a fast topping drop resolves from the pointer target before a smoothing frame", () => {
    const { controller, register, current } = setup();
    register("balls", -1.2);
    controller.reconcile();
    controller.setMessageFootprint(new Box3(new Vector3(-0.3, 0, -0.3), new Vector3(0.3, 0.02, 0.3)), new Vector3(0, 1, 0));
    const before = controller.entries.get("balls").position.clone();
    const target = before.clone().setX(0.48);
    controller.begin("balls");
    controller.move("balls", target);
    assert.ok(controller.entries.get("balls").position.equals(before), "no frame has rendered the pointer move yet");
    controller.end();
    const released = controller.entries.get("balls").position;
    assert.ok(Math.abs(released.x - 0.502) < 1e-7, "drop chooses the nearby right edge rather than the starting side");
    assert.equal(released.z, target.z);
    assert.equal(released.y, before.y);
    assert.deepEqual(current.state.toppingLayout.balls.position, released.toArray());
});

test("topping drop adjustment clears text without moving other toppings, and canceled tunneling restores its start", () => {
    const { controller, register, parent } = setup();
    const moving = register("balls", -1.2);
    const other = register("candle", 0.75, 0, 0.2, 0.2);
    controller.reconcile();
    controller.setMessageFootprint(new Box3(new Vector3(-0.3, 0, -0.3), new Vector3(0.3, 0.02, 0.3)), new Vector3(0, 1, 0));
    const otherPosition = controller.entries.get("candle").position.clone();
    const before = controller.entries.get("balls").position.clone();
    controller.begin("balls");
    controller.move("balls", before.clone().setX(0.48));
    controller.update(0.2);
    controller.end();
    const placed = controller.entries.get("balls");
    assert.equal(controller.valid(placed, placed.position), true, "all obstacles participate in drop adjustment");
    assert.ok(controller.entries.get("candle").position.equals(otherPosition));
    assert.equal(getTransformedToppingBox(moving.object, parent).intersectsBox(getTransformedToppingBox(other.object, parent)), false);
    const safe = placed.position.clone();
    controller.begin("balls");
    controller.move("balls", new Vector3(0, safe.y, 0));
    controller.update(0.2);
    controller.cancel();
    assert.ok(controller.entries.get("balls").position.equals(safe), "cancel returns to the last placed position");
});

test("overlapping message drops move to the nearest topping edge without changing height", () => {
    const { controller, register } = setup();
    register("balls", 0, 0, 0.2, 0.2);
    controller.reconcile();
    const message = new Box3(new Vector3(-0.25, -0.01, -0.08), new Vector3(0.25, 0.01, 0.08));
    const pearl = controller.messageObstacles()[0];
    const surface = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, topY: 1, round: false };
    for (const axis of ["x", "z"]) for (const sign of [-1, 1]) {
        const dropped = new Vector3(0, 1.02, 0);
        dropped[axis] = sign < 0 ? pearl.min[axis] - message.max[axis] + 0.02 : pearl.max[axis] - message.min[axis] - 0.02;
        const position = controller.placeMessage(message, dropped, surface);
        const bounds = message.clone().translate(position);
        const gap = sign < 0 ? pearl.min[axis] - bounds.max[axis] : bounds.min[axis] - pearl.max[axis];
        assert.ok(Math.abs(gap - TOPPING_PLACEMENT_GAP) < 1e-7);
        assert.equal(position.y, dropped.y);
        assert.equal(position[axis === "x" ? "z" : "x"], 0, "separation follows the shortest collision vector");
        assert.ok(controller.placeMessage(message, position, surface).equals(position), "a clear drop does not move");
    }
    const position = controller.placeMessage(message, new Vector3(0, 1.02, 0), surface);
    assert.equal(position.y, 1.02);
    assert.ok(Math.abs(position.x) < 1e-8, "a centered overlap escapes along the smaller Z penetration");
    const placed = message.clone().translate(position);
    placed.min.y = -Infinity; placed.max.y = Infinity;
    assert.equal(placed.intersectsBox(pearl), false, "new text starts beside an existing pearl");
});

test("drop adjustment avoids other toppings and respects the message boundary or its safe fallback", () => {
    const { controller, register } = setup();
    register("balls", 0, 0, 0.2, 0.2);
    register("cherry-0", 0, 0.4, 0.2, 0.2);
    controller.reconcile();
    const message = new Box3(new Vector3(-0.2, -0.01, -0.1), new Vector3(0.2, 0.01, 0.1));
    const surface = { minX: -2, maxX: 2, minZ: -2, maxZ: 2, topY: 1, round: false };
    const dropped = new Vector3(0, 1.02, 0.02);
    const adjusted = controller.placeMessage(message, dropped, surface, { isPositionAllowed: (candidate) => candidate.z >= -0.05 });
    assert.equal(adjusted.y, dropped.y);
    assert.ok(adjusted.z >= -0.05, "a nearer edge outside the cake's allowed area is rejected");
    const placed = message.clone().translate(adjusted);
    placed.min.y = -Infinity; placed.max.y = Infinity;
    assert.ok(controller.messageObstacles().every((obstacle) => !placed.intersectsBox(obstacle)));
    const fallback = new Vector3(-1, 1.02, 0);
    const unavailable = controller.placeMessage(message, dropped, surface, { isPositionAllowed: () => false, fallback });
    assert.ok(unavailable.equals(fallback), "an impossible drop returns to its original safe position");
});

test("moving or clearing text updates topping obstacles and additions avoid the live message", () => {
    const { controller, register } = setup();
    const message = new Box3(new Vector3(-0.4, 0, -0.3), new Vector3(0.4, 0.02, 0.3));
    controller.setMessageFootprint(message, new Vector3(0, 1, 0));
    register("balls", 0);
    controller.reconcile();
    const entry = controller.entries.get("balls");
    assert.equal(controller.valid(entry, entry.position), true, "new pearls are placed clear of the message");
    const center = new Vector3(0, entry.position.y, 0);
    assert.equal(controller.valid(entry, center), false);
    controller.setMessageFootprint(message, new Vector3(0.9, 1, 0));
    assert.equal(controller.valid(entry, center), true, "text's old footprint is released immediately");
    assert.equal(controller.valid(entry, new Vector3(0.9, entry.position.y, 0)), false);
    controller.setMessageFootprint(null);
    assert.equal(controller.valid(entry, new Vector3(0.9, entry.position.y, 0)), true);
});
