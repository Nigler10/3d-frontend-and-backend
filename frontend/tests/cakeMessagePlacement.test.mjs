import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";
import * as THREE from "three";
import { Text } from "three-text";
import { DEFAULT_CAKE_MESSAGE_LAYOUT, normalizeCakeMessage, normalizeCakeMessageLayout, wrapCakeMessage } from "../src/utils/cakeMessage.js";
import { clampCakeMessagePosition, curveCakeMessageGeometry, fitCakeMessageGeometry, getCakeMessageDragPosition, getCakeMessagePadding, getCakeMessageSurface, MESSAGE_EDGE_GAP, MESSAGE_HEIGHT_OFFSET, MESSAGE_MAX_ARC_SWEEP, MESSAGE_SURFACE_GAP } from "../src/utils/cakeMessagePlacement.js";
import { isToppingPositionValid } from "../src/utils/toppingDragPlacement.js";

const buffer = (path) => {
    const bytes = readFileSync(new URL(path, import.meta.url));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};
Text.setHarfBuzzBuffer(buffer("../public/hb/hb.wasm"));
const font = buffer("../node_modules/three/examples/fonts/ttf/kenpixel.ttf");
const createText = (width, text = "Happy Birthday to you and your wonderful family!") => Text.create({
    font, text, size: 0.22, depth: 0.018, perGlyphAttributes: true,
    layout: { width, align: "center", hyphenate: false, respectExistingBreaks: true },
});

const renderedFootprint = (geometry) => Array.from({ length: geometry.attributes.position.count }, (_, index) => ({
    x: geometry.attributes.position.getX(index), z: -geometry.attributes.position.getY(index),
}));

const footprintFits = (points, position, surface) => {
    const box = new THREE.Box3();
    const vertex = new THREE.Vector3();
    for (const point of points) box.expandByPoint(vertex.set(point.x, 0, point.z));
    const padding = getCakeMessagePadding(box, surface);
    const cx = (surface.minX + surface.maxX) / 2, cz = (surface.minZ + surface.maxZ) / 2;
    const rx = (surface.maxX - surface.minX) / 2 - padding;
    const rz = (surface.maxZ - surface.minZ) / 2 - padding;
    const outline = surface.outline;
    const winding = outline?.length >= 3 ? Math.sign(outline.reduce((area, point, index) => {
        const next = outline[(index + 1) % outline.length];
        return area + point.x * next.z - next.x * point.z;
    }, 0)) : 0;
    return points.every((point) => {
        const x = point.x + position.x, z = point.z + position.z;
        if (x < surface.minX + padding - 1e-8 || x > surface.maxX - padding + 1e-8 ||
            z < surface.minZ + padding - 1e-8 || z > surface.maxZ - padding + 1e-8) return false;
        if (winding) return outline.every((a, index) => {
            const b = outline[(index + 1) % outline.length];
            return winding * ((b.x - a.x) * (z - a.z) - (b.z - a.z) * (x - a.x)) / Math.hypot(b.x - a.x, b.z - a.z) >= padding - 1e-8;
        });
        return !surface.round || Math.hypot((x - cx) / rx, (z - cz) / rz) <= 1 + 1e-8;
    });
};

test("message settings restore defaults and constrain invalid slider and position values", () => {
    assert.deepEqual(normalizeCakeMessageLayout(), DEFAULT_CAKE_MESSAGE_LAYOUT);
    assert.deepEqual(normalizeCakeMessageLayout({ x: -10, y: 110, width: 5, curve: 500 }), { x: 0, y: 100, width: 30, curve: 100, textSize: 70 });
    assert.deepEqual(normalizeCakeMessageLayout({ width: Infinity, curve: "invalid" }), DEFAULT_CAKE_MESSAGE_LAYOUT);
    assert.equal(normalizeCakeMessageLayout({ textSize: 0 }).textSize, 50);
    assert.equal(normalizeCakeMessageLayout({ textSize: 300 }).textSize, 200);
    assert.equal(normalizeCakeMessageLayout({ textSize: NaN }).textSize, 70);
});

test("measured whole-word wrapping adds lines as the message box narrows", async () => {
    const wide = await createText(1.6);
    const measure = (value) => wide.measureTextWidth(value) * 0.22 / wide.getLoadedFont().upem;
    const wrapped = wrapCakeMessage("Happy Birthday to you and your wonderful family!", 0.65, measure);
    const renderWidth = Math.max(0.65, ...wrapped.split("\n").map(measure)) * (1 + 1e-6);
    const narrow = await createText(renderWidth, wrapped);
    assert.ok(new Set(narrow.glyphs.map((glyph) => glyph.lineIndex)).size > new Set(wide.glyphs.map((glyph) => glyph.lineIndex)).size);
    assert.equal(new Set(narrow.glyphs.map((glyph) => glyph.lineIndex)).size, wrapped.split("\n").length);
    assert.ok(narrow.geometry.boundingBox.max.x - narrow.geometry.boundingBox.min.x <= renderWidth + 1e-6);
    wide.dispose(); narrow.dispose();
});

