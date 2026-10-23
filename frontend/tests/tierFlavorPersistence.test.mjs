import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";
import * as THREE from "three";
import { DEFAULT_CAKE_MESSAGE_LAYOUT, normalizeCakeMessage, normalizeCakeMessageLayout } from "../src/utils/cakeMessage.js";
import { DEFAULT_CHOCOLATE_LAYOUT, hydrateChocolateLayouts, resizeChocolateLayouts } from "../src/utils/chocolateQuantity.js";
import { getChocolateQuaternion, updateChocolateRotation } from "../src/utils/chocolateRotation.js";
import { getGroundedNutY } from "../src/utils/nutPlacement.js";
import { createCakeCustomization } from "../src/utils/cakeCustomization.js";
import * as tierConfig from "../src/components/cake/tierConfig.js";

async function compile(relativePath, names) {
    const source = readFileSync(new URL(relativePath, import.meta.url), "utf8")
        .replace(/^import .+;\r?$/gm, "")
        .replace(/^export /gm, "")
        .replace("import.meta.env.VITE_DJANGO_BASE_URL", "undefined");
    const { code } = await transformWithOxc(source, relativePath, { jsx: { runtime: "classic" } });
    return `${code}\n;({ ${names.join(", ")} });`;
}

const providerCode = await compile("../src/contexts/Customization.jsx", [
    "CustomizationProvider", "CAKE_SIZES", "DEFAULT_FLAVOR", "FLAVOR_VISUALS", "TOPPING_SIZES", "TIER_FLAVOR_LABELS",
]);
const sceneCode = await compile("../src/components/cake/CakeTierScene.jsx", ["CakeTierScene", "TEXTURE_URLS"]);
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
const plain = (value) => JSON.parse(JSON.stringify(value));

