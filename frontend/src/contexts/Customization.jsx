// src/contexts/Customization.jsx
import { createContext, useContext, useEffect, useState } from "react";

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

const flavors = ["Choco Moist", "Vanilla Chiffon", "Ube Chiffon"];

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
    candle: { x: 50, y: 50, size: "medium", mode: "gold", color: "gold" },
    chocolate: { x: 50, y: 50, size: "medium" },
    balls: { x: 50, y: 50, size: "medium" },
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

// LANDMARK: hydrate tierFlavors from saved payload
const hydrateTierFlavors = (initialState) => {
    if (!initialState?.tier_flavors) return null;

    const map = initialState.tier_flavors;

    return {
        tier2: map["Bottom Tier"] && map["Top Tier"]
            ? [map["Bottom Tier"], map["Top Tier"]]
            : [flavors[0], flavors[0]],

        tier3: [
            map["Bottom Tier"] || flavors[0],
            map["Middle Tier"] || flavors[0],
            map["Top Tier"] || flavors[0],
        ],

        tier4: [
            map["Bottom Tier"] || flavors[0],
            map["Second Tier"] || flavors[0],
            map["Third Tier"] || flavors[0],
            map["Top Tier"] || flavors[0],
        ],
    };
};

const hydrateToppingLayout = (initialState) => {
    const savedLayout = initialState?.topping_layout || {};

    return Object.fromEntries(
        Object.entries(DEFAULT_TOPPING_LAYOUT).map(([key, defaultLayout]) => [
            key,
            {
                ...defaultLayout,
                ...(savedLayout[key] || {}),
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
    candle: 100,
    chocolate: 200,
    balls: 100,
    nuts: 75,
    cherry: 50,
    sprinkles: 50,
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
    const [flavor, setFlavor] = useState(
        () => initialState?.flavor || flavors[0]
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
    const [tierFlavors, setTierFlavors] = useState(() => {
        const hydrated = hydrateTierFlavors(initialState);
        if (hydrated) return hydrated;

        return {
            tier2: [flavors[0], flavors[0]],
            tier3: [flavors[0], flavors[0], flavors[0]],
            tier4: [flavors[0], flavors[0], flavors[0], flavors[0]],
        };
    });
      const [tierFlavorOverrides, setTierFlavorOverrides] = useState({
        tier2: [false, false],
        tier3: [false, false, false],
        tier4: [false, false, false, false],
    });

    const [tierFlavorLabels] = useState(["Bottom Tier", "Middle Tier", "Top Tier", "Peak Tier"]);
    // LANDMARK: inscription + font hydrate fix
    const [inscriptionText, setInscriptionText] = useState(
        () => initialState?.inscription_text || ""
    );

    const [textFont, setTextFont] = useState(
        () => initialState?.text_font || TEXT_FONT_OPTIONS[0].value
    );
    const [inscriptionColor, setInscriptionColor] = useState(
        () => initialState?.inscription_color || INSCRIPTION_COLOR_OPTIONS[0].value
    );

    const tier = CAKE_SIZES[selectedTierIndex] ?? CAKE_SIZES[0];
    const selectedTierFlavors = tier.tierKey === "tier1"
        ? [flavor]
        : tierFlavors[tier.tierKey] ?? [flavor];
    const selectedTierFlavorOverrides = tier.tierKey === "tier1"
        ? [false]
        : tierFlavorOverrides[tier.tierKey] ?? [];
    const pricingFlavor = selectedTierFlavors[0] ?? flavor;

    const setToppingPosition = (key, x, y) => {
        if (key.startsWith("cherry-")) {
            const index = Number.parseInt(key.slice("cherry-".length), 10);
            if (Number.isNaN(index)) return;

            setCherryLayouts((prev) => prev.map((layout, layoutIndex) => (
                layoutIndex === index ? { ...layout, x, y } : layout
            )));
            return;
        }

        setToppingLayout((prev) => ({
            ...prev,
            [key]: { ...prev[key], x, y },
        }));
    };

    const setToppingSize = (key, size) => {
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
        const tierKey = CAKE_SIZES[selectedTierIndex]?.tierKey;
        if (!tierKey || tierKey === "tier1") return;
        setTierFlavors((prev) => ({
            ...prev,
            [tierKey]: prev[tierKey].map((f, idx) => (idx === layerIdx ? newFlavor : f)),
        }));
        setTierFlavorOverrides((prev) => ({
            ...prev,
            [tierKey]: (prev[tierKey] || []).map((v, idx) => (idx === layerIdx ? true : v)),
        }));
    };
     const resetTierFlavorOverrides = () => {
        setTierFlavors({
            tier2: [flavors[0], flavors[0]],
            tier3: [flavors[0], flavors[0], flavors[0]],
            tier4: [flavors[0], flavors[0], flavors[0], flavors[0]],
        });
        setTierFlavorOverrides({
            tier2: [false, false],
            tier3: [false, false, false],
            tier4: [false, false, false, false],
        });
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
        const configuredPrice = basePrices.find((item) =>
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
        return DEFAULT_ADDON_PRICES[key] ?? 0;
    };

    const calculatePrice = () => {
        let addonsPrice = 0;
        if (candle) addonsPrice += getAddonPrice("candle");
        if (chocolate) addonsPrice += getAddonPrice("chocolate");
        if (balls) addonsPrice += getAddonPrice("balls");
        if (nuts) addonsPrice += getAddonPrice("nuts");
        if (cherry) addonsPrice += getAddonPrice("cherry") * cherryLayouts.length;
        if (sprinkles) addonsPrice += getAddonPrice("sprinkles");

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
        setFlavor(randomFlavor);
        setCandleNumber(Math.floor(Math.random() * 100) + 1);
        setCandleMode(Math.random() < 0.5 ? "gold" : "number");
        setTierFlavors({
            tier2: Array.from({ length: 2 }, () => flavors[Math.floor(Math.random() * flavors.length)]),
            tier3: Array.from({ length: 3 }, () => flavors[Math.floor(Math.random() * flavors.length)]),
            tier4: Array.from({ length: 4 }, () => flavors[Math.floor(Math.random() * flavors.length)]),
        });

        setCandle(false);
        setChocolate(false);
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
                setToppingSize,
                tierFlavors,
                setTierLayerFlavor,
                tierFlavorLabels,
                inscriptionText,
                setInscriptionText,
                textFont,
                setTextFont,
                inscriptionColor,
                setInscriptionColor,
            }}
        >
            {props.children}
        </CustomizationContext.Provider>
    );
};

export const useCustomization = () => useContext(CustomizationContext);