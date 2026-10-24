// src/contexts/Customization.jsx
import { createContext, useContext, useEffect, useState } from "react";
import { DEFAULT_CAKE_MESSAGE_LAYOUT, normalizeCakeMessage, normalizeCakeMessageLayout } from "../utils/cakeMessage";
import { DEFAULT_CHOCOLATE_LAYOUT, hydrateChocolateLayouts, resizeChocolateLayouts } from "../utils/chocolateQuantity";
import { updateChocolateRotation } from "../utils/chocolateRotation";

const cakeColors = [
    { color: "#683434", name: "brown" },
    { color: "#70fd9d", name: "mint" },
    { color: "#52e7d4", name: "blue" },
    { color: "#ffa500", name: "orange" },
    { color: "#ff0000", name: "red" },
    { color: "#222222", name: "black" },
    { color: "#ececec", name: "white" },
    { color: "#a56bff", name: "lavender" },
    { color: "#896599", name: "mauve" },
    { color: "#32cd32", name: "lime green" },
    { color: "#ffe4b5", name: "peach" },
    { color: "#ff69b4", name: "hot pink" },
    { color: "#f3e5ab", name: "vanilla" },
];

const icingColors = [
    { color: "#3B1F18", name: "chocolate" },
    { color: "#FFF7EA", name: "vanilla cream" },
    { color: "#F7A8C8", name: "pink" },
    { color: "#B980F0", name: "ube" },
    { color: "#AEE8D5", name: "mint" },
    { color: "#F3C96B", name: "caramel" },
];

export const DEFAULT_FLAVOR = "Choco Moist";
const flavors = [DEFAULT_FLAVOR, "Vanilla Chiffon", "Ube Chiffon"];

const flavorTextureMap = {
    "Choco Moist": "choco",
    "Vanilla Chiffon": "vanilla",
    "Ube Chiffon": "ube",
};

export const FLAVOR_VISUALS = {
    "Choco Moist": { color: "#8B4513", label: "Chocolate" },
    "Vanilla Chiffon": { color: "#F3E5AB", label: "Vanilla" },
    "Ube Chiffon": { color: "#A56BFF", label: "Ube" },
};

export const TEXT_FONT_OPTIONS = [
    { value: "classic", label: "Cursive", path: "https://pub-b6dbdfd663ae44429f46f08964320068.r2.dev/fonts/customization/cursive.ttf" },
    { value: "elegant", label: "Elegant", path: "https://pub-b6dbdfd663ae44429f46f08964320068.r2.dev/fonts/customization/elegant.otf" },
    { value: "playful", label: "Playful", path: "https://pub-b6dbdfd663ae44429f46f08964320068.r2.dev/fonts/customization/playful.ttf" },
];

export const INSCRIPTION_COLOR_OPTIONS = [
    { value: "#EF4444", label: "Red" },
    { value: "#FACC15", label: "Yellow" },
    { value: "#22C55E", label: "Green" },
    { value: "#3B82F6", label: "Blue" },
    { value: "#FFFFFF", label: "White" },
    { value: "#000000", label: "Black" },
];

export const TOPPING_OPTIONS = [
    { key: "candle", label: "Candle", color: "#FFD700" },
    { key: "chocolate", label: "Chocolate", color: "#8B4513" },
    { key: "balls", label: "Balls", color: "#D4AF37" },
    { key: "nuts", label: "Nuts", color: "#A0522D" },
    { key: "cherry", label: "Cherry", color: "#DC143C" },
    { key: "sprinkles", label: "Sprinkles", color: "#F4D35E" },
];

export const TOPPING_SIZES = {
    small: 0.8,
    medium: 1.0,
    large: 1.2,
};

