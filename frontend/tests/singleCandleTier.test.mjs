import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";
import * as THREE from "three";
import { getChocolateQuaternion } from "../src/utils/chocolateRotation.js";
import { getGroundedNutY } from "../src/utils/nutPlacement.js";
import { findToppingPosition, isToppingPositionValid, TOPPING_PLACEMENT_GAP, TOPPING_SURFACE_OFFSET } from "../src/utils/toppingDragPlacement.js";
import * as tierConfig from "../src/components/cake/tierConfig.js";

const source = readFileSync(new URL("../src/components/cake/CakeTierScene.jsx", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace(/^export /gm, "");
const { code } = await transformWithOxc(source, "CakeTierScene.jsx", { jsx: { runtime: "classic" } });
const sizes = { small: 0.8, medium: 1, large: 1.2 };
const topHeights = [2.35, 1.8, 2.35, 2.73];
const topWidths = [4, 2.6, 1.8, 1.4];
const React = { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };

function makeModel(count) {
    const index = count - 1;
    const modelScale = index === 0 ? 1 : 0.9;
    const modelOffset = index === 0 ? 0 : -0.95;
    const scene = new THREE.Group();
    for (let layer = 0; layer < count; layer++) {
        const width = topWidths[index] + (count - layer - 1) * 0.5;
        const topY = topHeights[index] - (count - layer - 1) * 0.4;
        for (const shape of ["round", "rectangle"]) {
            const geometry = shape === "round"
                ? new THREE.CylinderGeometry(width / 2 / modelScale, width / 2 / modelScale, 0.3 / modelScale, 64).scale(1, 1, 0.75)
                : new THREE.BoxGeometry(width / modelScale, 0.3 / modelScale, width * 0.75 / modelScale);
            const mesh = new THREE.Mesh(geometry);
            mesh.name = `cake_${shape}_${layer}`;
            mesh.position.y = (topY - 0.15 - modelOffset) / modelScale;
            scene.add(mesh);
        }
    }
    const candle = new THREE.Mesh(new THREE.BoxGeometry(8, 6, 14).translate(1.2, -0.4, 0.8));
    return { scene, nodes: { chandel: candle }, materials: { chandel: new THREE.MeshStandardMaterial() } };
}

function makeSurface(count, round) {
    const radiusX = topWidths[count - 1] / 2;
    const radiusZ = radiusX * 0.75;
    return {
        minX: -radiusX, maxX: radiusX, minZ: -radiusZ, maxZ: radiusZ,
        topY: topHeights[count - 1], round,
        ...(round ? { outline: Array.from({ length: 64 }, (_, index) => ({ x: radiusX * Math.cos(index * Math.PI / 32), z: radiusZ * Math.sin(index * Math.PI / 32) })) } : {}),
    };
}

function createScene({ count = 2, round = false, mode = "gold", enabled = true, readOnly = false, dragging = false, onTop = true, missingEntry = false } = {}) {
    let tierCount = count;
    let surface = makeSurface(count, round);
    const models = Array.from({ length: 4 }, (_, index) => makeModel(index + 1));
    const state = {
        form: round ? 1 : 2, cakeColor: { color: "#683434" }, icingColor: { color: "#5A2415" },
        flavors: ["Choco Moist"], flavorTextureMap: { "Choco Moist": "choco" },
        tierFlavors: Object.fromEntries([1, 2, 3, 4].map(n => [`tier${n}`, Array(n).fill("Choco Moist")])),
        tierFlavorOverrides: Object.fromEntries([1, 2, 3, 4].map(n => [`tier${n}`, Array(n).fill(false)])),
        candle: enabled, candleMode: mode, candleColor: "gold", candleNumber: 1,
        chocolate: false, chocolateLayouts: [], balls: false, nuts: false, cherry: false, cherryLayouts: [], sprinkles: false,
        toppingLayout: { candle: { x: 95, y: 95, size: "medium", mode }, balls: { size: "small" }, cherry: { size: "small" } },
        inscriptionText: "", inscriptionLayout: {}, textSize: 70,
    };
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)), new THREE.Vector3(-0.03, -0.03, -0.03));
    models[0].nodes.chandel.geometry.computeBoundingBox();
    const footprint = models[0].nodes.chandel.geometry.boundingBox.clone().applyMatrix4(matrix);
    const insertionDepth = 0.02;
    const position = findToppingPosition({
        box: footprint, surfaceBox: footprint, surface,
        position: new THREE.Vector3(surface.maxX, surface.topY - footprint.min.y - insertionDepth + TOPPING_SURFACE_OFFSET, surface.maxZ),
    });
    if (!onTop) position.y -= 0.5;
    state.toppingLayout.candle.position = position.toArray();
    const entry = { id: "candle", position, messageBox: footprint, box: footprint.clone(), insertionDepth, object: new THREE.Group(), anchor: new THREE.Vector3() };
    const commits = [];
    const applied = [];
    const refs = [];
    let refCursor = 0;
    let effects = [];
    let reconcileBeforeEffect = false;
    const controller = {
        entries: new Map(missingEntry ? [] : [["candle", entry]]), isDragging: { current: dragging },
        placementBounds: (registered) => ({ surface, surfaceBox: registered.messageBox }),
        obstacles: () => [],
        height: registered => surface.topY - registered.messageBox.min.y - registered.insertionDepth + TOPPING_SURFACE_OFFSET,
        apply(registered, next, publish) {
            applied.push({ position: next.clone(), publish });
            registered.object.matrix.makeTranslation(next.x - registered.anchor.x, next.y - registered.anchor.y, next.z - registered.anchor.z);
            const placed = { ...registered, position: next.clone() };
            this.entries.set("candle", placed);
            return placed;
        },
        commit(placed) {
            commits.push(placed.position.clone());
            state.toppingLayout.candle = {
                ...state.toppingLayout.candle,
                x: 100 * (placed.position.x - surface.minX) / (surface.maxX - surface.minX),
                y: 100 * (placed.position.z - surface.minZ) / (surface.maxZ - surface.minZ),
                position: placed.position.toArray(),
            };
        },
    };
    const { CakeTierScene } = runInNewContext(`${code}\n;({ CakeTierScene });`, {
        React, THREE, ...tierConfig, getGroundedNutY, getChocolateQuaternion,
        findToppingPosition, TOPPING_PLACEMENT_GAP, TOPPING_SURFACE_OFFSET,
        DEFAULT_FLAVOR: "Choco Moist", FLAVOR_VISUALS: {}, TOPPING_SIZES: sizes,
        useCustomization: () => state,
        useMemo: calculate => calculate(), useLayoutEffect: effect => effect(), useFrame() {},
        useRef(value) { const index = refCursor++; return refs[index] || (refs[index] = { current: value }); },
        useEffect: effect => effects.push(effect),
        useGLTF: () => models[tierCount - 1],
        useTexture: urls => Object.fromEntries(Object.keys(urls).map(key => [key, new THREE.Texture()])),
        useToppingDragPlacement() {
            if (reconcileBeforeEffect) effects.push(() => {
                const registered = controller.entries.get("candle");
                if (registered) registered.position.set(0, controller.height(registered), 0);
            });
            return controller;
        },
        DraggableCakeTopping: "DraggableCakeTopping", CakeInscription: "CakeInscription",
    });
    function render(nextCount = tierCount, reconcile = false) {
        tierCount = nextCount;
        surface = makeSurface(nextCount, round);
        refCursor = 0;
        effects = [];
        reconcileBeforeEffect = reconcile;
        const rendered = CakeTierScene({ selectedTierIndex: nextCount - 1, cakeGroupRef: { current: new THREE.Group() }, controlsRef: { current: {} }, readOnlyToppings: readOnly });
        effects.forEach(effect => effect());
        return rendered;
    }
    return { render, state, controller, commits, applied, get surface() { return surface; }, get model() { return models[tierCount - 1]; } };
}

