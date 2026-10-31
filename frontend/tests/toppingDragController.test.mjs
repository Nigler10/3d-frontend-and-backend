import test from "node:test";
import assert from "node:assert/strict";
import { Box3, BoxGeometry, CylinderGeometry, Group, Mesh, PerspectiveCamera, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { createToppingDragController } from "../src/utils/toppingDragController.js";
import { getTransformedToppingBox, TOPPING_PLACEMENT_GAP, TOPPING_SURFACE_OFFSET } from "../src/utils/toppingDragPlacement.js";

function setup({ tierCount = 1, round = false, combined = false, candleMode = "gold", tierRadii, tierHeights } = {}) {
    const parent = new Group();
    parent.position.set(2, -0.8, -1);
    parent.rotation.y = 0.8;
    const scene = new Group();
    const geometries = Array.from({ length: tierCount }, (_, index) => {
        const radius = tierRadii?.[index] ?? 2 - index * 0.5;
        const bottom = index ? tierHeights?.[index - 1] ?? index : 0;
        const top = tierHeights?.[index] ?? index + 1;
        const geometry = round ? new CylinderGeometry(radius, radius, top - bottom, 64) : new BoxGeometry(radius * 2, top - bottom, radius * 2);
        return geometry.translate(0, (bottom + top) / 2, 0);
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
    const cherryFitWarnings = [];
    const numberResizeRejections = [];
    const numberSizeRejections = [];
    const store = { publish() {}, clear() {}, controller: null, setDragging: (isDragging, point) => dragEvents.push({ isDragging, ...point }) };
    const current = {
        scene, cakeGroupRef: { current: parent }, controlsRef: { current: { enabled: true } },
        state: {
            form: round ? 1 : 2, selectedTierIndex: tierCount - 1, candleMode, candle: true, toppingLayout: {}, cherryLayouts: [], chocolateLayouts: [],
            setCandle: (value) => { current.state = { ...current.state, candle: value }; },
            setToppingSize: (id, size) => {
                current.state = { ...current.state, toppingLayout: { ...current.state.toppingLayout,
                    [id]: { ...current.state.toppingLayout[id], size } } };
            },
            setToppingPosition(id, x, y, position, relativePlacement) {
                const key = id.startsWith("chocolate-") ? "chocolateLayouts" : id.startsWith("cherry-") ? "cherryLayouts" : null;
                if (key) {
                    const index = Number(id.split("-")[1]);
                    current.state[key][index] = { ...current.state[key][index], x, y, position: [...position] };
                    return;
                }
                const layout = { ...current.state.toppingLayout[id], x, y };
                if (position) layout.position = [...position];
                else if (position === null) delete layout.position;
                if (id === "candle") {
                    if (relativePlacement) layout.relativePlacement = { ...relativePlacement };
                    else delete layout.relativePlacement;
                }
                current.state = { ...current.state, toppingLayout: { ...current.state.toppingLayout, [id]: layout } };
            },
        },
    };
    const controller = createToppingDragController({ getCurrent: () => current, store, invalidate: () => frames++, onPlacementRejected: (ids) => rejectedAdditions.push(ids), onLowerLedgeRestricted: (id) => ledgeRestrictions.push(id), onCherryFitRejected: (id) => cherryFitWarnings.push(id),
        onNumberCandleResizeRejected: () => {
            numberResizeRejections.push("candle");
            current.state.setCandle(false);
            current.state.setToppingPosition("candle", 50, 50, null);
        },
        onNumberCandleSizeRejected: (layout) => {
            numberSizeRejections.push(layout);
            current.state.setToppingSize("candle", "small");
            current.state.setToppingPosition("candle", layout.x, layout.y, layout.position, layout.relativePlacement);
        }, eventTarget: new EventTarget(), scheduleFrame: queueMicrotask });
    store.controller = controller;
    controller.reconcile();
    const register = (id, x, z = 0, width = 0.4, depth = 0.4) => {
        const anchor = new Vector3(x, tierHeights?.at(-1) ?? tierCount, z);
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
    const start = (id, pointerId, grabAt) => {
        const position = grabAt || controller.entries.get(id).position;
        assert.equal(controller.begin(id), true);
        const data = dataAt(position);
        assert.equal(pointerId === undefined
            ? controller.startPointer(id, data, camera, canvas)
            : controller.startPointer(id, null, camera, canvas, { x: data.x, y: data.y, pointerId }), true);
    };
    const drag = (id, target) => controller.drag(id, dataAt(target), camera, canvas);
    const pointerMove = (target, pointerId) => {
        const data = dataAt(target);
        controller.pointerMove({ clientX: data.x, clientY: data.y, pointerId }, camera, canvas);
    };
    const pointerUp = (target, pointerId) => {
        const data = dataAt(target);
        controller.pointerUp({ clientX: data.x, clientY: data.y, pointerId }, camera, canvas);
    };
    return { controller, current, store, parent, camera, register, start, drag, pointerMove, pointerUp, dragEvents, rejectedAdditions, ledgeRestrictions, cherryFitWarnings, numberResizeRejections, numberSizeRejections, frames: () => frames };
}

test("pointer moves update mesh refs immediately and save coordinates only once on pointerup", async () => {
    for (const round of [false, true]) for (const id of ["candle", "chocolate-0", "balls", "nuts", "cherry-0"]) {
        const { controller, current, store, register, parent, camera, start, pointerMove, pointerUp, drag } = setup({ round });
        const topping = register(id, 0, 0, 0.2, 0.2);
        controller.reconcile();
        if (id === "candle" || id.startsWith("cherry-")) {
            camera.position.copy(parent.localToWorld(new Vector3(0, 6, 6)));
            camera.lookAt(parent.localToWorld(new Vector3()));
            camera.updateWorldMatrix(true, false);
        }
        const getSaved = () => id.startsWith("chocolate-") ? current.state.chocolateLayouts[0]
            : id.startsWith("cherry-") ? current.state.cherryLayouts[0] : current.state.toppingLayout[id];
        const saved = getSaved();
        const published = [];
        let commits = 0;
        const save = current.state.setToppingPosition;
        current.state.setToppingPosition = (...args) => { commits++; save(...args); };
        store.publish = (...args) => published.push(args);
        start(id);
        for (const target of [new Vector3(0.3, 1, 0.2), new Vector3(0.6, 1, 0.4)]) {
            pointerMove(target);
            const center = getTransformedToppingBox(topping.object, parent).getCenter(new Vector3());
            assert.ok(Math.abs(center.x - target.x) < 0.003, `${id}, round=${round}: move the mesh before a React render or animation frame (${center.x} versus ${target.x})`);
            assert.ok(Math.abs(center.z - target.z) < 0.003);
            controller.update(1 / 60);
            assert.equal(commits, 0);
            assert.equal(published.length, 0);
            assert.equal(getSaved(), saved);
        }
        const release = new Vector3(0.9, 1, 0.5);
        pointerUp(release);
        pointerUp(release);
        drag(id, release);
        controller.end(id);
        await Promise.resolve();
        const placed = controller.entries.get(id).position;
        assert.ok(Math.abs(placed.x - release.x) < 0.003);
        assert.ok(Math.abs(placed.z - release.z) < 0.003);
        assert.equal(commits, 1, "duplicate release callbacks must share one commit");
        assert.equal(published.length, 1);
        assert.deepEqual(getSaved().position, placed.toArray());
    }
});

test("native pointer drags ignore other pointers and commit only when the initiating pointer releases", () => {
    const { controller, current, register, start, pointerMove, pointerUp } = setup();
    register("balls", 0, 0, 0.2, 0.2);
    controller.reconcile();
    const saved = current.state.toppingLayout.balls;
    const original = controller.entries.get("balls").position.clone();
    const target = new Vector3(0.8, 1, 0.5);
    start("balls", 7);
    pointerMove(target, 8);
    pointerUp(target, 8);
    assert.ok(controller.entries.get("balls").position.equals(original));
    assert.equal(controller.isDragging.current, true);
    pointerMove(target, 7);
    assert.ok(controller.entries.get("balls").position.x > 0.7);
    assert.equal(current.state.toppingLayout.balls, saved);
    pointerUp(target, 7);
    assert.equal(controller.isDragging.current, false);
    assert.deepEqual(current.state.toppingLayout.balls.position, controller.entries.get("balls").position.toArray());
});

test("animation frames move mesh refs without publishing React coordinates until the drag ends", () => {
    const { controller, current, store, register, parent } = setup();
    const topping = register("balls", 0, 0, 0.2, 0.2);
    controller.reconcile();
    const saved = current.state.toppingLayout.balls;
    const published = [];
    store.publish = (...args) => published.push(args);
    controller.begin("balls");
    controller.move("balls", new Vector3(0.8, 1, 0.5));
    for (let frame = 0; frame < 30; frame++) controller.update(1 / 60);
    assert.ok(getTransformedToppingBox(topping.object, parent).getCenter(new Vector3()).x > 0.7);
    assert.equal(published.length, 0);
    assert.equal(current.state.toppingLayout.balls, saved);
    controller.end();
    assert.equal(published.length, 1);
    assert.deepEqual(current.state.toppingLayout.balls.position, controller.entries.get("balls").position.toArray());
});

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

test("number candles preserve relative angle, radius and ledge across tier configurations and clamp removed ledges to the bottom", () => {
    const configurations = {
        1: { radii: [1.9], heights: [2.7] },
        2: { radii: [2.8, 1.4], heights: [1.2, 3.6] },
        3: { radii: [2.6, 1.6, 0.8], heights: [0.9, 2.2, 4.1] },
        4: { radii: [3.1, 2.5, 1.7, 1.1], heights: [0.7, 1.8, 3.0, 4.9] },
    };
    for (const round of [false, true]) for (const initialLedge of [0, 1, 2, 3]) for (const angle of [0, Math.PI / 2, Math.PI]) {
        const first = configurations[4];
        const { controller, current, register, parent } = setup({ tierCount: 4, round, candleMode: "number", tierRadii: first.radii, tierHeights: first.heights });
        const topping = register("candle", 0, 0, 0.08, 0.06);
        const insertionDepth = 0.1;
        controller.register("candle", { ...controller.entries.get("candle"), insertionDepth });
        controller.reconcile();
        const bottomIndex = 3 - initialLedge;
        const radius = first.radii[bottomIndex] * (initialLedge ? 0.9 : 0.45);
        const initial = new Vector3(Math.cos(angle) * radius, first.heights[bottomIndex] - insertionDepth + TOPPING_SURFACE_OFFSET, Math.sin(angle) * radius);
        controller.commit(controller.apply(controller.entries.get("candle"), initial, false));
        let expected = { ...current.state.toppingLayout.candle.relativePlacement };
        assert.equal(expected.ledgeIndex, initialLedge, "ledge indices count down from the top");
        for (const count of [2, 3, 1, 4]) {
            const configuration = configurations[count];
            const scene = new Group();
            configuration.radii.forEach((radius, index) => {
                const bottom = index ? configuration.heights[index - 1] : 0;
                const top = configuration.heights[index];
                const geometry = round ? new CylinderGeometry(radius, radius, top - bottom, 64) : new BoxGeometry(2 * radius, top - bottom, 2 * radius);
                const mesh = new Mesh(geometry.translate(0, (top + bottom) / 2, 0));
                mesh.name = round ? "cake_round" : "cake_rectangle";
                scene.add(mesh);
            });
            parent.remove(current.scene);
            parent.add(scene);
            current.scene = scene;
            current.state = { ...current.state, selectedTierIndex: count - 1 };
            controller.reconcile();
            expected.ledgeIndex = Math.min(expected.ledgeIndex, count - 1);
            const selectedIndex = count - 1 - expected.ledgeIndex;
            const selectedRadius = configuration.radii[selectedIndex];
            const position = controller.entries.get("candle").position;
            assert.ok(Math.abs(position.x - Math.cos(expected.angle) * expected.normalizedRadius * selectedRadius) < 1e-6);
            assert.ok(Math.abs(position.z - Math.sin(expected.angle) * expected.normalizedRadius * selectedRadius) < 1e-6);
            assert.ok(Math.abs(position.y - (configuration.heights[selectedIndex] - insertionDepth + TOPPING_SURFACE_OFFSET)) < 1e-6, "Y must use the new ledge height and candle embed depth");
            const saved = current.state.toppingLayout.candle.relativePlacement;
            assert.equal(saved.ledgeIndex, expected.ledgeIndex);
            assert.equal(saved.tierCount, count);
            assert.ok(Math.abs(saved.angle - expected.angle) < 1e-6);
            assert.ok(Math.abs(saved.normalizedRadius - expected.normalizedRadius) < 1e-6);
            const placed = position.clone();
            controller.reconcile();
            assert.ok(controller.entries.get("candle").position.distanceTo(placed) < 1e-8, "repeated reconciliation must not remap an already converted placement");
            assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y + insertionDepth - configuration.heights[selectedIndex] - TOPPING_SURFACE_OFFSET) < 1e-6);
        }
    }
});

test("number-candle relative placement survives a controller remount and keeps exact XYZ for a matching saved preview", () => {
    const source = setup({ tierCount: 4, candleMode: "number" });
    source.register("candle", 0, 0, 0.08, 0.06);
    source.controller.reconcile();
    const original = new Vector3(0, 1.001, 1.8);
    source.controller.commit(source.controller.apply(source.controller.entries.get("candle"), original, false));
    const saved = JSON.parse(JSON.stringify(source.current.state.toppingLayout.candle));
    assert.equal(saved.relativePlacement.ledgeIndex, 3);
    for (const readOnly of [false, true]) {
        const target = setup({ tierCount: 2, candleMode: "number", tierRadii: [3, 1.5], tierHeights: [1.4, 3.2] });
        target.register("candle", 0, 0, 0.08, 0.06);
        target.current.state.toppingLayout.candle = saved;
        target.controller.register("candle", { ...target.controller.entries.get("candle"), layout: saved });
        if (readOnly) target.controller.interactive = false;
        target.controller.reconcile();
        const position = target.controller.entries.get("candle").position;
        assert.ok(position.distanceTo(new Vector3(0, 1.401, 2.7)) < 1e-6);
        assert.equal(target.current.state.toppingLayout.candle.relativePlacement.ledgeIndex, 1);
        const preview = setup({ tierCount: 2, candleMode: "number", tierRadii: [3, 1.5], tierHeights: [1.4, 3.2] });
        preview.register("candle", 0, 0, 0.08, 0.06);
        preview.controller.interactive = false;
        const layout = JSON.parse(JSON.stringify(target.current.state.toppingLayout.candle));
        preview.controller.register("candle", { ...preview.controller.entries.get("candle"), layout });
        preview.controller.reconcile();
        assert.deepEqual(preview.controller.entries.get("candle").position.toArray(), layout.position);
    }
});

test("switching a lower-ledge number candle from tier 3 or 4 to tier 2 retries Small without removal and can be toggled on again", async () => {
    for (const round of [false, true]) for (const fromCount of [3, 4]) for (let ledgeIndex = 1; ledgeIndex < fromCount; ledgeIndex++) {
        for (const size of ["medium", "large"]) for (const outcome of ["fits", "small", "top"]) {
            const { controller, current, parent, register, numberResizeRejections, numberSizeRejections, rejectedAdditions } = setup({
                tierCount: fromCount, round, candleMode: "number",
            });
            const topping = register("candle", 0, 0, 0.24, 0.18);
            current.state.setToppingSize("candle", size);
            controller.register("candle", { ...controller.entries.get("candle"), insertionDepth: 0.05, layout: current.state.toppingLayout.candle });
            controller.reconcile();
            const original = new Vector3(0, fromCount - ledgeIndex - 0.05 + TOPPING_SURFACE_OFFSET,
                2 - (fromCount - ledgeIndex - 1) * 0.5 - 0.25);
            controller.commit(controller.apply(controller.entries.get("candle"), original, false));
            assert.equal(current.state.toppingLayout.candle.relativePlacement.ledgeIndex, ledgeIndex);
            const scene = new Group();
            for (const [radius, bottom, top] of [[2, 0, 1], [outcome === "fits" ? 1.6 : outcome === "small" ? 1.84 : 1.97, 1, 2]]) {
                const geometry = round ? new CylinderGeometry(radius, radius, top - bottom, 64) : new BoxGeometry(2 * radius, top - bottom, 2 * radius);
                const mesh = new Mesh(geometry.translate(0, (top + bottom) / 2, 0));
                mesh.name = round ? "cake_round" : "cake_rectangle";
                scene.add(mesh);
            }
            parent.remove(current.scene);
            parent.add(scene);
            current.scene = scene;
            current.state = { ...current.state, selectedTierIndex: 1 };
            const sizes = [];
            const setSize = current.state.setToppingSize;
            current.state.setToppingSize = (...args) => { sizes.push(args); setSize(...args); };
            controller.reconcile();
            controller.reconcile();
            await Promise.resolve();
            assert.equal(controller.entries.has("candle"), true, "the candle stays registered while Small is remeasured");
            assert.equal(current.state.candle, true);
            assert.equal(topping.object.visible, true);
            assert.deepEqual(sizes, outcome === "fits" ? [] : [["candle", "small"]]);
            if (outcome !== "fits") {
                const ratio = size === "large" ? 2 / 3 : 0.8;
                topping.anchor.set(0, 2, 0);
                topping.mesh.geometry = new BoxGeometry(0.24 * ratio, 0.4 * ratio, 0.18 * ratio);
                topping.mesh.position.copy(topping.anchor).add(new Vector3(0, 0.2 * ratio, 0));
                topping.object.matrix.identity();
                const box = getTransformedToppingBox(topping.object, parent).translate(topping.anchor.clone().negate());
                controller.register("candle", { ...controller.entries.get("candle"), anchor: topping.anchor, box, messageBox: box,
                    insertionDepth: 0.05 * ratio, layout: current.state.toppingLayout.candle });
                controller.reconcile();
            }
            await Promise.resolve();
            const accepted = controller.entries.get("candle");
            const saved = current.state.toppingLayout.candle;
            assert.equal(saved.size, outcome === "fits" ? size : "small");
            assert.equal(saved.relativePlacement.tierCount, 2);
            assert.equal(saved.relativePlacement.ledgeIndex, outcome === "top" ? 0 : 1);
            assert.equal(controller.valid(accepted, accepted.position), true);
            const placed = accepted.position.clone();
            controller.reconcile();
            assert.ok(controller.entries.get("candle").position.distanceTo(placed) < 1e-8);
            current.state.setCandle(false);
            controller.unregister("candle");
            current.state.setCandle(true);
            controller.register("candle", { ...accepted, layout: saved });
            controller.reconcile();
            await Promise.resolve();
            assert.equal(topping.object.visible, true, "turning the candle back ON must display it");
            assert.ok(controller.entries.get("candle").position.distanceTo(placed) < 1e-8);
            assert.deepEqual(numberResizeRejections, []);
            assert.deepEqual(numberSizeRejections, []);
            assert.deepEqual(rejectedAdditions, []);
        }
    }
});

test("changing cake shape reprojects number-candle radius using the new outline even when tier count is unchanged", () => {
    const { controller, current, register, parent } = setup({ tierCount: 3, round: true, candleMode: "number" });
    register("candle", 0, 0, 0.08, 0.06);
    controller.reconcile();
    const coordinate = 1.35 / Math.sqrt(2);
    controller.commit(controller.apply(controller.entries.get("candle"), new Vector3(coordinate, 2.001, coordinate), false));
    const relative = { ...current.state.toppingLayout.candle.relativePlacement };
    const scene = new Group();
    for (let index = 0; index < 3; index++) {
        const radius = 2 - index * 0.5;
        const mesh = new Mesh(new BoxGeometry(2 * radius, 1, 2 * radius).translate(0, index + 0.5, 0));
        mesh.name = "cake_rectangle";
        scene.add(mesh);
    }
    parent.remove(current.scene);
    parent.add(scene);
    current.scene = scene;
    current.state = { ...current.state, form: 2 };
    controller.reconcile();
    const position = controller.entries.get("candle").position;
    assert.ok(position.distanceTo(new Vector3(1.35, 2.001, 1.35)) < 1e-6);
    const saved = current.state.toppingLayout.candle.relativePlacement;
    assert.equal(saved.form, 2);
    assert.equal(saved.ledgeIndex, relative.ledgeIndex);
    assert.ok(Math.abs(saved.angle - relative.angle) < 1e-8);
    assert.ok(Math.abs(saved.normalizedRadius - relative.normalizedRadius) < 1e-8);
});

test("legacy number-candle XYZ gains relative state once without moving or modifying a matching preview", () => {
    const source = setup({ tierCount: 3, candleMode: "number" });
    source.register("candle", 0, 0, 0.08, 0.06);
    const legacy = { ...source.current.state.toppingLayout.candle, x: 56.25, y: 82.5, position: [0.25, 2.001, 1.3] };
    source.current.state.toppingLayout.candle = legacy;
    source.controller.register("candle", { ...source.controller.entries.get("candle"), layout: legacy });
    source.controller.reconcile();
    assert.ok(source.controller.entries.get("candle").position.distanceTo(new Vector3(...legacy.position)) < 1e-8);
    assert.equal(source.current.state.toppingLayout.candle.relativePlacement.ledgeIndex, 1);
    const upgraded = source.current.state.toppingLayout.candle;
    source.controller.reconcile();
    assert.equal(source.current.state.toppingLayout.candle, upgraded, "relative state must not cause repeated state commits");
    const preview = setup({ tierCount: 3, candleMode: "number" });
    preview.register("candle", 0, 0, 0.08, 0.06);
    preview.current.state.toppingLayout.candle = legacy;
    preview.controller.register("candle", { ...preview.controller.entries.get("candle"), layout: legacy });
    preview.controller.interactive = false;
    let commits = 0;
    preview.current.state.setToppingPosition = () => commits++;
    preview.controller.reconcile();
    assert.deepEqual(preview.controller.entries.get("candle").position.toArray(), legacy.position);
    assert.equal(commits, 0, "loading a read-only legacy snapshot must not save new coordinates");
});

test("resizing a number candle shifts it radially out of a new tier wall or removes it if the shift hits a topping or rim", async () => {
    for (const round of [false, true]) for (const outcome of ["clear", "topping", "rim"]) {
        const { controller, current, register, parent, numberResizeRejections, rejectedAdditions } = setup({
            tierCount: 2, round, candleMode: "number", tierRadii: [2, 1], tierHeights: [1, 2],
        });
        const candle = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        controller.commit(controller.apply(controller.entries.get("candle"), new Vector3(0, 1.001, 1.2), false));
        let cherry, cherryPosition;
        if (outcome === "topping") {
            cherry = register("cherry-0", 0, 0, 0.14, 0.10);
            controller.reconcile();
            controller.commit(controller.apply(controller.entries.get("cherry-0"), new Vector3(0, 1.001, 1.9), false));
            cherryPosition = controller.entries.get("cherry-0").position.clone();
        }
        const scene = new Group();
        for (const [radius, bottom, top] of [[2, 0, 1], [outcome === "rim" ? 1.97 : 1.8, 1, 2]]) {
            const geometry = round ? new CylinderGeometry(radius, radius, top - bottom, 64) : new BoxGeometry(2 * radius, top - bottom, 2 * radius);
            const mesh = new Mesh(geometry.translate(0, (top + bottom) / 2, 0));
            mesh.name = round ? "cake_round" : "cake_rectangle";
            scene.add(mesh);
        }
        if (outcome === "clear") {
            // A size change can update the existing model without a new UUID.
            current.scene.children.at(-1).scale.set(1.8, 1, 1.8);
        } else {
            parent.remove(current.scene);
            parent.add(scene);
            current.scene = scene;
        }
        current.state = { ...current.state, selectedSize: "Resized cake" };
        controller.reconcile();
        await Promise.resolve();
        if (outcome === "clear") {
            const entry = controller.entries.get("candle");
            assert.ok(entry.position.z > 1.8, "the number candle must shift outward to clear the enlarged upper tier");
            assert.ok(Math.abs(entry.position.x) < 1e-8, "the saved radial angle must stay fixed");
            assert.ok(Math.abs(entry.position.y - 1.001) < 1e-6);
            assert.equal(controller.valid(entry, entry.position), true);
            assert.equal(candle.object.visible, true);
            assert.equal(current.state.candle, true);
            assert.deepEqual(numberResizeRejections, []);
        } else {
            assert.equal(controller.entries.has("candle"), false, "a blocked radial shift must remove the candle instead of relocating it elsewhere");
            assert.equal(candle.object.visible, false);
            assert.equal(current.state.candle, false, "the candle toggle must be OFF");
            assert.equal(current.state.toppingLayout.candle.position, undefined);
            assert.equal(current.state.toppingLayout.candle.relativePlacement, undefined);
            assert.deepEqual(numberResizeRejections, ["candle"]);
            controller.reconcile();
            await Promise.resolve();
            assert.deepEqual(numberResizeRejections, ["candle"], "removal must notify only once");
            if (cherry) {
                assert.ok(controller.entries.get("cherry-0").position.distanceTo(cherryPosition) < 1e-8, "other toppings must not move to accommodate the number candle");
                assert.equal(cherry.object.visible, true);
            }
            current.state.setCandle(true);
            const replacement = register("candle", 0, 0, 0.14, 0.10);
            controller.reconcile();
            assert.equal(current.state.candle, true);
            assert.equal(replacement.object.visible, true, "turning the candle back on must allow a fresh placement");
            assert.equal(current.state.toppingLayout.candle.relativePlacement.ledgeIndex, 0);
            assert.deepEqual(numberResizeRejections, ["candle"]);
        }
        assert.deepEqual(rejectedAdditions, [], "a resize rejection must not also show the generic topping rejection");
    }
});

test("a number candle that cannot fit a selected size on the fourth-tier ledge stays in place and resets to Small", async () => {
    for (const round of [false, true]) for (const size of ["medium", "large"]) for (const narrow of [false, true]) {
        const { controller, current, register, parent, numberResizeRejections, numberSizeRejections, rejectedAdditions } = setup({
            tierCount: 4, round, candleMode: "number", tierRadii: narrow ? [1.2, 1, 0.8, 0.7] : [2, 1.5, 1, 0.5],
        });
        const topping = register("candle", 0, 0, 0.06, 0.08);
        current.state.setToppingSize("candle", "small");
        controller.register("candle", { ...controller.entries.get("candle"), layout: current.state.toppingLayout.candle });
        controller.reconcile();
        const original = new Vector3(0, 3.001, 0.75);
        const entry = controller.entries.get("candle");
        controller.commit(controller.apply({ ...entry, layout: { ...entry.layout, position: original.toArray() } }, original, false));
        const relative = { ...current.state.toppingLayout.candle.relativePlacement };
        assert.equal(relative.ledgeIndex, 1, "the candle starts on the narrow ledge below the top tier");
        const renderSize = (selectedSize) => {
            topping.mesh.scale.setScalar({ small: 1, medium: 1.25, large: 1.5 }[selectedSize]);
            topping.object.matrix.identity();
            topping.object.updateWorldMatrix(false, true);
            const box = getTransformedToppingBox(topping.object, parent).translate(topping.anchor.clone().negate());
            current.state.setToppingSize("candle", selectedSize);
            controller.register("candle", { ...controller.entries.get("candle"), box, messageBox: box,
                layout: current.state.toppingLayout.candle });
            controller.reconcile();
        };
        renderSize(size);
        assert.equal(controller.entries.has("candle"), true, "changing the candle's size must not remove it");
        assert.equal(topping.object.visible, true);
        assert.equal(current.state.candle, true, "the candle toggle stays ON");
        if (narrow) {
            assert.equal(current.state.toppingLayout.candle.size, "small");
            assert.ok(controller.entries.get("candle").position.distanceTo(original) < 1e-8, "a failed size must restore the original location");
            assert.deepEqual(current.state.toppingLayout.candle.relativePlacement, relative);
            assert.equal(numberSizeRejections.length, 1);
            renderSize("small");
        } else {
            assert.equal(current.state.toppingLayout.candle.size, size, "larger candles remain selected when there is enough room");
            assert.deepEqual(numberSizeRejections, []);
        }
        controller.reconcile();
        await Promise.resolve();
        const accepted = controller.entries.get("candle");
        assert.equal(accepted.layout.size, narrow ? "small" : size);
        assert.ok(Math.abs(accepted.position.x - original.x) < 1e-8);
        assert.ok(Math.abs(accepted.position.z - original.z) < 1e-8);
        assert.equal(current.state.toppingLayout.candle.relativePlacement.ledgeIndex, 1);
        assert.equal(controller.valid(accepted, accepted.position), true);
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 3.001) < 1e-6);
        assert.equal(numberSizeRejections.length, narrow ? 1 : 0, "restoring Small must not repeat the toast");
        assert.deepEqual(numberResizeRejections, [], "candle-size selection must not use the cake-resize removal path");
        assert.deepEqual(rejectedAdditions, [], "a failed candle size must not use generic topping removal");
    }
});

