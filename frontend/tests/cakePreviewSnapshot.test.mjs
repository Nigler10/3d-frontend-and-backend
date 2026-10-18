import test from "node:test";
import assert from "node:assert/strict";
import { captureCakePreview, getCakePreviewImage } from "../src/utils/cakePreviewSnapshot.js";

const image = "data:image/png;base64,Y2FrZQ==";

test("finalizing renders the exact scene and camera immediately before capturing the main canvas", () => {
    const calls = [];
    const scene = { name: "custom cake with its current toppings" };
    const camera = { name: "current view" };
    const gl = {
        getContext: () => ({ isContextLost: () => false }),
        render: (actualScene, actualCamera) => calls.push([actualScene, actualCamera]),
        domElement: { toDataURL: (format) => { calls.push(format); return image; } },
    };
    assert.equal(captureCakePreview({ gl, scene, camera }), image);
    assert.deepEqual(calls, [[scene, camera], "image/png"]);
    const saved = JSON.parse(JSON.stringify({ topping_layout: { chocolate: { x: 30, y: 70 }, _preview: { version: 1, image } } }));
    assert.equal(getCakePreviewImage(saved), image);
});

test("blank or lost canvases cannot silently finalize an inaccurate preview", () => {
    const gl = { getContext: () => ({ isContextLost: () => true }), render() { assert.fail("lost context must not render"); } };
    assert.throws(() => captureCakePreview({ gl }), /still loading/);
    gl.getContext = () => ({ isContextLost: () => false });
    gl.render = () => {};
    gl.domElement = { toDataURL: () => "data:," };
    assert.throws(() => captureCakePreview({ gl }), /could not be captured/);
});

test("preview readers support older designs and reject non-snapshot image sources", () => {
    for (const customization of [null, {}, { topping_layout: {} }, { topping_layout: { _preview: { image: "javascript:alert(1)" } } }, { topping_layout: { _preview: { image: "data:image/svg+xml;base64,Y2FrZQ==" } } }]) {
        assert.equal(getCakePreviewImage(customization), null);
    }
});