function meshes(element, result = []) {
    if (Array.isArray(element)) element.forEach(child => meshes(child, result));
    else if (element && typeof element === "object") {
        if (element.type === "mesh") result.push(element);
        meshes(element.props?.children, result);
    }
    return result;
}

test("a single candle moves to each new top surface and fits round and rectangular tiers", () => {
    for (const round of [false, true]) for (const path of [[1, 2, 3, 4], [2, 3], [2, 4]]) {
        const view = createScene({ count: path[0], round });
        view.render();
        assert.equal(view.commits.length, 0);
        for (const next of path.slice(1)) {
            const before = view.commits.length;
            view.render(next);
            const entry = view.controller.entries.get("candle");
            assert.equal(view.commits.length, before + 1);
            assert.ok(isToppingPositionValid({ box: entry.box, surfaceBox: entry.messageBox, position: entry.position, surface: view.surface }));
            assert.ok(Math.abs(entry.position.y + entry.messageBox.min.y + entry.insertionDepth - view.surface.topY - TOPPING_SURFACE_OFFSET) < 1e-9);
            assert.deepEqual(view.state.toppingLayout.candle.position, entry.position.toArray());
            assert.equal(view.applied.at(-1).publish, false);
            const placed = entry.position.clone();
            view.render(next);
            assert.equal(view.commits.length, before + 1);
            assert.ok(view.controller.entries.get("candle").position.equals(placed));
        }
    }
});

