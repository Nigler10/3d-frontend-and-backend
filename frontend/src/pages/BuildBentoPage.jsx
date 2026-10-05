// src/pages/BuildBentoPage.jsx
import { useRef, Suspense, useState, useEffect, useMemo, Component } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF, useTexture, OrbitControls, ContactShadows } from "@react-three/drei";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useLocation, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { CAKE_SIZES, CustomizationProvider, FLAVOR_VISUALS, INSCRIPTION_COLOR_OPTIONS, TEXT_FONT_OPTIONS, TOPPING_OPTIONS, TOPPING_SIZES, useCustomization } from "../contexts/Customization";
import { useCart } from "../context/CartContext";
import CakeInscription from "../components/CakeInscription";
import CakeCompass from "../components/CakeCompass";
import {
    Cake,
    Circle,
    Square,
    Flame,
    Cookie,
    Sparkles,
    Wheat,
    Cherry,
    Hash,
    Dices,
    ShoppingCart,
    CheckCircle2,
    XCircle,
    MousePointer,
} from "lucide-react";
import './BuildBentoPage.css';

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
        map: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/vanilla/vanilla/vanilla_chiffon_diffuse.jpg",
        normalMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/vanilla/vanilla/vanilla_chiffon_normal.jpg",
        aoMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/vanilla/vanilla/vanilla_chiffon_ao.jpg",
    },
    ube: {
        map: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/ube/ube_chiffon_diffuseOriginal.jpg",
        normalMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/ube/ube_chiffon_normal.jpg",
        aoMap: "https://cdn.jsdelivr.net/gh/patzylifts/cake-assets@main/textures/ube/ube_chiffon_ao.jpg",
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
const TIER_TOP_Y = [2.35, 1.80, 2.35, 2.73];
const TIER_TOP_RADIUS = [1, 0.72, 0.52, 0.40];
const CANDLE_DIGIT_SPACING = 0.25;
const CANDLE_DIGIT_FALLBACK_SCALE = 0.045;
const CANDLE_NUMBER_Y_OFFSET = [-0.12, -0.12, -0.08, -0.08];
const TIER_TOP_ROTATION = [0, 0.18, 0.25, 0.35];
const TIER_FLAVOR_LABELS = {
    1: ["Cake"],
    2: ["Bottom Tier", "Top Tier"],
    3: ["Bottom Tier", "Middle Tier", "Top Tier"],
    4: ["Bottom Tier", "Second Tier", "Third Tier", "Top Tier"],
};

const FLAVOR_LABELS = {
    "Choco Moist": "Chocolate",
    "Vanilla Chiffon": "Vanilla",
    "Ube Chiffon": "Ube",
};

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
const clampToppingToBoard = (x, y, form, markerDiameter, width, height) => {
    // Failsafe para sa tamang numbers
    const safeX = Number.isFinite(Number(x)) ? Number(x) : 50;
    const safeY = Number.isFinite(Number(y)) ? Number(y) : 50;

    let finalX = safeX;
    let finalY = safeY;

    // Kapag nag-load ang component at 0 pa ang width/height
    if (!width || !height) {
        if (form === 1) { // Round Cake
            const dx = safeX - 50;
            const dy = safeY - 50;
            const dist = Math.hypot(dx, dy);
            // Limit distance to 40% from center safely
            if (dist > 40 && dist > 0) {
                finalX = 50 + (dx / dist) * 40;
                finalY = 50 + (dy / dist) * 40;
            }
        } else { // Rectangle Cake
            finalX = Math.max(10, Math.min(90, safeX));
            finalY = Math.max(10, Math.min(90, safeY));
        }
    } else {
        // Normal na clamping logic kapag nakuha na ang exact DOM dimensions
        const marginPx = (markerDiameter / 2) + 8; // Exact safety gap
        const marginPctX = (marginPx / width) * 100;
        const marginPctY = (marginPx / height) * 100;

        if (form === 1) {
            const maxRadiusX = Math.max(5, 50 - marginPctX);
            const maxRadiusY = Math.max(5, 50 - marginPctY);
            const dx = safeX - 50;
            const dy = safeY - 50;

            // Normalized distance computation
            const dist = Math.hypot(dx / maxRadiusX, dy / maxRadiusY);

            // FIX: Dito nangyari ang bug. Tinanggal na natin ang pag-multiply 
            // ulit sa maxRadius kaya hinding hindi na ito tatalon pa-labas.
            if (dist > 1 && dist > 0) {
                finalX = 50 + (dx / dist);
                finalY = 50 + (dy / dist);
            }
        } else {
            const cornerRadius = Math.min(16, width / 2, height / 2);
            const safeCornerRadius = Math.max(0, cornerRadius - marginPx);
            const cornerStart = marginPx + safeCornerRadius;

            let boundedX = Math.max(marginPctX, Math.min(100 - marginPctX, safeX));
            let boundedY = Math.max(marginPctY, Math.min(100 - marginPctY, safeY));

            const pixelX = (boundedX / 100) * width;
            const pixelY = (boundedY / 100) * height;
            const isLeftCorner = pixelX < cornerStart;
            const isRightCorner = pixelX > width - cornerStart;
            const isTopCorner = pixelY < cornerStart;
            const isBottomCorner = pixelY > height - cornerStart;

            if ((isLeftCorner || isRightCorner) && (isTopCorner || isBottomCorner)) {
                const centerX = isLeftCorner ? cornerRadius : width - cornerRadius;
                const centerY = isTopCorner ? cornerRadius : height - cornerRadius;
                const dx = pixelX - centerX;
                const dy = pixelY - centerY;
                const distance = Math.hypot(dx, dy);

                if (distance > safeCornerRadius && safeCornerRadius > 0) {
                    const directionX = distance > 0 ? dx / distance : (isLeftCorner ? -1 : 1) / Math.SQRT2;
                    const directionY = distance > 0 ? dy / distance : (isTopCorner ? -1 : 1) / Math.SQRT2;
                    boundedX = ((centerX + directionX * safeCornerRadius) / width) * 100;
                    boundedY = ((centerY + directionY * safeCornerRadius) / height) * 100;
                }
            }
            finalX = Math.max(marginPctX, Math.min(100 - marginPctX, boundedX));
            finalY = Math.max(marginPctY, Math.min(100 - marginPctY, boundedY));
        }
    }

    // Ultimate Guardrail: I-force ang X at Y na laging may valid number (0 hanggang 100)
    // para imposible nang mawala ang indicator sa screen.
    if (Number.isNaN(finalX)) finalX = 50;
    if (Number.isNaN(finalY)) finalY = 50;

    return [
        Math.max(0, Math.min(100, finalX)),
        Math.max(0, Math.min(100, finalY))
    ];
};
const getFlavorMaterialProps = (flavorName, textureByFlavor, fallbackColor, useFlavorColor = false) => ({
    color: useFlavorColor
        ? (FLAVOR_VISUALS[flavorName]?.color || fallbackColor)
        : (fallbackColor || FLAVOR_VISUALS[flavorName]?.color),
    roughness: 0.65,
    metalness: 0.0,
    ...(textureByFlavor[flavorName] || {})
});

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
    let maxLocalX = 0, maxLocalY = 0, maxLocalZ = 0;
    geometries.forEach((geometry) => {
        if (!geometry) return;
        geometry.computeBoundingBox();
        const boxSize = geometry.boundingBox.getSize(new THREE.Vector3());
        maxLocalX = Math.max(maxLocalX, boxSize.x);
        maxLocalY = Math.max(maxLocalY, boxSize.y);
        maxLocalZ = Math.max(maxLocalZ, boxSize.z);
    });

    // Because the nuts are rotated 90-degrees (Math.PI/2) on the X axis, 
    // its vertical height in the 3D world is actually its local Z dimension.
    const nutWorldWidth = Math.max(maxLocalX, maxLocalY);
    const nutWorldHeight = maxLocalZ;

    // 4. Calculate the proper scale-down size
    const coverageRatio = form === 1 ? 0.55 : 0.55;
    const targetWidth = topWidth * coverageRatio;

    const currentBaseWidth = nutWorldWidth * Math.abs(baseScale);
    const fitScale = currentBaseWidth > 0 ? (targetWidth / currentBaseWidth) : 0.5;
    const finalScale = baseScale * fitScale;

    // 5. Calculate perfect Y height to sit flush on the cake
    const topY = tierBounds?.max?.y ?? TIER_TOP_Y[selectedTierIndex] ?? TIER_TOP_Y[0];

    // Since the pivot is now dead center, we lift it by exactly half 
    // its scaled height so it rests beautifully on the icing.
    const flushYOffset = (nutWorldHeight * Math.abs(finalScale)) / 2;

    return {
        // X and Z are locked to 0 for a perfect center placement!
        position: [0, topY + flushYOffset - 0.02, 0],
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
    activeTexture,
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

    const cakeMatProps = { color: cakeColor.color, roughness: 0.65, metalness: 0.0, ...activeTexture };
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
            if (form === 1) child.material = new THREE.MeshStandardMaterial(cakeMatProps);
            return;
        }
        if (isRect) {
            child.visible = form === 2;
            if (form === 2) child.material = new THREE.MeshStandardMaterial(cakeMatProps);
            return;
        }

        child.castShadow = true;
        child.receiveShadow = true;
    });

    cakeMeshes
        .filter((mesh) => mesh.visible)
        .map((mesh) => {
            const box = new THREE.Box3().setFromObject(mesh);
            return { mesh, y: box.getCenter(new THREE.Vector3()).y };
        })
        .sort((a, b) => a.y - b.y)
        .forEach(({ mesh }, idx) => {
            const flavorName = selectedLayerFlavors[idx] ?? selectedLayerFlavors[0];
            const isOverridden = selectedLayerOverrides[idx];
            mesh.material = new THREE.MeshStandardMaterial(
                getFlavorMaterialProps(flavorName, textureByFlavor, cakeColor.color, isOverridden)
            );
            mesh.castShadow = true;
            mesh.receiveShadow = true;
        });
}

