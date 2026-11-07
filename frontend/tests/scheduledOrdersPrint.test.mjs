import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getOrderStatusLabel } from "../src/utils/orderStatus.js";

const source = readFileSync(new URL("../src/components/admin/ScheduledOrdersPrint.jsx", import.meta.url), "utf8");
const { code } = await transformWithOxc(source.replace(/^import[\s\S]*?;\r?$/gm, "").replace(/^export (?:default )?/gm, ""), "ScheduledOrdersPrint.jsx", { jsx: { runtime: "classic" } });
const brand = { name: "Configured Bakery", logo: "/logo.png", contact: "Configured contact" };
const generatedAt = new Date("2026-11-06T16:05:06Z");
const orders = [
    { id: 181, full_name: 'Customer <A> & "B"', delivery_date: "2026-11-09", delivery_time: "11:00:00", status: "processing" },
    { id: 174, full_name: "Another customer", delivery_date: "2026-11-07", delivery_time: "08:00:00", status: "awaiting_downpayment" },
];
const formatters = {
    formatTimeSlot: (time) => time ? `slot ${time}` : "Flexible Window",
    getStatusConfig: (status) => ({ label: status === "processing" ? "Processing" : "Awaiting Payment", style: "existing-status-colors" }),
    checkIsOverdue: (date) => date === "2026-11-07",
};

function harness() {
    const alerts = [], notices = [], frames = [], renders = [], events = {};
    let printCount = 0, unmountCount = 0, imageReady = false;
    const printDocument = {
        title: "", documentElement: {}, head: { appendChild() {} }, body: {},
        fonts: { ready: Promise.resolve() }, images: [{ decode: async () => { imageReady = true; } }],
    };
    const document = {
        documentElement: { lang: "en" },
        body: { appendChild: (frame) => frames.push(frame) },
        querySelectorAll: () => [],
        createElement: () => ({
            style: {}, setAttribute() {}, contentDocument: printDocument,
            contentWindow: { addEventListener: (type, handler) => { events[type] = handler; }, focus() {}, print() { assert(imageReady); printCount++; } },
            remove() { this.removed = true; },
        }),
    };
    const functions = runInNewContext(`${code}\n;({ snapshotScheduledOrders, ScheduledOrdersPrint, printScheduledOrders });`, {
        React, receiptBrand: brand, document, window: { alert: (message) => alerts.push(message) },
        createRoot: () => ({ render: (element) => renders.push(element), unmount: () => unmountCount++ }),
        flushSync: (fn) => fn(),
    });
    return { ...functions, alerts, notices, frames, renders, printDocument,
        showAlert: async (message, options) => { notices.push({ message, options }); },
        afterPrint: () => events.afterprint(), printCount: () => printCount, unmountCount: () => unmountCount };
}

test("snapshot keeps visible order order/values and uses the table's formatters and overdue rules", () => {
    const h = harness();
    const selected = structuredClone(orders);
    const rows = h.snapshotScheduledOrders(selected, formatters);
    assert.deepEqual(Array.from(rows, (row) => row.id), [181, 174]);
    assert.equal(rows[0].customer, orders[0].full_name);
    assert.equal(rows[0].deliveryDate, "2026-11-09");
    assert.equal(rows[0].timeSlot, "slot 11:00:00");
    assert.equal(rows[1].status, "Awaiting Payment");
    assert.equal(rows[1].statusClassName, "existing-status-colors");
    assert.equal(rows[1].overdue, true);
    selected[0].full_name = "Changed by polling";
    selected.reverse();
    assert.equal(rows[0].customer, orders[0].full_name);
    assert.equal(rows[0].id, 181);
});

test("bulk template contains each visible order once, configured branding, timestamp, count and escaped customer data", () => {
    const h = harness();
    const rows = h.snapshotScheduledOrders(orders, formatters);
    const html = renderToStaticMarkup(React.createElement(h.ScheduledOrdersPrint, { rows, generatedAt }));
    for (const content of ["Configured Bakery", "Configured contact", "All Scheduled Orders", "Export", "Customer name", "Order #",
        "Delivery date", "Time slot", "Status", "Overdue", "#181", "#174", "Awaiting Payment", "OVERDUE", "Total: 2 orders",
        "2026-11-06T16:05:06.000Z", "Nov 7, 2026", "Customer &lt;A&gt; &amp; &quot;B&quot;"]) {
        assert(html.includes(content), `Missing ${content}`);
    }
    assert.equal((html.match(/<tr>/g) || []).length, 3);
    assert(html.indexOf("#181") < html.indexOf("#174"));
    assert(!html.includes("INVOICE / RECEIPT"));
    assert(!html.includes("printable-invoice"));
    assert(!html.includes("Smiley Page Corner"));
});

