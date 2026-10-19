import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";
import * as THREE from "three";
import { normalizeCakeMessage } from "../src/utils/cakeMessage.js";
import { DEFAULT_CHOCOLATE_LAYOUT, hydrateChocolateLayouts, resizeChocolateLayouts } from "../src/utils/chocolateQuantity.js";
import { getChocolateQuaternion, updateChocolateRotation } from "../src/utils/chocolateRotation.js";
import { getGroundedNutY } from "../src/utils/nutPlacement.js";
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
        React, normalizeCakeMessage, DEFAULT_CHOCOLATE_LAYOUT, hydrateChocolateLayouts, resizeChocolateLayouts, updateChocolateRotation,
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

test("every layout starts with independent Choco Moist flavors", () => {
    const builder = createBuilder();
    const state = builder.render();
    for (let index = 0; index < 4; index++) {
        const key = `tier${index + 1}`;
        assert.deepEqual(plain(state.tierFlavors[key]), Array(index + 1).fill("Choco Moist"));
        assert.equal(builder.select(index).selectedTierFlavors, state.tierFlavors[key]);
    }
    builder.select(0).setFlavor((previous) => previous === "Choco Moist" ? "Vanilla Chiffon" : previous);
    assert.equal(builder.render().flavor, "Vanilla Chiffon");
    assert.deepEqual(plain(builder.select(1).selectedTierFlavors), ["Choco Moist", "Choco Moist"]);
});

test("editing and revisiting every layout preserves its bottom-to-top flavors and other customizations", () => {
    const builder = createBuilder();
    const initial = builder.render();
    initial.setCakeColor(initial.cakeColors[2]);
    initial.setIcingColor(initial.icingColors[2]);
    initial.setInscriptionText("Happy Birthday");
    const expected = {};
    for (let index = 0; index < 4; index++) {
        builder.select(index);
        for (let layer = 0; layer <= index; layer++) {
            const state = builder.render();
            state.setTierLayerFlavor(layer, state.flavors[(index + layer + 1) % state.flavors.length]);
        }
        expected[`tier${index + 1}`] = plain(builder.render().selectedTierFlavors);
    }
    const saved = builder.render();
    for (const index of [0, 3, 1, 2, 3, 0, 2, 1]) {
        const state = builder.select(index);
        assert.deepEqual(plain(state.selectedTierFlavors), expected[`tier${index + 1}`]);
        assert.equal(state.tierFlavors, saved.tierFlavors);
        assert.equal(state.tierFlavorOverrides, saved.tierFlavorOverrides);
        assert.equal(state.cakeColor, saved.cakeColor);
        assert.equal(state.icingColor, saved.icingColor);
        assert.equal(state.inscriptionText, "Happy Birthday");
    }
    builder.select(1).resetTierFlavorOverrides();
    const reset = builder.render();
    assert.deepEqual(plain(reset.selectedTierFlavors), ["Choco Moist", "Choco Moist"]);
    for (const key of ["tier1", "tier3", "tier4"]) {
        assert.equal(reset.tierFlavors[key], saved.tierFlavors[key]);
        assert.equal(reset.tierFlavorOverrides[key], saved.tierFlavorOverrides[key]);
    }
});

test("saved flavors hydrate only their own layout and missing layers default to Choco Moist", () => {
    const sizes = createBuilder().CAKE_SIZES;
    for (let index = 0; index < 4; index++) {
        const builder = createBuilder({
            tier: sizes[index].tier, flavor: "Vanilla Chiffon",
            tier_flavors: { "Cake": "Ube Chiffon", "Bottom Tier": "Ube Chiffon", "Top Tier": "Vanilla Chiffon" },
        });
        for (let other = 0; other < 4; other++) {
            const state = builder.select(other);
            const expected = Array(other + 1).fill("Choco Moist");
            if (other === index) {
                expected[0] = "Ube Chiffon";
                if (other > 0) expected[other] = "Vanilla Chiffon";
            }
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