// ────────── Error Boundary ──────────────
class CanvasErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, info) {
        console.error("3D Canvas error caught by boundary:", error, info);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-[#6E473B] gap-3 bg-[#FCF8EE] rounded-2xl border border-[#E6CCA2]">
                    <Cake className="w-12 h-12 text-[#C05A11] animate-pulse" />
                    <p className="text-sm font-medium text-[#A07060]">3D preview couldn't load.</p>
                    <button
                        onClick={() => this.setState({ hasError: false })}
                        className="px-5 py-2 text-xs font-semibold bg-[#C05A11] hover:bg-[#A84E0E] text-white rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                        Retry
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}

// ────────── RealisticLighting ───────────────
function RealisticLighting() {
    return (
        <>
            <ambientLight intensity={0.9} color="#fff8f2" />
            <hemisphereLight intensity={0.7} skyColor="#fffbf0" groundColor="#c8956c" />
            <directionalLight
                position={[4, 9, 6]}
                intensity={3.5}
                color="#fff5e8"
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
                shadow-bias={-0.0008}
                shadow-camera-near={0.5}
                shadow-camera-far={30}
                shadow-camera-left={-6}
                shadow-camera-right={6}
                shadow-camera-top={6}
                shadow-camera-bottom={-6}
            />
            <directionalLight position={[-5, 6, -3]} intensity={1.6} color="#ffeedd" />
            <directionalLight position={[0, 4, -7]} intensity={1.2} color="#e8f0ff" />
            <spotLight
                position={[0.5, 9, 1.5]}
                intensity={5.0}
                angle={Math.PI / 7}
                penumbra={0.55}
                color="#fff9f0"
                castShadow
                shadow-mapSize-width={1024}
                shadow-mapSize-height={1024}
                shadow-bias={-0.001}
                target-position={[0, 1, 0]}
            />
            <pointLight position={[1, 3, 5]} intensity={1.4} color="#fff8f0" distance={12} decay={2} />
            <pointLight position={[-3, 4, 3]} intensity={0.9} color="#ffe8cc" distance={10} decay={2} />
        </>
    );
}

// ───── CakeModel ─────
function CherryTextureLoader({ onLoad }) {
    const texture = useTexture(TIER1_CHERRY_TEXTURE);

    useEffect(() => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.needsUpdate = true;
        onLoad(texture);
    }, [texture, onLoad]);

    return null;
}

