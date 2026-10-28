import test from "node:test";
import assert from "node:assert/strict";
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createToppingDragController } from "../src/utils/toppingDragController.js";
import { getTransformedToppingBox, TOPPING_PLACEMENT_GAP } from "../src/utils/toppingDragPlacement.js";

function setup({ tierCount = 1, round = false, combined = false, candleMode = "gold" } = {}) {
    const parent = new Group();
    parent.position.set(2, -0.8, -1);
    parent.rotation.y = 0.8;
    const scene = new Group();
    const geometries = Array.from({ length: tierCount }, (_, index) => {
        const radius = 2 - index * 0.5;
        const geometry = round ? new CylinderGeometry(radius, radius, 1, 64) : new BoxGeometry(radius * 2, 1, radius * 2);
        return geometry.translate(0, index + 0.5, 0);
    });
    for (const geometry of combined ? [mergeGeometries(geometries)] : geometries) {
        const cake = new Mesh(geometry);
        cake.name = round ? "cake_round" : "cake_rectangle";
        scene.add(cake);
    }
    parent.add(scene);
    let frames = 0;
    const dragEvents = [];
    const rejectedAdditions = [];
    const ledgeRestrictions = [];
    const store = { publish() {}, clear() {}, controller: null, setDragging: (isDragging, point) => dragEvents.push({ isDragging, ...point }) };
    const current = {
        scene, cakeGroupRef: { current: parent }, controlsRef: { current: { enabled: true } },
        state: {
            form: round ? 1 : 2, selectedTierIndex: tierCount - 1, candleMode, toppingLayout: {}, cherryLayouts: [], chocolateLayouts: [],
            setToppingPosition(id, x, y, position) {
                const key = id.startsWith("chocolate-") ? "chocolateLayouts" : id.startsWith("cherry-") ? "cherryLayouts" : null;
                if (key) {
                    const index = Number(id.split("-")[1]);
                    current.state[key][index] = { ...current.state[key][index], x, y, position: [...position] };
                    return;
                }
                current.state = { ...current.state, toppingLayout: { ...current.state.toppingLayout, [id]: { ...current.state.toppingLayout[id], x, y, position: [...position] } } };
            },
        },
    };
    const controller = createToppingDragController({ getCurrent: () => current, store, invalidate: () => frames++, onPlacementRejected: (ids) => rejectedAdditions.push(ids), onLowerLedgeRestricted: (id) => ledgeRestrictions.push(id), eventTarget: new EventTarget(), scheduleFrame: queueMicrotask });
    store.controller = controller;
    controller.reconcile();
    const register = (id, x, z = 0, width = 0.4, depth = 0.4) => {
        const anchor = new Vector3(x, tierCount, z);
        const object = new Group();
        object.matrixAutoUpdate = false;
        const mesh = new Mesh(new BoxGeometry(width, 0.4, depth));
        mesh.position.copy(anchor).add(new Vector3(0, 0.2, 0));
        object.add(mesh);
        parent.add(object);
        const box = getTransformedToppingBox(object, parent).translate(anchor.clone().negate());
        const layout = { x: (x + 2) * 25, y: (z + 2) * 25, size: "medium" };
        current.state = { ...current.state, toppingLayout: { ...current.state.toppingLayout, [id]: layout } };
        if (id.startsWith("chocolate-")) current.state.chocolateLayouts[Number(id.slice(10))] = layout;
        if (id.startsWith("cherry-")) current.state.cherryLayouts[Number(id.slice(7))] = layout;
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
    const pointerMove = (target) => {
        const data = dataAt(target);
        controller.pointerMove({ clientX: data.x, clientY: data.y }, camera, canvas);
    };
    return { controller, current, store, parent, register, start, drag, pointerMove, dragEvents, rejectedAdditions, ledgeRestrictions, frames: () => frames };
}

test("number candles and cherries reach every exposed lower ledge and preserve their saved height", () => {
    for (const round of [false, true]) for (const combined of [false, true]) for (const tierCount of [2, 3, 4]) {
        for (const id of ["candle", "cherry-0"]) {
            const { controller, current, register, parent } = setup({ tierCount, round, combined, candleMode: "number" });
            const topping = register(id, 0, 0, 0.14, 0.10);
            controller.reconcile();
            for (let tier = tierCount - 2; tier >= 0; tier--) for (const axis of ["x", "z"]) for (const sign of [-1, 1]) {
                const target = new Vector3(0, tier + 1, 0);
                target[axis] = sign * (2 - tier * 0.5 - 0.25);
                controller.begin(id);
                controller.move(id, target);
                for (let frame = 0; frame < 20; frame++) controller.update(1 / 60);
                controller.end();
                const position = controller.entries.get(id).position;
                const bounds = getTransformedToppingBox(topping.object, parent);
                assert.ok(Math.abs(position[axis] - target[axis]) < 0.003, `${id}, ${tierCount} tiers, round=${round}, combined=${combined}: ${position.toArray()} versus ${target.toArray()}`);
                assert.ok(Math.abs(bounds.min.y - (tier + 1.001)) < 1e-6, `topping must sit on ledge ${tier + 1}: ${bounds.min.y}`);
                controller.reconcile();
                assert.ok(controller.entries.get(id).position.distanceTo(position) < 1e-7, "reconciliation must preserve the lower ledge");
                const saved = id === "candle" ? current.state.toppingLayout.candle : current.state.cherryLayouts[0];
                assert.deepEqual(saved.position, position.toArray());
            }
        }
    }
});

test("pointer movement immediately clamps restricted toppings to the top and warns once per drag", () => {
    for (const round of [false, true]) for (const id of ["chocolate-0", "balls", "candle"]) {
        const { controller, register, start, pointerMove, drag, parent, ledgeRestrictions } = setup({ tierCount: 3, round });
        const topping = register(id, 0, 0, 0.2, 0.16);
        const entry = controller.entries.get(id);
        const collisionBox = entry.box.clone();
        for (const axis of ["x", "z"]) { collisionBox.min[axis] += 0.03; collisionBox.max[axis] -= 0.03; }
        controller.register(id, { ...entry, box: collisionBox, messageBox: entry.box });
        controller.reconcile();
        const distance = round ? 1.3 / Math.SQRT2 : 1.3;
        const lower = new Vector3(-distance, 2, distance);
        pointerMove(lower);
        assert.deepEqual(ledgeRestrictions, [], "hovering must not trigger a drag warning");
        start(id);
        pointerMove(lower);
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6, "clamp during pointermove, before a smoothing frame or release");
        for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
            assert.ok(Math.abs(x) <= 1 - TOPPING_PLACEMENT_GAP + 1e-7);
            assert.ok(Math.abs(z) <= 1 - TOPPING_PLACEMENT_GAP + 1e-7);
            if (round) assert.ok(Math.hypot(x, z) <= 1 - TOPPING_PLACEMENT_GAP + 1e-7);
        }
        assert.deepEqual(ledgeRestrictions, [id]);
        for (let event = 0; event < 12; event++) pointerMove(lower);
        drag(id, lower);
        assert.deepEqual(ledgeRestrictions, [id], "native and package drag events must share the warning guard");
        controller.end();
        controller.reconcile();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 3.001) < 1e-6);
    }
});

