import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, LayoutGrid, List, Package, X } from "lucide-react";
import { authFetch } from "../../utils/auth";
import { getOrderStatusLabel } from "../../utils/orderStatus";
import AdminDeliveryChangeRequests from "./AdminDeliveryChangeRequests";
import { calendarDays, dateFromKey, deliveryToday, deliveryWindow, moveMonth } from "./scheduleCalendar";

const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
const FILTERS = [["all", "All"], ["pending", "Pending"], ["processing", "Processing"], ["out_for_delivery", "Out for Delivery"]];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SECONDARY_BUTTON = "inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#E6DBCB] bg-white px-3 py-2 text-xs font-semibold text-[#5C3D2E] transition hover:bg-[#F9F3EA] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#AD4313] disabled:cursor-not-allowed disabled:opacity-50";
const money = (amount) => `₱${Number(amount).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const longDate = (key) => dateFromKey(key).toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// Reuse the dashboard's existing status palette and label conventions.
function statusStyle(status) {
    switch (status) {
        case "pending_review":
        case "awaiting_customer_response": return "border-[#ECD9B4] bg-[#FFF7EA] text-[#C05A11]";
        case "awaiting_downpayment": return "border-[#FCD34D] bg-[#FFFBEB] text-[#D97706]";
        case "processing": return "border-[#BFDBFE] bg-[#EFF6FF] text-[#2563EB]";
        case "out_for_delivery": return "border-orange-200 bg-orange-100 text-orange-800";
        case "ready_for_delivery": return "border-[#BBF7D0] bg-[#EDFDF3] text-[#16A34A]";
        case "delivered":
        case "completed": return "border-[#A7F3D0] bg-[#E6F4EA] text-[#137333]";
        case "cancelled":
        case "rejected": return "border-[#FCA5A5] bg-[#FEE2E2] text-[#991B1B]";
        default: return "border-[#E6CCA2] bg-[#FDF6E2] text-[#6E473B]";
    }
}

function statusLabel(order) {
    return order.status === "awaiting_downpayment" ? "Awaiting Payment" : getOrderStatusLabel(order.status, true);
}

function useScheduleResource(endpoint, params, revision) {
    const query = new URLSearchParams(params).toString();
    const key = `${endpoint}?${query}`;
    const [state, setState] = useState({ key: "", data: null, loading: true, error: "" });
    useEffect(() => {
        const controller = new AbortController();
        setState((previous) => ({ key, data: previous.key === key ? previous.data : null, loading: true, error: "" }));
        (async () => {
            try {
                const response = await authFetch(`${BASEURL}/api/orders/admin/schedule/${key}`, {
                    signal: controller.signal, cache: "no-store",
                });
                if (!response.ok) throw new Error(response.status === 403 || response.status === 401
                    ? "Your admin session is unavailable. Please sign in again."
                    : "Unable to load scheduled orders. Please retry.");
                const data = await response.json();
                if (!controller.signal.aborted) setState({ key, data, loading: false, error: "" });
            } catch (error) {
                if (!controller.signal.aborted) setState((previous) => ({ ...previous, loading: false, error: error.message }));
            }
        })();
        return () => controller.abort();
    }, [key, revision]);
    return state.key === key ? state : { data: null, loading: true, error: "" };
}

function ScheduleDialog({ title, onClose, children }) {
    const dialogRef = useRef(null);
    useEffect(() => {
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        dialogRef.current.focus();
        const onKeyDown = (event) => {
            if (event.key === "Escape") onClose();
            if (event.key !== "Tab") return;
            const elements = [...dialogRef.current.querySelectorAll("button:not(:disabled), a[href], textarea, input")];
            const first = elements[0];
            const last = elements[elements.length - 1];
            if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
                event.preventDefault(); last?.focus();
            } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
                event.preventDefault(); first?.focus();
            }
        };
        document.addEventListener("keydown", onKeyDown);
        return () => {
            document.body.style.overflow = previousOverflow;
            document.removeEventListener("keydown", onKeyDown);
            previousFocus?.focus();
        };
    }, [onClose]);
    return createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
            <div ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-[#FFFDF9] p-4 text-[#3D251E] shadow-xl sm:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h3 className="text-lg font-black">{title}</h3>
                    <button type="button" onClick={onClose} className={SECONDARY_BUTTON} aria-label="Close dialog"><X className="h-4 w-4" /></button>
                </div>
                {children}
            </div>
        </div>, document.body,
    );
}

export default function AdminScheduledOrders({ viewMode, onViewChange, status, onStatusChange, renderQueue }) {
    const [selectedDate, setSelectedDate] = useState(deliveryToday);
    const month = selectedDate.slice(0, 7);
    const [revision, setRevision] = useState(0);
    const [rescheduleOrder, setRescheduleOrder] = useState(null);
    const today = deliveryToday();
    const days = calendarDays(month);
    const apiStatus = status === "overdue" ? "all" : status;
    const calendar = useScheduleResource("calendar/", { month, start_date: days[0].key, end_date: days[days.length - 1].key, status: apiStatus }, revision);
    const details = useScheduleResource("day/", { date: selectedDate, status: apiStatus }, revision);
    // The existing dashboard also exposes an overdue filter. Reuse its rules
    // locally while the read-only schedule endpoint supplies real status counts.
    const terminalStatuses = ["delivered", "completed", "cancelled", "rejected"];
    const counts = new Map(calendar.data?.days.map((day) => {
        if (status !== "overdue") return [day.date, day];
        const active = Object.entries(day.status_counts).filter(([value]) => !terminalStatuses.includes(value));
        const count = day.date < today ? active.reduce((sum, [, count]) => sum + count, 0) : 0;
        return [day.date, { ...day, count, dominant_status: active.sort((a, b) => b[1] - a[1])[0]?.[0], is_high_volume: count >= calendar.data.high_volume_threshold }];
    }) || []);
    const orders = (details.data?.orders || []).filter((order) => status !== "overdue" || (
        order.delivery_date < today && !terminalStatuses.includes(order.status)
    )).map((order) => ({ ...order, full_name: order.customer_name }));
    const activeViewLabel = viewMode === "calendar" ? "Calendar Schedule View" : viewMode === "table" ? "Table / Queue View" : "Card View";
    const refresh = () => setRevision((value) => value + 1);
    const closeReschedule = useCallback(() => setRescheduleOrder(null), []);

    useEffect(() => {
        const update = () => { if (!document.hidden) setRevision((value) => value + 1); };
        const interval = window.setInterval(update, 30000);
        window.addEventListener("focus", update);
        window.addEventListener("order:status", update);
        document.addEventListener("visibilitychange", update);
        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", update);
            window.removeEventListener("order:status", update);
            document.removeEventListener("visibilitychange", update);
        };
    }, []);

    const selectDay = (day) => {
        setSelectedDate(day);
    };

    return (
        <section id="order-queue-section" aria-labelledby="scheduled-orders-heading" className="min-w-0 overflow-hidden rounded-2xl border border-[#E6DBCB] bg-white shadow-xs">
            <header className="flex flex-col justify-between gap-4 border-b border-[#E6DBCB]/50 bg-[#FFFDF9] p-4 sm:p-5 lg:flex-row lg:items-center">
                <div className="flex min-w-0 items-start gap-3">
                    <div className="shrink-0 rounded-lg bg-[#FDF0EB] p-2 text-[#AD4313]"><Package className="h-4 w-4" aria-hidden="true" /></div>
                    <div>
                        <h2 id="scheduled-orders-heading" className="text-lg font-black">All Scheduled Orders &amp; Live Dispatch Queue</h2>
                        <p className="mt-1 text-xs text-[#8C6D58]">Manage delivery slots, track preparation progress, or inspect daily calendar schedules.</p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1 rounded-xl border border-[#E6DBCB]/60 bg-[#F9F3EA] p-1" role="group" aria-label="Schedule view">
                    {[["calendar", "Calendar Schedule View", CalendarDays], ["table", "Table / Queue View", List], ["cards", "Card View", LayoutGrid]].map(([value, label, Icon]) => (
                        <button key={value} type="button" aria-pressed={viewMode === value} aria-controls="scheduled-orders-content" onClick={() => onViewChange(value)}
                            className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#AD4313] ${viewMode === value ? "bg-[#AD4313] text-white" : "text-[#5C3D2E] hover:bg-white"}`}>
                            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {label}
                        </button>
                    ))}
                </div>
            </header>

            <div className="space-y-4 p-4 sm:p-5">
                {viewMode === "calendar" && <>
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E6DBCB] bg-[#FFFDF9] p-3">
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex gap-1">
                            <button type="button" aria-label="Previous month" className={SECONDARY_BUTTON} onClick={() => selectDay((current) => moveMonth(current, -1))}><ChevronLeft className="h-3 w-3" aria-hidden="true" /> Prev</button>
                            <button type="button" className={`${SECONDARY_BUTTON} text-[#AD4313]`} onClick={() => selectDay(deliveryToday())}>Today</button>
                            <button type="button" aria-label="Next month" className={SECONDARY_BUTTON} onClick={() => selectDay((current) => moveMonth(current, 1))}>Next <ChevronRight className="h-3 w-3" aria-hidden="true" /></button>
                        </div>
                        <h3 className="text-sm font-black text-[#3D251E]">{dateFromKey(`${month}-01`).toLocaleDateString("en-PH", { month: "long", year: "numeric" })}</h3>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filter scheduled orders by status">
                        <span className="mr-1 text-xs text-[#8C6D58]">Filter:</span>
                        {FILTERS.map(([value, label]) => (
                            <button key={value} type="button" aria-pressed={status === value} onClick={() => onStatusChange(value)} title={value === "pending" ? "Pending review, awaiting payment, and awaiting customer response" : undefined}
                                className={`rounded-full border px-3 py-1.5 text-[11px] font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#AD4313] ${status === value ? "border-[#AD4313] bg-[#AD4313] text-white" : "border-[#E6DBCB] bg-white text-[#5C3D2E] hover:bg-[#F9F3EA]"}`}>
                                {label} ({calendar.data ? calendar.data.counts[value] : "…"})
                            </button>
                        ))}
                        {!FILTERS.some(([value]) => value === status) && <button type="button" className="inline-flex items-center gap-1 rounded-full border border-[#E6CCA2] bg-[#FDF6E2] px-3 py-1.5 text-[11px] font-semibold text-[#AD4313]" onClick={() => onStatusChange("all")}>{status === "overdue" ? "Overdue Orders" : getOrderStatusLabel(status, true)} <X className="h-3 w-3" aria-hidden="true" /><span className="sr-only">Clear status filter</span></button>}
                    </div>
                </div>

                {(calendar.error || details.error) && <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#FCA5A5] bg-[#FEF2F2] p-3 text-xs text-[#991B1B]"><p>{calendar.error || details.error} {(calendar.data || details.data) && "Previously loaded information may be outdated."}</p><button type="button" className={SECONDARY_BUTTON} onClick={refresh}>Retry</button></div>}

                </>}

                <div id="scheduled-orders-content" role="region" aria-label={activeViewLabel}>
                {viewMode === "calendar" ? (
                <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-7">
                    <div className="min-h-96 min-w-0 overflow-hidden rounded-xl border border-[#E6DBCB] lg:col-span-4" aria-busy={calendar.loading}>
                        <div className="grid grid-cols-7 border-b border-[#E6DBCB] bg-[#F9F3EA]">
                            {WEEKDAYS.map((day) => <div key={day} className="py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-[#8C6D58]">{day}</div>)}
                        </div>
                        <div className="grid grid-cols-7">
                            {days.map((day) => {
                                const summary = counts.get(day.key);
                                const selected = day.key === selectedDate;
                                const count = summary?.count || 0;
                                const description = calendar.error ? "counts unavailable" : calendar.data ? `${count} orders` : "loading orders";
                                return (
                                    <button key={day.key} type="button" aria-pressed={selected} aria-current={day.key === today ? "date" : undefined}
                                        aria-label={`${longDate(day.key)}, ${description}`} onClick={() => selectDay(day.key)}
                                        className={`relative flex h-16 min-w-0 flex-col gap-0.5 border-b border-r border-[#E6DBCB]/50 p-1.5 text-left transition [&:nth-child(7n)]:border-r-0 hover:bg-[#FCF8EE] focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#AD4313] ${selected ? "z-10 rounded-lg bg-[#FFF7EA] ring-2 ring-inset ring-[#AD4313]" : day.inMonth ? "bg-white" : "bg-stone-50"}`}>
                                        <span className={`text-[11px] leading-tight ${selected ? "font-black text-[#AD4313]" : day.inMonth ? "font-semibold text-[#3D251E]" : "text-stone-400"}`}>{day.day}</span>
                                        {count > 0 && <span title={`${count} orders · ${getOrderStatusLabel(summary.dominant_status, true)}`} className={`w-full break-words rounded px-1 py-0.5 text-[9px] leading-tight sm:text-[10px] ${selected && summary.is_high_volume ? "bg-[#AD4313] font-bold text-white" : statusStyle(summary.dominant_status)}`}>{count} <span className="hidden sm:inline">{selected && summary.is_high_volume ? "Deliveries" : count === 1 ? "Order" : "Orders"}</span><span className="sr-only sm:hidden">Orders</span></span>}
                                        {selected && summary?.is_high_volume && <span title={`Above the month's average daily load (at least ${calendar.data.high_volume_threshold} orders)`} className="hidden text-[9px] font-semibold text-[#AD4313] sm:block">Active Focus</span>}
                                        {(selected || day.key === today) && <span className="absolute right-1.5 top-2 h-1.5 w-1.5 rounded-full bg-[#AD4313]" aria-hidden="true" />}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="sr-only" role="status">{calendar.loading ? "Updating schedule…" : "Delivery times in Philippine time"}</p>
                    </div>

                    <aside aria-label="Selected date details" aria-busy={details.loading} className="flex min-w-0 flex-col rounded-xl border border-[#E6DBCB] p-4 lg:col-span-3">
                        <div className="flex items-center justify-between gap-3 border-b border-[#E6DBCB]/50 pb-4">
                            <div><p className="text-[10px] font-bold uppercase tracking-wider text-[#AD4313]">Selected Date Details</p><h3 className="mt-1 text-sm font-black">{longDate(selectedDate)}</h3></div>
                            <span className="shrink-0 rounded-lg bg-[#FDF0EB] px-2 py-1 text-xs font-black text-[#AD4313]">{details.data ? `${details.data.day_total_count} Orders` : "…"}</span>
                        </div>
                        <div className={status === "all" ? "sr-only" : "py-2 text-[10px] text-[#8C6D58]"} aria-live="polite">{details.loading ? "Updating orders…" : details.data ? `Showing ${orders.length} of ${details.data.day_total_count} orders${status !== "all" ? ` · ${FILTERS.find(([value]) => value === status)?.[1] || getOrderStatusLabel(status, true)}` : ""}` : "Orders unavailable"}</div>
                        <div className="max-h-96 min-h-64 flex-1 space-y-3 overflow-y-auto py-3 pr-1" tabIndex={0} aria-label="Orders for selected date">
                            {!details.data && details.loading && <p role="status" className="py-12 text-center text-xs text-[#8C6D58]">Loading scheduled orders…</p>}
                            {details.data && orders.length === 0 && <div className="flex flex-col items-center gap-2 py-12 text-center text-xs text-[#8C6D58]"><CalendarDays className="h-7 w-7 opacity-50" aria-hidden="true" /><p>{status === "all" ? "No orders scheduled for this day." : "No orders match this status for the selected day."}</p></div>}
                            {orders.map((order) => (
                                <article key={order.id} className="space-y-2 rounded-xl border border-[#E6DBCB]/70 bg-[#FFFDF9] p-3">
                                    <div className="flex flex-wrap items-start justify-between gap-2"><h4 className="break-words text-xs font-bold">{order.customer_name || "Name not provided"} <span className="font-semibold">(Order #{order.id})</span></h4><span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold uppercase ${statusStyle(order.status)}`}>{statusLabel(order)}</span></div>
                                    <div className="flex flex-wrap justify-between gap-2 text-[11px]"><p className="flex items-center gap-1 text-[#8C6D58]"><Clock className="h-3 w-3 shrink-0 text-[#AD4313]" aria-hidden="true" />{deliveryWindow(order.delivery_time)}</p><ul className="space-y-1 text-[#5C3D2E]">{order.items.map((item) => <li key={item.id}>{item.product_name} × {item.quantity}</li>)}</ul></div>
                                    <div className="flex flex-wrap items-center justify-end gap-3 border-t border-[#E6DBCB]/30 pt-2 text-[11px]"><Link to={`/admin/orders/${order.id}`} className="font-semibold text-[#AD4313] hover:underline">View Details →</Link><button type="button" onClick={() => setRescheduleOrder(order)} className="rounded-lg bg-[#FDF0EB] px-2 py-1 font-semibold text-[#AD4313] hover:bg-[#F9F3EA]">Reschedule</button></div>
                                </article>
                            ))}
                        </div>
                        <footer className="mt-auto border-t border-[#E6DBCB]/50 pt-3" title="Total estimate for all orders on the selected day">
                            <p className="text-xs text-[#8C6D58]">Total Day Est: <span className="font-bold text-[#5C3D2E]">{details.data ? money(details.data.day_total_estimate) : "—"}</span></p>
                        </footer>
                    </aside>
                </div>
                ) : renderQueue()}
                </div>
            </div>

            {rescheduleOrder && <ScheduleDialog title={`Reschedule · Order #${rescheduleOrder.id}`} onClose={closeReschedule}>
                {rescheduleOrder.delivery_change_requests.some((request) => request.status === "pending")
                    ? <AdminDeliveryChangeRequests order={{ ...rescheduleOrder, delivery_change_requests: rescheduleOrder.delivery_change_requests.filter((request) => request.status === "pending") }} onUpdated={async () => { closeReschedule(); refresh(); }} />
                    : <div className="space-y-4 text-sm text-[#5C3D2E]"><p>No pending delivery-change request exists for this order. The existing reschedule flow starts when the customer submits a delivery-change request from their order page. Admins can then review and approve it here.</p><Link className="inline-block font-bold text-[#AD4313] hover:underline" to={`/admin/orders/${rescheduleOrder.id}`}>Open existing order details →</Link></div>}
            </ScheduleDialog>}
        </section>
    );
}