export function CakeModel({ selectedTierIndex, autoSpin, cakeGroupRef }) {
    const activeTierUrl = TIER_MODEL_URLS[`tier${selectedTierIndex + 1}`] || TIER_MODEL_URLS.tier1;
    const activeTier = useGLTF(activeTierUrl);
    const { nodes, materials } = activeTier;
    const {
        form,
        cakeColor,
        icingColor,
        flavor,
        flavors,
        flavorTextureMap,
        selectedTierFlavors,
        selectedTierFlavorOverrides,
        candle,
        candleMode,
        candleColor,
        candleNumber,
        chocolate,
        balls,
        nuts,
        cherry,
        cherryLayouts,
        sprinkles,
        toppingLayout,
        inscriptionText,
        textFont,
        inscriptionColor,
    } = useCustomization();

    const baseFlavor = selectedTierFlavors?.[0] || flavor;
    const activeTextureKey = flavorTextureMap[baseFlavor] || "choco";
    const flavorTextureKeys = useMemo(() => [...new Set(
        [baseFlavor, ...(selectedTierFlavors || [])]
            .map((flavorName) => flavorTextureMap[flavorName] || "choco")
    )], [baseFlavor, selectedTierFlavors, flavorTextureMap]);
    const flavorTextureUrls = useMemo(() => Object.fromEntries(
        flavorTextureKeys.flatMap((key) => Object.entries(TEXTURE_URLS[key]).map(
            ([property, url]) => [`${key}_${property}`, url]
        ))
    ), [flavorTextureKeys]);
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
    const activeTexture = textureSetsByKey[activeTextureKey];
    const [cherryTexture, setCherryTexture] = useState(null);
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
        activeTexture,
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
        activeTexture,
        form,
        selectedTierFlavors,
        selectedTierFlavorOverrides,
        textureByFlavor,
        icingColor,
        cherryTexture,
        cherry,
        sprinkles,
    ]);

    useEffect(() => {
        applyMaterialsToScene(activeTier.scene, {
            ...matProps,
            tierIndex: selectedTierIndex,
        });
    }, [activeTier, matProps, selectedTierIndex]);

    useFrame((_, delta) => {
        if (autoSpin && cakeGroupRef.current) {
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
    const chocolateLayout = toppingLayout?.chocolate || { x: 50, y: 50, size: "M" };
    const chocolateFootprint = getToppingFootprint(
        chocolateGeometry,
        TOPPING_3D_CONFIG.chocolate.scale * 0.5 * (TOPPING_SIZES[chocolateLayout.size] || 1)
    );
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
        [nodes.nuts?.geometry, nodes.Mesh021?.geometry, nodes.Mesh021_1?.geometry]
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
                <mesh
                    geometry={goldCandleMesh}
                    material={materials.chandel || materials.Candle_White_Default || materials.Default}
                    position={candlePosition}
                    rotation={TOPPING_3D_CONFIG.candle.rotation}
                    scale={TOPPING_3D_CONFIG.candle.scale * effectiveCandleScale}
                    castShadow
                    receiveShadow
                />
            );
        }

        const spacing = CANDLE_DIGIT_SPACING * effectiveCandleScale;
        const digitMaterial = candleMaterial;
        const hasDigitMeshes = digits.every((digit) => nodes[`candle_${digit}`]?.geometry);

        if (!hasDigitMeshes) {
            const fallbackCandle = nodes.chandel?.geometry || nodes.Candle_White_Default?.geometry;
            if (!fallbackCandle) return null;

            return (
                <mesh
                    geometry={fallbackCandle}
                    material={candleMaterial}
                    position={candleNumberPosition}
                    rotation={TOPPING_3D_CONFIG.candle.rotation}
                    scale={TOPPING_3D_CONFIG.candle.scale * effectiveCandleScale}
                    castShadow
                    receiveShadow
                />
            );
        }

        return (
            <group position={candleNumberPosition}>
                {digits.map((digit, idx) => {
                    const node = nodes[`candle_${digit}`];
                    const xOffset = (idx - (digits.length - 1) / 2) * spacing;

                    return (
                        <mesh
                            key={`${digit}-${idx}`}
                            geometry={node.geometry}
                            material={digitMaterial}
                            position={[xOffset, 0, 0]}
                            rotation={[0, 0, 0]}
                            scale={getNodeScaleArray(node, effectiveCandleScale)}
                            castShadow
                        />
                    );
                })}
            </group>
        );
    };

    const renderCustomToppings = () => (
        <>
            {selectedToppings.candle && renderCandleNumber()}

            {selectedToppings.nuts && nodes.nuts?.geometry && (
                <mesh
                    geometry={nodes.nuts.geometry}
                    material={materials.Default}
                    position={nutTransform.position}
                    rotation={TOPPING_3D_CONFIG.nuts.rotation}
                    scale={nutTransform.scale}
                />
            )}

            {selectedToppings.nuts && !nodes.nuts?.geometry && nodes.Mesh021?.geometry && nodes.Mesh021_1?.geometry && (
                <group
                    position={nutTransform.position}
                    rotation={TOPPING_3D_CONFIG.nuts.rotation}
                    scale={nutTransform.scale}
                >
                    <mesh geometry={nodes.Mesh021.geometry} material={materials.Default} />
                    <mesh geometry={nodes.Mesh021_1.geometry} material={materials.Default} />
                </group>
            )}

            {selectedToppings.chocolate && chocolateGeometry && (
                <mesh
                    geometry={chocolateGeometry}
                    material={materials.choco || chocolateNode.material || new THREE.MeshStandardMaterial({
                        color: "#5A2415",
                        roughness: 0.55,
                        metalness: 0,
                    })}
                    position={getToppingPosition(
                        chocolateLayout,
                        TOPPING_3D_CONFIG.chocolate,
                        selectedTierIndex,
                        undefined,
                        form,
                        activeTierBounds,
                        chocolateFootprint
                    )}
                    rotation={TOPPING_3D_CONFIG.chocolate.rotation}
                    scale={TOPPING_3D_CONFIG.chocolate.scale * 0.5 * (TOPPING_SIZES[chocolateLayout.size] || 1)}
                    visible={true}
                    castShadow
                    receiveShadow
                />
            )}

            {selectedToppings.balls && nodes.balls?.geometry && (
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
            )}
            {selectedToppings.cherry && nodes.cherry?.geometry && (
                cherryLayouts.map((layout, index) => (
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
                ))
            )}

        </>
    );

    return (
        <group ref={cakeGroupRef} dispose={null} position={[0, -0.8, 0]}>
            {cherry && (
                <Suspense fallback={null}>
                    <CherryTextureLoader onLoad={setCherryTexture} />
                </Suspense>
            )}
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


// ──────── DraggableTopping ────────
function DraggableTopping({ topping, layout, isEnabled = true, form, boardWidth, boardHeight }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: topping.key,
    });

    const safeX = Number.isFinite(layout?.x) ? layout.x : 50;
    const safeY = Number.isFinite(layout?.y) ? layout.y : 50;
    const sizeStr = (layout?.size || "medium").toLowerCase();
    const markerDiameter = { small: 22, medium: 28, large: 36 }[sizeStr] ?? 28;

    let displayX = safeX;
    let displayY = safeY;

    if (transform && boardWidth > 0 && boardHeight > 0) {
        const tentativeX = safeX + (transform.x / boardWidth) * 100;
        const tentativeY = safeY + (transform.y / boardHeight) * 100;
        [displayX, displayY] = clampToppingToBoard(
            tentativeX,
            tentativeY,
            form,
            markerDiameter,
            boardWidth,
            boardHeight
        );
    }

    const shortLabelText = topping?.shortLabel || topping?.label?.[0] || "";

    return (
        <button
            ref={setNodeRef}
            type="button"
            className={`topping-marker topping-marker--${sizeStr} ${isDragging ? "topping-marker--dragging" : ""} ${isEnabled ? "" : "opacity-50"}`}
            style={{
                left: `${displayX}%`,
                top: `${displayY}%`,
                backgroundColor: topping?.color || "#FFD700",
                transform: "translate(-50%, -50%)",
            }}
            aria-label={`Move ${topping?.label || "topping"}`}
            {...listeners}
            {...attributes}
        >
            {shortLabelText}
        </button>
    );
}

