import { normalizeCakeMessage } from "./cakeMessage.js";

export function createCakeCustomization(state, { tier, labels, previewImage }) {
    const layerFlavors = state.selectedTierFlavors.slice(0, labels.length);
    // Copy the complete design at submission time so later builder edits cannot
    // change the cart's saved cake or its per-layer material colors.
    return JSON.parse(JSON.stringify({
        shape: state.form === 1 ? "round" : "rectangle",
        cake_color: state.cakeColor.color,
        icing_color: state.icingColor.color,
        flavor: layerFlavors[0],
        tier: tier.tier,
        size: state.selectedSize,
        tier_flavors: Object.fromEntries(labels.map((label, index) => [label, layerFlavors[index]])),
        inscription_text: normalizeCakeMessage(state.inscriptionText),
        text_font: state.textFont,
        inscription_color: state.inscriptionColor,
        has_candle: state.candle,
        candle_number: state.candleNumber,
        candle_mode: state.candleMode,
        candle_color: state.candleColor,
        topping_layout: {
            ...state.toppingLayout,
            _preview: { version: 1, image: previewImage },
            _design: { version: 1, tier_flavor_overrides: state.selectedTierFlavorOverrides.slice(0, labels.length) },
            cherry: state.cherryLayouts,
            chocolate: state.chocolateLayouts,
            candle: { ...state.toppingLayout.candle, mode: state.candleMode, color: state.candleColor },
        },
        has_chocolate: state.chocolate,
        has_balls: state.balls,
        has_nuts: state.nuts,
        has_cherry: state.cherry,
        has_sprinkles: state.sprinkles,
    }));
}