test("number candles resize along the marked lower ledges of round and rectangular tier 2–4 cakes", async () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) {
        const ledges = tierCount === 2 ? [1] : tierCount === 3 ? [2] : [2, 3];
        for (const ledgeIndex of ledges) for (const edge of ["wall", "rim"]) for (const size of ["medium", "large"]) {
            const { controller, current, register, parent, numberResizeRejections, numberSizeRejections, rejectedAdditions } = setup({
                tierCount, round, candleMode: "number",
            });
            const topping = register("candle", 0, 0, 0.24, 0.18);
            current.state.setToppingSize("candle", "small");
            controller.register("candle", { ...controller.entries.get("candle"), layout: current.state.toppingLayout.candle });
            controller.reconcile();
            const outerRadius = 2 - (tierCount - ledgeIndex - 1) * 0.5;
            const original = new Vector3(0, tierCount - ledgeIndex + TOPPING_SURFACE_OFFSET,
                edge === "wall" ? outerRadius - 0.5 + 0.094 : outerRadius - 0.102);
            const entry = controller.entries.get("candle");
            controller.commit(controller.apply({ ...entry, layout: { ...entry.layout, position: original.toArray() } }, original, false));
            assert.equal(controller.valid(controller.entries.get("candle"), original), true, `${tierCount} tiers, ledge ${ledgeIndex}, ${edge}, round=${round}`);
            topping.mesh.scale.setScalar(size === "large" ? 1.5 : 1.25);
            topping.object.matrix.identity();
            const box = getTransformedToppingBox(topping.object, parent).translate(topping.anchor.clone().negate());
            current.state.setToppingSize("candle", size);
            controller.register("candle", { ...controller.entries.get("candle"), box, messageBox: box,
                layout: current.state.toppingLayout.candle });
            controller.reconcile();
            await Promise.resolve();
            const accepted = controller.entries.get("candle");
            assert.equal(current.state.toppingLayout.candle.size, size, `${tierCount} tiers, ledge ${ledgeIndex}, ${edge}, ${size}, round=${round}`);
            assert.equal(accepted.layout.size, size);
            assert.equal(current.state.toppingLayout.candle.relativePlacement.ledgeIndex, ledgeIndex);
            assert.ok(Math.abs(current.state.toppingLayout.candle.relativePlacement.angle - Math.PI / 2) < 1e-8);
            assert.equal(controller.valid(accepted, accepted.position), true, "the full resized footprint must clear both the upper wall and outer rim");
            assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - original.y) < 1e-6);
            assert.ok(edge === "wall" ? accepted.position.z > original.z : accepted.position.z < original.z);
            assert.equal(current.state.candle, true);
            assert.equal(topping.object.visible, true);
            assert.deepEqual(numberSizeRejections, []);
            assert.deepEqual(numberResizeRejections, []);
            assert.deepEqual(rejectedAdditions, []);
            const placed = accepted.position.clone();
            controller.reconcile();
            assert.ok(controller.entries.get("candle").position.distanceTo(placed) < 1e-8, "the resized location must persist");
        }
    }
});

