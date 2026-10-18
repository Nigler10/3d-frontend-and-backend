import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { reactDraggable3dCompat } from "../build/reactDraggable3dCompat.js";

const require = createRequire(import.meta.url);
const packagePath = require.resolve("react-draggable-3d");
const source = readFileSync(packagePath, "utf8");
const plugin = reactDraggable3dCompat();

test("React 19 compatibility is scoped to react-draggable-3d and leaves ReactDOM untouched", () => {
    assert.equal(plugin.transform(source, "/other/package.js"), null);
    const { code } = plugin.transform(source, packagePath);
    assert.ok(!code.includes("ReactDOM.findDOMNode("));
    assert.equal(require("react-dom").findDOMNode, undefined);
});

for (const touch of [false, true]) {
    test(`the actual package runs ${touch ? "touch" : "mouse"} start, drag, stop and unmount with nodeRef`, () => {
        const module = { exports: {} };
        runInNewContext(plugin.transform(source, packagePath).code, { module, exports: module.exports, require, console });
        const { DraggableCore } = module.exports;
        class Node {}
        const listeners = new Map();
        const ownerDocument = {
            body: { scrollLeft: 0, scrollTop: 0 }, defaultView: { Node },
            addEventListener: (name, handler) => listeners.set(name, handler),
            removeEventListener: (name) => listeners.delete(name),
        };
        ownerDocument.body.ownerDocument = ownerDocument;
        const canvas = Object.assign(new Node(), { ownerDocument });
        const calls = [];
        const core = new DraggableCore({
            ...DraggableCore.defaultProps,
            nodeRef: { current: canvas }, enableUserSelectHack: false,
            onStart: (_, data) => calls.push(["start", data.deltaX, data.deltaY]),
            onDrag: (_, data) => calls.push(["drag", data.deltaX, data.deltaY]),
            onStop: (_, data) => calls.push(["stop", data.deltaX, data.deltaY]),
        });
        core.setState = (updates) => Object.assign(core.state, updates);
        const event = (type, x, y) => ({
            type, button: 0, target: canvas, clientX: x, clientY: y, preventDefault() {},
            ...(touch ? { targetTouches: [{ identifier: 7, clientX: x, clientY: y }], changedTouches: [{ identifier: 7, clientX: x, clientY: y }] } : {}),
        });
        const start = touch ? "touchstart" : "mousedown";
        const move = touch ? "touchmove" : "mousemove";
        const stop = touch ? "touchend" : "mouseup";
        core[touch ? "onTouchStart" : "onMouseDown"](event(start, 10, 20));
        assert.equal(core.state.dragging, true);
        listeners.get(move)(event(move, 30, 50));
        listeners.get(stop)(event(stop, 35, 55));
        assert.deepEqual(calls, [["start", 0, 0], ["drag", 20, 30], ["stop", 5, 5]]);
        assert.equal(core.state.dragging, false);
        assert.equal(listeners.size, 0);
        core[touch ? "onTouchStart" : "onMouseDown"](event(start, 10, 20));
        core.componentWillUnmount();
        assert.equal(listeners.size, 0);
    });
}