test("cherry and number-candle pointer movement follows every hit ledge without restriction warnings", () => {
    for (const round of [false, true]) for (const id of ["cherry-0", "candle"]) {
        const { controller, register, start, pointerMove, parent, ledgeRestrictions } = setup({ tierCount: 3, round, candleMode: "number" });
        const topping = register(id, 0, 0, 0.14, 0.10);
        controller.reconcile();
        start(id);
        for (const [radius, height] of [[1.3, 2], [1.8, 1]]) {
            const distance = round ? radius / Math.SQRT2 : radius;
            pointerMove(new Vector3(-distance, height, distance));
            for (let frame = 0; frame < (id === "candle" ? 20 : 1); frame++) controller.update(1 / 30);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - height - 0.001) < 1e-6, `${id} should sit flush on the hit ledge`);
        }
        assert.deepEqual(ledgeRestrictions, []);
        controller.end();
    }
});

test("top-tier drags and cakes without lower tiers do not show ledge restriction warnings", () => {
    for (const tierCount of [1, 3]) {
        const { controller, register, start, pointerMove, ledgeRestrictions } = setup({ tierCount });
        register("chocolate-0", 0, 0, 0.2, 0.2);
        controller.reconcile();
        start("chocolate-0");
        pointerMove(new Vector3(0.4, tierCount, 0.4));
        pointerMove(new Vector3(8, tierCount, 8));
        assert.deepEqual(ledgeRestrictions, []);
        controller.end();
    }
});