test("single candles freeze at the physical top-tier rim for both front and back lower-ledge attempts", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera, ledgeRestrictions } = setup({ tierCount, round, combined: true });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const saved = current.state.toppingLayout.candle;
        const radius = 2 - (tierCount - 1) * 0.5;
        start("candle", 7);
        const xs = [];
        for (const x of [-0.15, 0, 0.15]) {
            pointerMove(new Vector3(x, tierCount - 1, -radius - 0.25), 7);
            for (const delta of [1 / 240, 1 / 60, 0.2]) controller.update(delta);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - tierCount - TOPPING_SURFACE_OFFSET) < 1e-6);
            assert.ok(bounds.getCenter(new Vector3()).z < -0.2, "a blocked drag must freeze at the rim instead of snapping to the center");
            const extent = Math.max(...[bounds.min.x, bounds.max.x].flatMap(cx => [bounds.min.z, bounds.max.z].map(cz => round ? Math.hypot(cx, cz) : Math.max(Math.abs(cx), Math.abs(cz)))));
            assert.ok(extent <= radius - TOPPING_PLACEMENT_GAP + 1e-7);
            assert.ok(extent > radius - 0.01, "the full physical footprint must contact the top rim");
            xs.push(bounds.getCenter(new Vector3()).x);
            assert.equal(current.state.toppingLayout.candle, saved);
        }
        assert.ok(Math.max(...xs) - Math.min(...xs) > 0.1, "the held candle can slide along the rim");
        pointerUp(new Vector3(0, tierCount - 1, radius + 0.25), 7);
        controller.reconcile();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - tierCount - TOPPING_SURFACE_OFFSET) < 1e-6);
        assert.deepEqual(ledgeRestrictions, ["candle"], "restricted lower-ledge attempts warn only once per held drag");
    }
});