test("tier repositioning retains the old edge placement when reconciliation already moved the current entry", () => {
    for (const round of [false, true]) {
        const view = createScene({ count: 2, round });
        view.render();
        view.render(4, true);
        const entry = view.controller.entries.get("candle");
        assert.equal(view.commits.length, 1);
        assert.ok(entry.position.x > 0.1, "use the retained old X coordinate rather than the reconciled center");
        assert.ok(entry.position.z > 0.1, "use the retained old Z coordinate rather than the reconciled center");
        assert.ok(isToppingPositionValid({ box: entry.box, position: entry.position, surface: view.surface }));
        assert.ok(Math.abs(entry.position.y - view.controller.height(entry)) < 1e-9);
    }
});

test("the single-candle tier effect leaves lower placements, number candles, previews and active drags alone", () => {
    for (const options of [{ onTop: false }, { mode: "number" }, { enabled: false }, { readOnly: true }, { dragging: true }, { missingEntry: true }]) {
        const view = createScene({ count: 2, ...options });
        const position = view.controller.entries.get("candle")?.position.clone();
        view.render();
        view.render(3);
        view.render(4);
        assert.equal(view.commits.length, 0, JSON.stringify(options));
        assert.equal(view.applied.length, 0, JSON.stringify(options));
        if (position) assert.ok(view.controller.entries.get("candle").position.equals(position));
    }
});

test("Small, Medium and Large directly scale the single candle across every tier despite the width cap", () => {
    for (const count of [1, 2, 3, 4]) {
        const view = createScene({ count });
        const widths = [];
        for (const size of ["small", "medium", "large"]) {
            view.state.toppingLayout.candle = { ...view.state.toppingLayout.candle, size };
            const rendered = view.render();
            const mesh = meshes(rendered).find(item => item.props.geometry === view.model.nodes.chandel.geometry);
            assert.ok(mesh);
            assert.equal(mesh.props.scale, -0.03 * sizes[size]);
            const candle = new THREE.Mesh(mesh.props.geometry);
            candle.scale.setScalar(mesh.props.scale);
            candle.rotation.fromArray([...mesh.props.rotation, "XYZ"]);
            widths.push(new THREE.Box3().setFromObject(candle).getSize(new THREE.Vector3()).x);
        }
        assert.ok(widths[0] < widths[1] && widths[1] < widths[2]);
        assert.ok(Math.abs(widths[2] / widths[0] - 1.5) < 1e-10);
    }
});