const DEFAULT_TOPPING_LAYOUT = {
    inscription: DEFAULT_CAKE_MESSAGE_LAYOUT,
    candle: { x: 50, y: 50, size: "medium", mode: "gold", color: "gold" },
    chocolate: DEFAULT_CHOCOLATE_LAYOUT,
    balls: { x: 50, y: 50, size: "small" },
    nuts: { x: 50, y: 50, size: "medium" },
    cherry: { x: 60, y: 40, size: "medium" },
    sprinkles: { x: 50, y: 50, size: "medium" },
};

export const CAKE_SIZES = [
    {
        tier: "1 Tier Cake",
        tierKey: "tier1",
        sizes: ["Bento Cake", "Tall Bento Cake", "Standard", "Tall Cake"],
    },
    {
        tier: "Mini 2 Tier",
        tierKey: "tier2",
        sizes: ["6x4 & 4x4", "6x6 Cake", "6x8 Cake", "8x5 Cake"],
    },
    {
        tier: "3 Tier Cake",
        tierKey: "tier3",
        sizes: ["4x5, 6x6 & 8x5"],
    },
    {
        tier: "4 Tier Cake",
        tierKey: "tier4",
        sizes: ["4x4 & 6x6, 8x5 & 10x4"],
    },
];

export const TIER_FLAVOR_LABELS = {
    1: ["Cake"],
    2: ["Bottom Tier", "Top Tier"],
    3: ["Bottom Tier", "Middle Tier", "Top Tier"],
    4: ["Bottom Tier", "Second Tier", "Third Tier", "Top Tier"],
};

const hydrateTierFlavors = (initialState) => {
    const savedTierIndex = Math.max(0, CAKE_SIZES.findIndex((item) => item.tier === initialState?.tier));
    const savedLayers = TIER_FLAVOR_LABELS[savedTierIndex + 1].map((label, layerIndex) => (
        initialState?.tier_flavors?.[label]
            || (layerIndex === 0 ? initialState?.flavor : null)
            || DEFAULT_FLAVOR
    ));
    return Object.fromEntries(CAKE_SIZES.map(({ tierKey }, index) => [
        tierKey,
        Array.from({ length: index + 1 }, (_, layerIndex) => savedLayers[layerIndex] || DEFAULT_FLAVOR),
    ]));
};

const hydrateTierFlavorOverrides = (initialState) => {
    const savedOverrides = initialState?.topping_layout?._design?.tier_flavor_overrides || [];
    return Object.fromEntries(CAKE_SIZES.map(({ tierKey }, index) => [
        tierKey,
        Array.from({ length: index + 1 }, (_, layerIndex) => savedOverrides[layerIndex] === true),
    ]));
};

const hydrateToppingLayout = (initialState) => {
    const savedLayout = initialState?.topping_layout || {};

    return Object.fromEntries(
        Object.entries(DEFAULT_TOPPING_LAYOUT).map(([key, defaultLayout]) => [
            key,
            key === "inscription" ? normalizeCakeMessageLayout(savedLayout[key]) : {
                ...defaultLayout,
                ...(key === "chocolate" && Array.isArray(savedLayout[key]) ? savedLayout[key][0] : (savedLayout[key] || {})),
            },
        ])
    );
};

const hydrateCherryLayouts = (initialState) => {
    const savedCherryLayout = initialState?.topping_layout?.cherry;
    const layouts = Array.isArray(savedCherryLayout)
        ? savedCherryLayout
        : savedCherryLayout
            ? [savedCherryLayout]
            : [DEFAULT_TOPPING_LAYOUT.cherry];

    return layouts.map((layout) => ({
        ...DEFAULT_TOPPING_LAYOUT.cherry,
        ...layout,
    }));
};

const normalizeCandleNumber = (value) => {
    const parsed = Number.parseInt(value, 10);
    if (Number.isNaN(parsed)) return 1;
    return Math.max(1, Math.min(100, parsed));
};

const normalizeCandleMode = (value) => value === "number" ? "number" : "gold";
const normalizeCandleColor = (value) => value === "white" ? "white" : "gold";