test("message wrapping preserves whole words even when one word exceeds the box width", () => {
    const message = "CongratulationsBirthdayGirl";
    const wrapped = wrapCakeMessage(message, 5, (value) => value.length);
    assert.equal(wrapped, message);
    assert.equal(wrapCakeMessage("Happy Birthday Ana", 10, (value) => value.length), "Happy\nBirthday\nAna");
    assert.equal(wrapCakeMessage("Happy Birthday", 4, (value) => value.length), "Happy\nBirthday");
    assert.equal(wrapCakeMessage("Happy Birthday Ana", 14, (value) => value.length), "Happy Birthday\nAna");
});

test("glyphs follow an arc without bending their extrusion into the cake or accumulating deformation", async () => {
    const text = await createText(1.6, "Happy Birthday");
    const geometry = text.geometry;
    curveCakeMessageGeometry(geometry, 0);
    const flat = geometry.attributes.position.array.slice();
    const thickness = geometry.boundingBox.max.z - geometry.boundingBox.min.z;
    curveCakeMessageGeometry(geometry, 85);
    const curved = geometry.attributes.position.array.slice();
    assert.notDeepEqual(curved, flat);
    assert.ok(Math.abs(geometry.boundingBox.max.z - geometry.boundingBox.min.z - thickness) < 1e-7);
    const glyph = text.glyphs.find((item) => item.vertexCount > 2);
    const vertex = (array, index) => new THREE.Vector3().fromArray(array, index * 3);
    assert.ok(Math.abs(vertex(flat, glyph.vertexStart).distanceTo(vertex(flat, glyph.vertexStart + 1)) - vertex(curved, glyph.vertexStart).distanceTo(vertex(curved, glyph.vertexStart + 1))) < 1e-6);
    curveCakeMessageGeometry(geometry, -100);
    curveCakeMessageGeometry(geometry, 85);
    assert.deepEqual(geometry.attributes.position.array, curved);
    curveCakeMessageGeometry(geometry, 0);
    assert.deepEqual(geometry.attributes.position.array, flat);
    text.dispose();
});

const createGlyphBoxes = (lineCount, repeat = 1) => {
    const positions = [], centers = [], glyphIndices = [], lineIndices = [], baselines = [];
    // Deliberately mix wide and narrow ink bounds, descenders and word spaces.
    const widths = Array.from({ length: repeat }, () => [0.32, 0.025, 0.24, 0.04, 0.29]).flat();
    for (let line = 0; line < lineCount; line++) {
        let left = -0.6;
        widths.forEach((width, glyph) => {
            const bottom = -line * 0.18 - (glyph % 2 ? 0.06 : 0);
            const top = -line * 0.18 + 0.22;
            for (const [x, y] of [[left, bottom], [left + width, bottom], [left + width, top], [left, top]]) {
                positions.push(x, y, 0);
                centers.push(left + width / 2, (bottom + top) / 2, 0);
                glyphIndices.push(line * widths.length + glyph);
                lineIndices.push(line);
                baselines.push(bottom);
            }
            left += width + (glyph === 2 ? 0.15 : 0.005);
        });
    }
    const geometry = new THREE.BufferGeometry();
    for (const [name, values, size] of [["position", positions, 3], ["glyphCenter", centers, 3], ["glyphIndex", glyphIndices, 1], ["glyphLineIndex", lineIndices, 1], ["glyphBaselineY", baselines, 1]]) {
        geometry.setAttribute(name, new THREE.Float32BufferAttribute(values, size));
    }
    return geometry;
};

const glyphBoxes = (geometry) => Array.from({ length: geometry.attributes.position.count / 4 }, (_, glyph) =>
    Array.from({ length: 4 }, (_, corner) => new THREE.Vector2().fromBufferAttribute(geometry.attributes.position, glyph * 4 + corner)));

const boxesOverlap = (a, b) => {
    for (const box of [a, b]) for (let edge = 0; edge < 4; edge++) {
        const delta = box[(edge + 1) % 4].clone().sub(box[edge]);
        const axis = new THREE.Vector2(-delta.y, delta.x).normalize();
        const projectA = a.map((point) => point.dot(axis));
        const projectB = b.map((point) => point.dot(axis));
        if (Math.max(...projectA) <= Math.min(...projectB) + 1e-6 || Math.max(...projectB) <= Math.min(...projectA) + 1e-6) return false;
    }
    return true;
};

test("width-aware arc spacing separates wide and narrow letters in either curve direction", () => {
    const geometry = createGlyphBoxes(1);
    for (const curve of [-100, -50, 1, 50, 100]) {
        curveCakeMessageGeometry(geometry, curve);
        const boxes = glyphBoxes(geometry);
        const centers = boxes.map((box) => box[0].clone().add(box[2]).multiplyScalar(0.5));
        assert.ok(centers.every((point, index) => !index || point.x > centers[index - 1].x), `glyph order at ${curve}`);
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
            assert.equal(boxesOverlap(boxes[a], boxes[b]), false, `letters ${a}/${b} overlap at ${curve}`);
        }
    }
    geometry.dispose();
});

