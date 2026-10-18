import test from "node:test";
import assert from "node:assert/strict";
import { Box3, BoxGeometry, BufferGeometry, Float32BufferAttribute, Group, Mesh, PerspectiveCamera, Plane, Vector3 } from "three";
import {
    TOPPING_PLACEMENT_GAP,
    TOPPING_SURFACE_OFFSET,
    constrainToppingPosition,
    findToppingPosition,
    getTransformedToppingBox,
    getToppingSurfaceHeight,
    isToppingPositionValid,
    projectToppingDrag,
} from "../src/utils/toppingDragPlacement.js";

const surface = { minX: -1, maxX: 1, minZ: -1, maxZ: 1, round: false };
const box = (width = 0.2, depth = width) => new Box3(new Vector3(-width / 2, 0, -depth / 2), new Vector3(width / 2, 0.4, depth / 2));
const at = (bounds, x, z, y = 0) => bounds.clone().translate(new Vector3(x, y, z));
const valid = (bounds, position, options = {}) => isToppingPositionValid({ box: bounds, position, surface, ...options });

test("raycast placement rests the mesh bottom on the transformed cake with a stable micro-offset", () => {
    const cake = new Group();
    cake.position.set(2, -0.8, -3);
    cake.rotation.set(0.15, 0.8, -0.1);
    cake.scale.set(0.9, 1.2, 0.8);
    const top = new Mesh(new BoxGeometry(2, 0.4, 2));
    top.position.y = 1;
    cake.add(top);
    const bounds = new Box3(new Vector3(-0.1, -0.3, -0.1), new Vector3(0.1, 0.6, 0.1));
    for (const x of [-0.7, 0, 0.7]) {
        const options = { box: bounds, position: new Vector3(x, 0, 0), surface: { topY: 1.2, meshes: [top] }, parent: cake };
        const y = getToppingSurfaceHeight(options);
        assert.ok(Math.abs(y + bounds.min.y - 1.2 - TOPPING_SURFACE_OFFSET) < 1e-6);
        assert.equal(getToppingSurfaceHeight(options), y);
        assert.ok(Math.abs(getToppingSurfaceHeight({ ...options, insertionDepth: 0.1 }) - (y - 0.1)) < 1e-6);
    }
});

test("raycast placement follows local surface height and raised edges under the footprint", () => {
    const parent = new Group();
    const flat = new Mesh(new BoxGeometry(2, 0.2, 2));
    flat.position.y = 1;
    const raised = new Mesh(new BoxGeometry(0.2, 0.2, 0.2));
    raised.position.set(0.1, 1.2, 0.1);
    parent.add(flat, raised);
    const options = { box: box(0.2), position: new Vector3(), surface: { topY: 1.3, meshes: [flat, raised] }, parent };
    assert.ok(Math.abs(getToppingSurfaceHeight(options) - 1.301) < 1e-6);
    assert.ok(Math.abs(getToppingSurfaceHeight({ ...options, position: new Vector3(-0.6, 0, 0) }) - 1.101) < 1e-6);
});

test("package coordinates project correctly through a scrolled offset parent and a rotated cake", () => {
    const parent = new Group();
    parent.position.set(2, -0.8, 3);
    parent.rotation.y = 0.8;
    parent.updateWorldMatrix(true, true);
    const camera = new PerspectiveCamera(45, 2, 0.1, 100);
    camera.position.set(2, 6, 9);
    camera.lookAt(2, 0.4, 3);
    camera.updateWorldMatrix(true, false);
    const local = new Vector3(0.3, 1.2, -0.2);
    const screen = parent.localToWorld(local.clone()).project(camera);
    const rect = { left: 120, top: 80, width: 800, height: 400 };
    const offsetParent = { scrollLeft: 15, scrollTop: 30, getBoundingClientRect: () => ({ left: 40, top: 20 }) };
    const node = { offsetParent, ownerDocument: { body: {} } };
    const data = { node, x: rect.left + (screen.x + 1) * rect.width / 2 + 15 - 40, y: rect.top + (1 - screen.y) * rect.height / 2 + 30 - 20 };
    const plane = new Plane(new Vector3(0, 1, 0), -local.y).applyMatrix4(parent.matrixWorld);
    const actual = projectToppingDrag({ data, canvas: { getBoundingClientRect: () => rect }, camera, parent, plane });
    assert.ok(actual.distanceTo(local) < 1e-6);
});

test("pointer projection snaps to cake geometry before falling back to its drag plane", () => {
    const parent = new Group();
    const cake = new Mesh(new BoxGeometry(4, 1, 4));
    cake.position.y = 0.5;
    parent.add(cake);
    parent.updateWorldMatrix(true, true);
    const camera = new PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.set(0, 6, 5);
    camera.lookAt(0, 1, 0);
    camera.updateWorldMatrix(true, false);
    const body = { scrollLeft: 0, scrollTop: 0 };
    const canvas = { ownerDocument: { body }, getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 400 }) };
    const plane = new Plane(new Vector3(0, 1, 0), -2);
    const options = { data: { node: canvas, x: 200, y: 200 }, canvas, camera, parent, plane };
    assert.ok(Math.abs(projectToppingDrag({ ...options, meshes: [cake] }).y - 1) < 1e-6);
    assert.ok(Math.abs(projectToppingDrag(options).y - 2) < 1e-6);
});