function createBuilder(initialState) {
    const slots = [];
    let cursor = 0;
    const exports = runInNewContext(providerCode, {
        React, DEFAULT_CAKE_MESSAGE_LAYOUT, normalizeCakeMessage, normalizeCakeMessageLayout, DEFAULT_CHOCOLATE_LAYOUT, hydrateChocolateLayouts, resizeChocolateLayouts, updateChocolateRotation,
        createContext: () => ({ Provider: "Provider" }),
        useEffect() {},
        useState(initial) {
            const index = cursor++;
            if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
            return [slots[index], (next) => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
        },
    });
    const render = () => {
        cursor = 0;
        return exports.CustomizationProvider({ initialState }).props.value;
    };
    const select = (index) => { render().setSelectedTierIndex(index); return render(); };
    return { ...exports, render, select };
}

test("Tier 1 flavor cascades to every layout and upper-tier overrides survive navigation", () => {
    const builder = createBuilder();
    const state = builder.render();
    for (let index = 0; index < 4; index++) {
        const key = `tier${index + 1}`;
        assert.deepEqual(plain(state.tierFlavors[key]), Array(index + 1).fill("Choco Moist"));
        assert.equal(builder.select(index).selectedTierFlavors, state.tierFlavors[key]);
    }
    builder.select(0).setFlavor((previous) => previous === "Choco Moist" ? "Ube Chiffon" : previous);
    assert.deepEqual(plain(builder.select(1).selectedTierFlavors), ["Ube Chiffon", "Ube Chiffon"]);
    builder.render().setTierLayerFlavor(1, "Vanilla Chiffon");
    assert.equal(builder.select(0).flavor, "Ube Chiffon");
    assert.deepEqual(plain(builder.select(3).selectedTierFlavors), ["Ube Chiffon", "Vanilla Chiffon", "Ube Chiffon", "Ube Chiffon"]);
    builder.render().setTierLayerFlavor(3, "Choco Moist");
    builder.select(0);
    assert.deepEqual(plain(builder.select(3).selectedTierFlavors), ["Ube Chiffon", "Vanilla Chiffon", "Ube Chiffon", "Choco Moist"]);
});

test("both Tier 1 flavor handlers replace earlier overrides and retain the cascade on every model", () => {
    for (const handler of ["setFlavor", "setTierLayerFlavor"]) {
        for (const flavor of ["Vanilla Chiffon", "Ube Chiffon"]) {
            const builder = createBuilder();
            builder.select(3);
            for (let layer = 0; layer < 4; layer++) builder.render().setTierLayerFlavor(layer, "Choco Moist");
            const previous = builder.render();
            const state = builder.select(0);
            if (handler === "setFlavor") state.setFlavor(flavor);
            else state.setTierLayerFlavor(0, flavor);
            const saved = builder.render();
            for (const index of [3, 0, 2, 1, 3]) {
                const current = builder.select(index);
                assert.deepEqual(plain(current.selectedTierFlavors), Array(index + 1).fill(flavor));
                assert.deepEqual(plain(current.selectedTierFlavorOverrides), Array(index + 1).fill(false));
                assert.equal(current.tierFlavors, saved.tierFlavors);
                assert.equal(current.tierFlavorOverrides, saved.tierFlavorOverrides);
                for (const form of [1, 2]) {
                    current.setForm(form);
                    const meshes = cakeMaterials(builder);
                    assert.equal(meshes.length, index + 1);
                    assert.ok(meshes.every((mesh) => mesh.map.includes(`/${current.flavorTextureMap[flavor]}/`)));
                }
            }
            assert.deepEqual(plain(previous.tierFlavors.tier4), Array(4).fill("Choco Moist"));
            assert.deepEqual(plain(previous.tierFlavorOverrides.tier4), Array(4).fill(true));
        }
    }
});

test("manual upper-tab flavor changes affect only the chosen level after a Tier 1 cascade", () => {
    for (const index of [1, 2, 3]) {
        const builder = createBuilder();
        builder.select(0).setFlavor("Vanilla Chiffon");
        builder.select(index).setTierLayerFlavor(index, "Choco Moist");
        builder.render().setTierLayerFlavor(0, "Ube Chiffon");
        const saved = builder.render();
        const expected = Array(4).fill("Vanilla Chiffon");
        expected[0] = "Ube Chiffon";
        expected[index] = "Choco Moist";
        for (const selected of [0, 3, 1, 2, index]) {
            const current = builder.select(selected);
            assert.deepEqual(plain(current.selectedTierFlavors), expected.slice(0, selected + 1));
            assert.equal(current.tierFlavors, saved.tierFlavors);
            assert.equal(current.tierFlavorOverrides, saved.tierFlavorOverrides);
        }
    }
});

test("editing and revisiting every layout preserves its bottom-to-top flavors and other customizations", () => {
    const builder = createBuilder();
    const initial = builder.render();
    initial.setCakeColor(initial.cakeColors[2]);
    initial.setIcingColor(initial.icingColors[2]);
    initial.setInscriptionText("Happy Birthday");
    for (let index = 0; index < 4; index++) {
        builder.select(index);
        for (let layer = 0; layer <= index; layer++) {
            const state = builder.render();
            state.setTierLayerFlavor(layer, state.flavors[(index + layer + 1) % state.flavors.length]);
        }
    }
    const saved = builder.render();
    for (const index of [0, 3, 1, 2, 3, 0, 2, 1]) {
        const state = builder.select(index);
        assert.deepEqual(plain(state.selectedTierFlavors), plain(saved.tierFlavors.tier4.slice(0, index + 1)));
        assert.equal(state.tierFlavors, saved.tierFlavors);
        assert.equal(state.tierFlavorOverrides, saved.tierFlavorOverrides);
        assert.equal(state.cakeColor, saved.cakeColor);
        assert.equal(state.icingColor, saved.icingColor);
        assert.equal(state.inscriptionText, "Happy Birthday");
    }
    builder.select(1).resetTierFlavorOverrides();
    const reset = builder.render();
    assert.deepEqual(plain(reset.selectedTierFlavors), ["Choco Moist", "Choco Moist"]);
    assert.deepEqual(plain(reset.tierFlavors.tier4), ["Choco Moist", "Choco Moist", ...plain(saved.tierFlavors.tier4.slice(2))]);
    assert.deepEqual(plain(reset.tierFlavorOverrides.tier4), [false, false, ...plain(saved.tierFlavorOverrides.tier4.slice(2))]);
});

test("saved layers survive tier count changes and missing layers default to Choco Moist", () => {
    const sizes = createBuilder().CAKE_SIZES;
    for (let index = 0; index < 4; index++) {
        const builder = createBuilder({
            tier: sizes[index].tier, flavor: "Vanilla Chiffon",
            tier_flavors: { "Cake": "Ube Chiffon", "Bottom Tier": "Ube Chiffon", "Top Tier": "Vanilla Chiffon" },
        });
        for (let other = 0; other < 4; other++) {
            const state = builder.select(other);
            const expected = Array(other + 1).fill("Choco Moist");
            expected[0] = "Ube Chiffon";
            if (index > 0 && other >= index) expected[index] = "Vanilla Chiffon";
            assert.deepEqual(plain(state.selectedTierFlavors), expected);
        }
    }
    const legacy = createBuilder({ tier: sizes[3].tier, flavor: "Ube Chiffon" });
    assert.deepEqual(plain(legacy.render().selectedTierFlavors), ["Ube Chiffon", "Choco Moist", "Choco Moist", "Choco Moist"]);
});

function createModel(tierCount) {
    const scene = new THREE.Group();
    // Reverse traversal order and use parent transforms to require world-space sorting.
    for (let layer = tierCount - 1; layer >= 0; layer--) {
        const parent = new THREE.Group();
        parent.position.y = layer * 2;
        for (const shape of ["round", "rectangle"]) {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 1, 2));
            mesh.name = `cake_${shape}_${layer}`;
            parent.add(mesh);
        }
        scene.add(parent);
    }
    return { scene, nodes: {}, materials: {} };
}