test("wrapped arcs stay concentric and retain reading order in both curve directions", () => {
    const geometry = createGlyphBoxes(4);
    const circleThrough = (a, b, c) => {
        const ab = b.clone().sub(a), ac = c.clone().sub(a);
        const determinant = 2 * (ab.x * ac.y - ab.y * ac.x);
        return new THREE.Vector2(
            (ac.y * ab.lengthSq() - ab.y * ac.lengthSq()) / determinant,
            (ab.x * ac.lengthSq() - ac.x * ab.lengthSq()) / determinant
        ).add(a);
    };
    for (const curve of [-100, -50, 1, 50, 100]) {
        curveCakeMessageGeometry(geometry, curve);
        const boxes = glyphBoxes(geometry);
        // Glyphs 0, 2 and 4 have matching vertical bounds, so their ink centers
        // trace a circle parallel to their line's common anchor circle.
        const lines = Array.from({ length: 4 }, (_, line) => [0, 2, 4].map((glyph) => {
            const box = boxes[line * 5 + glyph];
            return box[0].clone().add(box[2]).multiplyScalar(0.5);
        }));
        const circles = lines.map((points) => {
            const center = circleThrough(...points);
            return { center, radius: center.distanceTo(points[1]) };
        });
        circles.forEach((circle, line) => {
            assert.ok(circle.center.distanceTo(circles[0].center) < 0.003, `common center at ${curve}, line ${line}`);
            if (line) {
                assert.ok((circles[line - 1].radius - circle.radius) * Math.sign(curve) > 0, `concentric radius order at ${curve}`);
                assert.ok(lines[line][1].y < lines[line - 1][1].y, `typed line order at ${curve}`);
            }
        });
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
            assert.equal(boxesOverlap(boxes[a], boxes[b]), false, `wrapped letters ${a}/${b} overlap at ${curve}`);
        }
    }
    geometry.dispose();
});

test("long concentric lines cannot wind through a full circle or overlap at excessive curvature", () => {
    const geometry = createGlyphBoxes(3, 10);
    curveCakeMessageGeometry(geometry, 0);
    const flat = geometry.attributes.position.array.slice();
    assert.ok(MESSAGE_MAX_ARC_SWEEP < 2 * Math.PI);
    for (const direction of [-1, 1]) {
        curveCakeMessageGeometry(geometry, direction * 10000);
        const limited = geometry.attributes.position.array.slice();
        assert.ok(limited.every(Number.isFinite));
        assert.notDeepEqual(limited, flat, "the overlap guard retains a curved layout");
        const boxes = glyphBoxes(geometry);
        for (let line = 0; line < 3; line++) {
            const angles = boxes.slice(line * 50, (line + 1) * 50).map((box) => Math.atan2(box[1].y - box[0].y, box[1].x - box[0].x));
            assert.ok(Math.max(...angles) - Math.min(...angles) <= MESSAGE_MAX_ARC_SWEEP + 1e-6, "each inner line leaves the end gap");
        }
        for (let a = 0; a < boxes.length; a++) for (let b = a + 1; b < boxes.length; b++) {
            assert.equal(boxesOverlap(boxes[a], boxes[b]), false, `long curved glyphs ${a}/${b} remain separate`);
        }
        curveCakeMessageGeometry(geometry, direction * 1000000);
        assert.deepEqual(geometry.attributes.position.array, limited, "further curvature cannot add another revolution");
    }
    geometry.dispose();
});

test("negative curves preserve horizontal order without per-glyph attributes", () => {
    const geometry = createGlyphBoxes(1);
    for (const attribute of Object.keys(geometry.attributes)) {
        if (attribute !== "position") geometry.deleteAttribute(attribute);
    }
    curveCakeMessageGeometry(geometry, 100);
    const positive = geometry.attributes.position.array.slice();
    curveCakeMessageGeometry(geometry, -100);
    const negative = geometry.attributes.position;
    for (let index = 0; index < negative.count; index++) {
        assert.equal(negative.getX(index), positive[index * 3], `same horizontal position for vertex ${index}`);
    }
    const centers = glyphBoxes(geometry).map((box) => box[0].clone().add(box[2]).multiplyScalar(0.5));
    assert.ok(centers.every((point, index) => !index || point.x > centers[index - 1].x));
    geometry.dispose();
});