test("transformed geometry includes rotation, negative scale, and parent-relative coordinates", () => {
    const cake = new Group();
    cake.position.set(4, 3, -2);
    cake.rotation.set(0.2, 0.9, -0.1);
    cake.scale.set(0.9, 1.2, 0.8);
    const topping = new Group();
    topping.position.set(0.3, 1.1, -0.2);
    const mesh = new Mesh(new BoxGeometry(2, 1, 4));
    mesh.scale.set(-0.5, 2, 0.25);
    mesh.rotation.y = Math.PI / 2;
    topping.add(mesh);
    cake.add(topping);
    const actual = getTransformedToppingBox(topping, cake);
    assert.ok(actual.min.distanceTo(new Vector3(-0.2, 0.1, -0.7)) < 1e-6);
    assert.ok(actual.max.distanceTo(new Vector3(0.8, 2.1, 0.3)) < 1e-6);
});

test("mesh vertices give tighter bounds than transforming a local bounding box", () => {
    const group = new Group();
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 0, 0, 2], 3));
    const mesh = new Mesh(geometry);
    mesh.rotation.y = Math.PI / 4;
    mesh.scale.x = -1;
    group.add(mesh);
    const actual = getTransformedToppingBox(group, group);
    assert.ok(Math.abs(actual.max.x - Math.sqrt(2)) < 1e-6);
    assert.ok(Math.abs(actual.min.z + 1 / Math.sqrt(2)) < 1e-6);
});

for (const number of ["1", "10", "100"]) {
    test(`number candle ${number} is one placement group containing all digits`, () => {
        const group = new Group();
        for (let index = 0; index < number.length; index += 1) {
            const digit = new Mesh(new BoxGeometry(0.16, 0.6, 0.08));
            digit.position.set((index - (number.length - 1) / 2) * 0.19, 0, 0);
            group.add(digit);
        }
        const bounds = getTransformedToppingBox(group, group);
        assert.ok(Math.abs(bounds.getSize(new Vector3()).x - (0.16 + 0.19 * (number.length - 1))) < 1e-6);
        assert.equal(valid(bounds, new Vector3(0, 0, 0)), true);
        assert.equal(valid(bounds, new Vector3(0.95, 0, 0)), false);
        const obstacle = at(box(0.1), bounds.max.x + 0.04, 0);
        assert.equal(valid(bounds, new Vector3(), { obstacles: [obstacle] }), false);
    });
}

test("the entire footprint stays inside rectangle and round tier surfaces 1 through 4", () => {
    for (const radius of [1, 0.72, 0.52, 0.4]) {
        for (const round of [false, true]) {
            const tierSurface = { minX: -radius, maxX: radius, minZ: -radius, maxZ: radius, round };
            const decoration = box(0.18, 0.1);
            const candidate = findToppingPosition({ box: decoration, position: new Vector3(radius, 2, radius), surface: tierSurface });
            assert.ok(candidate);
            assert.equal(valid(decoration, candidate, { surface: tierSurface }), true);
            assert.equal(candidate.y, 2);
            assert.equal(valid(decoration, new Vector3(radius - 0.01, 2, 0), { surface: tierSurface }), false);
        }
    }
});

test("round and elliptical boundaries reject corners even when their center is inside", () => {
    assert.equal(valid(box(0.4), new Vector3(0.65, 0, 0.65), { surface: { ...surface, round: true } }), false);
    const ellipse = { minX: -1.4, maxX: 1.4, minZ: -0.6, maxZ: 0.6, round: true };
    const candidate = findToppingPosition({ box: box(0.15), position: new Vector3(1.3, 0, 0.5), surface: ellipse });
    assert.ok(candidate);
    assert.equal(valid(box(0.15), candidate, { surface: ellipse }), true);
});

test("actual rounded rectangle outlines contain every footprint corner with either winding", () => {
    const outline = [
        { x: -1, z: -0.6 }, { x: -0.6, z: -1 }, { x: 0.6, z: -1 }, { x: 1, z: -0.6 },
        { x: 1, z: 0.6 }, { x: 0.6, z: 1 }, { x: -0.6, z: 1 }, { x: -1, z: 0.6 },
    ];
    const decoration = box(0.2);
    const target = new Vector3(0.75, 2, 0.75);
    assert.equal(valid(decoration, target), true);
    for (const points of [outline, [...outline].reverse()]) {
        const rounded = { ...surface, outline: points };
        assert.equal(valid(decoration, target, { surface: rounded }), false);
        const packed = findToppingPosition({ box: decoration, position: target, surface: rounded });
        assert.ok(packed);
        assert.equal(valid(decoration, packed, { surface: rounded }), true);
        const dragged = constrainToppingPosition({ box: decoration, from: new Vector3(0, 2, 0), to: target, surface: rounded });
        assert.equal(valid(decoration, dragged, { surface: rounded }), true);
        assert.ok((dragged.x + 0.1 + dragged.z + 0.1) <= 1.6 - TOPPING_PLACEMENT_GAP * Math.SQRT2 + 1e-7);
        assert.equal(dragged.y, 2);
    }
});