test("number candles use camera-facing ledges and stop at the top-tier back edge", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera, ledgeRestrictions } = setup({ tierCount, round, candleMode: "number" });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const radius = 2 - (tierCount - 1) * 0.5;
        start("candle", 7);
        pointerMove(new Vector3(0, tierCount - 1, radius + 0.25), 7);
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - (tierCount - 1) - TOPPING_SURFACE_OFFSET) < 1e-6);
        assert.deepEqual(ledgeRestrictions, []);
        for (let move = 0; move < 4; move++) {
            pointerMove(new Vector3(0, tierCount - 1, -radius - 0.25), 7);
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - tierCount - TOPPING_SURFACE_OFFSET) < 1e-6);
            assert.ok(bounds.min.z >= -radius + TOPPING_PLACEMENT_GAP - 1e-7);
            const extent = Math.max(...[bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.z, bounds.max.z].map(z => round ? Math.hypot(x, z) : Math.max(Math.abs(x), Math.abs(z)))));
            assert.ok(extent > radius - 0.01);
            assert.ok(bounds.getCenter(new Vector3()).z < -0.2);
        }
        assert.deepEqual(ledgeRestrictions, ["candle"]);
        pointerUp(new Vector3(0, tierCount - 1, radius + 0.25), 7);
        controller.reconcile();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - (tierCount - 1) - TOPPING_SURFACE_OFFSET) < 1e-6);
    }
});

test("grabbing the single candle near its tip keeps its offset and stays quiet until a restricted move", () => {
    for (const round of [false, true]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera, ledgeRestrictions } = setup({ tierCount: 3, round });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        const original = controller.entries.get("candle").position.clone().setZ(-0.9);
        controller.commit(controller.apply(controller.entries.get("candle"), original, false));
        camera.position.copy(parent.localToWorld(new Vector3(0, 4.8, 5)));
        camera.lookAt(parent.localToWorld(new Vector3(0, 2.5, 0)));
        camera.updateWorldMatrix(true, false);
        const grabAt = original.clone().add(new Vector3(0, 0.35, 0));
        start("candle", 7, grabAt);
        pointerMove(grabAt, 7);
        assert.ok(controller.entries.get("candle").position.distanceTo(original) < 1e-6);
        assert.deepEqual(ledgeRestrictions, []);
        let target;
        for (const pull of [0.1, 0.3, 1]) {
            target = grabAt.clone().add(new Vector3(0, 0, -pull));
            pointerMove(target, 7);
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
            assert.ok(bounds.getCenter(new Vector3()).z < -0.8);
            assert.ok(bounds.min.z >= -1 + TOPPING_PLACEMENT_GAP - 1e-7);
        }
        pointerUp(target, 7);
        controller.reconcile();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 3.001) < 1e-6);
    }
});

test("placement-board candle drags enforce the same top-tier and camera-facing ledge restrictions", () => {
    for (const round of [false, true]) for (const candleMode of ["gold", "number"]) {
        const { controller, current, register, parent, camera, ledgeRestrictions } = setup({ tierCount: 3, round, candleMode });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        current.camera = camera;
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        controller.reconcile();
        controller.moveMarker("candle", 50, candleMode === "number" ? 6.25 : 0);
        for (let frame = 0; frame < 20; frame++) controller.update(1 / 30);
        controller.end();
        let bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
        assert.ok(bounds.getCenter(new Vector3()).z < -0.8);
        assert.ok(bounds.min.z >= -1 + TOPPING_PLACEMENT_GAP - 1e-7);
        assert.deepEqual(ledgeRestrictions, ["candle"]);
        controller.moveMarker("candle", 50, candleMode === "number" ? 93.75 : 100);
        controller.end();
        bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - (candleMode === "number" ? 1.001 : 3.001)) < 1e-6);
        assert.equal(ledgeRestrictions.length, candleMode === "number" ? 1 : 2);
    }
});

test("single candles stop at the rear top rim before reaching a lower ledge behind the cake", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) for (const viewSign of [-1, 1]) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera, ledgeRestrictions } = setup({ tierCount, round, candleMode: "number" });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        // Match the rendered single candle even if the shared mode is stale.
        current.state.toppingLayout.candle.mode = "gold";
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2 * viewSign)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        controller.reconcile();
        const saved = current.state.toppingLayout.candle;
        start("candle");
        const topRadius = 2 - (tierCount - 1) * 0.5;
        const target = new Vector3(0, tierCount - 1, -topRadius - 0.3);
        for (let event = 0; event < 4; event++) {
            pointerMove(target);
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - tierCount - 0.001) < 1e-6, "a single candle cannot drop behind a tier");
            assert.ok(controller.entries.get("candle").position.z < -0.2, "back pulls stop at the rim instead of the center");
            for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
                assert.ok((round ? Math.hypot(x, z) : Math.max(Math.abs(x), Math.abs(z))) <= topRadius - TOPPING_PLACEMENT_GAP + 1e-7);
            }
            assert.equal(controller.isDragging.current, true);
            assert.equal(current.state.toppingLayout.candle, saved);
        }
        assert.deepEqual(ledgeRestrictions, ["candle"], "warn once when attempting the original back ledge");
        pointerMove(new Vector3(0.2, tierCount, 0));
        assert.ok(Math.abs(controller.entries.get("candle").position.x - 0.2) < 0.003, "valid top-tier movement resumes while still held");
        pointerUp(target);
        const position = controller.entries.get("candle").position.clone();
        controller.reconcile();
        assert.ok(controller.entries.get("candle").position.distanceTo(position) < 1e-8);
        assert.ok(new Vector3(...current.state.toppingLayout.candle.position).distanceTo(position) < 1e-8);
    }
});

test("single candles keep physical top-tier boundaries during front and side movement and camera rotation", () => {
    for (const round of [false, true]) for (const tierCount of [1, 2, 3, 4]) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount, round });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        const original = controller.entries.get("candle").position.clone();
        const radius = 2 - (tierCount - 1) * 0.5;
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        start("candle", 7);
        for (const target of [new Vector3(0, tierCount, -0.3), new Vector3(-0.25, tierCount, -8), new Vector3(0.25, tierCount, -8)]) {
            pointerMove(target, 7);
            for (const delta of [1 / 240, 1 / 60, 0.2]) controller.update(delta);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(bounds.min.z >= -radius + TOPPING_PLACEMENT_GAP - 1e-7, "the full candle must stop inside the physical top-tier rim");
            assert.ok(Math.abs(bounds.min.y - tierCount - 0.001) < 1e-6);
        }
        assert.ok(controller.entries.get("candle").position.x > 0.2, "sideways motion must continue while the rear limit is held");
        pointerUp(new Vector3(0, tierCount, 0.3), 7);
        controller.reconcile();
        assert.ok(controller.entries.get("candle").position.z > original.z + 0.25);
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, -2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        start("candle", 8);
        pointerUp(new Vector3(0, tierCount, -8), 8);
        controller.reconcile();
        const finalBounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(finalBounds.getCenter(new Vector3()).z < -0.2, "camera rotation and a second drag must still reach the rear top rim");
        assert.ok(finalBounds.min.z >= -radius + TOPPING_PLACEMENT_GAP - 1e-7);
        assert.ok(Math.abs(finalBounds.min.y - tierCount - 0.001) < 1e-6);
        assert.deepEqual(current.state.toppingLayout.candle.position, controller.entries.get("candle").position.toArray());
    }
});