test("changing a number candle to a single candle returns its saved lower placement to the top", () => {
    const { controller, current, register, start, pointerMove, parent, ledgeRestrictions } = setup({ tierCount: 3, candleMode: "number" });
    const topping = register("candle", 0, 0, 0.14, 0.10);
    controller.reconcile();
    start("candle");
    pointerMove(new Vector3(-1.3, 2, 1.3));
    controller.update(1 / 30);
    controller.end();
    assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 2.001) < 1e-6);
    current.state.candleMode = "gold";
    controller.reconcile();
    assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 3.001) < 1e-6);
    assert.deepEqual(ledgeRestrictions, []);
});

test("editing a saved chocolate on a lower ledge restores it to the top tier", () => {
    const { controller, register, parent, ledgeRestrictions } = setup({ tierCount: 3 });
    const topping = register("chocolate-0", 0, 0, 0.2, 0.2);
    const entry = controller.entries.get("chocolate-0");
    controller.register("chocolate-0", { ...entry, layout: { ...entry.layout, position: [1.7, 1.001, 0] } });
    controller.reconcile();
    const bounds = getTransformedToppingBox(topping.object, parent);
    assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
    assert.ok(bounds.max.x <= 1 - TOPPING_PLACEMENT_GAP + 1e-7);
    assert.deepEqual(ledgeRestrictions, []);
});

test("ledge clamps use the full physical topping extents on X/Z edges and round diagonals", () => {
    for (const round of [false, true]) for (const id of ["candle", "cherry-0"]) {
        for (const [x, z] of [[8, 0], [-8, 0], [0, 8], [0, -8], [8, 8], [-8, -8]]) {
            const { controller, register, parent } = setup({ tierCount: 3, round, combined: true, candleMode: "number" });
            const topping = register(id, 0, 0, 0.28, 0.18);
            const entry = controller.entries.get(id);
            const collisionBox = entry.box.clone();
            for (const axis of ["x", "z"]) { collisionBox.min[axis] += 0.04; collisionBox.max[axis] -= 0.04; }
            controller.register(id, { ...entry, box: collisionBox, messageBox: entry.box });
            controller.reconcile();
            controller.begin(id);
            controller.move(id, new Vector3(x, 1, z));
            controller.end();
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - 1.001) < 1e-6, "an outside drag should clamp to the lowest ledge");
            for (const cornerX of [bounds.min.x, bounds.max.x]) for (const cornerZ of [bounds.min.z, bounds.max.z]) {
                assert.ok(Math.abs(cornerX) <= 2 - TOPPING_PLACEMENT_GAP + 1e-7);
                assert.ok(Math.abs(cornerZ) <= 2 - TOPPING_PLACEMENT_GAP + 1e-7);
                if (round) assert.ok(Math.hypot(cornerX, cornerZ) <= 2 - TOPPING_PLACEMENT_GAP + 1e-7);
            }
        }
    }
});

