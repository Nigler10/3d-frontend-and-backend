import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";

const source = readFileSync(new URL("../src/components/ToppingDragControls.jsx", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace(/^export /gm, "");
const { code } = await transformWithOxc(source, "ToppingDragControls.jsx", { jsx: { runtime: "classic" } });

function mount(readOnly = false, useDocument = false, state = {}) {
    const canvas = new EventTarget();
    if (useDocument) canvas.ownerDocument = new EventTarget();
    const camera = {};
    const store = {};
    const moves = [];
    const releases = [];
    const warnings = [];
    const errors = [];
    const cleanup = [];
    let options;
    const controller = { pointerMove: (...args) => moves.push(args), pointerUp: (...args) => releases.push(args), reconcile() {}, end() {} };
    const { useToppingDragPlacement } = runInNewContext(`${code}\n;({ useToppingDragPlacement });`, {
        createContext: () => ({}), useContext: () => store, useRef: () => ({ current: null }),
        useState: (initialize) => [initialize()], useFrame() {}, useLayoutEffect() {},
        useEffect: (effect) => { const dispose = effect(); if (dispose) cleanup.push(dispose); },
        useThree: () => ({ camera, gl: { domElement: canvas }, invalidate() {} }),
        createToppingDragController: (args) => { options = args; return controller; },
        toast: { warn: (message, settings) => warnings.push({ message, ...settings }), error: (message, settings) => errors.push({ message, ...settings }) },
    });
    useToppingDragPlacement({ scene: {}, cakeGroupRef: {}, controlsRef: {}, state, readOnly });
    return { canvas, camera, options, moves, releases, warnings, errors, unmount: () => cleanup.forEach((dispose) => dispose()) };
}

test("the active canvas forwards pointermove events immediately and removes its listener on unmount", () => {
    const view = mount();
    const event = new Event("pointermove");
    view.canvas.dispatchEvent(event);
    assert.equal(view.moves.length, 1);
    assert.equal(view.moves[0][0], event);
    assert.equal(view.moves[0][1], view.camera);
    assert.equal(view.moves[0][2], view.canvas);
    view.unmount();
    view.canvas.dispatchEvent(new Event("pointermove"));
    assert.equal(view.moves.length, 1);
});

test("single-candle visibility and lower-ledge restrictions use stable warning toast IDs", () => {
    const view = mount();
    for (const id of ["chocolate-0", "balls", "candle"]) view.options.onLowerLedgeRestricted(id);
    assert.equal(view.warnings.length, 3);
    assert.equal(new Set(view.warnings.slice(0, 2).map((warning) => warning.toastId)).size, 1);
    assert.equal(typeof view.warnings[0].toastId, "string");
    assert.ok(view.warnings[0].toastId.length > 0);
    assert.match(view.warnings[0].message, /Chocolates and balls must stay on the top tier/);
    assert.equal(view.warnings[2].message, "Single candle must stay on the top tier. Number candles can only use lower ledges facing the camera");
    assert.equal(view.warnings[2].toastId, "candle-tier-restriction");
    view.options.onLowerLedgeRestricted("candle");
    assert.equal(view.warnings[3].toastId, view.warnings[2].toastId);
    view.unmount();
});

test("the active canvas forwards pointerup and removes its release listener on unmount", () => {
    const view = mount();
    const event = new Event("pointerup");
    view.canvas.dispatchEvent(event);
    assert.equal(view.releases.length, 1);
    assert.equal(view.releases[0][0], event);
    assert.equal(view.releases[0][1], view.camera);
    assert.equal(view.releases[0][2], view.canvas);
    view.unmount();
    view.canvas.dispatchEvent(new Event("pointerup"));
    assert.equal(view.releases.length, 1);
});

test("a cherry that cannot fit uses toast.error with the requested message and stable toastId", () => {
    const view = mount();
    view.options.onCherryFitRejected("cherry-0");
    assert.deepEqual(view.errors, [{
        message: "This topping does not fit on this lower ledge. Please place it on another tier.",
        toastId: "cherry-fit-warning",
    }]);
    assert.equal(view.warnings.length, 0);
    view.unmount();
});

test("a rejected number-candle resize sets the toggle OFF and emits the exact ledge-space toast", () => {
    const toggles = [], placements = [];
    const view = mount(false, false, {
        setCandle: (value) => toggles.push(value),
        setToppingPosition: (...args) => placements.push(args),
    });
    view.options.onNumberCandleResizeRejected();
    assert.deepEqual(toggles, [false]);
    assert.deepEqual(placements, [["candle", 50, 50, null]], "failed coordinates must be cleared so the candle can be enabled again");
    assert.deepEqual(view.errors, [{ message: "No more space in these ledge.", toastId: "number-candle-ledge-space" }]);
    assert.deepEqual(view.warnings, []);
    view.unmount();
});

test("a rejected number-candle size restores Small at the saved position without turning its toggle OFF", () => {
    const toggles = [], sizes = [], placements = [];
    const view = mount(false, false, {
        setCandle: (value) => toggles.push(value),
        setToppingSize: (...args) => sizes.push(args),
        setToppingPosition: (...args) => placements.push(args),
    });
    const layout = { x: 50, y: 81, size: "medium", position: [0, 3.001, 0.75],
        relativePlacement: { angle: Math.PI / 2, normalizedRadius: 0.94, ledgeIndex: 1, tierCount: 4, form: 1 } };
    view.options.onNumberCandleSizeRejected(layout);
    assert.deepEqual(sizes, [["candle", "small"]]);
    assert.deepEqual(placements, [["candle", layout.x, layout.y, layout.position, layout.relativePlacement]]);
    assert.deepEqual(toggles, [], "a candle-size warning must leave the toggle ON");
    assert.deepEqual(view.errors, [{ message: "Choose Small to fit the candle on this ledge.", toastId: "number-candle-size-fit" }]);
    assert.deepEqual(view.warnings, []);
    view.unmount();
});

test("document pointer events keep a drag moving and release it outside the canvas", () => {
    const view = mount(false, true);
    view.canvas.ownerDocument.dispatchEvent(new Event("pointermove"));
    view.canvas.ownerDocument.dispatchEvent(new Event("pointerup"));
    assert.equal(view.moves.length, 1);
    assert.equal(view.releases.length, 1);
    assert.equal(view.moves[0][2], view.canvas);
    assert.equal(view.releases[0][2], view.canvas);
    view.unmount();
    view.canvas.ownerDocument.dispatchEvent(new Event("pointermove"));
    view.canvas.ownerDocument.dispatchEvent(new Event("pointerup"));
    assert.equal(view.moves.length, 1);
    assert.equal(view.releases.length, 1);
});

test("the 3D topping group starts a native pointer drag without a React draggable wrapper", () => {
    const camera = {};
    const canvas = {};
    const starts = [];
    const controller = { enabled: true, interactive: true, begin: () => true, startPointer: (...args) => starts.push(args) };
    const { DraggableCakeTopping } = runInNewContext(`${code}\n;({ DraggableCakeTopping });`, {
        createContext: () => ({}), useRef: () => ({ current: null }), useLayoutEffect() {},
        useThree: () => ({ camera, gl: { domElement: canvas } }),
        React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    });
    const rendered = DraggableCakeTopping({ id: "candle", controller, anchor: [0, 1, 0], layout: {}, children: "mesh" });
    assert.equal(rendered.type, "group");
    assert.equal(rendered.props.matrixAutoUpdate, false);
    const event = { button: 0, isPrimary: true, pointerId: 7, clientX: 150, clientY: 200, stopPropagation() {} };
    rendered.props.onPointerDown(event);
    assert.equal(starts.length, 1);
    assert.equal(starts[0][0], "candle");
    assert.equal(starts[0][1], null);
    assert.equal(starts[0][2], camera);
    assert.equal(starts[0][3], canvas);
    assert.equal(starts[0][4].x, 150);
    assert.equal(starts[0][4].y, 200);
    assert.equal(starts[0][4].pointerId, 7);
    rendered.props.onPointerDown({ ...event, button: 2 });
    rendered.props.onPointerDown({ ...event, isPrimary: false });
    assert.equal(starts.length, 1);
});

test("drag-indicator coordinates update its DOM ref without notifying React during pointer movement", () => {
    let store;
    const indicator = { style: {} };
    const effects = [];
    const { ToppingDragProvider, ToppingDragIndicator } = runInNewContext(`${code}\n;({ ToppingDragProvider, ToppingDragIndicator });`, {
        HandGrab() {},
        React: { createElement: (type, props, ...children) => ({ type, props, children }) },
        createContext: () => ({ Provider() {} }), useContext: () => store,
        useState: (initialize) => { store = initialize(); return [store]; },
        useRef: () => ({ current: indicator }),
        useSyncExternalStore: (_, snapshot) => snapshot(),
        useLayoutEffect: (effect) => effects.push(effect),
    });
    ToppingDragProvider({ children: null });
    let notifications = 0;
    const unsubscribe = store.subscribe(() => notifications++);
    store.setDragging(true, { x: 100, y: 200 });
    const activeSnapshot = store.getDragging();
    const rendered = ToppingDragIndicator();
    assert.equal(rendered.props.ref.current, indicator);
    const dispose = effects[0]();
    for (let point = 0; point < 100; point++) {
        store.setDragging(true, { x: 100 + point, y: 200 + point });
        assert.equal(indicator.style.transform, `translate3d(${52 + point}px, ${152 + point}px, 0)`);
        assert.equal(store.getDragging(), activeSnapshot);
    }
    assert.equal(notifications, 1, "React only renders the indicator when drag visibility changes");
    store.setDragging(false);
    assert.equal(notifications, 2);
    dispose();
    indicator.style.transform = "unmounted";
    store.setDragging(true, { x: 500, y: 500 });
    assert.equal(indicator.style.transform, "unmounted");
    unsubscribe();
});

test("read-only previews do not register a drag-monitoring pointermove listener", () => {
    const view = mount(true);
    view.canvas.dispatchEvent(new Event("pointermove"));
    view.canvas.dispatchEvent(new Event("pointerup"));
    assert.equal(view.moves.length, 0);
    assert.equal(view.releases.length, 0);
    view.unmount();
});