test("wrapped and curved message footprints stay on every tier surface with a fixed height", async () => {
    const text = await createText(0.7);
    for (const radius of [1, 0.72, 0.52, 0.4]) for (const round of [true, false]) {
        const surface = { minX: -radius, maxX: radius, minZ: -radius * 0.8, maxZ: radius * 0.8, topY: 2.75, round };
        for (const curve of [-100, 0, 100]) for (const width of [0.3, 0.8, 1]) {
            curveCakeMessageGeometry(text.geometry, curve);
            const box = fitCakeMessageGeometry(text.geometry, radius * 1.6 * width, surface);
            const points = renderedFootprint(text.geometry);
            for (const x of [-5, 0, 5]) for (const z of [-5, 0, 5]) {
                const position = clampCakeMessagePosition(new THREE.Vector3(x, 100, z), box, surface);
                assert.ok(footprintFits(points, position, surface), `${radius}, ${round}, ${curve}, ${width}: ${position.toArray()}`);
                assert.ok(Math.abs(position.y + box.min.y - surface.topY - MESSAGE_HEIGHT_OFFSET) < 1e-8);
            }
        }
    }
    text.dispose();
});

test("round message dragging stops at the padded inner edge on every tier", () => {
    for (const radius of [1, 0.72, 0.52, 0.4]) for (const center of [[0, 0], [1.2, -0.5]]) {
        const [cx, cz] = center;
        const surface = { minX: cx - radius, maxX: cx + radius, minZ: cz - radius, maxZ: cz + radius, topY: 2.35, round: true };
        for (const [width, depth] of [[0.8, 0.2], [0.35, 0.9]]) {
            const box = new THREE.Box3(new THREE.Vector3(-width * radius / 2, -0.01, -depth * radius / 2), new THREE.Vector3(width * radius / 2, 0.01, depth * radius / 2));
            const points = [
                { x: box.min.x, z: box.min.z }, { x: box.min.x, z: box.max.z },
                { x: box.max.x, z: box.min.z }, { x: box.max.x, z: box.max.z },
            ];
            const padding = getCakeMessagePadding(box, surface);
            for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 18) {
                const target = new THREE.Vector3(cx + 10 * radius * Math.cos(angle), 100, cz + 10 * radius * Math.sin(angle));
                const position = clampCakeMessagePosition(target, box, surface);
                assert.ok(footprintFits(points, position, surface));
                const outermost = Math.max(...points.map((point) => Math.hypot(position.x + point.x - cx, position.z + point.z - cz)));
                assert.ok(Math.abs(outermost - (radius - padding)) < 1e-8, "outermost text respects the inner margin");
            }
        }
    }
});

test("rectangular cake messages retain the full 0.5 inner margin when it fits", () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.3, -0.01, -0.1), new THREE.Vector3(0.3, 0.01, 0.1));
    const surface = { minX: -1, maxX: 1, minZ: -0.8, maxZ: 0.8, topY: 2.35, round: false };
    const position = clampCakeMessagePosition(new THREE.Vector3(10, 100, 10), box, surface);
    assert.ok(isToppingPositionValid({ box, position, surface, gap: MESSAGE_EDGE_GAP }));
    assert.ok(Math.abs(position.x + box.max.x + MESSAGE_EDGE_GAP - surface.maxX) < 1e-6);
    assert.ok(Math.abs(position.z + box.max.z + MESSAGE_EDGE_GAP - surface.maxZ) < 1e-6);
});

test("the padding stays absolute at 0.5 and caps only when the tier cannot fit the text", () => {
    const box = new THREE.Box3(new THREE.Vector3(-0.12, -0.01, -0.08), new THREE.Vector3(0.12, 0.01, 0.08));
    const large = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, topY: 2.35, round: true };
    assert.equal(getCakeMessagePadding(box, large), 0.5);
    const small = { ...large, minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4 };
    const padding = getCakeMessagePadding(box, small);
    assert.ok(padding > 0 && padding < 0.4);
    const position = clampCakeMessagePosition(new THREE.Vector3(10, 0, 10), box, small);
    assert.ok(isToppingPositionValid({ box, position, surface: small, gap: padding }));
    assert.ok(Math.hypot(position.x, position.z) > 0, "the small tier still has usable drag space");
});

test("curved glyphs respect the padded outline instead of empty box corners", async () => {
    const text = await createText(1.6, "Happy Birthday");
    for (const radius of [1, 0.4]) for (const curve of [-100, 100]) for (const polygon of [false, true]) {
        const surface = { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius, topY: 2.35, round: true };
        if (polygon) surface.outline = Array.from({ length: 32 }, (_, index) => ({ x: radius * Math.cos(index * Math.PI / 16), z: radius * Math.sin(index * Math.PI / 16) }));
        curveCakeMessageGeometry(text.geometry, curve);
        const box = fitCakeMessageGeometry(text.geometry, radius * 1.6, surface);
        const padding = getCakeMessagePadding(box, surface);
        const points = renderedFootprint(text.geometry);
        let movedBeyondBoxLimit = false;
        for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
            const ux = Math.cos(angle), uz = Math.sin(angle);
            const position = clampCakeMessagePosition(new THREE.Vector3(ux * radius * 10, 100, uz * radius * 10), box, surface);
            assert.ok(footprintFits(points, position, surface), `all rendered glyphs stay inside: ${radius}, ${curve}, ${polygon}`);
            const pastEdge = position.clone().add(new THREE.Vector3(ux * 0.0001, 0, uz * 0.0001));
            assert.equal(footprintFits(points, pastEdge, surface), false, "drag stops at actual letter contact");
            if (!isToppingPositionValid({ box, position, surface, gap: padding })) movedBeyondBoxLimit = true;
        }
        assert.ok(movedBeyondBoxLimit, "empty AABB corners no longer keep curved letters away from the edge");
    }
    text.dispose();
});