test("single candles initially placed near the rear rim slide along the physical edge and never drop", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount, round, combined: true });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const radius = 2 - (tierCount - 1) * 0.5;
        const edge = controller.entries.get("candle").position.clone();
        edge.z = -radius + 0.08;
        controller.commit(controller.apply(controller.entries.get("candle"), edge, false));
        start("candle", 7);
        const xPositions = [];
        for (const x of [-0.2, 0, 0.2]) {
            pointerMove(new Vector3(x, tierCount - 1, -radius - 0.3), 7);
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            const center = bounds.getCenter(new Vector3());
            assert.ok(center.z < -0.15, "a back pull must clamp at the rear rim rather than the front center line");
            assert.ok(Math.abs(bounds.min.y - tierCount - 0.001) < 1e-6);
            const distances = [bounds.min.x, bounds.max.x].flatMap((cx) => [bounds.min.z, bounds.max.z].map((cz) => round ? Math.hypot(cx, cz) : Math.max(Math.abs(cx), Math.abs(cz))));
            assert.ok(Math.max(...distances) <= radius - TOPPING_PLACEMENT_GAP + 1e-7);
            assert.ok(Math.max(...distances) > radius - 0.01, "sideways movement must contact the physical rim");
            xPositions.push(center.x);
        }
        assert.ok(Math.max(...xPositions) - Math.min(...xPositions) > 0.1, "sideways pointer movement must slide along the rear rim");
        const front = new Vector3(0, tierCount - 1, radius + 0.25);
        pointerUp(front, 7);
        controller.reconcile();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - tierCount - 0.001) < 1e-6, "front-ledge attempts must also remain on the top tier after release");
        start("candle", 8);
        pointerUp(new Vector3(0.1, tierCount - 1, -radius - 0.3), 8);
        controller.reconcile();
        const finalBounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(finalBounds.min.y - tierCount - 0.001) < 1e-6, "dragging from a front ledge to the back must return to the top rim");
        assert.ok(finalBounds.getCenter(new Vector3()).z < -0.15);
    }
});

test("an embedded single candle stays at the physical rear rim through frames, release and reconciliation", () => {
    for (const round of [false, true]) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera } = setup({
            tierCount: 3, round, combined: true, tierRadii: [1.4, 1.2, 1], tierHeights: [2.6, 2.8, 3],
        });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        const insertionDepth = 0.15;
        controller.register("candle", { ...controller.entries.get("candle"), insertionDepth });
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 4.8, 5)));
        camera.lookAt(parent.localToWorld(new Vector3(0, 1.2, 0)));
        camera.updateWorldMatrix(true, false);
        let commits = 0;
        const save = current.state.setToppingPosition;
        current.state.setToppingPosition = (...args) => { commits++; save(...args); };
        const assertRearRim = () => {
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y + insertionDepth - 3.001) < 1e-6, "the embedded base must remain seated on the highest cap");
            assert.ok(bounds.getCenter(new Vector3()).z < -0.8);
            const distances = [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.z, bounds.max.z].map(z => round ? Math.hypot(x, z) : Math.max(Math.abs(x), Math.abs(z))));
            assert.ok(Math.max(...distances) <= 1 - TOPPING_PLACEMENT_GAP + 1e-7);
            assert.ok(Math.max(...distances) > 0.99);
        };
        start("candle", 7);
        for (const x of [-0.1, 0, 0.1]) {
            pointerMove(new Vector3(x, 3, -8), 7);
            assertRearRim();
            for (const delta of [1 / 240, 1 / 60, 0.25]) { controller.update(delta); assertRearRim(); }
            assert.equal(commits, 0);
        }
        pointerUp(new Vector3(0.1, 3, -8), 7);
        assertRearRim();
        controller.reconcile();
        assertRearRim();
        assert.equal(commits, 1, "release and reconciliation must preserve the same top-rim placement");
    }
});

test("a number candle returns from a front ledge to the rear top rim past an occupied front rim and can cancel", () => {
    for (const round of [false, true]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount: 3, round, candleMode: "number" });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        register("nuts", 0, 0.85, 0.2, 0.2);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        start("candle", 7);
        pointerUp(new Vector3(0, 2, 1.3), 7);
        const front = controller.entries.get("candle").position.clone();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 2.001) < 1e-6);
        start("candle", 8);
        pointerMove(new Vector3(0, 2, -1.3), 8);
        for (let frame = 0; frame < 4; frame++) {
            controller.update(1 / 60);
            const entry = controller.entries.get("candle");
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
            assert.ok(controller.entries.get("candle").position.z < -0.8);
            assert.equal(controller.valid(entry, entry.position), true, "top-rim clamping must still avoid other toppings");
        }
        controller.cancel();
        controller.reconcile();
        assert.ok(controller.entries.get("candle").position.distanceTo(front) < 1e-8, "cancel must restore the visible front ledge and its original height");
    }
});

test("single-candle restriction warnings ignore top-tier motion and fire once on any lower-ledge attempt", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) for (const viewSign of [-1, 1]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera, ledgeRestrictions } = setup({ tierCount, round });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2 * viewSign)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        start("candle", 7);
        const radius = 2 - (tierCount - 1) * 0.5;
        for (const target of [
            new Vector3(0, tierCount, -0.2),
            new Vector3(0, tierCount, -radius + 0.01),
            new Vector3(0, tierCount - 1, -8),
        ]) {
            pointerMove(target, 7);
            assert.deepEqual(ledgeRestrictions, [], "top-tier motion and empty background must not trigger a lower-ledge warning");
        }
        const lowerBack = new Vector3(0, tierCount - 1, -radius - 0.3);
        for (let event = 0; event < 6; event++) {
            pointerMove(lowerBack, 7);
            assert.deepEqual(ledgeRestrictions, ["candle"]);
            assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - tierCount - 0.001) < 1e-6);
        }
        pointerUp(lowerBack, 7);
        assert.deepEqual(ledgeRestrictions, ["candle"], "pointerup must not duplicate the lower-ledge warning");
    }
});

test("number candles reach camera-facing front and side ledges from every forward-facing camera quadrant and retain saved placements", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) for (const angle of [0, Math.PI / 2, Math.PI]) for (const edgeAngle of [angle - 0.6, angle, angle + 0.6]) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera, ledgeRestrictions } = setup({ tierCount, round, combined: true, candleMode: "number" });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(2 * Math.cos(angle), 20, 2 * Math.sin(angle))));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const originalSize = getTransformedToppingBox(topping.object, parent).getSize(new Vector3());
        const saved = current.state.toppingLayout.candle;
        start("candle", 7);
        let target;
        for (let tier = tierCount - 2; tier >= 0; tier--) {
            const radius = (2 - tier * 0.5 - 0.25) / (round ? 1 : Math.max(Math.abs(Math.cos(edgeAngle)), Math.abs(Math.sin(edgeAngle))));
            target = new Vector3(radius * Math.cos(edgeAngle), tier + 1, radius * Math.sin(edgeAngle));
            pointerMove(target, 7);
            controller.update(1 / 60);
            const entry = controller.entries.get("candle");
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - target.y - 0.001) < 1e-6, `round=${round}, tiers=${tierCount}, camera=${angle}: seat on the visible ledge`);
            assert.ok(Math.abs(entry.position.x - target.x) < 0.001, `${entry.position.toArray()} should follow ${target.toArray()} on the visible ledge`);
            assert.ok(Math.abs(entry.position.z - target.z) < 0.001, `${entry.position.toArray()} should follow ${target.toArray()} on the visible ledge`);
            const tierRadius = 2 - tier * 0.5;
            for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
                assert.ok((round ? Math.hypot(x, z) : Math.max(Math.abs(x), Math.abs(z))) <= tierRadius - TOPPING_PLACEMENT_GAP + 1e-7);
            }
            assert.ok(bounds.getSize(new Vector3()).distanceTo(originalSize) < 1e-8);
            assert.equal(current.state.toppingLayout.candle, saved);
            assert.equal(controller.isDragging.current, true);
        }
        assert.deepEqual(ledgeRestrictions, []);
        pointerUp(target, 7);
        const position = controller.entries.get("candle").position.clone();
        controller.reconcile();
        assert.ok(controller.entries.get("candle").position.distanceTo(position) < 1e-8, "reconciliation must preserve the visible lower-ledge placement");
        assert.deepEqual(current.state.toppingLayout.candle.position, position.toArray());
        const preview = setup({ tierCount, round, combined: true, candleMode: "number" });
        const previewCandle = preview.register("candle", 0, 0, 0.14, 0.10);
        preview.controller.interactive = false;
        preview.controller.register("candle", { ...preview.controller.entries.get("candle"), layout: current.state.toppingLayout.candle });
        preview.controller.reconcile();
        assert.ok(getTransformedToppingBox(previewCandle.object, preview.parent).min.distanceTo(getTransformedToppingBox(topping.object, parent).min) < 1e-8);
    }
});