test("pointer projection moves a topping from the top onto a visible lower ledge", () => {
    for (const round of [false, true]) {
        const { controller, register, start, drag, parent } = setup({ tierCount: 3, round, candleMode: "number" });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        const distance = round ? 1.75 / Math.SQRT2 : 1.75;
        const target = new Vector3(-distance, 1, distance);
        start("candle");
        drag("candle", target);
        controller.update(1 / 30);
        controller.end();
        const position = controller.entries.get("candle").position;
        assert.ok(Math.abs(position.x - target.x) < 0.003);
        assert.ok(Math.abs(position.z - target.z) < 0.003);
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 1.001) < 1e-6);
    }
});

test("cherry pointer drags clamp to the intersected middle tier instead of remaining on the top tier", () => {
    for (const round of [false, true]) for (const combined of [false, true]) {
        const { controller, register, start, drag, parent, current } = setup({ tierCount: 3, round, combined });
        const topping = register("cherry-0", 0, 0, 0.2, 0.16);
        const entry = controller.entries.get("cherry-0");
        const collisionBox = entry.box.clone();
        for (const axis of ["x", "z"]) { collisionBox.min[axis] += 0.02; collisionBox.max[axis] -= 0.02; }
        controller.register("cherry-0", { ...entry, box: collisionBox, messageBox: entry.box });
        controller.reconcile();
        const distance = round ? 1.48 / Math.SQRT2 : 1.48;
        start("cherry-0");
        drag("cherry-0", new Vector3(-distance, 2, distance));
        controller.update(1 / 30);
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6, `cherry must drop during the drag: ${bounds.min.y}`);
        const center = bounds.getCenter(new Vector3());
        assert.ok((round ? Math.hypot(center.x, center.z) : Math.max(Math.abs(center.x), Math.abs(center.z))) > 1, "the rendered cherry must reach the exposed ledge before dropping");
        for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
            assert.ok(Math.abs(x) <= 1.5 - TOPPING_PLACEMENT_GAP + 1e-7);
            assert.ok(Math.abs(z) <= 1.5 - TOPPING_PLACEMENT_GAP + 1e-7);
            if (round) assert.ok(Math.hypot(x, z) <= 1.5 - TOPPING_PLACEMENT_GAP + 1e-7);
        }
        controller.end();
        controller.reconcile();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 2.001) < 1e-6);
        assert.deepEqual(current.state.cherryLayouts[0].position, controller.entries.get("cherry-0").position.toArray());
    }
});

test("a cherry dragged beyond the cake stays clamped to the last intersected tier", () => {
    for (const round of [false, true]) {
        const { controller, register, start, drag, parent } = setup({ tierCount: 3, round, combined: true });
        const topping = register("cherry-0", 0, 0, 0.2, 0.16);
        controller.reconcile();
        const distance = round ? 1.3 / Math.SQRT2 : 1.3;
        start("cherry-0");
        drag("cherry-0", new Vector3(-distance, 2, distance));
        controller.update(1 / 30);
        drag("cherry-0", new Vector3(-8, 2, 8));
        controller.update(1 / 30);
        controller.end();
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6);
        for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
            assert.ok(Math.abs(x) <= 1.5 - TOPPING_PLACEMENT_GAP + 1e-7);
            assert.ok(Math.abs(z) <= 1.5 - TOPPING_PLACEMENT_GAP + 1e-7);
            if (round) assert.ok(Math.hypot(x, z) <= 1.5 - TOPPING_PLACEMENT_GAP + 1e-7);
        }
    }
});