test("message surface measurement excludes lower tiers and honors rotated parent transforms", () => {
    const parent = new THREE.Group();
    parent.position.set(0, -0.8, 0);
    parent.rotation.y = 0.9;
    const scene = new THREE.Group();
    parent.add(scene);
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.5, 32));
    bottom.name = "round1st_layer";
    bottom.position.y = 1;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 32));
    top.name = "round2nd_layer";
    top.position.y = 1.5;
    scene.add(bottom, top);
    const bounds = new THREE.Box3(new THREE.Vector3(-0.5, 0, -0.5), new THREE.Vector3(0.5, 1.75, 0.5));
    const surface = getCakeMessageSurface(scene, parent, bounds, true);
    assert.ok(surface.outline.length >= 16);
    assert.ok(surface.outline.every((point) => Math.hypot(point.x, point.z) <= 0.500001));
    const box = new THREE.Box3(new THREE.Vector3(-0.1, -0.01, -0.05), new THREE.Vector3(0.1, 0.01, 0.05));
    const position = clampCakeMessagePosition(new THREE.Vector3(4, 0, 4), box, surface);
    assert.ok(isToppingPositionValid({ box, position, surface, gap: getCakeMessagePadding(box, surface) }));
});

test("message dragging converts world pointer movement into the rotated cake coordinates", () => {
    const parent = new THREE.Group();
    parent.position.set(1, -0.8, 2);
    parent.rotation.y = Math.PI / 2;
    parent.scale.setScalar(0.9);
    parent.updateMatrixWorld(true);
    const start = new THREE.Vector3(0.1, 2.35, 0.2);
    const target = new THREE.Vector3(-0.3, 2.35, 0.4);
    const worldStart = parent.localToWorld(start.clone());
    const worldDelta = parent.localToWorld(target.clone()).sub(worldStart);
    const proposed = new THREE.Matrix4().makeTranslation(...start.clone().add(worldDelta).toArray());
    assert.ok(getCakeMessageDragPosition(proposed, start, worldStart, parent).distanceTo(target) < 1e-8);
});

const inscriptionSource = readFileSync(new URL("../src/components/CakeInscription.jsx", import.meta.url), "utf8")
    .replace(/^import .+;\r?$/gm, "").replace(/^export default .+;\r?$/gm, "").replace(/^export /gm, "");
const inscriptionCode = (await transformWithOxc(inscriptionSource, "CakeInscription.jsx", { jsx: { runtime: "classic" } })).code;

function renderInscription(props = {}, wrapped = null, previous = null) {
    const effects = [], cleanups = previous?.cleanups ?? [], changes = previous?.changes ?? [], updates = [];
    const controlsRef = previous?.controlsRef ?? { current: { enabled: true } }, draggingRef = previous?.draggingRef ?? { current: false };
    const canvas = previous?.canvas ?? { style: { cursor: "crosshair" } };
    const refs = previous?.refs ?? [], memos = previous?.memos ?? [];
    let refIndex = 0, memoIndex = 0;
    const { CakeInscription } = runInNewContext(`${inscriptionCode}\n;({CakeInscription});`, {
        React: { createElement: (type, attributes, ...children) => ({ type, props: { ...attributes, children } }) },
        THREE, DragControls: "DragControls", ThreeText: { setHarfBuzzPath() {} },
        TEXT_FONT_OPTIONS: [{ value: "classic", path: "test.ttf" }],
        normalizeCakeMessage, normalizeCakeMessageLayout, wrapCakeMessage,
        clampCakeMessagePosition, curveCakeMessageGeometry, fitCakeMessageGeometry, getCakeMessageDragPosition, getCakeMessageSurface,
        useMemo: (fn, dependencies) => {
            const index = memoIndex++;
            if (!memos[index] || dependencies.some((value, offset) => !Object.is(value, memos[index].dependencies[offset]))) memos[index] = { value: fn(), dependencies };
            return memos[index].value;
        },
        useCallback: (fn) => fn, useRef: (current) => refs[refIndex++] ??= { current },
        useState: (initial) => [wrapped ?? initial, (value) => updates.push(value)],
        useLayoutEffect: (effect) => effects.push(effect), useEffect: (effect) => effects.push(effect),
        useThree: (select) => select({ invalidate() {}, gl: { domElement: canvas } }),
    });
    const tree = CakeInscription({ selectedTierIndex: 0, text: "Happy Birthday Alexandra!", controlsRef, draggingRef,
        onLayoutChange: (layout) => changes.push(layout), ...props });
    const parent = new THREE.Group();
    parent.position.y = -0.8;
    parent.rotation.y = 0.6;
    const root = previous?.root ?? new THREE.Group();
    parent.add(root);
    tree.props.ref.current = root;
    const drag = tree.props.children[0];
    const group = previous?.group ?? new THREE.Group();
    group.matrixAutoUpdate = false;
    group.matrix = drag.props.matrix;
    root.add(group);
    drag.props.ref.current = group;
    effects.forEach((effect) => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); });
    return { tree, drag, root, group, canvas, controlsRef, draggingRef, changes, updates, cleanups, refs, memos, wrapped, text: drag.props.children[0] };
}