test("collisions enforce a consistent gap and do not allow vertically stacked decorations", () => {
    const obstacle = at(box(), 0, 0, 10);
    assert.equal(valid(box(), new Vector3(0.2 + TOPPING_PLACEMENT_GAP, -5, 0), { obstacles: [obstacle] }), true);
    assert.equal(valid(box(), new Vector3(0.2 + TOPPING_PLACEMENT_GAP / 2, -5, 0), { obstacles: [obstacle] }), false);
});

test("a fast drag cannot tunnel through a thin obstacle even when its final target is valid", () => {
    const decoration = box(0.08);
    const obstacles = [at(box(0.01, 1.5), 0, 0)];
    const from = new Vector3(-0.7, 2.2, 0);
    const to = new Vector3(0.7, 2.2, 0);
    assert.equal(valid(decoration, to, { obstacles }), true);
    const result = constrainToppingPosition({ box: decoration, from, to, surface, obstacles });
    assert.ok(result.x < 0);
    assert.equal(valid(decoration, result, { obstacles }), true);
    assert.equal(result.y, to.y);
});

test("dragging slides smoothly at contact and remains stable across repeated events", () => {
    const decoration = box(0.2);
    const obstacles = [at(box(0.3), 0, 0)];
    let from = new Vector3(-0.7, 1.2, -0.1);
    const to = new Vector3(0, 1.2, 0.1);
    from = constrainToppingPosition({ box: decoration, from, to, surface, obstacles });
    for (let index = 0; index < 30; index += 1) {
        const next = constrainToppingPosition({ box: decoration, from, to, surface, obstacles });
        assert.equal(valid(decoration, next, { obstacles }), true);
        assert.ok(next.distanceTo(from) < 1e-6);
        from = next;
    }
    const slid = constrainToppingPosition({ box: decoration, from, to: new Vector3(0, 1.2, 0.7), surface, obstacles });
    assert.ok(slid.z > from.z);
    assert.equal(valid(decoration, slid, { obstacles }), true);
});

test("a contact slide cannot shortcut through a second topping between frames", () => {
    const decoration = box(0.2);
    const obstacles = [at(box(0.3), 0, 0), at(box(0.04, 0.02), -0.25, -0.56)];
    const from = new Vector3(-0.7, 1, -0.7);
    const to = new Vector3(0.7, 1, 0.7);
    const result = constrainToppingPosition({ box: decoration, from, to, surface, obstacles });
    assert.equal(valid(decoration, result, { obstacles }), true);
    assert.ok(result.x < 0);
    for (let index = 0; index <= 100; index += 1) {
        const sample = new Vector3().lerpVectors(from, result, index / 100);
        assert.equal(valid(decoration, sample, { obstacles }), true);
    }
});

test("boundary drags contain the full box and preserve the requested insertion height", () => {
    for (const round of [false, true]) {
        const options = { box: box(0.3), from: new Vector3(0, 2.13, 0), to: new Vector3(5, 2.13, 3), surface: { ...surface, round } };
        const result = constrainToppingPosition(options);
        assert.equal(valid(options.box, result, { surface: options.surface }), true);
        assert.equal(result.y, 2.13);
    }
});

test("multiple cherries pack deterministically without moving already valid placements", () => {
    const obstacles = [];
    const positions = [];
    const decoration = box(0.23);
    const round = { ...surface, round: true };
    for (let index = 0; index < 12; index += 1) {
        const position = findToppingPosition({ box: decoration, position: new Vector3(0, 0.9, 0), surface: round, obstacles });
        assert.ok(position);
        assert.equal(valid(decoration, position, { surface: round, obstacles }), true);
        positions.push(position);
        obstacles.push(at(decoration, position.x, position.z));
    }
    const preserved = findToppingPosition({ box: decoration, position: positions[0], surface: round, obstacles: obstacles.slice(1) });
    assert.ok(preserved.equals(positions[0]));
    const repeat = findToppingPosition({ box: decoration, position: new Vector3(0, 0.9, 0), surface: round, obstacles: obstacles.slice(0, 4) });
    assert.ok(repeat.equals(positions[4]));
});

test("resizing revalidates footprints and reports insufficient space without shrinking", () => {
    const small = box(0.2);
    const large = box(2.1);
    const request = new Vector3(0.7, 1, 0.7);
    assert.ok(findToppingPosition({ box: small, position: request, surface }));
    const sizeBefore = large.getSize(new Vector3());
    assert.equal(findToppingPosition({ box: large, position: request, surface }), null);
    assert.ok(large.getSize(new Vector3()).equals(sizeBefore));
    assert.equal(findToppingPosition({ box: small, position: new Vector3(), surface, obstacles: [at(box(2), 0, 0)] }), null);
});
