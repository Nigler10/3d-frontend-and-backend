import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";
import { getOrderStatusLabel } from "../src/utils/orderStatus.js";

const path = "../src/pages/customer/CustomerOrdersPage.jsx";
const source = readFileSync(new URL(path, import.meta.url), "utf8");
const icons = Object.fromEntries(source.match(/import\s*\{([^}]+)\}\s*from "lucide-react";/)[1].split(",").map((name) => name.trim()).filter(Boolean).map((name) => [name, name]));
const { code } = await transformWithOxc(source.replace(/^import[\s\S]*?;\r?$/gm, "").replace(/^export (?:default )?/gm, "").replaceAll("import.meta.env.VITE_DJANGO_BASE_URL", "undefined"), path, { jsx: { runtime: "classic" } });
const React = { Fragment: "fragment", createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) };
const flush = () => new Promise((resolve) => setImmediate(resolve));
const nodes = (value) => Array.isArray(value) ? value.flatMap(nodes) : value && typeof value === "object" ? [value, ...nodes(value.props?.children)] : [];
const text = (value) => Array.isArray(value) ? value.map(text).join("") : value && typeof value === "object" ? text(value.props?.children) : value == null ? "" : String(value);

const tabStatuses = {
    awaiting: ["pending_review", "awaiting_customer_response"],
    awaiting_downpayment: ["awaiting_downpayment"],
    to_receive: ["processing"],
    completed: ["delivered", "completed"],
    cancelled: ["cancelled", "rejected"],
};

const orderListResponse = (orders) => ({
    orders,
    counts: {
        all: orders.length,
        ...Object.fromEntries(Object.entries(tabStatuses).map(([tab, statuses]) => [
            tab, orders.filter((order) => statuses.includes(order.status)).length,
        ])),
    },
});

async function customerPage(initialOrders) {
    let orders = initialOrders;
    let cursor = 0;
    let mounted = false;
    const state = [];
    const effects = [];
    const polls = [];
    const page = runInNewContext(`${code}\n;({ CustomerOrdersPage, ActiveOrderCard, PastOrderCard });`, {
        React, ...icons, getOrderStatusLabel,
        CustomCakeModal: "CustomCakeModal",
        useNavigate: () => () => {},
        useMemo: (calculate) => calculate(),
        useEffect: (effect) => { if (!mounted) effects.push(effect); },
        useState(initial) {
            const slot = cursor++;
            if (!(slot in state)) state[slot] = typeof initial === "function" ? initial() : initial;
            return [state[slot], (next) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
        },
        authFetch: async (url) => ({ ok: true, json: async () => url.endsWith("/customer/orders/?status=all") ? orderListResponse(orders) : [] }),
        window: { setInterval: (poll) => { polls.push(poll); return polls.length; }, clearInterval() {}, addEventListener() {}, removeEventListener() {} },
    });
    const render = () => { cursor = 0; return page.CustomerOrdersPage(); };
    render();
    mounted = true;
    effects.forEach((effect) => effect());
    await flush();
    const buttons = () => nodes(render()).filter((node) => node.type === "button");
    const button = (prefix) => buttons().find((node) => text(node).startsWith(prefix));
    return {
        render, button, buttons,
        select(prefix) { const target = button(prefix); assert(target, `Missing ${prefix} tab`); target.props.onClick(); },
        cards: () => nodes(render()).filter((node) => [page.ActiveOrderCard, page.PastOrderCard].includes(node.type)).map((node) => node.props.order),
        card: (order) => page.ActiveOrderCard({ order, unreadCount: 0 }),
        async refresh(nextOrders) { orders = nextOrders; polls.forEach((poll) => poll()); await flush(); },
    };
}

test("To Pay appears between review and receive and only shows orders awaiting downpayment", async () => {
    const orders = [
        "awaiting_downpayment", "pending_review", "processing", "awaiting_downpayment", "delivered", "cancelled",
    ].map((status, index) => ({ id: index + 1, status, items: [] }));
    const page = await customerPage(orders);
    const tabs = ["All Orders (6)", "Awaiting Review & Quote (1)", "To Pay (2)", "To Receive (1)", "Past Completed (1)", "Cancelled (1)"];
    assert.deepEqual(page.buttons().map(text).filter((label) => tabs.includes(label)), tabs);
    assert.equal(page.button("To Pay (").props.className, page.button("To Receive (").props.className);
    assert.deepEqual(page.cards().map((order) => order.id), [1, 2, 3, 4]);

    const activeClass = page.button("All Orders (").props.className;
    page.select("To Pay (");
    assert.equal(page.button("To Pay (").props.className, activeClass);
    assert.deepEqual(page.cards().map((order) => order.id), [1, 4]);

    for (const [tab, id] of [["Awaiting Review & Quote", 2], ["To Receive", 3], ["Past Completed", 5], ["Cancelled", 6]]) {
        page.select(`${tab} (`);
        assert.deepEqual(page.cards().map((order) => order.id), [id]);
    }

    page.select("To Pay (");
    await page.refresh(orders.map((order) => order.id === 1 ? { ...order, status: "processing" } : order));
    assert.equal(text(page.button("To Pay (")), "To Pay (1)");
    assert.equal(text(page.button("All Orders (")), "All Orders (6)");
    assert.deepEqual(page.cards().map((order) => order.id), [4]);
});

test("Cancelled tab counts and displays both cancelled and rejected orders with their original status labels", async () => {
    const orders = ["pending_review", "cancelled", "rejected", "processing", "delivered"].map((status, index) => ({ id: index + 1, status, items: [] }));
    const page = await customerPage(orders);
    assert.equal(text(page.button("Cancelled (")), "Cancelled (2)");
    assert.deepEqual(page.cards().map((order) => order.id), [1, 2, 3, 4]);
    page.select("Cancelled (");
    assert.deepEqual(page.cards().map((order) => order.id), [2, 3]);
    const rejected = page.card(orders[2]);
    assert(text(rejected).includes("Rejected"));
    assert(nodes(rejected).some((node) => node.props.className?.includes("bg-rose-50")));
    page.select("Awaiting Review & Quote (");
    assert.deepEqual(page.cards().map((order) => order.id), [1]);
});

test("a pending-review order remains visible in Cancelled after a refreshed admin cancellation or rejection", async () => {
    for (const status of ["cancelled", "rejected"]) {
        const order = { id: 15, status: "pending_review", items: [] };
        const page = await customerPage([order]);
        page.select("Awaiting Review & Quote (");
        assert.deepEqual(page.cards().map((item) => item.id), [15]);
        await page.refresh([{ ...order, status }]);
        assert.equal(page.cards().length, 0);
        assert.equal(text(page.button("Cancelled (")), "Cancelled (1)");
        page.select("Cancelled (");
        assert.deepEqual(page.cards().map((item) => [item.id, item.status]), [[15, status]]);
        page.select("All Orders (");
        assert.deepEqual(page.cards().map((item) => [item.id, item.status]), [[15, status]]);
    }
});