async function settleInscription(props, previous = null) {
    let activeProps = props;
    let handledChanges = previous?.changes.length ?? 0;
    let component = renderInscription(props, previous?.wrapped ?? null, previous);
    const loaded = previous?.loaded ?? [];
    for (let step = 0; step < 6; step++) {
        if (component.changes.length > handledChanges) {
            handledChanges = component.changes.length;
            activeProps = { ...activeProps, messageLayout: { ...activeProps.messageLayout, ...component.changes.at(-1) } };
            component = renderInscription(activeProps, component.wrapped, component);
        }
        const text = await Text.create({
            font, text: component.text.props.children[0], size: component.text.props.size,
            depth: component.text.props.depth, letterSpacing: component.text.props.letterSpacing,
            lineHeight: component.text.props.lineHeight, perGlyphAttributes: true, layout: component.text.props.layout,
        });
        loaded.push(text);
        component.text.props.onLoad(text.geometry, text);
        if (!component.updates.length && component.changes.length === handledChanges) return { ...component, loaded, geometry: text.geometry };
        component = renderInscription(activeProps, component.updates.at(-1) ?? component.wrapped, component);
    }
    assert.fail("message wrapping did not settle");
}

test("changing a rectangular cake to round nudges and saves an invalid corner placement once", async () => {
    const bounds = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2.35, 1));
    const props = { text: "Ana", round: false, surfaceBounds: bounds, messageLayout: { x: 85, y: 85 } };
    const rectangle = await settleInscription(props);
    const before = new THREE.Vector3().setFromMatrixPosition(rectangle.group.matrix);
    const round = await settleInscription({ ...props, round: true }, rectangle);
    const after = new THREE.Vector3().setFromMatrixPosition(round.group.matrix);
    assert.ok(after.x < before.x && after.z < before.z, "round boundary nudges an invalid rectangular corner inward");
    assert.ok(footprintFits(renderedFootprint(round.geometry), after, { minX: -1, maxX: 1, minZ: -1, maxZ: 1, round: true }));
    assert.equal(round.changes.length, 1);
    const saved = round.changes[0];
    const stable = renderInscription({ ...props, round: true, messageLayout: { ...props.messageLayout, ...saved } }, round.wrapped, round);
    assert.equal(stable.changes.length, 1, "saving the nudge does not loop");
    const settled = new THREE.Vector3().setFromMatrixPosition(stable.group.matrix);
    assert.ok(settled.distanceTo(after) < 1e-6, `saved placement moved from ${after.toArray()} to ${settled.toArray()}`);
    round.cleanups.forEach((cleanup) => cleanup());
    round.loaded.forEach((text) => text.dispose());
});

test("round-to-rectangle and tier-size changes remeasure bounds and preserve an unconstrained axis", async () => {
    const large = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 2.35, 1));
    const narrow = new THREE.Box3(new THREE.Vector3(-1, 0, -0.45), new THREE.Vector3(1, 2.35, 0.45));
    const props = { text: "Ana", round: true, surfaceBounds: large, messageLayout: { x: 65, y: 80 } };
    const initial = await settleInscription(props);
    const before = new THREE.Vector3().setFromMatrixPosition(initial.group.matrix);
    const rectangle = await settleInscription({ ...props, round: false, surfaceBounds: narrow }, initial);
    const nudged = new THREE.Vector3().setFromMatrixPosition(rectangle.group.matrix);
    assert.ok(Math.abs(nudged.x - before.x) < 1e-8, "Cartesian clamping leaves a valid X coordinate unchanged");
    assert.ok(nudged.z < before.z);
    assert.ok(footprintFits(renderedFootprint(rectangle.geometry), nudged, { minX: -1, maxX: 1, minZ: -0.45, maxZ: 0.45, round: false }));
    assert.equal(rectangle.changes.length, 1, "only the final measured text placement is saved");
    const small = new THREE.Box3(new THREE.Vector3(-0.4, 0, -0.4), new THREE.Vector3(0.4, 2.75, 0.4));
    const smaller = await settleInscription({ ...props, selectedTierIndex: 3, surfaceBounds: small, messageLayout: { ...props.messageLayout, ...rectangle.changes[0] } }, rectangle);
    const position = new THREE.Vector3().setFromMatrixPosition(smaller.group.matrix);
    assert.ok(footprintFits(renderedFootprint(smaller.geometry), position, { minX: -0.4, maxX: 0.4, minZ: -0.4, maxZ: 0.4, round: true }));
    assert.equal(smaller.changes.length, 2);
    assert.ok(Math.abs(position.x - (-0.4 + smaller.changes[1].x / 100 * 0.8)) < 1e-8);
    assert.ok(Math.abs(position.z - (-0.4 + smaller.changes[1].y / 100 * 0.8)) < 1e-8);
    smaller.cleanups.forEach((cleanup) => cleanup());
    smaller.loaded.forEach((text) => text.dispose());
});

