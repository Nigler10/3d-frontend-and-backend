export const MAX_CHOCOLATE_COUNT = 3;
export const DEFAULT_CHOCOLATE_LAYOUT = { x: 50, y: 50, size: "small" };

export function normalizeChocolateCount(value) {
    const count = Number(value);
    return Number.isFinite(count) ? Math.max(1, Math.min(MAX_CHOCOLATE_COUNT, Math.floor(count))) : 1;
}

export function hydrateChocolateLayouts(savedLayout) {
    const layouts = Array.isArray(savedLayout) ? savedLayout : savedLayout ? [savedLayout] : [];
    return (layouts.length ? layouts.slice(0, MAX_CHOCOLATE_COUNT) : [DEFAULT_CHOCOLATE_LAYOUT])
        .map((layout) => ({ ...DEFAULT_CHOCOLATE_LAYOUT, ...layout }));
}

export function resizeChocolateLayouts(layouts, count) {
    return Array.from({ length: normalizeChocolateCount(count) }, (_, index) => (
        layouts[index] || {
            ...DEFAULT_CHOCOLATE_LAYOUT,
            x: 35 + ((index * 17) % 35),
            y: 35 + ((index * 23) % 30),
        }
    ));
}
