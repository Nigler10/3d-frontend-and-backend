import test from "node:test";
import assert from "node:assert/strict";
import { getCheckoutSelection } from "../src/utils/checkoutSelection.js";

test("whole-cart checkout is explicit when no individual cake was selected", () => {
    assert.deepEqual(getCheckoutSelection(new URLSearchParams(), null), { cartItemId: null, error: null });
});

test("single-cake selection survives a page reload through its URL and uses the cart line ID", () => {
    assert.deepEqual(getCheckoutSelection(new URLSearchParams("cart_item_id=42"), null), { cartItemId: 42, error: null });
    assert.equal(getCheckoutSelection(new URLSearchParams(), { directBuyItem: { id: 42, product_id: 9 } }).cartItemId, 42);
    assert.equal(getCheckoutSelection(new URLSearchParams("cart_item_id=42"), { directBuyItem: { id: 43 } }).cartItemId, 42);
});

test("invalid single-cake selections cannot fall back to ordering the entire cart", () => {
    for (const value of ["", "0", "-1", "1.2", "undefined", "9007199254740992"]) {
        const selection = getCheckoutSelection(new URLSearchParams({ cart_item_id: value }), null);
        assert.ok(selection.error);
        assert.equal(selection.cartItemId, null);
    }
    assert.ok(getCheckoutSelection(new URLSearchParams(), { directBuyItem: {} }).error);
});