test("valid placements stay fixed across shape changes and previews never save nudges", async () => {
    for (const readOnly of [false, true]) {
        const props = { text: "Ana", readOnly, round: false, messageLayout: { x: 55, y: 55 } };
        const rectangle = await settleInscription(props);
        const before = new THREE.Vector3().setFromMatrixPosition(rectangle.group.matrix);
        const round = await settleInscription({ ...props, round: true }, rectangle);
        assert.ok(new THREE.Vector3().setFromMatrixPosition(round.group.matrix).distanceTo(before) < 1e-8);
        assert.equal(round.changes.length, 0);
        round.cleanups.forEach((cleanup) => cleanup());
        round.loaded.forEach((text) => text.dispose());
        const edge = await settleInscription({ ...props, round: false, messageLayout: { x: 99, y: 99 } });
        const nudged = await settleInscription({ ...props, round: true, messageLayout: { x: 99, y: 99 } }, edge);
        assert.equal(nudged.changes.length, readOnly ? 0 : 1);
        nudged.cleanups.forEach((cleanup) => cleanup());
        nudged.loaded.forEach((text) => text.dispose());
    }
});

test("message size scales with the measured tier radius without changing its relative placement", async () => {
    for (const textSize of [50, 100, 150]) {
        let reference;
        for (const [selectedTierIndex, radius] of [[0, 1], [1, 0.72], [2, 0.52], [3, 0.4], [0, 0.63]]) {
            const component = renderInscription({
                selectedTierIndex, text: "Ana", textSize,
                messageLayout: { x: 50, y: 50, curve: -70 },
                surfaceBounds: new THREE.Box3(new THREE.Vector3(-radius, 0, -radius), new THREE.Vector3(radius, 2.35, radius)),
            });
            assert.ok(Math.abs(component.text.props.size - 0.22 * textSize / 100 * radius) < 1e-10);
            const text = await Text.create({
                font, text: "Ana", size: component.text.props.size, depth: component.text.props.depth,
                perGlyphAttributes: true, layout: component.text.props.layout,
            });
            component.text.props.onLoad(text.geometry, text);
            const bounds = text.geometry.boundingBox.getSize(new THREE.Vector3()).divideScalar(radius);
            const position = new THREE.Vector3().setFromMatrixPosition(component.group.matrix);
            const current = { bounds, x: position.x / radius, z: position.z / radius };
            if (!reference) reference = current;
            assert.ok(current.bounds.distanceTo(reference.bounds) < 1e-6, `relative text dimensions at tier ${selectedTierIndex}`);
            assert.ok(Math.abs(current.x - reference.x) < 1e-6 && Math.abs(current.z - reference.z) < 1e-6);
            assert.equal(component.changes.length, 0, "tier scaling does not overwrite the saved position");
            component.cleanups.forEach((cleanup) => cleanup());
            text.dispose();
        }
    }
});