function cakeMaterials(builder) {
    const modelIndex = builder.render().selectedTierIndex;
    const model = createModel(modelIndex + 1);
    const { CakeTierScene } = runInNewContext(sceneCode, {
        React, THREE, ...tierConfig, ...builder, getGroundedNutY, getChocolateQuaternion,
        useCustomization: builder.render,
        useMemo: (calculate) => calculate(), useLayoutEffect: (effect) => effect(), useFrame() {},
        useGLTF: () => model,
        useTexture: (urls) => Object.fromEntries(Object.entries(urls).map(([key, url]) => {
            const texture = new THREE.Texture();
            texture.name = url;
            return [key, texture];
        })),
        useToppingDragPlacement: () => ({ isDragging: { current: false } }),
        CakeInscription: "CakeInscription",
    });
    const rendered = CakeTierScene({ selectedTierIndex: modelIndex, cakeGroupRef: { current: null } });
    const result = [];
    rendered.props.children[0].props.object.traverse((mesh) => {
        if (mesh.isMesh && mesh.visible) result.push({
            name: mesh.name, color: mesh.material.color.getHexString(), roughness: mesh.material.roughness,
            ...Object.fromEntries(["map", "normalMap", "roughnessMap", "aoMap"].map((key) => [key, mesh.material[key]?.name])),
        });
    });
    return result.sort((a, b) => a.name.localeCompare(b.name));
}

function saveDesign(builder) {
    const state = builder.render();
    return createCakeCustomization(state, {
        tier: builder.CAKE_SIZES[state.selectedTierIndex],
        labels: builder.TIER_FLAVOR_LABELS[state.selectedTierIndex + 1],
        previewImage: "data:image/png;base64,Y2FrZQ==",
    });
}

test("message position, text size and curve survive tier navigation and saved previews", () => {
    const builder = createBuilder();
    const initial = builder.render();
    initial.setInscriptionText("Happy Birthday Ana!");
    initial.setInscriptionLayout({ x: 65, y: 40, width: 45, curve: -60 });
    initial.setTextSize(150);
    const expected = { x: 65, y: 40, width: 45, curve: -60, textSize: 150 };
    for (const index of [3, 1, 0, 2]) {
        const state = builder.select(index);
        assert.deepEqual(plain(state.inscriptionLayout), expected);
        assert.equal(state.textSize, 150);
        assert.equal(state.inscriptionText, "Happy Birthday Ana!");
    }
    const saved = saveDesign(builder);
    const restored = createBuilder(saved);
    assert.deepEqual(plain(restored.render().inscriptionLayout), expected);
    assert.deepEqual(saveDesign(restored), saved);
    builder.render().setTextSize((previous) => previous + 25);
    assert.equal(builder.render().textSize, 175);
    assert.deepEqual(saved.topping_layout.inscription, expected);
    assert.deepEqual(plain(restored.render().inscriptionLayout), expected);
    assert.deepEqual(plain(builder.render().toppingLayout.cherry), plain(initial.toppingLayout.cherry));
});

