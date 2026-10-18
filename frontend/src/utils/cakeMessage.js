export const MAX_CAKE_MESSAGE_LENGTH = 48;

export function normalizeCakeMessage(text) {
    if (typeof text !== "string") return "";
    return text.replace(/\s+/g, " ").trim().slice(0, MAX_CAKE_MESSAGE_LENGTH).trimEnd();
}