test("empty export opens the existing info dialog without a native alert or print job", async () => {
    const h = harness();
    await h.printScheduledOrders({ orders: [], showAlert: h.showAlert, ...formatters });
    assert.equal(h.notices.length, 1);
    assert.equal(h.notices[0].message, "There are no orders matching the current view to export.\nAdjust your filters and try again.");
    assert.equal(h.notices[0].options.title, "No Orders to Export");
    assert.equal(h.notices[0].options.tone, "info");
    assert.equal(h.notices[0].options.confirmLabel, "Okay");
    assert.deepEqual(h.alerts, []);
    assert.equal(h.frames.length, 0);
    assert.equal(h.printCount(), 0);
});

test("print captures rows at click time, waits for the logo and cleans up after print or cancellation", async () => {
    const h = harness();
    const selected = structuredClone(orders);
    const pending = h.printScheduledOrders({ orders: selected, ...formatters });
    selected.reverse();
    selected[0].full_name = "Poll update";
    await pending;
    assert.equal(h.printCount(), 1);
    assert.equal(h.renders.length, 1);
    assert.deepEqual(Array.from(h.renders[0].props.rows, (row) => row.id), [181, 174]);
    assert.equal(h.renders[0].props.rows[1].customer, "Another customer");
    await h.printScheduledOrders({ orders, ...formatters });
    assert.equal(h.frames.length, 1, "Repeated clicks must not open duplicate print dialogs");
    h.afterPrint();
    assert.equal(h.frames[0].removed, true);
    assert.equal(h.unmountCount(), 1);
    await h.printScheduledOrders({ orders, ...formatters });
    assert.equal(h.printCount(), 2);
    h.afterPrint();
});

test("print asset failures clean up and allow retry", async () => {
    const h = harness();
    const readyImage = h.printDocument.images[0];
    h.printDocument.images = [{ decode: async () => { throw new Error("logo failed"); } }];
    await h.printScheduledOrders({ orders, ...formatters });
    assert.equal(h.printCount(), 0);
    assert.equal(h.frames[0].removed, true);
    assert.equal(h.alerts.length, 1);
    h.printDocument.images = [readyImage];
    await h.printScheduledOrders({ orders, ...formatters });
    assert.equal(h.frames.length, 2);
    assert.equal(h.printCount(), 1);
    h.afterPrint();
});