test("inverted number candles freeze at the latest accepted coordinates through pointer moves, frames and release", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) for (const ancestorRotation of [0, 1.2]) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount, round, candleMode: "number" });
        if (ancestorRotation) {
            const ancestor = new Group();
            ancestor.position.set(-3, 0.6, 2);
            ancestor.rotation.y = ancestorRotation;
            ancestor.add(parent);
        }
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const forwardRotation = parent.rotation.y;
        const saved = current.state.toppingLayout.candle;
        const radius = 2 - (tierCount - 1) * 0.5;
        const front = new Vector3(0, tierCount - 1, radius + 0.25);
        start("candle", 7);
        pointerMove(front, 7);
        const lastValid = controller.entries.get("candle").position.clone();
        const frozenMatrix = topping.object.matrix.toArray();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - (tierCount - 1) - TOPPING_SURFACE_OFFSET) < 1e-6);
        for (const rotation of [3 * Math.PI / 4, Math.PI, 5 * Math.PI / 4, -Math.PI, 3 * Math.PI]) {
            parent.rotation.y = forwardRotation + rotation;
            for (const target of [front.clone().setX(0.3), front.clone().setZ(-radius - 0.25), new Vector3(-0.3, tierCount, 0.2)]) {
                pointerMove(target, 7);
                assert.deepEqual(controller.entries.get("candle").position.toArray(), lastValid.toArray(), "inverted pointer destinations must be ignored entirely");
                for (const delta of [1 / 240, 1 / 60, 0.2]) {
                    controller.update(delta);
                    assert.deepEqual(controller.entries.get("candle").position.toArray(), lastValid.toArray(), "animation frames must not shift or raise the frozen candle");
                    assert.deepEqual(topping.object.matrix.toArray(), frozenMatrix);
                }
                assert.equal(current.state.toppingLayout.candle, saved);
            }
        }
        parent.rotation.y = forwardRotation + 2 * Math.PI;
        const resumedTarget = front.clone().setX(0.25);
        pointerMove(resumedTarget, 7);
        const resumed = controller.entries.get("candle").position.clone();
        assert.ok(resumed.x > lastValid.x + 0.2, "a valid forward angle must immediately re-enable dragging");
        assert.equal(controller.isDragging.current, true);
        assert.equal(current.state.toppingLayout.candle, saved);
        parent.rotation.y = forwardRotation + Math.PI;
        pointerMove(front.clone().setX(-0.25), 7);
        assert.deepEqual(controller.entries.get("candle").position.toArray(), resumed.toArray(), "a second inversion must use the newly saved location");
        pointerUp(new Vector3(0, tierCount, 0), 7);
        controller.reconcile();
        assert.ok(controller.entries.get("candle").position.distanceTo(resumed) < 1e-8, "release while inverted must preserve the saved placement");
        assert.deepEqual(current.state.toppingLayout.candle.position, controller.entries.get("candle").position.toArray());
    }
});

test("a drag that begins inverted keeps its initial location and leaves single candles and other toppings unchanged", () => {
    for (const [id, mode, frozen] of [["candle", "number", true], ["candle", "gold", false], ["nuts", "gold", false], ["cherry-0", "gold", false], ["chocolate-0", "number", false]]) {
        const { controller, register, start, pointerMove, parent, camera } = setup({ tierCount: 3, candleMode: mode });
        register(id, 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        parent.rotation.y += Math.PI;
        const initial = controller.entries.get(id).position.clone();
        start(id, 7);
        pointerMove(new Vector3(0.3, 3, 0.25), 7);
        if (frozen) assert.deepEqual(controller.entries.get(id).position.toArray(), initial.toArray());
        else assert.ok(controller.entries.get(id).position.distanceTo(initial) > 0.1);
        controller.cancel();
        assert.ok(controller.entries.get(id).position.distanceTo(initial) < 1e-8);
    }
});

test("single candles remain on the top tier and warn once per held drag from any camera angle", () => {
    for (const round of [false, true]) for (const angle of Array.from({ length: 8 }, (_, index) => index * Math.PI / 4)) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera, ledgeRestrictions } = setup({ tierCount: 3, round });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        const front = new Vector3(Math.cos(angle), 0, Math.sin(angle));
        camera.position.copy(parent.localToWorld(front.clone().multiplyScalar(2).setY(20)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        start("candle", 7);
        let target;
        for (const [depth, height] of [[-0.3, 3], [-1.3, 2], [-8, 2], [-0.3, 3]]) {
            target = new Vector3(0, height, depth);
            pointerMove(target, 7);
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
                assert.ok((round ? Math.hypot(x, z) : Math.max(Math.abs(x), Math.abs(z))) <= 1 - TOPPING_PLACEMENT_GAP + 1e-7, "the entire candle must stay inside the top tier on a rear drag");
            }
            assert.ok(controller.entries.get("candle").position.z < -0.15, "rear top-tier placements remain accessible");
            assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
            assert.equal(controller.isDragging.current, true);
        }
        assert.deepEqual(ledgeRestrictions, ["candle"]);
        pointerMove(new Vector3(0, 3, 0.4), 7);
        assert.ok(controller.entries.get("candle").position.z > 0.39);
        pointerUp(target, 7);
        assert.deepEqual(ledgeRestrictions, ["candle"], "release must not repeat the held-drag warning");
        const position = controller.entries.get("candle").position.clone();
        controller.reconcile();
        assert.ok(controller.entries.get("candle").position.distanceTo(position) < 1e-8);
    }
});

test("single-candle top-tier limits contain the full selected size with an offset pivot", () => {
    for (const round of [false, true]) for (const tierCount of [1, 2, 3, 4]) for (const size of [0.8, 1, 1.2]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount, round, combined: true });
        const topping = register("candle", 0, 0, 0.14 * size, 0.10 * size);
        topping.mesh.geometry.translate(0.12, 0, -0.08);
        topping.object.visible = true;
        const box = getTransformedToppingBox(topping.object, parent).translate(topping.anchor.clone().negate());
        controller.register("candle", { ...controller.entries.get("candle"), box, messageBox: box });
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const originalSize = getTransformedToppingBox(topping.object, parent).getSize(new Vector3());
        const radius = 2 - (tierCount - 1) * 0.5;
        start("candle", 7);
        let target;
        for (const [x, z] of [[0, -8], [-8, -8], [8, -8], [-8, -0.2], [8, -0.2], [-0.2, -8], [0.2, -8], [0.4, -0.4]]) {
            target = new Vector3(x, tierCount, z);
            pointerMove(target, 7);
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - tierCount - 0.001) < 1e-6);
            assert.ok(bounds.getSize(new Vector3()).distanceTo(originalSize) < 1e-8);
            for (const cx of [bounds.min.x, bounds.max.x]) for (const cz of [bounds.min.z, bounds.max.z]) {
                assert.ok((round ? Math.hypot(cx, cz) : Math.max(Math.abs(cx), Math.abs(cz))) <= radius - TOPPING_PLACEMENT_GAP + 1e-7, "no physical edge of the candle may overflow the tier");
            }
        }
        pointerUp(target, 7);
        const position = controller.entries.get("candle").position.clone();
        controller.reconcile();
        assert.ok(controller.entries.get("candle").position.distanceTo(position) < 1e-8);
    }
});

test("number candles freeze when the camera sees their back and unlock when the tier faces the camera again", () => {
    for (const round of [false, true]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera, ledgeRestrictions } = setup({ tierCount: 3, round, candleMode: "number" });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        const lookFrom = (z) => {
            camera.position.copy(parent.localToWorld(new Vector3(0, 20, z)));
            camera.lookAt(parent.localToWorld(new Vector3()));
            camera.updateWorldMatrix(true, false);
        };
        lookFrom(2);
        const forwardRotation = parent.rotation.y;
        start("candle", 7);
        pointerMove(new Vector3(0, 2, 1.3), 7);
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 2.001) < 1e-6);
        const lastValid = controller.entries.get("candle").position.clone();
        lookFrom(-2);
        pointerMove(new Vector3(0, 2, 1.3), 7);
        controller.update(1 / 60);
        assert.deepEqual(controller.entries.get("candle").position.toArray(), lastValid.toArray(), "inversion must preserve the last location instead of jumping onto the top rim");
        assert.deepEqual(ledgeRestrictions, []);
        pointerMove(new Vector3(0, 2, -1.3), 7);
        assert.deepEqual(controller.entries.get("candle").position.toArray(), lastValid.toArray(), "changing the pointer destination must not unlock an inverted number candle");
        parent.rotation.y = forwardRotation + Math.PI;
        const target = new Vector3(0.25, 2, 1.3);
        pointerMove(target, 7);
        assert.ok(controller.entries.get("candle").position.x > 0.2, "turning the tier forward must unlock dragging");
        pointerUp(target, 7);
        controller.reconcile();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 2.001) < 1e-6);
    }
});

test("single-candle hidden ledge warning probes preserve rear rim placement and locked height", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount, round, combined: true });
        const topping = register("candle", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        start("candle", 7);
        let pointerRaycasts = 0;
        current.scene.traverse((mesh) => {
            if (!mesh.isMesh) return;
            const raycast = mesh.raycast;
            mesh.raycast = function (raycaster, hits) {
                // Vertical rays seat a topping; angled camera rays choose a tier.
                if (Math.abs(raycaster.ray.direction.y) < 1 - 1e-10) pointerRaycasts++;
                return raycast.call(this, raycaster, hits);
            };
        });
        const topRadius = 2 - (tierCount - 1) * 0.5;
        const back = new Vector3(0, tierCount - 1, -topRadius - 0.3);
        for (let event = 0; event < 4; event++) {
            pointerMove(back, 7);
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.equal(pointerRaycasts, event + 1, "a hidden lower ledge is probed only for warning classification");
            assert.ok(Math.abs(bounds.min.y - tierCount - 0.001) < 1e-6);
            assert.ok(bounds.min.z >= -topRadius + TOPPING_PLACEMENT_GAP - 1e-7);
            assert.equal(controller.isDragging.current, true);
        }
        pointerMove(new Vector3(0, tierCount - 1, topRadius + 0.3), 7);
        assert.equal(pointerRaycasts, 5, "front movement raycasts once to select its visible tier");
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - tierCount - 0.001) < 1e-6);
        const count = pointerRaycasts;
        pointerUp(back, 7);
        assert.equal(pointerRaycasts, count + 1, "a release probe must not place the candle on the lower ledge");
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - tierCount - 0.001) < 1e-6);
    }
});

test("single-candle drop adjustment clears front ledge text while remaining on the top tier", () => {
    const { controller, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount: 3 });
    const topping = register("candle", 0, 0, 0.14, 0.10);
    controller.reconcile();
    camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
    camera.lookAt(parent.localToWorld(new Vector3()));
    camera.updateWorldMatrix(true, false);
    controller.setMessageFootprint(new Box3(new Vector3(-0.8, 0, 0.6), new Vector3(0.8, 0.2, 2)), new Vector3());
    start("candle", 7);
    const target = new Vector3(0, 2, 1.3);
    pointerMove(target, 7);
    assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 3.001) < 1e-6);
    pointerUp(target, 7);
    const bounds = getTransformedToppingBox(topping.object, parent);
    const position = controller.entries.get("candle").position.clone();
    assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
    assert.equal(controller.valid(controller.entries.get("candle"), position), true);
    controller.reconcile();
    assert.ok(controller.entries.get("candle").position.distanceTo(position) < 1e-8);
});

