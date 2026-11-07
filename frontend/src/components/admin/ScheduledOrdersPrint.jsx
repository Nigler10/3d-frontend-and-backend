import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { receiptBrand } from "../../config/receiptBrand";
import "../../styles/order-invoice.css";
import "../../styles/scheduled-orders-print.css";

// Capture already-filtered/sorted visible rows synchronously, before loading
// print assets. Dashboard polling must not change a document being exported.
export function snapshotScheduledOrders(orders, { formatTimeSlot, getStatusConfig, checkIsOverdue }) {
    return orders.map((order) => {
        const status = getStatusConfig(order.status);
        return {
            id: order.id,
            customer: order.full_name || "Customer",
            deliveryDate: order.delivery_date || "—",
            timeSlot: formatTimeSlot(order.delivery_time),
            status: status.label,
            statusClassName: status.style,
            overdue: checkIsOverdue(order.delivery_date, order.status),
        };
    });
}

const SCHEDULED_COLUMNS = [
    { key: "customer", label: "Customer name", className: "spc-order-invoice-item-name" },
    { key: "id", label: "Order #", render: (row) => `#${row.id}` },
    { key: "deliveryDate", label: "Delivery date" },
    { key: "timeSlot", label: "Time slot" },
    { key: "status", label: "Status", badgeClassKey: "statusClassName" },
    { key: "overdue", label: "Overdue", render: (row) => row.overdue ? <strong className="text-[#991B1B]">OVERDUE</strong> : "—" },
];

export function ScheduledOrdersPrint({ rows, generatedAt, brand = receiptBrand,
    title = "All Scheduled Orders & Live Dispatch Queue — Export", columns = SCHEDULED_COLUMNS,
    tableLabel = "Exported scheduled orders" }) {
    const timestamp = generatedAt.toLocaleString("en-PH", {
        timeZone: "Asia/Manila", year: "numeric", month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
    });

    return (
        <article className="spc-scheduled-orders-print">
            <header className="spc-order-invoice-brand">
                <img src={brand.logo} alt={`${brand.name} logo`} />
                <div>
                    <h2>{brand.name}</h2>
                    <h3>{title}</h3>
                    {brand.contact && <p className="spc-order-invoice-contact">{brand.contact}</p>}
                    <p className="spc-scheduled-orders-print-generated">Generated: <time dateTime={generatedAt.toISOString()}>{timestamp}</time></p>
                </div>
            </header>

            <div className="spc-scheduled-orders-print-table">
                <table aria-label={tableLabel}>
                    <colgroup>{columns.map((column) => <col key={column.key} style={column.width ? { width: column.width } : undefined} />)}</colgroup>
                    <thead>
                        <tr>
                            {columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => (
                            <tr key={row.id}>
                                {columns.map((column) => <td key={column.key} className={column.className}>
                                    {column.render ? column.render(row) : column.badgeClassKey
                                        ? <span className={`inline-block rounded-full border px-2 py-1 text-[10px] font-bold uppercase ${row[column.badgeClassKey]}`}>{row[column.key]}</span>
                                        : row[column.key]}
                                </td>)}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <footer>Total: {rows.length} {rows.length === 1 ? "order" : "orders"}</footer>
        </article>
    );
}

let activeFrame = null;

export async function printScheduledOrders({ orders, formatTimeSlot, getStatusConfig, checkIsOverdue,
    title, columns, tableLabel, mapOrder, showAlert }) {
    if (activeFrame) return;
    if (!orders.length) {
        await showAlert("There are no orders matching the current view to export.\nAdjust your filters and try again.", {
            title: "No Orders to Export",
            tone: "info",
            confirmLabel: "Okay",
        });
        return;
    }
    const rows = mapOrder ? orders.map(mapOrder) : snapshotScheduledOrders(orders, { formatTimeSlot, getStatusConfig, checkIsOverdue });
    const generatedAt = new Date();
    const frame = document.createElement("iframe");
    activeFrame = frame;
    frame.title = title || "Scheduled orders PDF export";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    Object.assign(frame.style, { position: "fixed", left: "-10000px", top: "0", width: "1120px", height: "800px", border: "0" });
    let root;
    const cleanup = () => {
        root?.unmount();
        frame.remove();
        if (activeFrame === frame) activeFrame = null;
    };

    try {
        document.body.appendChild(frame);
        const printDocument = frame.contentDocument;
        const printWindow = frame.contentWindow;
        printDocument.title = title || "Scheduled orders export";
        printDocument.documentElement.lang = document.documentElement.lang || "en";

        // Reuse the live app's compiled fonts, receipt styles and status colors.
        // The iframe isolates this print job from the single-receipt print rules.
        const styleLoads = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((source) => {
            const clone = source.cloneNode(true);
            const loaded = clone.tagName === "LINK" ? new Promise((resolve, reject) => {
                clone.href = source.href;
                clone.onload = resolve;
                clone.onerror = () => reject(new Error("Unable to load export styles."));
            }) : Promise.resolve();
            printDocument.head.appendChild(clone);
            return loaded;
        });
        root = createRoot(printDocument.body);
        flushSync(() => root.render(<ScheduledOrdersPrint rows={rows} generatedAt={generatedAt} title={title} columns={columns} tableLabel={tableLabel} />));
        await Promise.all(styleLoads);
        await printDocument.fonts?.ready;
        await Promise.all([...printDocument.images].map((image) => image.decode()));
        printWindow.addEventListener("afterprint", cleanup, { once: true });
        printWindow.focus();
        printWindow.print();
    } catch {
        cleanup();
        window.alert("Unable to prepare the PDF export. Please try again.");
    }
}