test("all dashboard views use printable PDF export for the same queue page and retain the existing button markup", () => {
    const dashboard = readFileSync(new URL("../src/pages/admin/AdminDashboard.jsx", import.meta.url), "utf8");
    assert.match(dashboard, /onClick=\{\(\) => printScheduledOrders\(\{\s+orders: processedQueueOrders\.slice\(0, perPage\),/);
    assert.match(dashboard, /orders: processedQueueOrders\.slice\(0, perPage\),\s+showAlert,/);
    assert.match(dashboard, /const \{ showAlert \} = useCustomerDialog\(\)/);
    assert(!dashboard.includes("handleExportCSV"));
    assert(!dashboard.includes("data:text/csv"));
    assert.match(dashboard, /<Download className="w-3\.5 h-3\.5" \/> Export/);
    assert.match(dashboard, /e\.stopPropagation\(\);\s+navigate\(`\/admin\/orders\/\$\{order\.id\}`\);/);
    const css = readFileSync(new URL("../src/styles/scheduled-orders-print.css", import.meta.url), "utf8");
    assert.match(css, /thead \{ display: table-header-group; \}/);
    assert.match(css, /break-inside: avoid/);
    assert(!css.includes("break-after: page"));
});

const ordersPageSource = readFileSync(new URL("../src/pages/admin/AdminOrdersPage.jsx", import.meta.url), "utf8");
const { code: ordersPageCode } = await transformWithOxc(ordersPageSource.replace(/^import[\s\S]*?;\r?$/gm, "")
    .replace(/^export (?:default )?/gm, "").replaceAll("import.meta.env.VITE_DJANGO_BASE_URL", '"http://backend.test"'), "AdminOrdersPage.jsx", { jsx: { runtime: "classic" } });
const treeNodes = (value) => Array.isArray(value) ? value.flatMap(treeNodes) : value && typeof value === "object" ? [value, ...treeNodes(value.props?.children)] : [];
const treeText = (value) => Array.isArray(value) ? value.map(treeText).join("") : value && typeof value === "object" ? treeText(value.props?.children) : value == null ? "" : String(value);

async function ordersPage(initialOrders) {
    let cursor = 0, mounted = false;
    const state = [], effects = [], exports = [];
    const icons = Object.fromEntries(ordersPageSource.match(/import\s*\{([^}]+)\}\s*from "lucide-react";/)[1]
        .split(",").map((name) => name.trim()).filter(Boolean).map((name) => [name, name]));
    const page = runInNewContext(`${ordersPageCode}\n;AdminOrdersPage;`, {
        React,
        ...icons, getOrderStatusLabel,
        useCustomerDialog: () => ({ showAlert() {} }),
        useNavigate: () => () => {}, useMemo: (calculate) => calculate(),
        useEffect: (effect) => { if (!mounted) effects.push(effect); },
        useState(initial) {
            const slot = cursor++;
            if (!(slot in state)) state[slot] = initial;
            return [state[slot], (next) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
        },
        authFetch: async (url) => ({ ok: true, json: async () => url.includes("/chat/") ? [{ order: 13, unread: 2 }] : initialOrders }),
        printScheduledOrders: (options) => exports.push(options),
        setInterval: () => 1, clearInterval() {},
    });
    const render = () => { cursor = 0; return page(); };
    render(); mounted = true; effects.forEach((effect) => effect());
    await new Promise((resolve) => setImmediate(resolve));
    const visibleIds = () => treeNodes(render()).filter((node) => node.type === "tr" && node.props.onClick)
        .map((node) => Number(treeText(treeNodes(node).find((child) => child.type === "span" && /^#\d+$/.test(treeText(child)))).slice(1)));
    return {
        render, visibleIds,
        click(label) {
            const target = treeNodes(render()).find((node) => node.type === "button" && (node.props["aria-label"] === label || treeText(node).includes(label)));
            assert(target, `Missing ${label} button`); target.props.onClick();
        },
        search(value) { treeNodes(render()).find((node) => node.type === "input" && node.props.placeholder?.startsWith("Search name")).props.onChange({ target: { value } }); },
        export() {
            const before = visibleIds();
            this.click("Export");
            const options = exports.at(-1);
            assert.deepEqual(Array.from(options.orders, (order) => order.id), before);
            assert.deepEqual(visibleIds(), before, "Export must not alter the displayed rows");
            return options;
        },
    };
}

test("customer-orders export uses exactly the current page after search, status, sort and unread filtering", async () => {
    const fixtures = Array.from({ length: 25 }, (_, index) => ({ id: index + 1, user_name: `customer ${index + 1}`,
        total_amount: (index + 1) * 100.25, status: index % 2 === 0 ? "processing" : "awaiting_downpayment" }));
    const page = await ordersPage(fixtures);
    assert.equal(page.export().orders.length, 10);
    page.click("Next Page");
    assert.deepEqual(Array.from(page.export().orders, (order) => order.id), [15, 14, 13, 12, 11, 10, 9, 8, 7, 6]);
    page.search("customer 1");
    assert.equal(page.export().orders.length, 10);
    page.click("Filter"); page.click("Processing");
    assert.deepEqual(Array.from(page.export().orders, (order) => order.id), [19, 17, 15, 13, 11, 1]);
    page.click("⇅ Sort"); page.click("Amount (Low to High)");
    assert.deepEqual(Array.from(page.export().orders, (order) => order.id), [1, 11, 13, 15, 17, 19]);
    page.click("Unread Chats");
    assert.deepEqual(Array.from(page.export().orders, (order) => order.id), [13]);
    page.search("no matching customer");
    assert.equal(page.export().orders.length, 0);
});

test("customer-orders export reuses the shared template with its own title, real amounts, contact and payment columns", async () => {
    const page = await ordersPage([{ id: 42, user_name: "customer42", formatted_phone: "0912-345-6789", full_address: "Test delivery address",
        total_amount: "1250.50", status: "processing", payment_status: "partial" }]);
    const options = page.export();
    assert.equal(typeof options.showAlert, "function");
    assert.equal(options.title, "All Customer Orders — Export");
    const h = harness();
    const rows = options.orders.map(options.mapOrder);
    const html = renderToStaticMarkup(React.createElement(h.ScheduledOrdersPrint, { ...options, rows, generatedAt }));
    for (const content of ["All Customer Orders — Export", "Configured Bakery", "customer42", "0912-345-6789", "Test delivery address",
        "Total amount", "₱1,250.50", "Processing", "Payment", "partial", "Total: 1 order", "width:30%"])
        assert(html.includes(content), `Missing ${content}`);
    assert(!html.includes("Delivery date"));
    assert(!html.includes("Dispatch Queue"));
    assert.equal((html.match(/<tr>/g) || []).length, 2);
    await h.printScheduledOrders(options);
    assert.equal(h.printDocument.title, options.title);
    assert.equal(h.renders[0].props.columns, options.columns);
    assert.equal(h.renders[0].props.rows[0].amount, "₱1,250.50");
    h.afterPrint();
    assert.match(ordersPageSource, /<Download aria-hidden="true" className="w-3\.5 h-3\.5" \/> Export/);
    assert(!ordersPageSource.includes("data:text/csv"));
});