test("older saved messages default their text size without moving their position", () => {
    const builder = createBuilder({ topping_layout: { inscription: { x: 72, y: 35, width: 60, curve: 45 } } });
    assert.deepEqual(plain(builder.render().inscriptionLayout), { x: 72, y: 35, width: 60, curve: 45, textSize: 70 });
    builder.render().setTextSize(500);
    assert.equal(builder.render().textSize, 200);
    builder.render().setTextSize(0);
    assert.equal(builder.render().textSize, 50);
    assert.equal(builder.render().inscriptionLayout.x, 72);
    assert.equal(builder.render().inscriptionLayout.y, 35);
});

test("tier tabs retain the same scene component identity for the draggable message", async () => {
    const source = readFileSync(new URL("../src/components/cake/CakeModel.jsx", import.meta.url), "utf8")
        .replace(/^import .+;\r?$/gm, "").replace(/^export default /gm, "").replace(/^export /gm, "");
    const { code } = await transformWithOxc(source, "CakeModel.jsx", { jsx: { runtime: "classic" } });
    const { CakeModel } = runInNewContext(`${code}\n;({ CakeModel });`, {
        React, lazy: (load) => ({ load }), useLayoutEffect() {}, Html: "Html", ...tierConfig,
    });
    const initial = CakeModel({ selectedTierIndex: 0 });
    for (const selectedTierIndex of [3, 1, 0, 2, 0]) {
        const next = CakeModel({ selectedTierIndex });
        assert.equal(next.type, initial.type, "tier selection updates props instead of replacing the message's ancestor");
        assert.equal(next.props.key, initial.props.key);
        assert.equal(next.props.selectedTierIndex, selectedTierIndex);
    }
});

test("the bottom Ube material remains on the model when a second tier is added", () => {
    const builder = createBuilder();
    const state = builder.render();
    state.setFlavor("Ube Chiffon");
    state.setCakeColor(state.cakeColors.find((item) => item.name === "lavender"));
    const before = cakeMaterials(builder)[0];
    builder.select(1);
    const after = cakeMaterials(builder).find((item) => item.name.endsWith("_0"));
    assert.deepEqual(after, before);
    builder.render().setTierLayerFlavor(1, "Vanilla Chiffon");
    assert.deepEqual(cakeMaterials(builder).find((item) => item.name.endsWith("_0")), before);
});

test("cart snapshots restore the complete design and exact per-layer materials", () => {
    for (let count = 1; count <= 4; count++) {
        const builder = createBuilder();
        builder.select(count - 1);
        for (let layer = 0; layer < count; layer++) builder.render().setTierLayerFlavor(layer, builder.render().flavors[layer % 3]);
        let state = builder.render();
        state.setForm(2);
        state.setSelectedSize(builder.CAKE_SIZES[count - 1].sizes.at(-1));
        state.setCakeColor(state.cakeColors[2]);
        state.setIcingColor(state.icingColors[2]);
        state.setInscriptionText("Happy Birthday Ana!");
        state.setTextFont("playful");
        state.setInscriptionColor("#FFFFFF");
        state.setCandle(true);
        state.setCandleNumber(27);
        state.setCandleMode("number");
        state.setCandleColor("white");
        state.setChocolateCount(3);
        state.setCherryCount(2);
        state.setBalls(true);
        state.setNuts(true);
        state.setSprinkles(true);
        state = builder.render();
        state.setToppingPosition("chocolate-0", 25, 35, [-0.4, 2.8, 0.2]);
        state.setToppingPosition("cherry-1", 70, 60, [0.3, 2.9, 0.2]);
        state.setToppingPosition("candle", 50, 50, [0, 2.85, 0]);
        state.setToppingSize("chocolate-1", "large");
        state.setChocolateRotation(0, "x", 30);
        const payload = saveDesign(builder);
        const original = cakeMaterials(builder);
        const restored = createBuilder(JSON.parse(JSON.stringify(payload)));
        assert.deepEqual(saveDesign(restored), payload);
        assert.deepEqual(cakeMaterials(restored), original);
        const preserved = JSON.stringify(payload);
        builder.render().setTierLayerFlavor(0, "Ube Chiffon");
        builder.render().setToppingPosition("chocolate-0", 80, 80, [1, 3, 1]);
        assert.equal(JSON.stringify(payload), preserved);
        assert.deepEqual(cakeMaterials(restored), original);
    }
});