// ────── ToppingPlacementBoard ──────
function ToppingPlacementBoard({ form, selectedTierIndex, activeToppings, toppingLayout, cherryLayouts, candleEnabled, onMove }) {
    const boardRef = useRef(null);
    const [boardDimensions, setBoardDimensions] = useState({ width: 0, height: 0 });
    const { setNodeRef } = useDroppable({ id: "cake-placement" });
    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: { distance: 4 },
        }),
        useSensor(TouchSensor, {
            activationConstraint: { delay: 100, tolerance: 8 },
        }),
    );

    const setBoardNode = (node) => {
        boardRef.current = node;
        setNodeRef(node);
        if (node) {
            const w = node.clientWidth;
            const h = node.clientHeight;
            if (w && h) {
                setBoardDimensions((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
            }
        }
    };

    useEffect(() => {
        const board = boardRef.current;
        if (!board || typeof ResizeObserver === "undefined") return;

        const clampActiveToppings = () => {
            const width = board.clientWidth;
            const height = board.clientHeight;
            if (!width || !height) return;

            setBoardDimensions((prev) => (prev.width === width && prev.height === height ? prev : { width, height }));

            activeToppings.forEach((topping) => {
                const layout = topping.key.startsWith("cherry-")
                    ? cherryLayouts[Number.parseInt(topping.key.slice("cherry-".length), 10)]
                    : toppingLayout[topping.key];
                if (!layout) return;

                const markerDiameter = { small: 22, medium: 28, large: 36 }[layout.size] ?? 28;
                // Treat an already-corrupted (non-finite) stored value as
                // needing correction too, using the board center as the
                // starting point to clamp from.
                const safeCurrentX = Number.isFinite(layout.x) ? layout.x : 50;
                const safeCurrentY = Number.isFinite(layout.y) ? layout.y : 50;
                const [nextX, nextY] = clampToppingToBoard(
                    safeCurrentX,
                    safeCurrentY,
                    form,
                    markerDiameter,
                    width,
                    height
                );

                if (
                    Number.isFinite(nextX) &&
                    Number.isFinite(nextY) &&
                    (!Number.isFinite(layout.x) ||
                        !Number.isFinite(layout.y) ||
                        Math.abs(nextX - layout.x) > 0.01 ||
                        Math.abs(nextY - layout.y) > 0.01)
                ) {
                    onMove(topping.key, nextX, nextY);
                }
            });
        };

        const observer = new ResizeObserver(clampActiveToppings);
        observer.observe(board);
        clampActiveToppings();

        // Belt-and-suspenders: re-run once more after the browser has
        // actually painted, in case clientWidth/clientHeight was still 0 on
        // the very first pass (e.g. right when this accordion section opens
        // or when switching to a smaller tier). ResizeObserver doesn't
        // always fire a second time if the size settles immediately.
        const raf = requestAnimationFrame(clampActiveToppings);

        return () => {
            observer.disconnect();
            cancelAnimationFrame(raf);
        };
    }, [activeToppings, form, toppingLayout, cherryLayouts, onMove, selectedTierIndex]);

    const handleDragEnd = ({ active, delta }) => {
        const key = active?.id;
        if (!key || !boardRef.current) return;

        const currentLayout = key.startsWith("cherry-")
            ? cherryLayouts[Number.parseInt(key.slice("cherry-".length), 10)]
            : toppingLayout[key];

        if (!currentLayout) return;

        const width = boardRef.current.clientWidth;
        const height = boardRef.current.clientHeight;
        const markerDiameter = { small: 22, medium: 28, large: 36 }[currentLayout.size] ?? 28;
        const [nextX, nextY] = clampToppingToBoard(
            currentLayout.x + (delta.x / width) * 100,
            currentLayout.y + (delta.y / height) * 100,
            form,
            markerDiameter,
            width,
            height
        );

        onMove(key, nextX, nextY);
    };

    const tierScale = TIER_TOP_RADIUS[selectedTierIndex] ?? TIER_TOP_RADIUS[0];

    return (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <div className="topping-board">
                <div
                    ref={setBoardNode}
                    className={`topping-board__cake ${form === 1 ? "topping-board--round" : "topping-board--rectangle"}`}
                    style={{ width: `${tierScale * 100}%`, height: `${tierScale * 100}%` }}
                >
                    {activeToppings.map((topping) => (
                        <DraggableTopping
                            key={topping.key}
                            topping={topping}
                            form={form}
                            boardWidth={boardDimensions.width}
                            boardHeight={boardDimensions.height}
                            isEnabled={topping.key !== "candle" || candleEnabled}
                            layout={topping.key.startsWith("cherry-")
                                ? cherryLayouts[Number.parseInt(topping.key.slice("cherry-".length), 10)]
                                : toppingLayout[topping.key]}
                        />
                    ))}
                </div>
            </div>
        </DndContext>
    );
}

function ConfiguratorSection({
    title,
    isOpen,
    onToggle,
    children,
}) {
    return (
        <section className="rounded-xl bg-[#FDF6E2] border border-[#ECD9B4] shadow-sm overflow-hidden">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left hover:bg-[#F8EDD4] transition-colors"
            >
                <span className="text-xs font-bold tracking-wider text-[#A05A2C] uppercase">
                    {title}
                </span>

                <span
                    className={`text-[#C05A11] text-lg transition-transform duration-200 ${isOpen ? "rotate-180" : ""
                        }`}
                >
                    ⌄
                </span>
            </button>

            {isOpen && (
                <div className="px-5 pb-5">
                    {children}
                </div>
            )}
        </section>
    );
}

// ────── Configurator ──────
function Configurator({ selectedTierIndex, setSelectedTierIndex, selectedSize, setSelectedSize }) {
    const {
        cakeColors, cakeColor, setCakeColor,
        icingColors, icingColor, setIcingColor,
        form, setForm,
        flavors, flavor, setFlavor,
        candle, setCandle,
        candleMode, setCandleMode,
        candleColor, setCandleColor,
        candleNumber, setCandleNumber,
        chocolate, setChocolate,
        balls, setBalls,
        nuts, setNuts,
        cherry, setCherry,
        cherryCount, setCherryCount, cherryLayouts,
        sprinkles, setSprinkles,
        generateRandomCake,
        calculatePrice,
        pricingLoading,
        pricingError,
        toppingLayout,
        setToppingPosition,
        setToppingSize,
        tierFlavors,
        setTierLayerFlavor,
        resetTierFlavorOverrides,
        tierFlavorLabels,
        inscriptionText,
        setInscriptionText,
        textFont,
        setTextFont,
        inscriptionColor,
        setInscriptionColor,
    } = useCustomization();

    const { addCustomCakeToCart } = useCart();
    const navigate = useNavigate();
    const [orderStatus, setOrderStatus] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openSection, setOpenSection] = useState("tier");

    const toggleSection = (section) => {
        setOpenSection((current) =>
            current === section ? null : section
        );
    };

    const handleSizeChange = (e) => setSelectedSize(e.target.value);
    const handleShapeChange = (newForm) => {
        setForm(newForm);
    };
    const toppingEnabled = { candle, chocolate, balls, nuts, cherry, sprinkles };
    const activeToppings = TOPPING_OPTIONS
        .filter((topping) => toppingEnabled[topping.key])
        .filter((topping) => topping.key !== "nuts" && topping.key !== "sprinkles")
        .flatMap((topping) => topping.key === "cherry"
            ? cherryLayouts.map((_, index) => ({ ...topping, key: `cherry-${index}`, label: `Cherry ${index + 1}` }))
            : [topping]);
    const placementToppings = activeToppings.some((topping) => topping.key === "candle")
        ? activeToppings
        : [TOPPING_OPTIONS.find((topping) => topping.key === "candle"), ...activeToppings];
    const activeTierLabels = TIER_FLAVOR_LABELS[selectedTierIndex + 1] || TIER_FLAVOR_LABELS[1];

    const handleAddToCart = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        const selectedTier = CAKE_SIZES[selectedTierIndex] ?? CAKE_SIZES[0];
        const selectedTierKey = selectedTier.tierKey;
        const layerCount = selectedTierIndex + 1;

        const activeTierFlavors =
            selectedTierKey === "tier1"
                ? [flavor]
                : Array.from(
                    { length: layerCount },
                    (_, idx) => tierFlavors[selectedTierKey]?.[idx] ?? flavors[idx % flavors.length]
                );

        const tierFlavorPayload =
            selectedTierKey === "tier1"
                ? {}
                : Object.fromEntries(
                    activeTierFlavors.map((layerFlavor, idx) => [
                        activeTierLabels[idx] ?? `Tier ${idx + 1}`,
                        layerFlavor,
                    ])
                );

        const payload = {
            shape: form === 1 ? "round" : "rectangle",
            cake_color: cakeColor.color,
            icing_color: icingColor.color,
            flavor: activeTierFlavors[0] || flavor,
            tier: selectedTier.tier,
            size: selectedSize,
            tier_flavors: tierFlavorPayload,
            inscription_text: inscriptionText.trim(),
            text_font: textFont,
            inscription_color: inscriptionColor,
            has_candle: candle,
            candle_number: candleNumber,
            candle_mode: candleMode,
            candle_color: candleColor,
            topping_layout: {
                ...toppingLayout,
                cherry: cherryLayouts,
                candle: {
                    ...toppingLayout.candle,
                    mode: candleMode,
                    color: candleColor,
                },
            },
            has_chocolate: chocolate,
            has_balls: balls,
            has_nuts: nuts,
            has_cherry: cherry,
            has_sprinkles: sprinkles,
        };

        const result = await addCustomCakeToCart(payload);

        if (result.success) {
            setOrderStatus("success");
            setTimeout(() => {
                setOrderStatus(null);
                navigate("/cart");
            }, 1500);
        } else {
            setOrderStatus("error");
            setErrorMessage(
                result.error?.error || result.error?.message || "Failed to add cake to cart. Please try again."
            );
            setTimeout(() => setOrderStatus(null), 3000);
        }

        setIsSubmitting(false);
    };

    return (
        <aside className="w-full lg:w-[400px] h-auto lg:h-full lg:overflow-y-auto bg-[#FFFDF9]/95 backdrop-blur-xl border border-[#E6CCA2] rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col gap-4 sm:gap-6 custom-scrollbar">
            <h2 className="text-xl font-bold tracking-tight text-[#6E473B]">
                Design Your Cake
            </h2>

            {/* ── Tier & Size ── */}
            <ConfiguratorSection
                title="1. Tier & Size"
                isOpen={openSection === "tier"}
                onToggle={() => toggleSection("tier")}
            >
                <h3 className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase mb-3">Tier Layout</h3>
                <div className="flex flex-wrap gap-2 mb-4">
                    {CAKE_SIZES.map((item, idx) => (
                        <button
                            key={item.tier}
                            type="button"
                            className={`px-4 py-2 text-sm font-medium rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none active:scale-95 ${selectedTierIndex === idx
                                ? "bg-[#C05A11] border-[#C05A11] text-white font-semibold shadow-md shadow-[#C05A11]/20"
                                : "bg-white border-[#E6CCA2] text-[#6E473B] hover:bg-[#FDF6E2]"
                                }`}
                            onClick={() => {
                                setSelectedTierIndex(idx);
                                setSelectedSize(CAKE_SIZES[idx].sizes[0]);

                            }}
                        >
                            {item.tier}
                        </button>
                    ))}
                </div>

                <h3 className="text-xs font-semibold tracking-wider text-[#A05A2C] uppercase mb-2">Base Dimensions</h3>
                <div className="relative w-full">
                    <select
                        id="size-select"
                        className="w-full px-4 py-2.5 text-sm rounded-xl bg-white border border-[#E6CCA2] text-[#6E473B] appearance-none focus:outline-none focus:border-[#C05A11] focus:ring-1 focus:ring-[#C05A11]/30 cursor-pointer"
                        value={selectedSize}
                        onChange={handleSizeChange}
                    >
                        {CAKE_SIZES[selectedTierIndex].sizes.map((s) => (
                            <option key={s} value={s} className="bg-white text-[#6E473B]">{s}</option>
                        ))}
                    </select>
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A05A2C] pointer-events-none text-xs">▼</span>
                </div>
            </ConfiguratorSection>

            {/* ── Shape ── */}
            <ConfiguratorSection
                title="2. Cake Base Shape"
                isOpen={openSection === "shape"}
                onToggle={() => toggleSection("shape")}
            >
                <div className="flex gap-2">
                    <button
                        type="button"
                        className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none active:scale-95 flex items-center justify-center gap-1.5 ${form === 1
                            ? "bg-[#C05A11] border-[#C05A11] text-white font-semibold shadow-md shadow-[#C05A11]/20"
                            : "bg-white border-[#E6CCA2] text-[#6E473B] hover:bg-[#FDF6E2]"
                            }`}
                        onClick={() => handleShapeChange(1)}
                    >
                        <Circle className="w-4 h-4" /> Round
                    </button>
                    <button
                        type="button"
                        className={`flex-1 py-2.5 text-sm font-medium rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none active:scale-95 flex items-center justify-center gap-1.5 ${form === 2
                            ? "bg-[#C05A11] border-[#C05A11] text-white font-semibold shadow-md shadow-[#C05A11]/20"
                            : "bg-white border-[#E6CCA2] text-[#6E473B] hover:bg-[#FDF6E2]"
                            }`}
                        onClick={() => handleShapeChange(2)}
                    >
                        <Square className="w-4 h-4" /> Rectangle
                    </button>
                </div>
            </ConfiguratorSection>

            {/* ── Cake Color ── */}
            <ConfiguratorSection
                title="3. Cake Color"
                isOpen={openSection === "cakeColor"}
                onToggle={() => toggleSection("cakeColor")}
            >
                <div className="flex flex-wrap gap-2.5">
                    {cakeColors.map((c) => (
                        <button
                            key={c.name}
                            type="button"
                            className={`w-9 h-9 rounded-full border-2 transition-all duration-200 cursor-pointer active:scale-90 hover:scale-105 focus:outline-none ${cakeColor.name === c.name
                                ? "border-[#C05A11] ring-2 ring-[#C05A11]/30 scale-105 shadow-md"
                                : "border-transparent shadow-sm"
                                }`}
                            style={{ background: c.color }}
                            title={c.name}
                            onClick={() => setCakeColor(c)}
                            aria-label={`Cake color ${c.name}`}
                        />
                    ))}
                </div>
            </ConfiguratorSection>

            {/* ── Icing Color ── */}
            <ConfiguratorSection
                title="4. Icing Color"
                isOpen={openSection === "icingColor"}
                onToggle={() => toggleSection("icingColor")}
            >
                <div className="flex flex-wrap gap-2.5">
                    {icingColors.map((c) => (
                        <button
                            key={c.name}
                            type="button"
                            className={`group relative w-9 h-9 rounded-full border-2 transition-all duration-200 cursor-pointer active:scale-90 hover:scale-105 focus:outline-none ${icingColor.name === c.name
                                ? "border-[#C05A11] ring-2 ring-[#C05A11]/30 scale-105 shadow-md"
                                : "border-transparent shadow-sm"
                                }`}
                            style={{ background: c.color }}
                            title={c.name}
                            onClick={() => setIcingColor(c)}
                            aria-label={`Icing color ${c.name}`}
                        >
                            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-medium text-[#A07060] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none capitalize">{c.name}</span>
                        </button>
                    ))}
                </div>
            </ConfiguratorSection>

            {/* ── Flavor ── */}
            <ConfiguratorSection
                title={selectedTierIndex === 0 ? "5. Flavor" : "Tier Flavor Layout"}
                isOpen={openSection === "flavor"}
                onToggle={() => toggleSection("flavor")}
            >
                {selectedTierIndex === 0 ? (
                    <div className="flex flex-col gap-2">
                        {flavors.map((f) => (
                            <button
                                key={f}
                                type="button"
                                className={`w-full px-4 py-3 text-left text-sm font-medium rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none active:scale-[0.99] ${flavor === f
                                    ? "bg-[#C05A11] border-[#C05A11] text-white font-semibold shadow-md shadow-[#C05A11]/20"
                                    : "bg-white border-[#E6CCA2] text-[#6E473B] hover:bg-[#FFFDF9]"
                                    }`}
                                onClick={() => {
                                    setFlavor(f);
                                    if (f === "Choco Moist")
                                        setCakeColor(cakeColors.find((c) => c.name === "brown") || cakeColors[0]);
                                    else if (f === "Vanilla Chiffon")
                                        setCakeColor(cakeColors.find((c) => c.name === "vanilla") || cakeColors[0]);
                                    else if (f === "Ube Chiffon")
                                        setCakeColor(cakeColors.find((c) => c.name === "lavender") || cakeColors[0]);
                                }}
                            >
                                {FLAVOR_LABELS[f] || "Cake"} - {f}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col gap-3">
                        <p className="text-xs text-[#A07060] italic">Choose the flavor for each tier in your cake layout.</p>
                        <button
                            type="button"
                            className="self-start px-3 py-1.5 text-[11px] font-semibold text-[#A05A2C] bg-white border border-[#E6CCA2] rounded-lg hover:bg-[#FDF6E2] transition-all cursor-pointer active:scale-95"
                            onClick={resetTierFlavorOverrides}
                        >
                            ↺ Reset all tiers to Cake Color
                        </button>
                        {Array.from({ length: selectedTierIndex + 1 }).map((_, idx) => (
                            <label className="flex items-center justify-between gap-4 p-3 bg-white rounded-xl border border-[#E6CCA2]" key={`tier-flavor-${idx}`}>
                                <span className="flex items-center gap-2 text-sm font-medium text-[#6E473B]">
                                    <span
                                        className="w-3 h-3 rounded-full border border-black/10 inline-block shadow-sm"
                                        style={{
                                            backgroundColor:
                                                FLAVOR_VISUALS[tierFlavors[CAKE_SIZES[selectedTierIndex]?.tierKey]?.[idx]]
                                                    ?.color || cakeColor.color,
                                        }}
                                    />
                                    {activeTierLabels[idx] ?? tierFlavorLabels[idx] ?? `Tier ${idx + 1}`}
                                </span>
                                <select
                                    className="px-3 py-1.5 text-xs rounded-lg bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11] cursor-pointer"
                                    value={tierFlavors[CAKE_SIZES[selectedTierIndex]?.tierKey]?.[idx] || flavors[0]}
                                    onChange={(event) => setTierLayerFlavor(idx, event.target.value)}
                                >
                                    {flavors.map((f) => (
                                        <option key={f} value={f}>{f}</option>
                                    ))}
                                </select>
                            </label>
                        ))}
                    </div>
                )}
            </ConfiguratorSection>

            {/* ── Cake Message ── */}
            <ConfiguratorSection
                title="6. Cake Message"
                isOpen={openSection === "message"}
                onToggle={() => toggleSection("message")}
            >
                <div className="flex flex-col gap-2.5">
                    <input
                        className="w-full px-4 py-2.5 text-sm rounded-xl bg-white border border-[#E6CCA2] text-[#6E473B] placeholder-[#CBB294] focus:outline-none focus:border-[#C05A11] focus:ring-1 focus:ring-[#C05A11]/30 transition-all"
                        value={inscriptionText}
                        maxLength={48}
                        placeholder="Add text on top"
                        onChange={(event) => setInscriptionText(event.target.value)}
                    />
                    <div className="relative w-full">
                        <select
                            className="w-full px-4 py-2.5 text-sm rounded-xl bg-white border border-[#E6CCA2] text-[#6E473B] appearance-none focus:outline-none focus:border-[#C05A11] focus:ring-1 focus:ring-[#C05A11]/30 cursor-pointer"
                            value={textFont}
                            onChange={(event) => setTextFont(event.target.value)}
                        >
                            {TEXT_FONT_OPTIONS.map((fontOption) => (
                                <option key={fontOption.value} value={fontOption.value}>
                                    {fontOption.label}
                                </option>
                            ))}
                        </select>
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#A05A2C] pointer-events-none text-xs">▼</span>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                        {INSCRIPTION_COLOR_OPTIONS.map((colorOption) => (
                            <button
                                key={colorOption.value}
                                type="button"
                                className={`w-8 h-8 rounded-full border-2 transition-all duration-200 cursor-pointer active:scale-90 hover:scale-105 focus:outline-none ${inscriptionColor === colorOption.value
                                    ? "border-[#C05A11] ring-2 ring-[#C05A11]/30 scale-105 shadow-md"
                                    : "border-[#E6CCA2] shadow-sm"
                                    }`}
                                style={{ backgroundColor: colorOption.value }}
                                title={colorOption.label}
                                aria-label={`Message color ${colorOption.label}`}
                                onClick={() => setInscriptionColor(colorOption.value)}
                            />
                        ))}
                    </div>
                </div>
            </ConfiguratorSection>

            {/* ── Decorations ── */}
            <ConfiguratorSection
                title="7. Decorations"
                isOpen={openSection === "decorations"}
                onToggle={() => toggleSection("decorations")}
            >
                <div className="grid grid-cols-2 gap-2">
                    {[
                        { label: "Candle", Icon: Flame, value: candle, set: setCandle },
                        { label: "Chocolate", Icon: Cookie, value: chocolate, set: setChocolate },
                        { label: "Balls", Icon: Sparkles, value: balls, set: setBalls },
                        { label: "Nuts", Icon: Wheat, value: nuts, set: setNuts },
                        { label: "Cherry", Icon: Cherry, value: cherry, set: setCherry },
                        { label: "Sprinkles", Icon: Sparkles, value: sprinkles, set: setSprinkles },
                    ].map(({ label, Icon, value, set }) => (
                        <button
                            key={label}
                            type="button"
                            className={`flex justify-between items-center px-3.5 py-2.5 text-xs font-medium rounded-xl border transition-all duration-200 cursor-pointer focus:outline-none active:scale-95 ${value
                                ? "bg-[#C05A11]/10 border-[#C05A11] text-[#A84E0E] font-semibold shadow-inner"
                                : "bg-white border-[#E6CCA2] text-[#6E473B] hover:bg-[#FFFDF9]"
                                }`}
                            onClick={() => set(!value)}
                        >
                            <span className="flex items-center gap-1.5"><Icon className="w-3.5 h-3.5" /> {label}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${value ? "bg-[#C05A11] text-white" : "bg-[#E6CCA2] text-[#6E473B]"}`}>
                                {value ? "ON" : "OFF"}
                            </span>
                        </button>
                    ))}
                </div>

                {/* ── Candle Style & Number (1-100) ── */}
                {candle && (
                    <div className="mt-3 p-3 bg-white rounded-xl border border-[#E6CCA2] shadow-sm">
                        <div className="flex items-center justify-between gap-3 mb-3">
                            <span className="text-xs font-semibold text-[#6E473B] flex items-center gap-1.5">
                                <Flame className="w-3.5 h-3.5 text-amber-500" /> Candle Style
                            </span>
                            <div className="flex rounded-lg border border-[#E6CCA2] overflow-hidden bg-[#FDF6E2]">
                                <button
                                    type="button"
                                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${candleMode === "gold"
                                        ? "bg-[#C05A11] text-white"
                                        : "text-[#6E473B] hover:text-[#A84E0E]"
                                        }`}
                                    onClick={() => setCandleMode("gold")}
                                >
                                    Single
                                </button>
                                <button
                                    type="button"
                                    className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border-l border-[#E6CCA2] ${candleMode === "number"
                                        ? "bg-[#C05A11] text-white"
                                        : "text-[#6E473B] hover:text-[#A84E0E]"
                                        }`}
                                    onClick={() => setCandleMode("number")}
                                >
                                    Number
                                </button>
                            </div>
                        </div>

                        {candleMode === "number" && (
                            <div className="flex items-center justify-between gap-3 mb-3">
                                <span className="text-xs font-semibold text-[#6E473B]">Candle Color</span>
                                <div className="flex rounded-lg border border-[#E6CCA2] overflow-hidden bg-[#FDF6E2]">
                                    {["white", "gold"].map((color) => (
                                        <button
                                            key={color}
                                            type="button"
                                            className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${candleColor === color
                                                ? "bg-[#C05A11] text-white"
                                                : "text-[#6E473B] hover:text-[#A84E0E]"
                                                } ${color === "gold" ? "border-l border-[#E6CCA2]" : ""}`}
                                            onClick={() => setCandleColor(color)}
                                        >
                                            {color}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {candleMode === "number" && (
                            <>
                                <label className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-semibold text-[#6E473B] flex items-center gap-1.5">
                                        <Hash className="w-3.5 h-3.5 text-amber-600" /> Candle Number
                                    </span>
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#FDF6E2] border border-[#ECD9B4] text-[#6E473B] font-bold text-sm hover:bg-[#C05A11] hover:text-white hover:border-[#C05A11] transition-all cursor-pointer active:scale-90"
                                            onClick={() => setCandleNumber(Math.max(1, candleNumber - 1))}
                                            disabled={candleNumber <= 1}
                                        >
                                            −
                                        </button>
                                        <input
                                            type="number"
                                            min="1"
                                            max="100"
                                            value={candleNumber}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value, 10);
                                                if (!isNaN(val)) setCandleNumber(Math.max(1, Math.min(100, val)));
                                            }}
                                            className="w-14 text-center px-2 py-1.5 text-sm font-bold rounded-lg bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11] focus:ring-1 focus:ring-[#C05A11]/30 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                        <button
                                            type="button"
                                            className="w-7 h-7 flex items-center justify-center rounded-lg bg-[#FDF6E2] border border-[#ECD9B4] text-[#6E473B] font-bold text-sm hover:bg-[#C05A11] hover:text-white hover:border-[#C05A11] transition-all cursor-pointer active:scale-90"
                                            onClick={() => setCandleNumber(Math.min(100, candleNumber + 1))}
                                            disabled={candleNumber >= 100}
                                        >
                                            +
                                        </button>
                                    </div>
                                </label>
                                <div className="mt-2">
                                    <input
                                        type="range"
                                        min="1"
                                        max="100"
                                        value={candleNumber}
                                        onChange={(e) => setCandleNumber(parseInt(e.target.value, 10))}
                                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#C05A11] bg-[#E6CCA2]"
                                    />
                                    <div className="flex justify-between text-[9px] text-[#A07060] mt-0.5 font-medium">
                                        <span>1</span>
                                        <span>25</span>
                                        <span>50</span>
                                        <span>75</span>
                                        <span>100</span>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </ConfiguratorSection>

            {/* ── Topping Placement ── */}
            <ConfiguratorSection
                title="8. Topping Placement"
                isOpen={openSection === "placement"}
                onToggle={() => toggleSection("placement")}
            >
                {placementToppings.length > 0 ? (
                    <div className="flex flex-col gap-5">
                        <div className="flex justify-center p-2 bg-[#FFFDF9] rounded-2xl border border-[#E6CCA2]">
                            <ToppingPlacementBoard
                                form={form}
                                selectedTierIndex={selectedTierIndex}
                                activeToppings={placementToppings}
                                toppingLayout={toppingLayout}
                                cherryLayouts={cherryLayouts}
                                candleEnabled={candle}
                                onMove={setToppingPosition}
                            />
                        </div>

                        <div className="flex flex-col gap-2.5">
                            {activeToppings.map((topping) => (
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 bg-white rounded-xl border border-[#E6CCA2] shadow-sm" key={topping.key}>
                                    <span className="flex items-center gap-2 text-xs font-semibold text-[#6E473B]">
                                        <span
                                            className="w-2.5 h-2.5 rounded-full inline-block shadow-sm"
                                            style={{ backgroundColor: topping.color }}
                                        />
                                        {topping.label}
                                    </span>
                                    {topping.key !== "sprinkles" && (
                                        <div className="flex gap-1 bg-[#FDF6E2] p-1 rounded-lg border border-[#ECD9B4]" aria-label={`${topping.label} size`}>
                                            {Object.keys(TOPPING_SIZES).map((size) => (
                                                <button
                                                    key={size}
                                                    type="button"
                                                    className={`px-3 py-1 text-[10px] font-bold tracking-wider uppercase rounded-md transition-all cursor-pointer ${(topping.key.startsWith("cherry-")
                                                        ? cherryLayouts[Number.parseInt(topping.key.slice("cherry-".length), 10)]
                                                        : (toppingLayout[topping.key] || { size: "M" })).size === size
                                                        ? "bg-[#C05A11] text-white shadow-sm"
                                                        : "text-[#A07060] hover:text-[#6E473B]"
                                                        }`}
                                                    onClick={() => setToppingSize(topping.key, size)}
                                                >
                                                    {size}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}

                            {cherry && (
                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[#E6CCA2] shadow-sm">
                                    <span className="text-xs font-semibold text-[#6E473B]">Number of cherries</span>
                                    <input
                                        type="number"
                                        min="1"
                                        max="12"
                                        value={cherryCount}
                                        onChange={(event) => setCherryCount(event.target.value)}
                                        className="w-16 text-center px-2 py-1.5 text-sm font-bold rounded-lg bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11]"
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    <div className="text-center py-6 text-xs text-[#A07060] italic bg-[#FFFDF9] rounded-xl border border-dashed border-[#E6CCA2]">
                        Select a decoration first.
                    </div>
                )}
            </ConfiguratorSection>

            {/* ── Randomize ── */}
            <button
                type="button"
                className="w-full py-3 text-sm font-semibold text-[#C05A11] bg-white border-2 border-[#C05A11] rounded-xl shadow-sm hover:bg-[#C05A11]/5 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
                onClick={generateRandomCake}
            >
                <Dices className="w-4 h-4" /> Randomize My Cake!
            </button>

            {/* ── Price ── */}
            <div className="mt-2 pt-4 border-t border-[#E6CCA2]/60 flex flex-col gap-1.5">
                {pricingLoading && (
                    <div className="text-xs text-[#A07060] animate-pulse">Loading latest prices...</div>
                )}
                {pricingError && (
                    <div className="text-xs text-red-600 font-semibold bg-red-50 p-2.5 rounded-lg border border-red-200">{pricingError}</div>
                )}
                <div className="flex items-center justify-between p-4 rounded-xl bg-[#C05A11]/10 border border-[#C05A11]/20">
                    <span className="text-sm font-medium text-[#6E473B]">Total Price:</span>
                    <span className="text-xl font-black text-[#C05A11]">₱{calculatePrice().toFixed(2)}</span>
                </div>
            </div>

            {/* ── Add to Cart ── */}
            <button
                type="button"
                className="w-full py-3.5 bg-[#C05A11] hover:bg-[#A84E0E] text-white font-bold rounded-xl shadow-md shadow-[#C05A11]/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none cursor-pointer text-base text-center flex items-center justify-center gap-2"
                onClick={handleAddToCart}
                disabled={isSubmitting || !!pricingError}
            >
                {isSubmitting ? "Adding..." : <><ShoppingCart className="w-5 h-5" /> Add to Cart</>}
            </button>

            {orderStatus === "success" && (
                <div className="fixed bottom-6 right-6 z-50 bg-[#2E7D32] text-white font-semibold text-sm px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-2 animate-bounce">
                    <CheckCircle2 className="w-5 h-5 text-white" /> Added to cart! Redirecting...
                </div>
            )}
            {orderStatus === "error" && (
                <div className="fixed bottom-6 right-6 z-50 bg-[#C62828] text-white font-semibold text-sm px-5 py-3.5 rounded-xl shadow-xl flex items-center gap-2">
                    <XCircle className="w-5 h-5 text-white" /> {errorMessage}
                </div>
            )}
        </aside>
    );
}

// ────── BuildBentoContent ──────
function BuildBentoContent() {
    const {
        selectedTierIndex,
        setSelectedTierIndex,
        selectedSize,
        setSelectedSize,
    } = useCustomization();

    const navigate = useNavigate();
    const [autoSpin, setAutoSpin] = useState(false);

    const cakeGroupRef = useRef(null);
    const orbitControlsRef = useRef(null);

    const handleResetView = () => {
        setAutoSpin(false);

        // Reset only the cake's horizontal heading.
        if (cakeGroupRef.current) {
            cakeGroupRef.current.rotation.y = 0;
        }

        const controls = orbitControlsRef.current;

        if (controls) {
            const camera = controls.object;
            const target = controls.target;

            const offsetX = camera.position.x - target.x;
            const offsetZ = camera.position.z - target.z;

            const horizontalDistance = Math.sqrt(
                offsetX * offsetX + offsetZ * offsetZ
            );

            camera.position.x = target.x;
            camera.position.z = target.z + horizontalDistance;

            camera.lookAt(target);
            controls.update();
        }
    };

    return (
        <div className="min-h-screen w-full max-w-full overflow-x-hidden bg-[#FCF8EE] pt-2 flex flex-col antialiased font-sans">
            {/* Main responsive wrapper layout */}
            <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6 lg:p-8 flex flex-col lg:flex-row gap-4 items-start">

                {/* 3D Canvas Box */}
                <div className="w-full flex-1 self-start relative lg:sticky lg:top-6 z-10 lg:z-auto">
                    <div className="cake-preview-shell w-full relative bg-white border border-[#E6CCA2] rounded-2xl shadow-sm overflow-hidden flex flex-col">
                        <button
                            type="button"
                            onClick={() => navigate(-1)}
                            className="absolute top-4 left-4 z-30 inline-flex items-center gap-2 bg-white/90 hover:bg-white backdrop-blur-sm border border-[#E6CCA2] text-[#6E473B] hover:text-[#C05A11] px-4 py-2 rounded-full text-sm font-bold shadow-sm transition-all cursor-pointer"
                        >
                            ← Back
                        </button>
                        <button
                            type="button"
                            onClick={() => setAutoSpin((prev) => !prev)}
                            aria-pressed={autoSpin}
                            className="absolute top-4 right-4 z-30 inline-flex items-center gap-2 bg-white/90 hover:bg-white backdrop-blur-sm border border-[#E6CCA2] text-[#6E473B] px-3 py-2 rounded-full text-xs font-bold shadow-sm transition-all cursor-pointer"
                        >
                            <span
                                className={`relative inline-block w-8 h-4 shrink-0 rounded-full transition-colors ${autoSpin ? "bg-[#C05A11]" : "bg-[#D6C4AE]"
                                    }`}
                            >
                                <span
                                    className="absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all duration-200"
                                    style={{
                                        left: autoSpin ? "18px" : "2px",
                                    }}
                                />
                            </span>

                            Auto Spin
                        </button>
                        <div className="w-full h-full relative">
                            <CanvasErrorBoundary>
                                <Canvas
                                    dpr={[1, 2]}
                                    camera={{ fov: 40, position: [0, 4, 5] }}
                                    shadows={{ type: THREE.PCFShadowMap }}
                                    gl={{
                                        toneMapping: THREE.ACESFilmicToneMapping,
                                        toneMappingExposure: 1.15,
                                        outputColorSpace: THREE.SRGBColorSpace,
                                    }}
                                    onCreated={({ gl }) => {
                                        gl.domElement.addEventListener(
                                            "webglcontextlost",
                                            (e) => {
                                                e.preventDefault();
                                                console.warn("WebGL context lost — will attempt to restore.");
                                            },
                                            false
                                        );
                                        gl.domElement.addEventListener(
                                            "webglcontextrestored",
                                            () => {
                                                console.info("WebGL context restored.");
                                            },
                                            false
                                        );
                                    }}
                                >
                                    <color attach="background" args={["#FCF8EE"]} />

                                    <fog attach="fog" args={["#FCF8EE", 16, 28]} />

                                    <RealisticLighting />

                                    <Suspense fallback={null}>
                                        <CakeModel selectedTierIndex={selectedTierIndex} autoSpin={autoSpin} cakeGroupRef={cakeGroupRef} />

                                        <ContactShadows
                                            position={[0, -2.3, 0]}
                                            opacity={0.18}
                                            scale={6}
                                            blur={2.5}
                                            color="#5C4033"
                                        />
                                    </Suspense>

                                    <OrbitControls
                                        ref={orbitControlsRef}
                                        enablePan={false}
                                        minDistance={3}
                                        maxDistance={12}
                                        minPolarAngle={Math.PI / 6}
                                        maxPolarAngle={Math.PI / 2}
                                        target={[0, 1.2, 0]}
                                    />
                                </Canvas>
                            </CanvasErrorBoundary>
                        </div>

                        <div className="cake-view-instruction absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-[#FFFDF9]/90 backdrop-blur border border-[#E6CCA2] px-4 py-1.5 rounded-full text-[11px] font-medium text-[#A05A2C] shadow-sm select-none pointer-events-none tracking-wide uppercase whitespace-nowrap flex items-center gap-1.5">
                            <MousePointer className="w-3.5 h-3.5" /> Drag to rotate · Scroll to zoom
                        </div>
                        <CakeCompass
                            cakeGroupRef={cakeGroupRef}
                            controlsRef={orbitControlsRef}
                            onReset={handleResetView}
                        />
                    </div>
                </div>

                {/* Configurator Side Column - Flows naturally alongside the enlarged preview */}
                <div className="w-full lg:w-auto">
                    <Configurator
                        selectedTierIndex={selectedTierIndex}
                        setSelectedTierIndex={setSelectedTierIndex}
                        selectedSize={selectedSize}
                        setSelectedSize={setSelectedSize}
                    />
                </div>
            </div>
        </div>
    );
}

export default function BuildBentoPage() {
    const location = useLocation();
    const reorderCustomization = location.state?.reorderCustomization;

    return (
        <CustomizationProvider initialState={reorderCustomization}>
            <BuildBentoContent />
        </CustomizationProvider>
    );
}