import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";

const source = readFileSync(new URL("../src/components/ToppingDragControls.jsx", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace(/^export /gm, "");
const { code } = await transformWithOxc(source, "ToppingDragControls.jsx", { jsx: { runtime: "classic" } });

function mount(readOnly = false) {
    const canvas = new EventTarget();
    const camera = {};
    const store = {};
    const moves = [];
    const warnings = [];
    const cleanup = [];
    let options;
    const controller = { pointerMove: (...args) => moves.push(args), reconcile() {}, end() {} };
    const { useToppingDragPlacement } = runInNewContext(`${code}\n;({ useToppingDragPlacement });`, {
        Draggable: { DraggableCore() {} },
        createContext: () => ({}), useContext: () => store, useRef: () => ({ current: null }),
        useState: (initialize) => [initialize()], useFrame() {}, useLayoutEffect() {},
        useEffect: (effect) => { const dispose = effect(); if (dispose) cleanup.push(dispose); },
        useThree: () => ({ camera, gl: { domElement: canvas }, invalidate() {} }),
        createToppingDragController: (args) => { options = args; return controller; },
        toast: { warn: (message, settings) => warnings.push({ message, ...settings }) },
    });
    useToppingDragPlacement({ scene: {}, cakeGroupRef: {}, controlsRef: {}, state: {}, readOnly });
    return { canvas, camera, options, moves, warnings, unmount: () => cleanup.forEach((dispose) => dispose()) };
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

test("lower-ledge restrictions call toast.warn with one static toastId across topping types", () => {
    const view = mount();
    for (const id of ["chocolate-0", "balls", "candle"]) view.options.onLowerLedgeRestricted(id);
    assert.equal(view.warnings.length, 3);
    assert.equal(new Set(view.warnings.map((warning) => warning.toastId)).size, 1);
    assert.equal(typeof view.warnings[0].toastId, "string");
    assert.ok(view.warnings[0].toastId.length > 0);
    assert.match(view.warnings[0].message, /Only cherries and number candles/);
    view.unmount();
});

test("read-only previews do not register a drag-monitoring pointermove listener", () => {
    const view = mount(true);
    view.canvas.dispatchEvent(new Event("pointermove"));
    assert.equal(view.moves.length, 0);
    view.unmount();
});