test("a cherry on a narrow ledge follows the hit tier height and can move back to the top", () => {
    const { controller, register, start, drag, parent } = setup({ tierCount: 3 });
    const topping = register("cherry-0", 0, 0, 0.4, 0.2);
    controller.reconcile();
    start("cherry-0");
    drag("cherry-0", new Vector3(-1.25, 2, 0));
    controller.update(1 / 30);
    controller.end();
    controller.reconcile();
    const lower = getTransformedToppingBox(topping.object, parent);
    assert.ok(Math.abs(lower.min.y - 2.001) < 1e-6, "the upper tier must not pull the cherry back up");
    assert.ok(lower.min.x >= -1.5 + TOPPING_PLACEMENT_GAP - 1e-7);
    assert.ok(lower.max.x <= -1 - TOPPING_PLACEMENT_GAP + 1e-7);
    start("cherry-0");
    drag("cherry-0", new Vector3(0, 3, 0));
    controller.update(1 / 30);
    controller.end();
    assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 3.001) < 1e-6);
});

test("cherry ledge drags stop the full footprint against the upper tier wall", () => {
    for (const round of [false, true]) for (const axis of ["x", "z"]) for (const sign of [-1, 1]) {
        const { controller, register, start, parent } = setup({ tierCount: 3, round, combined: true });
        const topping = register("cherry-0", 0, 0, 0.2, 0.2);
        const entry = controller.entries.get("cherry-0");
        const collisionBox = entry.box.clone();
        for (const direction of ["x", "z"]) { collisionBox.min[direction] += 0.03; collisionBox.max[direction] -= 0.03; }
        controller.register("cherry-0", { ...entry, box: collisionBox, messageBox: entry.box });
        controller.reconcile();
        start("cherry-0");
        const ledge = new Vector3(0, 2, 0);
        ledge[axis] = sign * 1.3;
        controller.move("cherry-0", ledge);
        controller.update(1 / 30);
        const inward = ledge.clone();
        inward[axis] = sign * 1.04;
        controller.move("cherry-0", inward);
        for (let frame = 0; frame < 30; frame++) {
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            const nearWall = sign > 0 ? bounds.min[axis] : -bounds.max[axis];
            assert.ok(nearWall >= 1 + TOPPING_PLACEMENT_GAP - 1e-7, `cherry clips the upper wall: ${nearWall}`);
            assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6);
        }
        controller.end();
        controller.reconcile();
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok((sign > 0 ? bounds.min[axis] : -bounds.max[axis]) >= 1 + TOPPING_PLACEMENT_GAP - 1e-7);
    }
});

test("a fast cherry drag cannot cross the upper tier through a clear ledge on the other side", () => {
    for (const round of [false, true]) {
        const { controller, register, start, parent } = setup({ tierCount: 3, round });
        const topping = register("cherry-0", 0, 0, 0.2, 0.2);
        controller.reconcile();
        start("cherry-0");
        controller.move("cherry-0", new Vector3(1.3, 2, 0));
        controller.update(1 / 30);
        controller.move("cherry-0", new Vector3(-1.3, 2, 0));
        controller.update(1 / 30);
        controller.end();
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(bounds.min.x >= 1 + TOPPING_PLACEMENT_GAP - 1e-7, "the upper tier must block inward motion across its full width");
        assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6);
    }
});

test("a cherry can slide around an upper wall while staying on its lower ledge", () => {
    const { controller, register, start, parent } = setup({ tierCount: 3, round: true });
    const topping = register("cherry-0", 0, 0, 0.2, 0.2);
    controller.reconcile();
    start("cherry-0");
    controller.move("cherry-0", new Vector3(1.3, 2, 0));
    controller.update(1 / 30);
    for (const target of [new Vector3(1.04, 2, 0), new Vector3(1.04, 2, 0.5)]) {
        controller.move("cherry-0", target);
        for (let frame = 0; frame < 40; frame++) {
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            const nearX = Math.max(bounds.min.x, Math.min(bounds.max.x, 0));
            const nearZ = Math.max(bounds.min.z, Math.min(bounds.max.z, 0));
            assert.ok(Math.hypot(nearX, nearZ) >= Math.cos(Math.PI / 64) + TOPPING_PLACEMENT_GAP - 1e-4, "sliding must keep the full cherry clear of the rendered upper wall");
            assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6);
        }
    }
    assert.ok(controller.entries.get("cherry-0").position.z > 0.45);
    controller.end();
});