test("different saved cakes keep their own flavors, material tints, shape and toppings", () => {
    const first = createBuilder();
    first.select(2);
    first.render().setTierLayerFlavor(1, "Ube Chiffon");
    first.render().setTierLayerFlavor(2, "Vanilla Chiffon");
    first.render().setCakeColor(first.render().cakeColors[2]);
    const firstPayload = saveDesign(first);
    const second = createBuilder();
    second.render().setFlavor("Vanilla Chiffon");
    second.render().setForm(2);
    second.render().setChocolateCount(2);
    const secondPayload = saveDesign(second);
    for (const payload of [firstPayload, secondPayload, firstPayload]) {
        const preview = createBuilder(payload);
        assert.deepEqual(saveDesign(preview), payload);
        assert.deepEqual(cakeMaterials(preview), cakeMaterials(payload === firstPayload ? first : second));
    }
});

test("randomizing clears previous material overrides and keeps the shared tier design consistent", () => {
    const builder = createBuilder();
    builder.select(3);
    for (let layer = 0; layer < 4; layer++) builder.render().setTierLayerFlavor(layer, "Ube Chiffon");
    builder.render().generateRandomCake();
    const state = builder.render();
    for (let index = 0; index < 4; index++) {
        assert.deepEqual(plain(state.tierFlavors[`tier${index + 1}`]), plain(state.tierFlavors.tier4.slice(0, index + 1)));
        assert.deepEqual(plain(state.tierFlavorOverrides[`tier${index + 1}`]), Array(index + 1).fill(false));
    }
    const payload = saveDesign(builder);
    const restored = createBuilder(payload);
    assert.deepEqual(saveDesign(restored), payload);
    assert.deepEqual(cakeMaterials(restored), cakeMaterials(builder));
});

test("remounted models render their own saved layout in bottom-to-top order during navigation", () => {
    const builder = createBuilder();
    for (let index = 0; index < 4; index++) {
        builder.select(index);
        for (let layer = 0; layer <= index; layer++) {
            const state = builder.render();
            state.setTierLayerFlavor(layer, state.flavors[(layer + index) % state.flavors.length]);
        }
    }
    const models = Array.from({ length: 4 }, (_, index) => createModel(index + 1));
    const { CakeTierScene, TEXTURE_URLS } = runInNewContext(sceneCode, {
        React, THREE, ...tierConfig, ...builder,
        getGroundedNutY, getChocolateQuaternion,
        useCustomization: builder.render,
        useMemo: (calculate) => calculate(),
        useLayoutEffect: (effect) => effect(),
        useFrame() {},
        useGLTF: (url) => models[Number(url.match(/tier(\d)/)[1]) - 1],
        useTexture: (urls) => Object.fromEntries(Object.entries(urls).map(([key, url]) => {
            const texture = new THREE.Texture();
            texture.name = url;
            return [key, texture];
        })),
        useToppingDragPlacement: () => ({ isDragging: { current: false } }),
        CakeInscription: "CakeInscription",
    });
    const saved = builder.render();
    for (const form of [1, 2]) {
        builder.render().setForm(form);
        for (const selected of [0, 3, 1, 2, 0]) {
            builder.select(selected);
            // A previous model may still render while another model's assets suspend.
            for (let modelIndex = 0; modelIndex < 4; modelIndex++) {
                const rendered = CakeTierScene({ selectedTierIndex: modelIndex, cakeGroupRef: { current: null } });
                const scene = rendered.props.children[0].props.object;
                const visible = [];
                scene.traverse((mesh) => { if (mesh.isMesh && mesh.visible) visible.push(mesh); });
                assert.equal(visible.length, modelIndex + 1);
                for (const mesh of visible) {
                    const layer = Number(mesh.name.split("_").at(-1));
                    const flavor = saved.tierFlavors[`tier${modelIndex + 1}`][layer];
                    const textureKey = saved.flavorTextureMap[flavor];
                    assert.equal(mesh.material.map.name, TEXTURE_URLS[textureKey].map);
                    assert.equal(mesh.material.normalMap.name, TEXTURE_URLS[textureKey].normalMap);
                    assert.equal(mesh.material.aoMap.name, TEXTURE_URLS[textureKey].aoMap);
                }
            }
        }
    }
});
