export const MAX_CAKE_MESSAGE_LENGTH = 48;
export const DEFAULT_CAKE_MESSAGE_LAYOUT = { x: 50, y: 61, width: 80, curve: 0, textSize: 70 };

export function normalizeCakeMessageLayout(layout = {}) {
    const limit = (key, min, max) => {
        const value = Number(layout?.[key]);
        return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : DEFAULT_CAKE_MESSAGE_LAYOUT[key];
    };
    return { x: limit("x", 0, 100), y: limit("y", 0, 100), width: limit("width", 30, 100), curve: limit("curve", -100, 100), textSize: limit("textSize", 50, 200) };
}

export function normalizeCakeMessage(text) {
    if (typeof text !== "string") return "";
    return text.replace(/\s+/g, " ").trim().slice(0, MAX_CAKE_MESSAGE_LENGTH).trimEnd();
}

export function wrapCakeMessage(text, maxWidth, measure) {
    const lines = [];
    let line = "";
    for (const word of text.trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        // Keep an oversized word intact; the geometry fitter scales it to fit.
        if (line && measure(candidate) > maxWidth) {
            lines.push(line);
            line = word;
        } else line = candidate;
    }
    if (line) lines.push(line);
    return lines.join("\n");
}
