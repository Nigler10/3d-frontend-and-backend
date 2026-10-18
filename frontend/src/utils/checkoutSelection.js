export function getCheckoutSelection(searchParams, state) {
    const single = searchParams.has("cart_item_id") || state?.directBuyItem != null;
    if (!single) return { cartItemId: null, error: null };
    const raw = searchParams.has("cart_item_id") ? searchParams.get("cart_item_id") : state.directBuyItem.id;
    const cartItemId = Number(raw);
    if (!/^[1-9]\d*$/.test(String(raw)) || !Number.isSafeInteger(cartItemId)) {
        return { cartItemId: null, error: "This cake selection is invalid. Please return to your cart and select the cake again." };
    }
    return { cartItemId, error: null };
}