const DEFAULT_CAKE_PRICES = {
    tier1: { "Choco Moist": 1000, "Vanilla Chiffon": 900, "Ube Chiffon": 900 },
    tier2: { "Choco Moist": 1800, "Vanilla Chiffon": 1600, "Ube Chiffon": 1600 },
    tier3: { "Choco Moist": 2800, "Vanilla Chiffon": 2500, "Ube Chiffon": 2500 },
    tier4: { "Choco Moist": 3800, "Vanilla Chiffon": 3400, "Ube Chiffon": 3400 },
};

const DEFAULT_ADDON_PRICES = {
    candle_single: 50,
    candle_number: 100,
    chocolate_small: 100,
    chocolate_medium: 150,
    chocolate_large: 200,
    balls_small: 75,
    balls_medium: 100,
    balls_large: 125,
    cherry_small: 30,
    cherry_medium: 50,
    cherry_large: 70,
    nuts: 75,
    sprinkles: 50,
    candle: 100,
    chocolate: 150,
    balls: 100,
    cherry: 50,
};

const CustomizationContext = createContext({});

export const CustomizationProvider = (props) => {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    const initialState = props.initialState;
    const [form, setForm] = useState(
        () => initialState?.shape === "rectangle" ? 2 : 1
    );
    const [selectedTierIndex, setSelectedTierIndex] = useState(
        () => {
            if (!initialState?.tier) return 0;
            const idx = CAKE_SIZES.findIndex(t => t.tier === initialState.tier);
            return idx === -1 ? 0 : idx;
        }
    );
    const [selectedSize, setSelectedSize] = useState(
        () => initialState?.size || CAKE_SIZES[0].sizes[0]
    );
    const [candle, setCandle] = useState(!!initialState?.has_candle);
    const [candleNumber, setCandleNumberState] = useState(
        () => normalizeCandleNumber(initialState?.candle_number)
    );
    const [candleMode, setCandleModeState] = useState(
        () => normalizeCandleMode(initialState?.topping_layout?.candle?.mode)
    );
    const [candleColor, setCandleColorState] = useState(
        () => normalizeCandleColor(initialState?.topping_layout?.candle?.color)
    );
    const [chocolate, setChocolate] = useState(!!initialState?.has_chocolate);
    const [chocolateLayouts, setChocolateLayouts] = useState(
        () => hydrateChocolateLayouts(initialState?.topping_layout?.chocolate)
    );
    const [balls, setBalls] = useState(!!initialState?.has_balls);
    const [nuts, setNuts] = useState(!!initialState?.has_nuts);
    const [cherry, setCherry] = useState(!!initialState?.has_cherry);
    const [cherryLayouts, setCherryLayouts] = useState(
        () => hydrateCherryLayouts(initialState)
    );
    const [sprinkles, setSprinkles] = useState(!!initialState?.has_sprinkles);
    const [cakeColor, setCakeColor] = useState(
        () => cakeColors.find(c => c.color === initialState?.cake_color) || cakeColors[0]
    );
    const [icingColor, setIcingColor] = useState(
        () => icingColors.find(c => c.color === initialState?.icing_color) || icingColors[0]
    );
    const [basePrices, setBasePrices] = useState([]);
    const [addonPrices, setAddonPrices] = useState([]);
    const [pricingLoading, setPricingLoading] = useState(true);
    const [pricingError, setPricingError] = useState("");
    // LANDMARK: init topping layout (ADMIN FIX)
    const [toppingLayout, setToppingLayout] = useState(
        () => hydrateToppingLayout(initialState)
    );
    // LANDMARK: init tier flavors from admin payload
    const [tierFlavors, setTierFlavors] = useState(() => hydrateTierFlavors(initialState));
    const [tierFlavorOverrides, setTierFlavorOverrides] = useState(() => hydrateTierFlavorOverrides(initialState));

    const [tierFlavorLabels] = useState(["Bottom Tier", "Middle Tier", "Top Tier", "Peak Tier"]);
    // LANDMARK: inscription + font hydrate fix
    const [inscriptionText, setInscriptionText] = useState(
        () => normalizeCakeMessage(initialState?.inscription_text)
    );

    const [textFont, setTextFont] = useState(
        () => initialState?.text_font || TEXT_FONT_OPTIONS[0].value
    );
    const [inscriptionColor, setInscriptionColor] = useState(
        () => initialState?.inscription_color || INSCRIPTION_COLOR_OPTIONS[0].value
    );
    const setInscriptionLayout = (changes) => {
        setToppingLayout((previous) => ({
            ...previous,
            inscription: normalizeCakeMessageLayout({ ...previous.inscription, ...changes }),
        }));
    };
    const setTextSize = (size) => {
        setToppingLayout((previous) => ({
            ...previous,
            inscription: normalizeCakeMessageLayout({
                ...previous.inscription,
                textSize: typeof size === "function" ? size(previous.inscription.textSize) : size,
            }),
        }));
    };

    const tier = CAKE_SIZES[selectedTierIndex] ?? CAKE_SIZES[0];
    const flavor = tierFlavors.tier1[0];
    const setFlavor = (newFlavor) => {
        const shouldCascade = selectedTierIndex === 0;
        setTierFlavors((prev) => {
            const nextFlavor = typeof newFlavor === "function" ? newFlavor(prev.tier1[0]) : newFlavor;
            return Object.fromEntries(Object.entries(prev).map(([key, layers]) => [
                key, layers.map((value, index) => shouldCascade || index === 0 ? nextFlavor : value),
            ]));
        });
        setTierFlavorOverrides((prev) => Object.fromEntries(Object.entries(prev).map(([key, layers]) => [
            key, layers.map((value, index) => shouldCascade || index === 0 ? false : value),
        ])));
    };
    const selectedTierFlavors = tierFlavors[tier.tierKey];
    const selectedTierFlavorOverrides = tierFlavorOverrides[tier.tierKey];
    const pricingFlavor = selectedTierFlavors[0] ?? flavor;

    const setToppingPosition = (key, x, y, position) => {
        const coordinates = position ? { position: [...position] } : {};
        if (key.startsWith("chocolate-")) {
            const index = Number(key.slice("chocolate-".length));
            setChocolateLayouts((prev) => prev.map((layout, layoutIndex) => (
                layoutIndex === index ? { ...layout, x, y, ...coordinates } : layout
            )));
            return;
        }
        if (key.startsWith("cherry-")) {
            const index = Number.parseInt(key.slice("cherry-".length), 10);
            if (Number.isNaN(index)) return;

            setCherryLayouts((prev) => prev.map((layout, layoutIndex) => (
                layoutIndex === index ? { ...layout, x, y, ...coordinates } : layout
            )));
            return;
        }

        setToppingLayout((prev) => ({
            ...prev,
            [key]: { ...prev[key], x, y, ...coordinates },
        }));
    };

    const rejectToppingAdditions = (keys) => {
        const rejected = new Set(keys);
        if (rejected.has("candle")) setCandle(false);
        if (rejected.has("chocolate")) setChocolate(false);
        if (rejected.has("balls")) setBalls(false);
        if (rejected.has("nuts")) setNuts(false);

        const chocolateIndexes = new Set(keys.filter((key) => key.startsWith("chocolate-")).map((key) => Number(key.slice(10))));
        if (chocolateIndexes.size) {
            if (chocolateLayouts.every((_, index) => chocolateIndexes.has(index))) setChocolate(false);
            setChocolateLayouts((prev) => {
                const remaining = prev.filter((_, index) => !chocolateIndexes.has(index));
                return remaining.length ? remaining : [{ ...DEFAULT_CHOCOLATE_LAYOUT }];
            });
        }

        const cherryIndexes = new Set(keys.filter((key) => key.startsWith("cherry-")).map((key) => Number(key.slice(7))));
        if (cherryIndexes.size) {
            if (cherryLayouts.every((_, index) => cherryIndexes.has(index))) setCherry(false);
            setCherryLayouts((prev) => {
                const remaining = prev.filter((_, index) => !cherryIndexes.has(index));
                return remaining.length ? remaining : [{ ...DEFAULT_TOPPING_LAYOUT.cherry }];
            });
        }
    };

    const setToppingSize = (key, size) => {
        if (key.startsWith("chocolate-")) {
            const index = Number(key.slice("chocolate-".length));
            setChocolateLayouts((prev) => prev.map((layout, layoutIndex) => (
                layoutIndex === index ? { ...layout, size } : layout
            )));
            return;
        }
        if (key.startsWith("cherry-")) {
            const index = Number.parseInt(key.slice("cherry-".length), 10);
            if (Number.isNaN(index)) return;

            setCherryLayouts((prev) => prev.map((layout, layoutIndex) => (
                layoutIndex === index ? { ...layout, size } : layout
            )));
            return;
        }

        setToppingLayout((prev) => ({
            ...prev,
            [key]: { ...prev[key], size },
        }));
    };

    const setChocolateCount = (count) => {
        setChocolate(true);
        setChocolateLayouts((prev) => resizeChocolateLayouts(prev, count));
    };

    const setChocolateRotation = (index, axis, value) => {
        setChocolateLayouts((prev) => updateChocolateRotation(prev, index, axis, value));
    };

    const setCherryCount = (count) => {
        const nextCount = Math.max(1, Math.min(12, Number(count) || 1));
        setCherry(true);
        setCherryLayouts((prev) => Array.from({ length: nextCount }, (_, index) => (
            prev[index] || {
                ...DEFAULT_TOPPING_LAYOUT.cherry,
                x: 35 + ((index * 17) % 35),
                y: 35 + ((index * 23) % 30),
            }
        )));
    };

    const setTierLayerFlavor = (layerIdx, newFlavor) => {
        if (!Number.isInteger(layerIdx) || layerIdx < 0 || layerIdx > selectedTierIndex) return;
        if (selectedTierIndex === 0) {
            setFlavor(newFlavor);
            return;
        }
        setTierFlavors((prev) => Object.fromEntries(Object.entries(prev).map(([key, layers]) => [
            key, layers.map((value, index) => index === layerIdx ? newFlavor : value),
        ])));
        setTierFlavorOverrides((prev) => Object.fromEntries(Object.entries(prev).map(([key, layers]) => [
            key, layers.map((value, index) => index === layerIdx ? true : value),
        ])));
    };
    const resetTierFlavorOverrides = () => {
        setTierFlavors((prev) => Object.fromEntries(Object.entries(prev).map(([key, layers]) => [
            key, layers.map((value, index) => index <= selectedTierIndex ? DEFAULT_FLAVOR : value),
        ])));
        setTierFlavorOverrides((prev) => Object.fromEntries(Object.entries(prev).map(([key, layers]) => [
            key, layers.map((value, index) => index <= selectedTierIndex ? false : value),
        ])));
    };

    const setCandleNumber = (value) => {
        setCandleNumberState(normalizeCandleNumber(value));
    };

    const setCandleMode = (value) => {
        setCandleModeState(normalizeCandleMode(value));
        setToppingLayout((prev) => ({
            ...prev,
            candle: {
                ...prev.candle,
                mode: normalizeCandleMode(value),
            },
        }));
    };

    const setCandleColor = (value) => {
        const normalizedColor = normalizeCandleColor(value);
        setCandleColorState(normalizedColor);
        setToppingLayout((prev) => ({
            ...prev,
            candle: {
                ...prev.candle,
                color: normalizedColor,
            },
        }));
    };

    useEffect(() => {
        let isMounted = true;

        async function fetchPricing() {
            setPricingLoading(true);
            setPricingError("");

            try {
                const res = await fetch(`${BASEURL}/api/custom-pricing/`);
                if (!res.ok) throw new Error("Failed to load custom cake pricing");
                const data = await res.json();

                if (isMounted) {
                    setBasePrices(data.base_prices || []);
                    setAddonPrices(data.addon_prices || []);
                }
            } catch (error) {
                if (isMounted) {
                    setPricingError(error.message);
                }
            } finally {
                if (isMounted) {
                    setPricingLoading(false);
                }
            }
        }

        fetchPricing();

        return () => {
            isMounted = false;
        };
    }, [BASEURL]);

    const getBasePrice = () => {
        const currentShape = form === 2 ? "rectangle" : "round";
        const configuredPrice = basePrices.find((item) =>
            (item.shape || "round") === currentShape &&
            item.tier === tier.tier &&
            item.size === selectedSize &&
            item.flavor === pricingFlavor
        );

        if (configuredPrice) return Number(configuredPrice.price);
        return DEFAULT_CAKE_PRICES[tier.tierKey]?.[pricingFlavor] ?? 1000;
    };

    const getAddonPrice = (key) => {
        const configuredAddon = addonPrices.find((item) => item.key === key);
        if (configuredAddon) return Number(configuredAddon.price);

        // Fallbacks if specific key not present
        if (key === "candle_single" || key === "candle_number") {
            const fallback = addonPrices.find((item) => item.key === "candle");
            if (fallback) return Number(fallback.price);
        }
        if (key.startsWith("chocolate_")) {
            const fallback = addonPrices.find((item) => item.key === "chocolate");
            if (fallback) return Number(fallback.price);
        }
        if (key.startsWith("balls_")) {
            const fallback = addonPrices.find((item) => item.key === "balls");
            if (fallback) return Number(fallback.price);
        }
        if (key.startsWith("cherry_")) {
            const fallback = addonPrices.find((item) => item.key === "cherry");
            if (fallback) return Number(fallback.price);
        }

        return DEFAULT_ADDON_PRICES[key] ?? 0;
    };

    const calculatePrice = () => {
        let addonsPrice = 0;

        // Candle pricing: single vs number
        if (candle) {
            const candleKey = candleMode === "number" ? "candle_number" : "candle_single";
            addonsPrice += getAddonPrice(candleKey);
        }

        // Chocolate pricing: per piece, based on size.
        if (chocolate) {
            chocolateLayouts.forEach((layout) => {
                const chocSize = (layout.size || "medium").toLowerCase();
                addonsPrice += getAddonPrice(`chocolate_${chocSize}`);
            });
        }

        // Balls pricing: small, medium, large
        if (balls) {
            const ballsSize = (toppingLayout.balls?.size || "medium").toLowerCase();
            const key = `balls_${ballsSize}`;
            addonsPrice += getAddonPrice(key);
        }

        // Nuts pricing
        if (nuts) {
            addonsPrice += getAddonPrice("nuts");
        }

        // Cherry pricing: per cherry, based on size
        if (cherry) {
            if (cherryLayouts.length > 0) {
                cherryLayouts.forEach((chLayout) => {
                    const cSize = (chLayout.size || "medium").toLowerCase();
                    const key = `cherry_${cSize}`;
                    addonsPrice += getAddonPrice(key);
                });
            } else {
                addonsPrice += getAddonPrice("cherry_medium");
            }
        }

        // Sprinkles pricing
        if (sprinkles) {
            addonsPrice += getAddonPrice("sprinkles");
        }

        return getBasePrice() + addonsPrice;
    };

    const handleTierChange = (idx) => {
        setSelectedTierIndex(idx);
        setSelectedSize(CAKE_SIZES[idx].sizes[0]);
    };

    const generateRandomCake = () => {
        const randomForm = Math.random() < 0.5 ? 1 : 2;
        const randomTierIdx = Math.floor(Math.random() * CAKE_SIZES.length);
        const randomCakeColor = cakeColors[Math.floor(Math.random() * cakeColors.length)];
        const randomFlavor = flavors[Math.floor(Math.random() * flavors.length)];
        const decorationOptions = ["candle", "chocolate", "balls", "nuts", "cherry", "sprinkles"];
        const randomDecoration = decorationOptions[Math.floor(Math.random() * decorationOptions.length)];

        setForm(randomForm);
        setSelectedTierIndex(randomTierIdx);
        setSelectedSize(CAKE_SIZES[randomTierIdx].sizes[0]);
        setCakeColor(randomCakeColor);
        setIcingColor(icingColors[Math.floor(Math.random() * icingColors.length)]);
        setCandleNumber(Math.floor(Math.random() * 100) + 1);
        setCandleMode(Math.random() < 0.5 ? "gold" : "number");
        const randomLayers = [randomFlavor, ...Array.from({ length: 3 }, () => flavors[Math.floor(Math.random() * flavors.length)])];
        setTierFlavors(Object.fromEntries(CAKE_SIZES.map(({ tierKey }, index) => [tierKey, randomLayers.slice(0, index + 1)])));
        setTierFlavorOverrides(hydrateTierFlavorOverrides());

        setCandle(false);
        setChocolate(false);
        setChocolateLayouts([{ ...DEFAULT_CHOCOLATE_LAYOUT }]);
        setBalls(false);
        setNuts(false);
        setCherry(false);
        setCherryLayouts([DEFAULT_TOPPING_LAYOUT.cherry]);
        setSprinkles(false);
        switch (randomDecoration) {
            case "candle":
                setCandle(true);
                break;
            case "chocolate":
                setChocolate(true);
                break;
            case "balls":
                setBalls(true);
                break;
            case "nuts":
                setNuts(true);
                break;
            case "cherry":
                setCherry(true);
                break;
            case "sprinkles":
                setSprinkles(true);
                break;
            default:
                break;
        }
    };

    return (
        <CustomizationContext.Provider
            value={{
                form,
                setForm,
                selectedTierIndex,
                setSelectedTierIndex: handleTierChange,
                selectedSize,
                setSelectedSize,
                cakeColors,
                cakeColor,
                setCakeColor,
                icingColors,
                icingColor,
                setIcingColor,
                flavors,
                flavor,
                setFlavor,
                flavorTextureMap,
                FLAVOR_VISUALS,
                TEXT_FONT_OPTIONS,
                INSCRIPTION_COLOR_OPTIONS,
                selectedTierFlavors,
                selectedTierFlavorOverrides,
                resetTierFlavorOverrides,
                candle,
                setCandle,
                candleMode,
                setCandleMode,
                candleColor,
                setCandleColor,
                candleNumber,
                setCandleNumber,
                chocolate,
                setChocolate,
                chocolateLayouts,
                chocolateCount: chocolateLayouts.length,
                setChocolateCount,
                setChocolateRotation,
                balls,
                setBalls,
                nuts,
                setNuts,
                cherry,
                setCherry,
                cherryCount: cherryLayouts.length,
                setCherryCount,
                cherryLayouts,
                sprinkles,
                setSprinkles,
                generateRandomCake,
                calculatePrice,
                pricingLoading,
                pricingError,
                basePrices,
                addonPrices,
                toppingLayout,
                setToppingPosition,
                rejectToppingAdditions,
                setToppingSize,
                tierFlavors,
                tierFlavorOverrides,
                setTierLayerFlavor,
                tierFlavorLabels,
                inscriptionText,
                setInscriptionText,
                textFont,
                setTextFont,
                inscriptionColor,
                setInscriptionColor,
                inscriptionLayout: toppingLayout.inscription,
                setInscriptionLayout,
                textSize: toppingLayout.inscription.textSize,
                setTextSize,
            }}
        >
            {props.children}
        </CustomizationContext.Provider>
    );
};

export const useCustomization = () => useContext(CustomizationContext);