test("single candles keep their top-tier height if a ray misses the upper cap near the back", () => {
    const { controller, current, register, start, pointerMove, parent, camera } = setup({ tierCount: 3 });
    const topping = register("candle", 0, 0, 0.14, 0.10);
    controller.reconcile();
    camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
    camera.lookAt(parent.localToWorld(new Vector3()));
    camera.updateWorldMatrix(true, false);
    start("candle");
    current.scene.children.at(-1).raycast = () => {};
    pointerMove(new Vector3(0, 2, -1.3));
    const bounds = getTransformedToppingBox(topping.object, parent);
    assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
    assert.ok(bounds.min.z >= -1 + TOPPING_PLACEMENT_GAP - 1e-7);
    controller.cancel();
});

test("rendered number candles retain lower-ledge dragging when the shared mode is stale", () => {
    const { controller, current, register, start, pointerMove, parent, ledgeRestrictions } = setup({ tierCount: 3 });
    const topping = register("candle", 0, 0, 0.14, 0.10);
    current.state.toppingLayout.candle.mode = "number";
    controller.reconcile();
    start("candle");
    pointerMove(new Vector3(-1.3, 2, 1.3));
    const bounds = getTransformedToppingBox(topping.object, parent);
    assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6);
    assert.deepEqual(ledgeRestrictions, []);
    controller.end();
});

test("switching from Single to Number mode enables front ledges while keeping the back at the top rim", () => {
    const { controller, current, register, start, pointerMove, parent, camera } = setup({ tierCount: 3 });
    const topping = register("candle", 0, 0, 0.14, 0.10);
    controller.reconcile();
    camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
    camera.lookAt(parent.localToWorld(new Vector3()));
    camera.updateWorldMatrix(true, false);
    start("candle", 7);
    pointerMove(new Vector3(0, 2, -1.3), 7);
    assert.ok(controller.entries.get("candle").position.z < -0.8);
    controller.end();
    current.state.toppingLayout.candle.mode = "number";
    controller.reconcile();
    start("candle", 8);
    pointerMove(new Vector3(0, 2, 1.3), 8);
    const bounds = getTransformedToppingBox(topping.object, parent);
    assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6);
    assert.ok(bounds.getCenter(new Vector3()).z > 1.2);
    pointerMove(new Vector3(0, 2, -1.3), 8);
    assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 3.001) < 1e-6);
    controller.end();
});

test("pointer movement immediately clamps restricted toppings to the top and warns once per drag", () => {
    for (const round of [false, true]) for (const id of ["chocolate-0", "balls"]) {
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
        assert.deepEqual(ledgeRestrictions, id === "candle" ? [] : [id]);
        for (let event = 0; event < 12; event++) pointerMove(lower);
        drag(id, lower);
        assert.deepEqual(ledgeRestrictions, id === "candle" ? [] : [id], "native and package drag events must share the warning guard");
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

test("changing a number candle to a single candle confines its saved placement to the top tier", () => {
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

test("cherries drop to front ledges and freeze at the visible half boundary from every camera angle", () => {
    for (const round of [false, true]) for (const tierCount of [2, 3, 4]) for (let quadrant = 0; quadrant < 8; quadrant++) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount, round, combined: true });
        const topping = register("cherry-0", 0, 0, 0.14, 0.10);
        controller.reconcile();
        const angle = quadrant * Math.PI / 4;
        const front = new Vector3(Math.cos(angle), 0, Math.sin(angle));
        const tangent = new Vector3(-front.z, 0, front.x);
        camera.position.copy(parent.localToWorld(front.clone().multiplyScalar(2).setY(20)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        let radius, height;
        let commits = 0;
        const save = current.state.setToppingPosition;
        current.state.setToppingPosition = (...args) => { commits++; save(...args); };
        start("cherry-0", 7);
        for (let tier = tierCount - 2; tier >= 0; tier--) {
            height = tier + 1;
            radius = (2 - tier * 0.5 - 0.25) / (round ? 1 : Math.max(Math.abs(tangent.x), Math.abs(tangent.z)));
            pointerMove(tangent.clone().multiplyScalar(radius).addScaledVector(front, 0.15).setY(height), 7);
            assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - height - TOPPING_SURFACE_OFFSET) < 1e-6, "every visible lower tier must seat the cherry flush");
        }
        let last;
        for (const pull of [0.1, 0.5, 3]) {
            last = tangent.clone().multiplyScalar(radius).addScaledVector(front, -pull).setY(height);
            pointerMove(last, 7);
            for (let frame = 0; frame < 4; frame++) controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            const depths = [bounds.min.x, bounds.max.x].flatMap(x => [bounds.min.z, bounds.max.z].map(z => x * front.x + z * front.z));
            assert.ok(Math.min(...depths) >= TOPPING_PLACEMENT_GAP - 1e-7, "the full cherry footprint must stop at the visible-half boundary");
            assert.ok(Math.min(...depths) < TOPPING_PLACEMENT_GAP + 0.003, "continued backward pulls must freeze at the boundary");
            assert.ok(Math.abs(bounds.min.y - height - TOPPING_SURFACE_OFFSET) < 1e-6, "a blocked back pull must keep its current ledge height");
            assert.equal(controller.valid(controller.entries.get("cherry-0"), controller.entries.get("cherry-0").position), true);
            assert.equal(commits, 0);
        }
        const before = getTransformedToppingBox(topping.object, parent).getCenter(new Vector3()).dot(tangent);
        last.addScaledVector(tangent, 0.1);
        pointerMove(last, 7);
        assert.ok(getTransformedToppingBox(topping.object, parent).getCenter(new Vector3()).dot(tangent) > before + 0.05, "sideways motion must remain available along the boundary");
        pointerUp(last, 7);
        controller.reconcile();
        const bounds = getTransformedToppingBox(topping.object, parent);
        for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) assert.ok(x * front.x + z * front.z >= TOPPING_PLACEMENT_GAP - 1e-7);
        assert.ok(Math.abs(bounds.min.y - height - TOPPING_SURFACE_OFFSET) < 1e-6);
        assert.equal(commits, 1);
    }
});

test("cherries move through all 360 degrees of the top tier without the lower-ledge halfway clamp", () => {
    for (const round of [false, true]) for (const tierCount of [1, 2, 3, 4]) {
        const { controller, current, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount, round, combined: true });
        const topping = register("cherry-0", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const saved = current.state.cherryLayouts[0];
        const radius = 2 - (tierCount - 1) * 0.5;
        start("cherry-0", 7);
        for (let step = 0; step < 36; step++) {
            const angle = step * Math.PI / 18;
            const distance = (radius - 0.02) / (round ? 1 : Math.max(Math.abs(Math.cos(angle)), Math.abs(Math.sin(angle))));
            pointerMove(new Vector3(distance * Math.cos(angle), tierCount, distance * Math.sin(angle)), 7);
            controller.update(1 / 60);
            const bounds = getTransformedToppingBox(topping.object, parent);
            const center = bounds.getCenter(new Vector3());
            assert.ok(center.x * Math.cos(angle) + center.z * Math.sin(angle) > radius - 0.2, "the cherry must follow the pointer around the full top rim, including the back half");
            assert.ok(Math.abs(bounds.min.y - tierCount - TOPPING_SURFACE_OFFSET) < 1e-6);
            for (const x of [bounds.min.x, bounds.max.x]) for (const z of [bounds.min.z, bounds.max.z]) {
                assert.ok((round ? Math.hypot(x, z) : Math.max(Math.abs(x), Math.abs(z))) <= radius - TOPPING_PLACEMENT_GAP + 1e-7);
            }
            assert.equal(current.state.cherryLayouts[0], saved);
        }
        pointerUp(new Vector3(0, tierCount, -radius + 0.15), 7);
        const position = controller.entries.get("cherry-0").position.clone();
        controller.reconcile();
        assert.ok(position.z < -radius + 0.2);
        assert.ok(controller.entries.get("cherry-0").position.distanceTo(position) < 1e-8);
    }
});

test("cherries can return from a front lower ledge to the back of the top tier and stop at its rear edge", () => {
    for (const round of [false, true]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount: 3, round });
        const topping = register("cherry-0", 0, 0, 0.14, 0.10);
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        start("cherry-0", 7);
        pointerMove(new Vector3(0, 2, 1.3), 7);
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 2.001) < 1e-6);
        pointerMove(new Vector3(0, 3, -0.7), 7);
        let bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
        assert.ok(bounds.getCenter(new Vector3()).z < -0.65, "returning to the top must remove the halfway clamp immediately");
        pointerUp(new Vector3(0, 2, -1.3), 7);
        controller.reconcile();
        bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
        assert.ok(bounds.getCenter(new Vector3()).z < -0.8, "a blocked back-ledge drop must stay at the rear top rim, not jump to the halfway line");
        assert.ok(bounds.min.z >= -1 + TOPPING_PLACEMENT_GAP - 1e-7);
    }
});

test("a cherry at the back of the top tier preserves its offset footprint and drops clear of text", () => {
    for (const round of [false, true]) {
        const { controller, register, start, pointerMove, pointerUp, parent, camera } = setup({ tierCount: 3, round });
        const topping = register("cherry-0", 0, -0.3, 0.14, 0.10);
        topping.mesh.geometry.translate(0.12, 0, 0.08);
        topping.object.visible = true;
        const box = getTransformedToppingBox(topping.object, parent).translate(topping.anchor.clone().negate());
        controller.register("cherry-0", { ...controller.entries.get("cherry-0"), box, messageBox: box });
        controller.reconcile();
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        start("cherry-0", 7);
        pointerMove(new Vector3(0.2, 3, -0.8), 7);
        let bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(bounds.min.z < -0.7, "the offset mesh must remain draggable on the back half of the top tier");
        assert.ok(Math.abs(controller.entries.get("cherry-0").position.x - 0.2) < 0.001);
        assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
        controller.setMessageFootprint(new Box3(new Vector3(-0.4, 0, -1), new Vector3(0.4, 0.2, -0.4)), new Vector3());
        pointerUp(new Vector3(0, 3, -0.8), 7);
        const entry = controller.entries.get("cherry-0");
        assert.equal(controller.valid(entry, entry.position), true);
        controller.reconcile();
        bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(bounds.min.z < -0.4, "top-tier drop adjustment may use the back half while clearing text");
        assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
    }
});

