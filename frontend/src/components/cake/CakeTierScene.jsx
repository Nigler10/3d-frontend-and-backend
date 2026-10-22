import { useLayoutEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { DEFAULT_FLAVOR, FLAVOR_VISUALS, TOPPING_SIZES, useCustomization } from "../../contexts/Customization";
import CakeInscription from "../CakeInscription";
import { DraggableCakeTopping, useToppingDragPlacement } from "../ToppingDragControls";
import { CAKE_GROUP_POSITION, TIER_TOP_Y, TIER_TOP_RADIUS } from "./tierConfig";
import { getGroundedNutY } from "../../utils/nutPlacement";
import { getChocolateQuaternion } from "../../utils/chocolateRotation";

const TIER_MODEL_URLS = {
    tier1: "https://cake-assets-decc.patrickticoy78.workers.dev/tier1/tier1.gltf",
    tier2: "https://cake-assets-decc.patrickticoy78.workers.dev/tier2/tier2.gltf",
    tier3: "https://cake-assets-decc.patrickticoy78.workers.dev/tier3/tier3.gltf",
    tier4: "https://cake-assets-decc.patrickticoy78.workers.dev/tier4/tier4.gltf",
};

const TIER1_CHERRY_TEXTURE = "https://cake-assets-decc.patrickticoy78.workers.dev/tier1/Cherry.jpg";

const TEXTURE_URLS = {
    choco: {
        map: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/choco_chiffon/Abstract_Organic_007_basecolor.jpg",
        normalMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/choco_chiffon/Abstract_Organic_006_normal.jpg",
        roughnessMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/choco_chiffon/Abstract_Organic_006_roughness.jpg",
        aoMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/choco_chiffon/Abstract_Organic_006_ambientOcclusion.jpg",
    },
    vanilla: {
        map: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/vanilla/vanilla_chiffon_diffuseOriginal.jpg",
        normalMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/vanilla/vanilla_chiffon_normal.jpg",
        roughnessMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/vanilla/vanilla_chiffon_roughness.jpg",
        aoMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/vanilla/vanilla_chiffon_ao.jpg",
    },
    ube: {
        map: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/ube/ube_chiffon_diffuseOriginal.jpg",
        normalMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/ube/ube_chiffon_normal.jpg",
        roughnessMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/ube/ube_chiffon_roughness.jpg",
        aoMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/ube/ube_chiffon_ao.jpg",
    },
};

const TOPPING_3D_CONFIG = {
    candle: {
        yOffset: -0.010,
        rotation: [-Math.PI / 2, 0, 0],
        scale: -0.03,
        radius: 0.95,
    },
    chocolate: {
        yOffset: 0.085,
        rotation: [2.87, -0.55, -2.38],
        scale: 0.1,
        radius: 0.9,
    },
    balls: {
        yOffset: 0.02,
        rotation: [-2.24, 0.35, -0.42],
        scale: -0.06,
        radius: 0.95,
    },
    nuts: {
        yOffset: 0.02,
        rotation: [Math.PI / 2, 0, -2.81],
        scale: 0.18,
        radius: 0.92,
    },
    cherry: {
        yOffset: -0.12,
        rotation: [0, 0, 0],
        scale: 0.039,
        radius: 0.85,
    },
    sprinkles: {
        yOffset: 0.01,
        rotation: [0, 0, 0],
        scale: 0.09,
        radius: 0.88,
    },
};

const BALLS_TIER_SCALE = [1, 0.8, 0.6, 0.55];
const CANDLE_DIGIT_SPACING = 0.25;
const CANDLE_DIGIT_FALLBACK_SCALE = 0.045;
const CANDLE_NUMBER_Y_OFFSET = [-0.12, -0.12, -0.08, -0.08];
const TIER_TOP_ROTATION = [0, 0.18, 0.25, 0.35];
const getToppingPosition = (
    layout,
    config,
    selectedTierIndex,
    candleMode,
    form,
    tierBounds,
    footprint = 0
) => {
    const tierRadius =
        TIER_TOP_RADIUS[selectedTierIndex] ?? TIER_TOP_RADIUS[0];

    const radius = config.radius * tierRadius;

    const isCandle = config === TOPPING_3D_CONFIG.candle;
    const isCherry = config === TOPPING_3D_CONFIG.cherry;

    const [placementMin, placementMax] = isCandle
        ? getCandlePlacementBounds(selectedTierIndex, candleMode)
        : [0, 100];

    let boundedX = Math.max(
        placementMin,
        Math.min(placementMax, layout.x)
    );

    let boundedY = Math.max(
        placementMin,
        Math.min(placementMax, layout.y)
    );

    if (tierBounds) {
        const margin = (isCandle ? 0.01 : 0.10) + footprint;
        const tierScale = TIER_TOP_RADIUS[selectedTierIndex] ?? 1;
        const minX = tierBounds.min.x + margin;
        const maxX = tierBounds.max.x - margin;
        const minZ = tierBounds.min.z + margin;
        const maxZ = tierBounds.max.z - margin;

        let x = THREE.MathUtils.lerp(minX, maxX, boundedX / 100);
        let z = THREE.MathUtils.lerp(minZ, maxZ, boundedY / 100);

        if (form === 1) {
            const centerX = (minX + maxX) / 2;
            const centerZ = (minZ + maxZ) / 2;
            const halfWidth = Math.max((maxX - minX) / 2, 0.001);
            const halfDepth = Math.max((maxZ - minZ) / 2, 0.001);
            const normalizedX = (x - centerX) / halfWidth;
            const normalizedZ = (z - centerZ) / halfDepth;
            const distance = Math.hypot(normalizedX, normalizedZ);

            if (distance > 1) {
                const scale = 1 / distance;
                x = centerX + normalizedX * scale * halfWidth;
                z = centerZ + normalizedZ * scale * halfDepth;
            }
        }

        const topSurfaceY =
            tierBounds.max.y ??
            TIER_TOP_Y[selectedTierIndex] ??
            TIER_TOP_Y[0];

        return [x, topSurfaceY + (isCherry ? -0.04 : config.yOffset), z];
    }



    const x = ((boundedX - 50) / 50) * radius;
    const z = ((boundedY - 50) / 50) * radius;

    const topSurfaceY =
        tierBounds?.max.y ??
        TIER_TOP_Y[selectedTierIndex] ??
        TIER_TOP_Y[0];

    let y = topSurfaceY + config.yOffset;

    if (isCherry) {
        y = topSurfaceY - 0.08;
    }

    return [x, y, z];
};

const getCandlePlacementBounds = (selectedTierIndex, candleMode = "number") => {
    // Allow the 2D UI dot to be dragged freely to the edges
    return [0, 100];
};
const getFlavorMaterialProps = (flavorName, textureByFlavor, fallbackColor, useFlavorColor = false) => {
    // Choco's original material tint is darker than its UI flavor swatch.
    const flavorColor = flavorName === DEFAULT_FLAVOR ? "#683434" : FLAVOR_VISUALS[flavorName]?.color;
    return {
        color: useFlavorColor ? (flavorColor || fallbackColor) : (fallbackColor || flavorColor),
        roughness: flavorName === "Vanilla Chiffon" ? 1 : 0.65,
        metalness: 0.0,
        ...(textureByFlavor[flavorName] || {})
    };
};

const getCakeShape = (name) => {
    const lname = (name || "").toLowerCase();
    if (lname.includes("rectangle") || lname.includes("rect") || lname.includes("cube")) return "rectangle";
    if (lname.includes("round") || lname === "cake" || /^cake([._]\d+)?$/.test(lname)) return "round";
    return null;
};

const getNodeScaleArray = (node, multiplier = 1) => {
    if (!node?.scale) {
        const fallback = CANDLE_DIGIT_FALLBACK_SCALE * multiplier;
        return [fallback, fallback, fallback];
    }

    return [
        node.scale.x * multiplier,
        node.scale.y * multiplier,
        node.scale.z * multiplier,
    ];
};

const getToppingFootprint = (geometry, scale) => {
    if (!geometry) return 0;
    geometry.computeBoundingSphere();
    return (geometry.boundingSphere?.radius || 0) * Math.abs(scale);
};

const getNodeHorizontalHalfExtents = (node, scale, rotation) => {
    if (!node?.geometry) return { x: 0, z: 0 };
    node.geometry.computeBoundingBox();

    const transformedBounds = node.geometry.boundingBox.clone().applyMatrix4(
        new THREE.Matrix4().compose(
            new THREE.Vector3(),
            new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
            new THREE.Vector3(...scale.map((value) => Math.abs(value)))
        )
    );

    return {
        x: Math.max(Math.abs(transformedBounds.min.x), Math.abs(transformedBounds.max.x)),
        z: Math.max(Math.abs(transformedBounds.min.z), Math.abs(transformedBounds.max.z)),
    };
};

const getNodeWidth = (node) => {
    if (!node?.geometry) return 0;
    node.geometry.computeBoundingBox();
    return (node.geometry.boundingBox?.max.x - node.geometry.boundingBox?.min.x || 0) *
        Math.abs(node.scale?.x || CANDLE_DIGIT_FALLBACK_SCALE);
};

const getCenteredNutTransform = (tierBounds, selectedTierIndex, form, geometries = []) => {
    const baseScale = TOPPING_3D_CONFIG.nuts.scale * TOPPING_SIZES.medium;

    // 1. Permanently fix the off-center pivot by centering the 3D geometry
    geometries.forEach((g) => {
        if (g && !g.userData.isCentered) {
            g.center();
            g.userData.isCentered = true;
        }
    });

    // 2. Measure the cake surface width
    const size = new THREE.Vector3();
    if (tierBounds) tierBounds.getSize(size);
    const topWidth = Math.min(size.x || 2, size.z || 2);

    // 3. Measure the actual dimensions of the nuts 
    let maxLocalX = 0, maxLocalY = 0;
    geometries.forEach((geometry) => {
        if (!geometry) return;
        geometry.computeBoundingBox();
        const boxSize = geometry.boundingBox.getSize(new THREE.Vector3());
        maxLocalX = Math.max(maxLocalX, boxSize.x);
        maxLocalY = Math.max(maxLocalY, boxSize.y);
    });

    const nutWorldWidth = Math.max(maxLocalX, maxLocalY);

    // 4. Calculate the proper scale-down size
    const coverageRatio = form === 1 ? 0.55 : 0.55;
    const targetWidth = topWidth * coverageRatio;

    const currentBaseWidth = nutWorldWidth * Math.abs(baseScale);
    const fitScale = currentBaseWidth > 0 ? (targetWidth / currentBaseWidth) : 0.5;
    const finalScale = baseScale * fitScale;

    // 5. Calculate perfect Y height to sit flush on the cake
    const topY = tierBounds?.max?.y ?? TIER_TOP_Y[selectedTierIndex] ?? TIER_TOP_Y[0];

    return {
        // X and Z are locked to 0 for a perfect center placement!
        position: [0, getGroundedNutY(geometries, finalScale, TOPPING_3D_CONFIG.nuts.rotation, topY), 0],
        scale: finalScale,
    };
}

const ICING_TRANSFORMS = {
    0: {
        round: {
            position: [-0.0119, -0.7735, 0.0015],
            scale: [1.235, 1.013, 1.235],
        },
        rectangle: {
            position: [0.008, -1.249, -0.000],
            scale: [1.268, 1.146, 1.267],
        },
    },

    1: {
        round: {
            position: [0, 0, 0],
            scale: [1.01, 1.0, 1.0],
        },
        rectangle: {
            position: [0, 0, 0],
            scale: [1.01, 1.0, 1.01],
        },
    },

    2: {
        round: {
            position: [0, 0, 0],
            scale: [1.01, 1.0, 1.01],
        },
        rectangle: {
            position: [0, 0, 0],
            scale: [1.01, 1.0, 1.01],
        },
    },

    3: {
        round: {
            position: [0, 0, 0],
            scale: [1.01, 1.0, 1.01],
        },
        rectangle: {
            position: [0, 0, 0],
            scale: [1.01, 1.0, 1.01],
        },
    },
};

function applyMaterialsToScene(scene, {
    cakeColor,
    form,
    selectedLayerOverrides = [],
    selectedLayerFlavors = [],
    textureByFlavor = {},
    icingColor,
    cherryTexture,
    cherryVisible = false,
    sprinklesVisible = false,
    tierIndex = 0,
}) {
    if (!scene) return;

    // The shared cake color is editable only for an all-Choco layout. In a
    // mixed layout, each tier must use its own flavor's tint and textures.
    const useCakeColor = selectedLayerFlavors.every((flavorName) => flavorName === DEFAULT_FLAVOR);
    const cherryMatProps = {
        color: "#FFFFFF",
        roughness: 0.42,
        metalness: 0.0,
        ...(cherryTexture ? { map: cherryTexture } : {}),
    };
    const cakeMeshes = [];

    scene.traverse((child) => {
        if (!child.isMesh) return;

        const lname = (child.name || "").toLowerCase();

        if (lname.includes("chandel") || lname.includes("candle")) { child.visible = false; return; }
        if (lname.includes("nut")) { child.visible = false; return; }
        if (lname.includes("bar") || lname.includes("choco")) { child.visible = false; return; }
        if (lname.includes("ball")) { child.visible = false; return; }

        if (lname.includes("icing")) {
            const isRectangleIcing =
                lname.includes("rectangle") || lname.includes("rect");

            const isRoundIcing =
                lname.includes("round");

            child.visible =
                (!isRectangleIcing && !isRoundIcing) ||
                (isRoundIcing && form === 1) ||
                (isRectangleIcing && form === 2);

            child.material = new THREE.MeshPhysicalMaterial({
                color: icingColor?.color || "#3B1F18",
                roughness: 0.3,
                metalness: 0,
                clearcoat: 0.25,
                clearcoatRoughness: 0.4,
                side: THREE.DoubleSide,
            });

            if (child.visible) {
                const type = isRectangleIcing
                    ? "rectangle"
                    : "round";

                const transform =
                    ICING_TRANSFORMS[tierIndex]?.[type];

                if (transform) {
                    child.position.set(...transform.position);
                    child.scale.set(...transform.scale);
                }
            }

            child.castShadow = true;
            child.receiveShadow = true;

            return;
        }

        if (lname.includes("cherry")) {
            // The selected topping is rendered with its configurable position below.
            child.visible = false;
            child.material = new THREE.MeshStandardMaterial(cherryMatProps);
            child.castShadow = true;
            child.receiveShadow = true;
            return;
        }

        if (lname.includes("sprinkle")) {
            const isRectangleSprinkle = lname.includes("rectangle") || lname.includes("rect");
            const isRoundSprinkle = lname.includes("round");
            child.visible = sprinklesVisible && (
                (!isRectangleSprinkle && !isRoundSprinkle) ||
                (isRoundSprinkle && form === 1) ||
                (isRectangleSprinkle && form === 2)
            );
            child.castShadow = true;
            child.receiveShadow = true;
            return;
        }

        const shape = getCakeShape(child.name);
        if (shape) {
            child.visible = (shape === "round" && form === 1) || (shape === "rectangle" && form === 2);
            cakeMeshes.push(child);
            return;
        }

        const isRect =
            child.name === "Cake_Rectangle" ||
            lname.includes("cake_rectangle") ||
            lname.includes("cake_rect") ||
            (lname.includes("rect") && lname.includes("cake"));

        const isRound =
            !isRect && (
                child.name === "Cake" ||
                lname === "cake" ||
                lname === "cake_01" ||
                lname.includes("cake")
            );

        if (isRound) {
            child.visible = form === 1;
            cakeMeshes.push(child);
            return;
        }
        if (isRect) {
            child.visible = form === 2;
            cakeMeshes.push(child);
            return;
        }

        child.castShadow = true;
        child.receiveShadow = true;
    });

    scene.updateWorldMatrix(true, true);
    cakeMeshes
        .filter((mesh) => mesh.visible)
        .map((mesh) => {
            const box = new THREE.Box3().setFromObject(mesh);
            return { mesh, y: box.getCenter(new THREE.Vector3()).y };
        })
        .sort((a, b) => a.y - b.y)
        .forEach(({ mesh }, idx) => {
            const flavorName = selectedLayerFlavors[idx] ?? DEFAULT_FLAVOR;
            const isOverridden = selectedLayerOverrides[idx];
            mesh.material = new THREE.MeshStandardMaterial(
                getFlavorMaterialProps(flavorName, textureByFlavor, cakeColor.color, isOverridden || !useCakeColor)
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        });
}

function CakeTierScene({ selectedTierIndex, autoSpin, cakeGroupRef, controlsRef, onReady, readOnlyToppings = false }) {
    const activeTierUrl = TIER_MODEL_URLS[`tier${selectedTierIndex + 1}`] || TIER_MODEL_URLS.tier1;
    const loadedTier = useGLTF(activeTierUrl);
    // Each canvas needs its own scene graph and material instances. Reusing the
    // cached scene reparents it when several rotatable previews are mounted.
    const activeTier = useMemo(() => {
        // Clone per mesh, even when tiers share a material in the source GLTF.
        const copyMaterial = (material) => material.clone();
        const scene = loadedTier.scene.clone(true);
        scene.traverse((object) => {
            if (object.isMesh) object.material = Array.isArray(object.material)
                ? object.material.map(copyMaterial) : copyMaterial(object.material);
        });
        return { ...loadedTier, scene, materials: Object.fromEntries(Object.entries(loadedTier.materials).map(([name, material]) => [name, copyMaterial(material)])) };
    }, [loadedTier]);
    const { nodes, materials } = activeTier;
    const customization = useCustomization();
    const {
        form,
        cakeColor,
        icingColor,
        flavors,
        flavorTextureMap,
        tierFlavors,
        tierFlavorOverrides,
        candle,
        candleMode,
        candleColor,
        candleNumber,
        chocolate,
        chocolateLayouts,
        balls,
        nuts,
        cherry,
        cherryLayouts,
        sprinkles,
        toppingLayout,
        inscriptionText,
        textFont,
        inscriptionColor,
    } = customization;

    const tierKey = `tier${selectedTierIndex + 1}`;
    const selectedTierFlavors = tierFlavors[tierKey];
    const selectedTierFlavorOverrides = tierFlavorOverrides[tierKey];
    const baseFlavor = selectedTierFlavors?.[0] || DEFAULT_FLAVOR;
    const flavorTextureKeys = useMemo(() => [...new Set(
        [baseFlavor, ...(selectedTierFlavors || [])]
            .map((flavorName) => flavorTextureMap[flavorName] || "choco")
    )], [baseFlavor, selectedTierFlavors, flavorTextureMap]);
    const flavorTextureUrls = useMemo(() => ({
        ...Object.fromEntries(flavorTextureKeys.flatMap((key) => Object.entries(TEXTURE_URLS[key]).map(
            ([property, url]) => [`${key}_${property}`, url]
        ))),
        ...(cherry ? { cherry: TIER1_CHERRY_TEXTURE } : {}),
    }), [flavorTextureKeys, cherry]);
    const loadedFlavorTextures = useTexture(flavorTextureUrls);

    const textureSetsByKey = useMemo(() => Object.fromEntries(
        flavorTextureKeys.map((key) => [
            key,
            Object.fromEntries(Object.keys(TEXTURE_URLS[key]).map((property) => [
                property,
                loadedFlavorTextures[`${key}_${property}`],
            ])),
        ])
    ), [flavorTextureKeys, loadedFlavorTextures]);
    const cherryTexture = loadedFlavorTextures.cherry || null;
    useLayoutEffect(() => {
        if (!cherryTexture) return;
        cherryTexture.colorSpace = THREE.SRGBColorSpace;
        cherryTexture.needsUpdate = true;
    }, [cherryTexture]);
    const activeTierScene = activeTier.scene;

    const activeTierBounds = useMemo(() => {
        if (!activeTierScene) return null;

        const clone = activeTierScene.clone(true);

        // Match the exact transform used by the rendered cake
        if (selectedTierIndex === 0) {
            clone.position.set(0, 0, 0);
            clone.scale.setScalar(1);
            clone.rotation.set(0, 0, 0);
        } else {
            clone.position.set(0, -0.95, 0);
            clone.scale.setScalar(0.9);
            clone.rotation.set(0, Math.PI, 0);
        }

        const cakeBounds = new THREE.Box3();
        const selectedShape = form === 1 ? "round" : "rectangle";

        clone.traverse((child) => {
            if (!child.isMesh) return;

            const lname = (child.name || "").toLowerCase();
            const isTopping = [
                "candle",
                "chandel",
                "nut",
                "bar",
                "ball",
                "cherry",
                "sprinkle",
                "plate",
            ].some((part) => lname.includes(part));

            const shape = getCakeShape(child.name);
            const isMatchingIcing =
                lname.includes("icing") &&
                ((lname.includes("round") && selectedShape === "round") ||
                    ((lname.includes("rectangle") || lname.includes("rect")) && selectedShape === "rectangle"));

            child.visible = !isTopping && (shape === selectedShape || isMatchingIcing);
        });

        clone.updateMatrixWorld(true);

        clone.traverse((child) => {
            if (child.isMesh && child.visible) {
                cakeBounds.expandByObject(child);
            }
        });

        if (cakeBounds.isEmpty()) return new THREE.Box3().setFromObject(clone);

        // Multi-tier models contain wider lower layers. Use only the highest
        // visible surface for topping placement and sizing.
        const topSurfaceBounds = new THREE.Box3();
        const worldVertex = new THREE.Vector3();
        const topY = cakeBounds.max.y;
        clone.traverse((child) => {
            if (!child.isMesh || !child.visible) return;

            const positions = child.geometry?.attributes?.position;
            if (!positions) return;

            for (let index = 0; index < positions.count; index += 1) {
                worldVertex.fromBufferAttribute(positions, index).applyMatrix4(child.matrixWorld);
                if (worldVertex.y >= topY - 0.08) topSurfaceBounds.expandByPoint(worldVertex);
            }
        });

        if (!topSurfaceBounds.isEmpty()) {
            topSurfaceBounds.min.y = cakeBounds.min.y;
            topSurfaceBounds.max.y = cakeBounds.max.y;
            return topSurfaceBounds;
        }

        return cakeBounds;
    }, [
        activeTierScene,
        selectedTierIndex,
        form,
    ]);

    const textureByFlavor = useMemo(() => {
        const map = {};
        (flavors || []).forEach((flavorName) => {
            const key = flavorTextureMap[flavorName] || "choco";
            map[flavorName] = textureSetsByKey[key];
        });
        return map;
    }, [flavors, flavorTextureMap, textureSetsByKey]);

    const matProps = useMemo(() => ({
        cakeColor,
        form,
        selectedLayerFlavors: selectedTierFlavors,
        selectedLayerOverrides: selectedTierFlavorOverrides,
        textureByFlavor,
        icingColor,
        cherryTexture,
        cherryVisible: cherry,
        sprinklesVisible: sprinkles,
    }), [
        cakeColor,
        form,
        selectedTierFlavors,
        selectedTierFlavorOverrides,
        textureByFlavor,
        icingColor,
        cherryTexture,
        cherry,
        sprinkles,
    ]);

    useLayoutEffect(() => {
        applyMaterialsToScene(activeTier.scene, {
            ...matProps,
            tierIndex: selectedTierIndex,
        });
        onReady?.(true);
    }, [activeTier, matProps, selectedTierIndex, onReady]);

    const toppingDrag = useToppingDragPlacement({ scene: activeTier.scene, cakeGroupRef, controlsRef, state: customization, readOnly: readOnlyToppings });

    useFrame((_, delta) => {
        if (autoSpin && cakeGroupRef.current && !toppingDrag.isDragging.current) {
            cakeGroupRef.current.rotation.y -= delta * 0.4;
        }
    });

    const selectedToppings = { candle, chocolate, balls, nuts, cherry, sprinkles };
    const chocolateNode = nodes.bar?.geometry
        ? nodes.bar
        : Object.values(nodes).find((node) => {
            const nodeName = (node?.name || "").toLowerCase();
            return node?.geometry && (nodeName.includes("bar") || nodeName.includes("choco"));
        });
    const chocolateGeometry = chocolateNode?.geometry;
    const ballsFootprint = getToppingFootprint(
        nodes.balls?.geometry,
        TOPPING_3D_CONFIG.balls.scale * TOPPING_SIZES[toppingLayout.balls.size] * (BALLS_TIER_SCALE[selectedTierIndex] ?? 1)
    );
    const cherryFootprint = getToppingFootprint(
        nodes.cherry?.geometry,
        TOPPING_3D_CONFIG.cherry.scale * TOPPING_SIZES.large
    );
    const nutTransform = getCenteredNutTransform(
        activeTierBounds,
        selectedTierIndex,
        form,
        nodes.nuts?.geometry ? [nodes.nuts.geometry] : [nodes.Mesh021?.geometry, nodes.Mesh021_1?.geometry]
    );

    const renderCandleNumber = () => {
        const selectedCandleMode = toppingLayout.candle?.mode || candleMode || "gold";
        const selectedCandleColor = toppingLayout.candle?.color || candleColor || "gold";
        const digitScaleMultiplier = TOPPING_SIZES[toppingLayout.candle.size] || 1;
        const digits = String(Math.max(1, Math.min(100, Number(candleNumber) || 1))).split("");
        const candleNodes = selectedCandleMode === "gold"
            ? [nodes.chandel || nodes.Candle_White_Default].filter(Boolean)
            : digits.map((digit) => nodes[`candle_${digit}`]).filter(Boolean);
        const candleWidth = candleNodes.reduce((width, node) => width + getNodeWidth(node), 0) +
            (selectedCandleMode === "number" ? (digits.length - 1) * CANDLE_DIGIT_SPACING : 0);
        const topSize = new THREE.Vector3();
        activeTierBounds?.getSize(topSize);
        const topWidth = Math.min(topSize.x, topSize.z);
        const requestedCandleWidth = candleWidth * digitScaleMultiplier;
        const candleSizeMultiplier = requestedCandleWidth > 0 && topWidth > 0
            ? Math.min(1, (topWidth * 0.72) / requestedCandleWidth)
            : 1;
        const effectiveCandleScale = digitScaleMultiplier * candleSizeMultiplier;
        const candleExtents = candleNodes.map((node) => getNodeHorizontalHalfExtents(
            node,
            selectedCandleMode === "gold"
                ? Array(3).fill(Math.abs(TOPPING_3D_CONFIG.candle.scale * effectiveCandleScale))
                : getNodeScaleArray(node, effectiveCandleScale),
            selectedCandleMode === "gold" ? TOPPING_3D_CONFIG.candle.rotation : [0, 0, 0]
        ));
        const candleFootprint = selectedCandleMode === "number"
            ? Math.max(
                candleWidth * effectiveCandleScale / 2,
                ...candleExtents.map((extent) => extent.z),
                0.025
            )
            : Math.max(...candleExtents.map((extent) => Math.max(extent.x, extent.z)), 0.025);

        // Pass form and activeTierBounds so it clamps safely inside the cake edges!
        const candlePosition = getToppingPosition(
            toppingLayout.candle,
            TOPPING_3D_CONFIG.candle,
            selectedTierIndex,
            selectedCandleMode,
            form,
            activeTierBounds,
            candleFootprint
        );
        const candleNumberPosition = [
            candlePosition[0],
            // Use the selected tier index to grab the specific height from your new array
            candlePosition[1] + (CANDLE_NUMBER_Y_OFFSET[selectedTierIndex] ?? -0.12),
            candlePosition[2],
        ];
        const candleMaterial = selectedCandleColor === "white"
            ? (materials.Candle_White_Default || materials.chandel || materials.Default)
            : (materials.chandel || materials.Candle_White_Default || materials.Default);

        if (selectedCandleMode === "gold") {
            const goldCandleMesh = nodes.chandel?.geometry || nodes.Candle_White_Default?.geometry;
            if (!goldCandleMesh) return null;

            return (
                <DraggableCakeTopping id="candle" controller={toppingDrag} anchor={candlePosition} layout={toppingLayout.candle} insertionDepth="existing">
                <mesh
                    geometry={goldCandleMesh}
                    material={materials.chandel || materials.Candle_White_Default || materials.Default}
                    position={candlePosition}
                    rotation={TOPPING_3D_CONFIG.candle.rotation}
                    scale={TOPPING_3D_CONFIG.candle.scale * effectiveCandleScale}
                    castShadow
                    receiveShadow
                />
                </DraggableCakeTopping>
            );
        }

        const spacing = CANDLE_DIGIT_SPACING * effectiveCandleScale;
        const digitMaterial = candleMaterial;
        const hasDigitMeshes = digits.every((digit) => nodes[`candle_${digit}`]?.geometry);

        if (!hasDigitMeshes) {
            const fallbackCandle = nodes.chandel?.geometry || nodes.Candle_White_Default?.geometry;
            if (!fallbackCandle) return null;

            return (
                <DraggableCakeTopping id="candle" controller={toppingDrag} anchor={candleNumberPosition} layout={toppingLayout.candle} insertionDepth="existing">
                <mesh
                    geometry={fallbackCandle}
                    material={candleMaterial}
                    position={candleNumberPosition}
                    rotation={TOPPING_3D_CONFIG.candle.rotation}
                    scale={TOPPING_3D_CONFIG.candle.scale * effectiveCandleScale}
                    castShadow
                    receiveShadow
                />
                </DraggableCakeTopping>
            );
        }

        const digitWidths = digits.map((digit) => {
            const node = nodes[`candle_${digit}`];
            if (!node.geometry.boundingBox) node.geometry.computeBoundingBox();
            return (node.geometry.boundingBox.max.x - node.geometry.boundingBox.min.x) * Math.abs(getNodeScaleArray(node, effectiveCandleScale)[0]);
        });
        const digitCenters = [0];
        for (let index = 1; index < digits.length; index += 1) {
            digitCenters.push(digitCenters[index - 1] + Math.max(spacing, (digitWidths[index - 1] + digitWidths[index]) / 2 + 0.015));
        }
        const digitGroupCenter = (digitCenters[0] - digitWidths[0] / 2 + digitCenters.at(-1) + digitWidths.at(-1) / 2) / 2;

        const cakeTopY =
    activeTierBounds?.max.y ??
    TIER_TOP_Y[selectedTierIndex] ??
    TIER_TOP_Y[0];

const candleEmbedDepth = 0.10 * effectiveCandleScale;

return (
    <DraggableCakeTopping id="candle" controller={toppingDrag} anchor={candlePosition} layout={toppingLayout.candle} insertionDepth={candleEmbedDepth}>
    <group
        position={[
            candlePosition[0],
            cakeTopY - candleEmbedDepth,
            candlePosition[2],
        ]}
    >
        {digits.map((digit, idx) => {
            const node = nodes[`candle_${digit}`];

            const digitScale = getNodeScaleArray(
                node,
                effectiveCandleScale
            );

            node.geometry.computeBoundingBox();

            const bounds = node.geometry.boundingBox;

            const scaledBottomY = bounds
                ? Math.min(
                    bounds.min.y * digitScale[1],
                    bounds.max.y * digitScale[1]
                )
                : 0;

            const xOffset =
                digitCenters[idx] - digitGroupCenter - (bounds.min.x + bounds.max.x) * digitScale[0] / 2;

            return (
                <mesh
                    key={`${digit}-${idx}`}
                    geometry={node.geometry}
                    material={digitMaterial}
                    position={[xOffset, -scaledBottomY, 0]}
                    rotation={[0, 0, 0]}
                    scale={digitScale}
                    castShadow
                    receiveShadow
                />
            );
        })}
    </group>
    </DraggableCakeTopping>
);
    };

    const renderCustomToppings = () => (
        <>
            {selectedToppings.candle && renderCandleNumber()}

            {selectedToppings.nuts && nodes.nuts?.geometry && (
                <mesh
                    geometry={nodes.nuts.geometry}
                    material={materials.Default}
                    position={[0, nutTransform.position[1], 0]}
                    rotation={TOPPING_3D_CONFIG.nuts.rotation}
                    scale={nutTransform.scale}
                />
            )}

            {selectedToppings.nuts && !nodes.nuts?.geometry && nodes.Mesh021?.geometry && nodes.Mesh021_1?.geometry && (
                <group
                    position={[0, nutTransform.position[1], 0]}
                    rotation={TOPPING_3D_CONFIG.nuts.rotation}
                    scale={nutTransform.scale}
                >
                    <mesh geometry={nodes.Mesh021.geometry} material={materials.Default} />
                    <mesh geometry={nodes.Mesh021_1.geometry} material={materials.Default} />
                </group>
            )}

            {selectedToppings.chocolate && chocolateGeometry && chocolateLayouts.map((layout, index) => {
                const scale = TOPPING_3D_CONFIG.chocolate.scale * 0.5 * (TOPPING_SIZES[layout.size] || 1);
                const footprint = getToppingFootprint(chocolateGeometry, scale);
                const position = getToppingPosition(layout, TOPPING_3D_CONFIG.chocolate, selectedTierIndex, undefined, form, activeTierBounds, footprint);
                return (
                    <DraggableCakeTopping key={`chocolate-${index}`} id={`chocolate-${index}`} controller={toppingDrag} anchor={position} layout={layout}>
                        <mesh
                            geometry={chocolateGeometry}
                            material={materials.choco || chocolateNode.material || new THREE.MeshStandardMaterial({
                                color: "#5A2415",
                                roughness: 0.55,
                                metalness: 0,
                            })}
                            position={position}
                            quaternion={getChocolateQuaternion(layout.rotation, TOPPING_3D_CONFIG.chocolate.rotation)}
                            scale={scale}
                            visible={true}
                            castShadow
                            receiveShadow
                        />
                    </DraggableCakeTopping>
                );
            })}

            {selectedToppings.balls && nodes.balls?.geometry && (
                <DraggableCakeTopping id="balls" controller={toppingDrag} anchor={getToppingPosition(toppingLayout.balls, TOPPING_3D_CONFIG.balls, selectedTierIndex, undefined, form, activeTierBounds, ballsFootprint)} layout={toppingLayout.balls}>
                <mesh
                    geometry={nodes.balls.geometry}
                    material={materials.balls}
                    position={getToppingPosition(
                        toppingLayout.balls,
                        TOPPING_3D_CONFIG.balls,
                        selectedTierIndex,
                        undefined,
                        form,
                        activeTierBounds,
                        ballsFootprint
                    )}
                    rotation={TOPPING_3D_CONFIG.balls.rotation}
                    scale={TOPPING_3D_CONFIG.balls.scale * TOPPING_SIZES[toppingLayout.balls.size] * (BALLS_TIER_SCALE[selectedTierIndex] ?? 1)}
                />
                </DraggableCakeTopping>
            )}
            {selectedToppings.cherry && nodes.cherry?.geometry && (
                cherryLayouts.map((layout, index) => (
                    <DraggableCakeTopping key={`cherry-${index}`} id={`cherry-${index}`} controller={toppingDrag} anchor={getToppingPosition(layout, TOPPING_3D_CONFIG.cherry, selectedTierIndex, undefined, form, activeTierBounds, cherryFootprint)} layout={layout}>
                    <mesh
                        key={`cherry-${index}`}
                        geometry={nodes.cherry.geometry}
                        material={materials.cherry || materials.Default}
                        position={getToppingPosition(
                            layout,
                            TOPPING_3D_CONFIG.cherry,
                            selectedTierIndex,
                            undefined,
                            form,
                            activeTierBounds,
                            cherryFootprint
                        )}
                        rotation={TOPPING_3D_CONFIG.cherry.rotation}
                        scale={TOPPING_3D_CONFIG.cherry.scale * TOPPING_SIZES[layout.size]}
                        castShadow
                    />
                    </DraggableCakeTopping>
                ))
            )}

        </>
    );

    return (
        <group ref={cakeGroupRef} dispose={null} position={CAKE_GROUP_POSITION}>
            <primitive
                object={activeTier.scene}
                position={selectedTierIndex === 0 ? [0, 0, 0] : [0, -0.95, 0]}
                scale={selectedTierIndex === 0 ? 1 : 0.9}
                rotation={selectedTierIndex === 0 ? [0, 0, 0] : [0, Math.PI, 0]}
            />

            {renderCustomToppings()}
            <CakeInscription
                selectedTierIndex={selectedTierIndex}
                text={inscriptionText}
                font={textFont}
                color={inscriptionColor}
                topY={activeTierBounds?.max.y}
            />
        </group>
    );
}



export function Tier1Cake(props) { return <CakeTierScene {...props} selectedTierIndex={0} />; }
export function Tier2Cake(props) { return <CakeTierScene {...props} selectedTierIndex={1} />; }
export function Tier3Cake(props) { return <CakeTierScene {...props} selectedTierIndex={2} />; }
export function Tier4Cake(props) { return <CakeTierScene {...props} selectedTierIndex={3} />; }
