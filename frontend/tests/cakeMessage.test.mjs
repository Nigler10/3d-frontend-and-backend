import test from "node:test";
import assert from "node:assert/strict";
import { MAX_CAKE_MESSAGE_LENGTH, normalizeCakeMessage } from "../src/utils/cakeMessage.js";

test("long restored messages are capped to the text shown on the cake before submission", () => {
    const message = "Happy Birthday! ".repeat(20);
    const normalized = normalizeCakeMessage(message);
    assert.equal(normalized, message.slice(0, MAX_CAKE_MESSAGE_LENGTH).trimEnd());
    assert.ok(normalized.length <= MAX_CAKE_MESSAGE_LENGTH);
    assert.equal(normalizeCakeMessage(normalized), normalized);
});

test("messages above the old 30-character database limit remain intact up to the input limit", () => {
    for (const length of [30, 31, MAX_CAKE_MESSAGE_LENGTH]) {
        const message = "W".repeat(length);
        assert.equal(normalizeCakeMessage(message), message);
    }
    assert.equal(normalizeCakeMessage("W".repeat(81)), "W".repeat(MAX_CAKE_MESSAGE_LENGTH));
});

test("preview and cart messages have consistent whitespace without dropping words", () => {
    assert.equal(normalizeCakeMessage("  Happy\n\tBirthday   Ana!  "), "Happy Birthday Ana!");
    assert.equal(normalizeCakeMessage("A".repeat(47) + " B"), "A".repeat(47));
});

test("cakes without messages can still be added to the cart", () => {
    for (const value of [undefined, null, "", " \n\t "]) {
        assert.equal(normalizeCakeMessage(value), "");
    }
});
