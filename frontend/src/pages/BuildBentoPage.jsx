// src/pages/BuildBentoPage.jsx
import { useRef, Suspense, useState, useEffect, Component } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, ContactShadows } from "@react-three/drei";
import { DndContext, MouseSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { useLocation, useNavigate } from "react-router-dom";
import * as THREE from "three";
import { CAKE_SIZES, CustomizationProvider, DEFAULT_FLAVOR, FLAVOR_VISUALS, INSCRIPTION_COLOR_OPTIONS, TEXT_FONT_OPTIONS, TIER_FLAVOR_LABELS, TOPPING_OPTIONS, TOPPING_SIZES, useCustomization } from "../contexts/Customization";
import { useCart } from "../context/CartContext";
import CakeModel, { TierLoadingFallback } from "../components/cake/CakeModel";
import { TIER_TOP_RADIUS } from "../components/cake/tierConfig";
import CakeCompass from "../components/CakeCompass";
import CakePreviewCapture from "../components/CakePreviewCapture";
import { MAX_CAKE_MESSAGE_LENGTH } from "../utils/cakeMessage";
import { normalizeChocolateRotation } from "../utils/chocolateRotation";
import { createCakeCustomization } from "../utils/cakeCustomization";
import { ToppingDragIndicator, ToppingDragProvider, useToppingDragMarker, useToppingDragStore } from "../components/ToppingDragControls";
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

export { CakeModel };

const FLAVOR_LABELS = {
    "Choco Moist": "Chocolate",
    "Vanilla Chiffon": "Vanilla",
    "Ube Chiffon": "Ube",
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
        this.props.onError?.();
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
export function RealisticLighting() {
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

// ──────── DraggableTopping ────────
function DraggableTopping({ topping, layout, isEnabled = true, form, boardWidth, boardHeight }) {
    const livePosition = useToppingDragMarker(topping.key);
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: topping.key,
    });

    const safeX = Number.isFinite(layout?.x) ? layout.x : 50;
    const safeY = Number.isFinite(layout?.y) ? layout.y : 50;
    const sizeStr = (layout?.size || "medium").toLowerCase();
    const markerDiameter = { small: 22, medium: 28, large: 36 }[sizeStr] ?? 28;

    let displayX = livePosition?.x ?? safeX;
    let displayY = livePosition?.y ?? safeY;

    if (!livePosition && transform && boardWidth > 0 && boardHeight > 0) {
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
    const dragStore = useToppingDragStore();
    const dragStartLayout = useRef(null);
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
                // Geometry validation owns the positions of individually placed
                // meshes. Pixel-sized marker margins must not move them again.
                if (dragStore.controller?.entries.has(topping.key)) return;
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
    }, [activeToppings, form, toppingLayout, cherryLayouts, onMove, selectedTierIndex, dragStore]);

    const handleDragStart = ({ active }) => {
        const key = active.id;
        dragStartLayout.current = key.startsWith("cherry-")
            ? cherryLayouts[Number.parseInt(key.slice("cherry-".length), 10)]
            : toppingLayout[key];
    };

    const handleDragMove = ({ active, delta }) => {
        const start = dragStartLayout.current;
        const board = boardRef.current;
        if (!start || !board?.clientWidth || !board.clientHeight) return false;
        return dragStore.controller?.moveMarker(active.id,
            start.x + (delta.x / board.clientWidth) * 100,
            start.y + (delta.y / board.clientHeight) * 100);
    };

    const handleDragEnd = ({ active, delta }) => {
        if (handleDragMove({ active, delta })) {
            dragStore.controller.end();
            dragStartLayout.current = null;
            return;
        }
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
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragMove={handleDragMove} onDragEnd={handleDragEnd} onDragCancel={() => { dragStore.controller?.cancel(); dragStartLayout.current = null; }}>
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
function Configurator({ selectedTierIndex, setSelectedTierIndex, selectedSize, setSelectedSize, capturePreview }) {
    const customization = useCustomization();
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
        chocolateCount, setChocolateCount, chocolateLayouts, setChocolateRotation,
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
        selectedTierFlavors,
        setTierLayerFlavor,
        resetTierFlavorOverrides,
        tierFlavorLabels,
        inscriptionText,
        setInscriptionText,
        textFont,
        setTextFont,
        inscriptionColor,
        setInscriptionColor,
    } = customization;

    const { addCustomCakeToCart } = useCart();
    const dragStore = useToppingDragStore();
    const navigate = useNavigate();
    const [orderStatus, setOrderStatus] = useState(null);
    const [errorMessage, setErrorMessage] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [openSection, setOpenSection] = useState("tier");
    const isCakeColorAvailable = selectedTierFlavors.every((layerFlavor) => layerFlavor === "Choco Moist");

    const toggleSection = (section) => {
        setOpenSection((current) =>
            current === section ? null : section
        );
    };

    const handleSizeChange = (e) => setSelectedSize(e.target.value);
    const handleShapeChange = (newForm) => {
        setForm(newForm);
    };
    const placementLayout = {
        ...toppingLayout,
        ...Object.fromEntries(chocolateLayouts.map((layout, index) => [`chocolate-${index}`, layout])),
    };
    const toppingEnabled = { candle, chocolate, balls, nuts, cherry, sprinkles };
    const activeToppings = TOPPING_OPTIONS
        .filter((topping) => toppingEnabled[topping.key])
        .filter((topping) => topping.key !== "nuts" && topping.key !== "sprinkles")
        .flatMap((topping) => topping.key === "cherry"
            ? cherryLayouts.map((_, index) => ({ ...topping, key: `cherry-${index}`, label: `Cherry ${index + 1}` }))
            : topping.key === "chocolate"
                ? chocolateLayouts.map((_, index) => ({ ...topping, key: `chocolate-${index}`, label: `Chocolate ${index + 1}` }))
                : [topping]);
    const placementToppings = activeToppings.some((topping) => topping.key === "candle")
        ? activeToppings
        : [TOPPING_OPTIONS.find((topping) => topping.key === "candle"), ...activeToppings];
    const activeTierLabels = TIER_FLAVOR_LABELS[selectedTierIndex + 1] || TIER_FLAVOR_LABELS[1];

    const handleAddToCart = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        let previewImage;
        try {
            if (dragStore.controller?.isDragging.current) throw new Error("Finish placing your topping before saving your cake.");
            if (dragStore.controller?.hasUnplacedToppings) throw new Error("There is not enough space for these toppings. Move, resize, or remove a topping before saving your cake.");
            previewImage = capturePreview?.();
            if (!previewImage) throw new Error("The cake preview is still loading. Please try again.");
        } catch (error) {
            setOrderStatus("error");
            setErrorMessage(error.message || "Unable to capture your cake preview. Please try again.");
            setIsSubmitting(false);
            setTimeout(() => setOrderStatus(null), 3000);
            return;
        }

        const selectedTier = CAKE_SIZES[selectedTierIndex] ?? CAKE_SIZES[0];
        const payload = createCakeCustomization(customization, {
            tier: selectedTier,
            labels: activeTierLabels,
            previewImage,
        });

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
                result.error?.inscription_text?.[0] || result.error?.error || result.error?.message || "Failed to add cake to cart. Please try again."
            );
            setTimeout(() => setOrderStatus(null), 3000);
        }

        setIsSubmitting(false);
    };

    return (
        <aside className="w-full lg:w-[400px] h-auto lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-y-contain lg:[&>*]:shrink-0 bg-[#FFFDF9]/95 backdrop-blur-xl border border-[#E6CCA2] rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col gap-4 sm:gap-6 custom-scrollbar">
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
                            className={`w-9 h-9 rounded-full border-2 transition-all duration-200 cursor-pointer active:scale-90 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:active:scale-100 focus:outline-none ${cakeColor.name === c.name
                                ? "border-[#C05A11] ring-2 ring-[#C05A11]/30 scale-105 shadow-md"
                                : "border-transparent shadow-sm"
                                }`}
                            style={{ background: c.color }}
                            title={c.name}
                            onClick={() => setCakeColor(c)}
                            disabled={!isCakeColorAvailable}
                            aria-label={`Cake color ${c.name}`}
                            aria-describedby="cake-color-note"
                        />
                    ))}
                </div>
                <p id="cake-color-note" className="mt-3 text-xs text-[#A07060]">
                    Note: Cake colors are only available when both tiers are Choco Moist.
                </p>
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
                            ↺ Reset tier flavors to Choco Moist
                        </button>
                        {Array.from({ length: selectedTierIndex + 1 }).map((_, idx) => (
                            <label className="flex items-center justify-between gap-4 p-3 bg-white rounded-xl border border-[#E6CCA2]" key={`tier-flavor-${idx}`}>
                                <span className="flex items-center gap-2 text-sm font-medium text-[#6E473B]">
                                    <span
                                        className="w-3 h-3 rounded-full border border-black/10 inline-block shadow-sm"
                                        style={{
                                            backgroundColor:
                                                FLAVOR_VISUALS[selectedTierFlavors[idx]]
                                                    ?.color || cakeColor.color,
                                        }}
                                    />
                                    {activeTierLabels[idx] ?? tierFlavorLabels[idx] ?? `Tier ${idx + 1}`}
                                </span>
                                <select
                                    className="px-3 py-1.5 text-xs rounded-lg bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11] cursor-pointer"
                                    value={selectedTierFlavors[idx] || DEFAULT_FLAVOR}
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
                        maxLength={MAX_CAKE_MESSAGE_LENGTH}
                        placeholder="Add text on top"
                        onChange={(event) => setInscriptionText(event.target.value.slice(0, MAX_CAKE_MESSAGE_LENGTH))}
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
                                toppingLayout={placementLayout}
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
                                                        : (placementLayout[topping.key] || { size: "M" })).size === size
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

                            {chocolate && chocolateLayouts.map((layout, index) => (
                                <fieldset key={`chocolate-rotation-${index}`} aria-label={`Chocolate ${index + 1} rotation`} className="flex flex-col gap-3 p-3 bg-white rounded-xl border border-[#E6CCA2] shadow-sm">
                                    <span className="text-xs font-semibold text-[#6E473B]">Chocolate {index + 1} rotation</span>
                                    {["x", "y"].map((axis) => (
                                        <label key={axis} className="flex flex-col gap-2">
                                            <span className="flex items-center justify-between text-xs font-semibold text-[#6E473B]">
                                                {axis.toUpperCase()} axis
                                                <output>{normalizeChocolateRotation(layout.rotation)[axis]}°</output>
                                            </span>
                                            <input
                                                type="range"
                                                aria-label={`Chocolate ${index + 1} ${axis.toUpperCase()} rotation`}
                                                min="0"
                                                max="360"
                                                step="5"
                                                value={normalizeChocolateRotation(layout.rotation)[axis]}
                                                onChange={(event) => setChocolateRotation(index, axis, event.target.value)}
                                                className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-[#C05A11] bg-[#E6CCA2]"
                                            />
                                        </label>
                                    ))}
                                </fieldset>
                            ))}

                            {chocolate && (
                                <div className="flex items-center justify-between p-3 bg-white rounded-xl border border-[#E6CCA2] shadow-sm">
                                    <label htmlFor="chocolate-count" className="text-xs font-semibold text-[#6E473B]">Number of chocolates</label>
                                    <input
                                        id="chocolate-count"
                                        type="number"
                                        min="1"
                                        max="3"
                                        step="1"
                                        value={chocolateCount}
                                        onChange={(event) => setChocolateCount(event.target.value)}
                                        className="w-16 text-center px-2 py-1.5 text-sm font-bold rounded-lg bg-[#FFFDF9] border border-[#E6CCA2] text-[#6E473B] focus:outline-none focus:border-[#C05A11]"
                                    />
                                </div>
                            )}

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
    const [isCakeReady, setIsCakeReady] = useState(false);

    const cakeGroupRef = useRef(null);
    const orbitControlsRef = useRef(null);
    const capturePreviewRef = useRef(null);

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
        <div className="cake-builder-page min-h-screen lg:h-dvh lg:min-h-0 lg:overflow-hidden w-full max-w-full overflow-x-clip lg:overflow-x-hidden bg-[#FCF8EE] pt-2 flex flex-col antialiased font-sans">
            <ToppingDragIndicator />
            {/* Main responsive wrapper layout */}
            <div className="max-w-7xl w-full mx-auto p-3 sm:p-4 md:p-6 lg:p-8 flex flex-col lg:flex-row lg:flex-1 lg:min-h-0 gap-4 items-start">

                {/* 3D Canvas Box */}
                <div className="cake-preview-column w-full flex-1 self-start relative z-10 lg:z-auto" aria-busy={!isCakeReady}>
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
                            <CanvasErrorBoundary onError={() => setIsCakeReady(true)}>
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

                                    <Suspense key={selectedTierIndex} fallback={<TierLoadingFallback selectedTierIndex={selectedTierIndex} onReady={setIsCakeReady} />}>
                                        <CakeModel
                                            selectedTierIndex={selectedTierIndex}
                                            autoSpin={autoSpin}
                                            cakeGroupRef={cakeGroupRef}
                                            controlsRef={orbitControlsRef}
                                            onReady={setIsCakeReady}
                                        />
                                        <CakePreviewCapture captureRef={capturePreviewRef} />

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

                {/* Configurator Side Column - Scrolls independently within the desktop viewport */}
                <div className="w-full lg:w-auto lg:h-full lg:min-h-0 lg:shrink-0">
                    <Configurator
                        selectedTierIndex={selectedTierIndex}
                        setSelectedTierIndex={setSelectedTierIndex}
                        selectedSize={selectedSize}
                        setSelectedSize={setSelectedSize}
                        capturePreview={() => capturePreviewRef.current?.()}
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
            <ToppingDragProvider>
            <BuildBentoContent />
            </ToppingDragProvider>
        </CustomizationProvider>
    );
}
