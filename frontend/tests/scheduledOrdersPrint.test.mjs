import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { transformWithOxc } from "vite";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
    const alerts = [], frames = [], renders = [], events = {};
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
    return { ...functions, alerts, frames, renders, printDocument,
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

test("empty table shows a message and does not create a print job", async () => {
    const h = harness();
    await h.printScheduledOrders({ orders: [], ...formatters });
    assert.deepEqual(h.alerts, ["No orders available to export."]);
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
    assert(!dashboard.includes("handleExportCSV"));
    assert(!dashboard.includes("data:text/csv"));
    assert.match(dashboard, /<Download className="w-3\.5 h-3\.5" \/> Export/);
    assert.match(dashboard, /e\.stopPropagation\(\);\s+navigate\(`\/admin\/orders\/\$\{order\.id\}`\);/);
    const css = readFileSync(new URL("../src/styles/scheduled-orders-print.css", import.meta.url), "utf8");
    assert.match(css, /thead \{ display: table-header-group; \}/);
    assert.match(css, /break-inside: avoid/);
    assert(!css.includes("break-after: page"));
});