test("placement-board cherry drags share the back-half boundary and cancellation restores their support", () => {
    for (const round of [false, true]) {
        const { controller, current, register, parent, camera } = setup({ tierCount: 3, round });
        const topping = register("cherry-0", 0, 0.2, 0.14, 0.10);
        current.camera = camera;
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 2)));
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        controller.reconcile();
        controller.moveMarker("cherry-0", 81.25, 60);
        controller.end();
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 2.001) < 1e-6);
        controller.moveMarker("cherry-0", 81.25, 0);
        controller.end();
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.z - TOPPING_PLACEMENT_GAP) < 1e-6);
        assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6);
        const original = controller.entries.get("cherry-0").position.clone();
        controller.moveMarker("cherry-0", 18.75, 0);
        controller.cancel();
        controller.reconcile();
        assert.ok(controller.entries.get("cherry-0").position.distanceTo(original) < 1e-8);
    }
});

test("cherry pointer transitions clamp exactly at the upper wall without snapping along the ledge", () => {
    for (const axis of ["x", "z"]) for (const sign of [-1, 1]) {
        const { controller, register, start, pointerMove, parent, camera } = setup({ tierCount: 3, combined: true });
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 0)));
        camera.up.set(0, 0, -1);
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const topping = register("cherry-0", 0, 0, 0.2, 0.2);
        controller.reconcile();
        start("cherry-0");
        const target = new Vector3(0.16, 2, 0.16);
        target[axis] = sign * 1.08;
        pointerMove(target);
        const bounds = getTransformedToppingBox(topping.object, parent);
        const center = bounds.getCenter(new Vector3());
        assert.ok(Math.abs(bounds.min.y - 2.001) < 1e-6, `axis=${axis}, sign=${sign}: ${bounds.min.toArray()} to ${bounds.max.toArray()}`);
        assert.ok(Math.abs(center[axis] - sign * (1.1 + TOPPING_PLACEMENT_GAP)) < 0.003);
        assert.ok(Math.abs(center[axis === "x" ? "z" : "x"] - 0.16) < 0.003, "clamping at a wall must preserve tangential pointer movement");
        controller.end();
    }
});

test("settled cherry pointer drags do not repeat surface raycasts between pointer events", () => {
    for (const round of [false, true]) {
        const { controller, current, store, register, start, pointerMove, pointerUp, parent } = setup({ tierCount: 3, round, combined: true });
        const topping = register("cherry-0", 0, 0, 0.2, 0.2);
        controller.reconcile();
        const saved = current.state.cherryLayouts[0];
        let raycasts = 0;
        current.scene.traverse((mesh) => {
            if (!mesh.isMesh) return;
            const raycast = mesh.raycast;
            mesh.raycast = function (...args) { raycasts++; return raycast.apply(this, args); };
        });
        let commits = 0;
        let publishes = 0;
        const save = current.state.setToppingPosition;
        current.state.setToppingPosition = (...args) => { commits++; save(...args); };
        store.publish = () => publishes++;
        start("cherry-0", 7);
        for (const target of [new Vector3(-1.25, 2, 0), new Vector3(-1.75, 1, 0), new Vector3(0, 3, 0)]) {
            pointerMove(target, 7);
            const count = raycasts;
            assert.ok(count > 0);
            assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - target.y - 0.001) < 1e-6);
            for (let frame = 0; frame < 15; frame++) controller.update(1 / 60);
            assert.equal(raycasts, count, "a stationary pointer must not repeat cherry raycasts every render frame");
            assert.equal(current.state.cherryLayouts[0], saved);
            assert.equal(commits, 0);
            assert.equal(publishes, 0);
        }
        pointerUp(new Vector3(-1.25, 2, 0), 7);
        assert.equal(commits, 1);
        assert.equal(publishes, 1);
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

test("an oversized cherry freezes at the exact tier edge without shrinking or ending the held drag", () => {
    const { controller, current, register, start, pointerMove, pointerUp, parent, cherryFitWarnings } = setup({ tierCount: 3 });
    const topping = register("cherry-0", 0, 0, 0.6, 0.6);
    controller.reconcile();
    const size = getTransformedToppingBox(topping.object, parent).getSize(new Vector3());
    const saved = current.state.cherryLayouts[0];
    start("cherry-0", 7);
    for (const x of [-1.25, -1.35, -1.4, -1.25]) {
        pointerMove(new Vector3(x, 2, 0), 7);
        const bounds = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(bounds.min.y - 3.001) < 1e-6);
        assert.ok(Math.abs(bounds.min.x - (-1 + TOPPING_PLACEMENT_GAP)) < 1e-7, "the cherry must reach exact boundary contact instead of returning to its start");
        assert.ok(bounds.getSize(new Vector3()).distanceTo(size) < 1e-8);
        assert.equal(topping.object.scale.x, 1);
        assert.equal(controller.isDragging.current, true);
        assert.equal(current.state.cherryLayouts[0], saved);
    }
    assert.deepEqual(cherryFitWarnings, ["cherry-0"], "continued pressure must warn only once per held drag");
    pointerMove(new Vector3(-0.4, 3, 0.4), 7);
    assert.ok(Math.abs(controller.entries.get("cherry-0").position.x + 0.4) < 0.003, "dragging into clear visible space resumes immediately");
    pointerUp(new Vector3(-1.25, 2, 0), 7);
    const frozen = controller.entries.get("cherry-0").position.clone();
    controller.reconcile();
    assert.ok(controller.entries.get("cherry-0").position.distanceTo(frozen) < 1e-8);
    assert.ok(getTransformedToppingBox(topping.object, parent).getSize(new Vector3()).distanceTo(size) < 1e-8);
});

test("oversized legacy cherry footprints freeze at the shipped two-tier ledge boundaries", () => {
    // Defensive fit validation still bounds unexpectedly large geometry.
    for (const round of [false, true]) for (const size of [0.8, 1, 1.2]) {
        const radii = round ? [0.831, 0.702] : [0.838, 0.751];
        const heights = [1.156, 1.806];
        const { controller, current, store, register, start, pointerMove, pointerUp, parent, camera, cherryFitWarnings } = setup({ tierCount: 2, round, combined: true, tierRadii: radii, tierHeights: heights });
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 0)));
        camera.up.set(0, 0, -1);
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const topping = register("cherry-0", 0, 0, 0.2101 * size, 0.2013 * size);
        controller.reconcile();
        const saved = current.state.cherryLayouts[0];
        const originalSize = getTransformedToppingBox(topping.object, parent).getSize(new Vector3());
        let commits = 0;
        let publishes = 0;
        const save = current.state.setToppingPosition;
        current.state.setToppingPosition = (...args) => { commits++; save(...args); };
        store.publish = () => publishes++;
        start("cherry-0", 7);
        let target;
        for (const angle of [0, Math.PI / 8, Math.PI / 4, Math.PI / 3]) {
            const radius = (radii[0] + radii[1]) / 2 / (round ? 1 : Math.max(Math.cos(angle), Math.sin(angle)));
            target = new Vector3(-Math.cos(angle) * radius, heights[0], Math.sin(angle) * radius);
            pointerMove(target, 7);
            const entry = controller.entries.get("cherry-0");
            const bounds = getTransformedToppingBox(topping.object, parent);
            assert.ok(Math.abs(bounds.min.y - heights[1] - 0.001) < 1e-6);
            assert.ok(bounds.getSize(new Vector3()).distanceTo(originalSize) < 1e-8);
            assert.ok(controller.valid(entry, entry.position));
            const corners = [bounds.min.x, bounds.max.x].flatMap((x) => [bounds.min.z, bounds.max.z].map((z) => round ? Math.hypot(x, z) : Math.max(Math.abs(x), Math.abs(z))));
            assert.ok(Math.abs(Math.max(...corners) - radii[1] + TOPPING_PLACEMENT_GAP) < 0.003, "the cherry freezes at the outline minus its full footprint");
            assert.equal(topping.object.scale.x, 1);
            assert.equal(controller.isDragging.current, true);
            for (let frame = 0; frame < 5; frame++) controller.update(1 / 60);
            assert.equal(current.state.cherryLayouts[0], saved);
            assert.equal(commits, 0);
            assert.equal(publishes, 0);
        }
        assert.deepEqual(cherryFitWarnings, ["cherry-0"]);
        pointerUp(target, 7);
        assert.equal(commits, 1);
        assert.equal(publishes, 1);
        const position = controller.entries.get("cherry-0").position.clone();
        topping.object.matrix.identity();
        const box = getTransformedToppingBox(topping.object, parent).translate(topping.anchor.clone().negate());
        controller.register("cherry-0", { ...controller.entries.get("cherry-0"), box, messageBox: box, layout: current.state.cherryLayouts[0] });
        controller.reconcile();
        assert.ok(controller.entries.get("cherry-0").position.distanceTo(position) < 1e-8);
        assert.equal(topping.object.scale.x, 1);
        assert.equal(commits, 1);
    }
});

test("an impossible lower ledge freezes a cherry on its current middle tier and allows another valid tier", () => {
    for (const round of [false, true]) {
        const { controller, register, start, pointerMove, parent, camera, cherryFitWarnings } = setup({ tierCount: 3, round, tierRadii: [1.6, 1.5, 1] });
        camera.position.copy(parent.localToWorld(new Vector3(0, 20, 0)));
        camera.up.set(0, 0, -1);
        camera.lookAt(parent.localToWorld(new Vector3()));
        camera.updateWorldMatrix(true, false);
        const topping = register("cherry-0", 0, 0, 0.2, 0.2);
        controller.reconcile();
        start("cherry-0", 7);
        pointerMove(new Vector3(-1.3, 2, 0), 7);
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 2.001) < 1e-6);
        assert.equal(cherryFitWarnings.length, 0);
        pointerMove(new Vector3(-1.595, 1, 0), 7);
        const frozen = getTransformedToppingBox(topping.object, parent);
        assert.ok(Math.abs(frozen.min.y - 2.001) < 1e-6, "do not teleport the cherry back to the top tier");
        assert.ok(Math.abs(frozen.min.x - (-1.5 + TOPPING_PLACEMENT_GAP)) < 0.005);
        assert.deepEqual(cherryFitWarnings, ["cherry-0"]);
        assert.equal(topping.object.scale.x, 1);
        pointerMove(new Vector3(0, 3, 0), 7);
        assert.ok(Math.abs(getTransformedToppingBox(topping.object, parent).min.y - 3.001) < 1e-6);
        assert.equal(controller.isDragging.current, true);
        controller.cancel();
    }
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