test("the renderer preserves whole-word wraps on narrow tiers without a second wrapping pass", async () => {
    const load = (component) => Text.create({
        font, text: component.text.props.children[0], size: component.text.props.size,
        depth: component.text.props.depth, letterSpacing: component.text.props.letterSpacing,
        lineHeight: component.text.props.lineHeight, perGlyphAttributes: true, layout: component.text.props.layout,
    });
    for (const selectedTierIndex of [0, 3]) for (const width of [30, 80]) {
        const props = { selectedTierIndex, text: "Happy Birthday Alexandra!", messageLayout: { width, curve: -100 } };
        const initial = renderInscription(props);
        assert.equal(initial.text.props.layout.width, undefined, "wait for font measurements before wrapping");
        const initialText = await load(initial);
        initial.text.props.onLoad(initialText.geometry, initialText);
        const wrapped = initial.updates.at(-1);
        assert.ok(wrapped);
        assert.equal(wrapped.text.replaceAll("\n", " "), props.text, "words stay intact and in typed order");
        const component = renderInscription(props, wrapped);
        const text = await load(component);
        const lines = wrapped.text.split("\n");
        assert.equal(new Set(text.glyphs.map((glyph) => glyph.lineIndex)).size, lines.length, "renderer honors only the requested breaks");
        let start = 0;
        lines.forEach((line, lineIndex) => {
            const glyphs = text.glyphs.filter((glyph) => glyph.textIndex >= start && glyph.textIndex < start + line.length);
            assert.ok(glyphs.every((glyph) => glyph.lineIndex === lineIndex), `whole line ${line} stays together`);
            start += line.length + 1;
        });
        component.text.props.onLoad(text.geometry, text);
        assert.equal(component.updates.length, 0, "wrapping settles after one measured update");
        for (const lineIndex of new Set(text.glyphs.map((glyph) => glyph.lineIndex))) {
            const glyphs = text.glyphs.filter((glyph) => glyph.lineIndex === lineIndex && glyph.vertexCount).sort((a, b) => a.textIndex - b.textIndex);
            const centers = glyphs.map((glyph) => {
                let minX = Infinity, maxX = -Infinity;
                for (let vertex = glyph.vertexStart; vertex < glyph.vertexStart + glyph.vertexCount; vertex++) {
                    minX = Math.min(minX, text.geometry.attributes.position.getX(vertex));
                    maxX = Math.max(maxX, text.geometry.attributes.position.getX(vertex));
                }
                return (minX + maxX) / 2;
            });
            assert.ok(centers.every((x, index) => !index || x > centers[index - 1]), `negative curve reads left to right: ${lines[lineIndex]}`);
        }
        const resized = renderInscription({ ...props, messageLayout: { ...props.messageLayout, width: width === 30 ? 80 : 30 } }, wrapped);
        assert.equal(resized.text.props.layout.width, undefined, "stale measurements cannot reflow a resized message");
        for (const item of [initial, component, resized]) item.cleanups.forEach((cleanup) => cleanup());
        initialText.dispose(); text.dispose();
    }
});

test("the message component locks height, pauses controls and saves its clamped drag position", async () => {
    const component = renderInscription({ messageLayout: { x: 50, y: 50, width: 45, curve: 60 } });
    const text = await createText(component.text.props.layout.width, "Happy Birthday Alexandra!");
    component.text.props.onLoad(text.geometry, text);
    assert.ok(component.updates.some((update) => update.text.includes("\n")));
    assert.equal(component.drag.props.axisLock, "y");
    component.tree.props.onPointerDown({ button: 0, stopPropagation() {} });
    assert.equal(component.canvas.style.cursor, "grabbing");
    assert.equal(component.controlsRef.current.enabled, false);
    assert.equal(component.draggingRef.current, true);
    component.drag.props.onDragStart();
    const before = new THREE.Vector3().setFromMatrixPosition(component.group.matrix);
    component.drag.props.onDrag(new THREE.Matrix4().makeTranslation(...before.clone().add(new THREE.Vector3(5, 12, 5)).toArray()));
    const after = new THREE.Vector3().setFromMatrixPosition(component.group.matrix);
    assert.equal(after.y, before.y);
    assert.ok(Math.abs(after.x) < 1 && Math.abs(after.z) < 1);
    component.drag.props.onDragEnd();
    assert.equal(component.canvas.style.cursor, "crosshair");
    assert.equal(component.controlsRef.current.enabled, true);
    assert.equal(component.draggingRef.current, false);
    assert.equal(component.changes.length, 1);
    assert.ok(Math.abs(component.changes[0].x - (after.x + 1) * 50) < 1e-6);
    assert.ok(Math.abs(component.changes[0].y - (after.z + 1) * 50) < 1e-6);
    component.cleanups.forEach((cleanup) => cleanup());
    text.dispose();
});

test("cancel and unmount restore orbit controls; saved previews have no message drag controls", () => {
    const component = renderInscription();
    component.tree.props.onPointerDown({ button: 0, stopPropagation() {} });
    component.tree.props.onPointerCancel();
    assert.equal(component.canvas.style.cursor, "crosshair");
    assert.equal(component.controlsRef.current.enabled, true);
    component.controlsRef.current.enabled = false;
    component.tree.props.onPointerDown({ button: 0, stopPropagation() {} });
    component.tree.props.onPointerUp();
    assert.equal(component.controlsRef.current.enabled, false);
    component.controlsRef.current.enabled = true;
    component.tree.props.onPointerDown({ button: 0, stopPropagation() {} });
    component.cleanups.forEach((cleanup) => cleanup());
    assert.equal(component.canvas.style.cursor, "crosshair");
    assert.equal(component.controlsRef.current.enabled, true);
    assert.equal(component.draggingRef.current, false);
    const preview = renderInscription({ readOnly: true });
    assert.equal(preview.drag.type, "group");
    assert.equal(preview.tree.props.onPointerDown, undefined);
    assert.equal(preview.drag.props.onDrag, undefined);
    assert.equal(preview.canvas.style.cursor, "crosshair");
    preview.cleanups.forEach((cleanup) => cleanup());
});