test("changing the single-candle size updates both its mesh and its uncapped physical placement footprint", () => {
    for (const count of [1, 2, 3, 4]) {
        const view = createScene({ count });
        for (const size of ["small", "large", "medium", "small"]) {
            view.state.toppingLayout.candle = { ...view.state.toppingLayout.candle, size };
            const mesh = meshes(view.render()).find(item => item.props.geometry === view.model.nodes.chandel.geometry);
            const candle = new THREE.Mesh(mesh.props.geometry);
            candle.position.fromArray(mesh.props.position);
            candle.rotation.fromArray([...mesh.props.rotation, "XYZ"]);
            candle.scale.setScalar(mesh.props.scale);
            const bounds = new THREE.Box3().setFromObject(candle);
            assert.equal(mesh.props.scale, -0.03 * sizes[size]);
            assert.ok(bounds.min.x >= view.surface.minX - 1e-8 && bounds.max.x <= view.surface.maxX + 1e-8, `${size} must be positioned using its actual selected width`);
            assert.ok(bounds.min.z >= view.surface.minZ - 1e-8 && bounds.max.z <= view.surface.maxZ + 1e-8, `${size} must be positioned using its actual selected depth`);
        }
    }
});

test("number-candle sizes on the marked lower ledges are independent of the smaller top-tier width", () => {
    for (const round of [false, true]) for (const count of [2, 3, 4]) {
        const view = createScene({ count, round, mode: "number", onTop: false });
        view.state.candleNumber = 38;
        view.model.nodes.candle_3 = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.6, 0.08));
        view.model.nodes.candle_8 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.08));
        for (const ledgeIndex of count === 2 ? [1] : count === 3 ? [2] : [2, 3]) {
            for (const size of ["small", "medium", "large"]) {
                view.state.toppingLayout.candle = { ...view.state.toppingLayout.candle, size,
                    relativePlacement: { angle: Math.PI / 2, normalizedRadius: 0.9, ledgeIndex, tierCount: count, form: round ? 1 : 2 } };
                const digits = meshes(view.render()).filter(mesh =>
                    [view.model.nodes.candle_3.geometry, view.model.nodes.candle_8.geometry].includes(mesh.props.geometry));
                assert.equal(digits.length, 2);
                for (const digit of digits) assert.deepEqual(Array.from(digit.props.scale), Array(3).fill(sizes[size]));
            }
        }
        if (count === 2) {
            for (const fromCount of [3, 4]) for (let ledgeIndex = 1; ledgeIndex < fromCount; ledgeIndex++) {
                view.state.toppingLayout.candle = { ...view.state.toppingLayout.candle, size: "large",
                    relativePlacement: { angle: Math.PI / 2, normalizedRadius: 0.9, ledgeIndex, tierCount: fromCount, form: round ? 1 : 2 } };
                const digit = meshes(view.render()).find(mesh => mesh.props.geometry === view.model.nodes.candle_3.geometry);
                assert.deepEqual(Array.from(digit.props.scale), Array(3).fill(sizes.large),
                    "tier 2 must measure the actual size on its remaining ledge before saving the new ledge index");
            }
        }
        if (count > 2) {
            view.state.toppingLayout.candle = { ...view.state.toppingLayout.candle, size: "large",
                relativePlacement: { ...view.state.toppingLayout.candle.relativePlacement, ledgeIndex: 1 } };
            const digit = meshes(view.render()).find(mesh => mesh.props.geometry === view.model.nodes.candle_3.geometry);
            assert.ok(digit.props.scale[0] < sizes.large, "the unmarked narrow ledge keeps its existing sizing behavior");
        }
    }
});