test("a cherry too wide for a ledge keeps its previous safe placement without shrinking", () => {
    const { controller, register, start, parent } = setup({ tierCount: 3 });
    const topping = register("cherry-0", 0, 0, 0.6, 0.6);
    controller.reconcile();
    const before = controller.entries.get("cherry-0").position.clone();
    const size = getTransformedToppingBox(topping.object, parent).getSize(new Vector3());
    start("cherry-0");
    controller.move("cherry-0", new Vector3(-1.25, 2, 0));
    controller.update(1 / 30);
    controller.end();
    assert.ok(controller.entries.get("cherry-0").position.equals(before));
    assert.ok(getTransformedToppingBox(topping.object, parent).getSize(new Vector3()).distanceTo(size) < 1e-8);
});

test("tier-wall contact never leaves a topping hanging from an upper edge", () => {
    for (const round of [false, true]) {
        const { controller, register, parent } = setup({ tierCount: 3, round });
        const topping = register("candle", 0, 0, 0.2, 0.2);
        controller.reconcile();
        controller.begin("candle");
        controller.move("candle", new Vector3(0.98, 3, 0));
        for (let frame = 0; frame < 30; frame++) {
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(bounds.max.x <= 1 - TOPPING_PLACEMENT_GAP + 1e-7);
            assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
        }
        controller.end();
    }
});

test("a cherry with an offset pivot seats its physical footprint on the lower ledge", () => {
    for (const axis of ["x", "z"]) {
        const { controller, register, parent } = setup({ tierCount: 3 });
        const topping = register("cherry-0", 0, 0, 0.14, 0.14);
        topping.mesh.geometry.translate(axis === "x" ? 0.3 : 0, 0, axis === "z" ? 0.3 : 0);
        topping.object.visible = true;
        const box = getTransformedToppingBox(topping.object, parent).translate(topping.anchor.clone().negate());
        controller.register("cherry-0", { ...controller.entries.get("cherry-0"), box, messageBox: box });
        controller.reconcile();
        const target = new Vector3(0, 1, 0);
        target[axis] = 1.45;
        controller.begin("cherry-0");
        controller.move("cherry-0", target);
        controller.end();
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - 1.001) < 1e-6);
        assert.ok(bounds.min[axis] > 1.5 && bounds.max[axis] < 2);
    }
});

test("lower ledge marker movement stays scoped to number candles and cherries", () => {
    for (const [id, candleMode, ledge] of [["candle", "number", true], ["candle", "gold", false], ["cherry-0", "gold", true], ["chocolate-0", "gold", false], ["balls", "gold", false], ["nuts", "gold", false]]) {
        const { controller, register, parent } = setup({ tierCount: 3, candleMode });
        const topping = register(id, 0, 0, 0.14, 0.14);
        controller.reconcile();
        controller.moveMarker(id, 93.75, 50);
        controller.end();
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - (ledge ? 1.001 : 3.001)) < 1e-6);
    }
});

test("an outside drag on a tiered cake still stops at intervening topping collisions", () => {
    const { controller, register, parent } = setup({ tierCount: 2 });
    const moving = register("chocolate-0", -1.2, 0, 0.14, 0.14);
    const obstacle = register("nuts", 0, 0, 0.8, 0.8);
    controller.reconcile();
    controller.begin("chocolate-0");
    controller.move("chocolate-0", new Vector3(8, 1, 0));
    controller.end();
    const bounds = getTransformedToppingBox(moving.object, parent);
    const blocker = getTransformedToppingBox(obstacle.object, parent);
    assert.ok(bounds.max.x <= blocker.min.x - TOPPING_PLACEMENT_GAP + 1e-7);
});

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
