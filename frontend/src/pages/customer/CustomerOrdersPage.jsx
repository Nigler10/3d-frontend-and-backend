import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { authFetch } from "../../utils/auth";
import { getOrderStatusLabel } from "../../utils/orderStatus";
import { CustomCakeModal } from "../../components/admin/CustomCakeModal";
import { CustomizationProvider } from "../../contexts/Customization";
import {
    Cake,
    Heart,
    Eye,
    Camera,
    Pencil,
    FileText,
    X,
    Printer,
    RefreshCw,
    MessageSquare,
    Check,
} from "lucide-react";


const ACTIVE_STATUSES = new Set([
    "pending_review",
    "awaiting_customer_response",
    "awaiting_downpayment",
    "processing",
    "ready_for_delivery",
]);

const FINISHED_STATUSES = new Set(["delivered", "completed"]);
const CANCELLED_STATUSES = new Set(["cancelled"]);
const ORDERS_PER_PAGE = 4;

const formatDate = (value, fallback = "Date unavailable") => {
    if (!value) return fallback;
    return new Date(value).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
};

const formatTotal = (value) =>
    `₱${Number(value || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    })}`;

function OrderItemsList({ items = [], orderId, onItemClick }) {
    if (!items || items.length === 0) {
        return <p className="text-xs text-stone-500 italic">No items listed for this order</p>;
    }

    return (
        <div className="space-y-3">
            {items.map((item, idx) => {
                const cust = item.customization || {};
                const isCustom = !!item.customization;
                const has3DModel = isCustom && (cust.shape || cust.tiers || cust.flavor);
                const hasUploadedPhoto = isCustom && (cust.uploaded_cake || cust.reference_photo || (cust.images && cust.images.length > 0));

                return (
                    <div
                        key={item.id || idx}
                        onClick={() => onItemClick(item, orderId)}
                        className="group flex items-center justify-between gap-4 p-3.5 bg-white rounded-2xl border border-[#F3E5D0] hover:border-[#C05A11] hover:bg-[#FFFBF4] transition-all cursor-pointer shadow-xs hover:shadow-md"
                        title="Click to view 3D cake design or sample photo"
                    >
                        <div className="flex items-center gap-3.5 min-w-0">
                            {/* Thumbnail / Icon Container */}
                            <div className="w-12 h-12 rounded-xl bg-[#FAF5EB] border border-[#F3E5D0] group-hover:border-[#E6CCA2] group-hover:bg-[#FFF8EF] flex items-center justify-center shrink-0 transition-colors">
                                {cust.shape === "Round" || cust.shape === "round" ? (
                                    <Cake className="w-6 h-6 text-[#C05A11]" />
                                ) : cust.shape === "Heart" || cust.shape === "heart" ? (
                                    <Heart className="w-6 h-6 text-[#C05A11]" />
                                ) : (
                                    <Cake className="w-6 h-6 text-[#C05A11]" />
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h4 className="text-sm font-bold text-[#6E473B] group-hover:text-[#C05A11] transition-colors truncate">
                                        {item.product_name || `Custom ${cust.shape || "Cake"}`}
                                    </h4>
                                    {has3DModel && (
                                        <span className="shrink-0 text-[10px] font-extrabold bg-[#FEF3C7] text-[#B45309] px-2 py-0.5 rounded-full border border-[#FCD34D]/40 flex items-center gap-1">
                                            3D Design <Eye className="w-3 h-3" />
                                        </span>
                                    )}
                                    {hasUploadedPhoto && !has3DModel && (
                                        <span className="shrink-0 text-[10px] font-extrabold bg-[#E0F2FE] text-[#0369A1] px-2 py-0.5 rounded-full border border-[#7DD3FC]/40 flex items-center gap-1">
                                            Photo Sample <Camera className="w-3 h-3" />
                                        </span>
                                    )}
                                </div>

                                {/* Details & Tags matching Image 1 */}
                                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-600">
                                    {cust.shape && (
                                        <span className="bg-[#FAF5EB] px-2.5 py-0.5 rounded-lg text-[#844414] font-semibold border border-[#F3E5D0]">
                                            {cust.shape}
                                        </span>
                                    )}
                                    {cust.flavor && (
                                        <span className="bg-[#FAF5EB] px-2.5 py-0.5 rounded-lg font-semibold border border-[#F3E5D0]">
                                            Flavor: {cust.flavor}
                                        </span>
                                    )}
                                    {cust.size && (
                                        <span className="bg-[#FAF5EB] px-2.5 py-0.5 rounded-lg font-semibold border border-[#F3E5D0]">
                                            Size: {cust.size}
                                        </span>
                                    )}
                                    {cust.tier_count && (
                                        <span className="bg-[#FAF5EB] px-2.5 py-0.5 rounded-lg text-[#844414] font-semibold border border-[#F3E5D0]">
                                            {cust.tier_count}-Tier
                                        </span>
                                    )}
                                    {item.quantity > 1 && (
                                        <span className="bg-[#FEF3C7] px-2 py-0.5 rounded-md text-[#B45309] font-bold">
                                            Qty: {item.quantity}
                                        </span>
                                    )}
                                </div>

                                {/* Dedication Message tag */}
                                {(cust.message || cust.dedication) && (
                                    <div className="mt-1.5 inline-flex items-center gap-1 text-[11px] bg-[#FFF8EF] border border-[#FCD34D]/40 text-[#B45309] font-medium px-2.5 py-0.5 rounded-md">
                                        <Pencil className="w-3 h-3 text-[#B45309]" />
                                        <span>Dedication: "{cust.message || cust.dedication}"</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Right side Price & Click View Button */}
                        <div className="flex flex-col items-end shrink-0 pl-2">
                            <span className="text-sm sm:text-base font-black text-[#844414]">
                                {formatTotal(item.price || item.subtotal || 0)}
                            </span>
                            <span className="mt-1 text-[11px] font-bold text-[#C05A11] group-hover:underline flex items-center gap-1">
                                <span>View Cake</span> <span>→</span>
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function InvoiceModal({ order, onClose }) {
    if (!order) return null;

    const items = order.items || [];
    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="fixed inset-0 z-[250] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto" role="dialog">
            <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#E6CCA2] my-8">
                {/* Header */}
                <div className="flex items-center justify-between bg-[#6E473B] text-white px-6 py-4">
                    <div className="flex items-center gap-2">
                        <FileText className="w-6 h-6 text-[#E6CCA2]" />
                        <div>
                            <h3 className="font-black text-lg leading-tight">Cake Studio Invoice</h3>
                            <p className="text-xs text-[#E6CCA2]">Order #{order.id}</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-white hover:text-[#E6CCA2] transition-colors"
                        aria-label="Close invoice"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Invoice Content */}
                <div className="p-6 space-y-6 bg-[#FCF8EE]/30" id="printable-invoice">
                    {/* Billed To & Dates */}
                    <div className="grid grid-cols-2 gap-4 text-xs">
                        <div>
                            <p className="text-[#A07060] uppercase font-bold tracking-wider text-[10px]">Customer Details</p>
                            <p className="font-bold text-[#6E473B] mt-1 text-sm">{order.full_name || order.user_name || "Valued Customer"}</p>
                            <p className="text-stone-600">{order.customer_email}</p>
                            <p className="text-stone-600">{order.formatted_phone}</p>
                            <p className="text-stone-600 mt-1">{order.full_address}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[#A07060] uppercase font-bold tracking-wider text-[10px]">Order Summary</p>
                            <p className="font-bold text-[#6E473B] mt-1">Date: {formatDate(order.created_at)}</p>
                            <p className="text-stone-600">Status: <span className="font-bold text-[#C05A11]">{getOrderStatusLabel(order.status)}</span></p>
                            {order.delivery_date && (
                                <p className="text-stone-600">Delivery: {formatDate(order.delivery_date)} {order.delivery_time ? `@ ${order.delivery_time}` : ""}</p>
                            )}
                        </div>
                    </div>

                    {/* Items Table */}
                    <div className="border border-[#E6CCA2] rounded-xl overflow-hidden bg-white">
                        <table className="w-full text-xs">
                            <thead className="bg-[#FAF5EB] text-[#844414] font-bold border-b border-[#E6CCA2]">
                                <tr>
                                    <th className="text-left py-2.5 px-4">Item & Customizations</th>
                                    <th className="text-center py-2.5 px-2">Qty</th>
                                    <th className="text-right py-2.5 px-4">Amount</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-stone-100">
                                {items.map((item, idx) => (
                                    <tr key={idx} className="hover:bg-stone-50">
                                        <td className="py-3 px-4">
                                            <p className="font-bold text-[#6E473B]">{item.product_name || "Custom Cake"}</p>
                                            {item.customization && (
                                                <p className="text-[11px] text-stone-500 mt-0.5">
                                                    {item.customization.shape} • {item.customization.flavor} • {item.customization.size || "Standard"}
                                                </p>
                                            )}
                                        </td>
                                        <td className="text-center py-3 px-2 font-medium">{item.quantity}</td>
                                        <td className="text-right py-3 px-4 font-bold text-[#844414]">{formatTotal(item.price || item.subtotal)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Totals */}
                    <div className="flex justify-end">
                        <div className="w-full sm:w-64 space-y-2 text-xs bg-white p-4 rounded-xl border border-[#E6CCA2]">
                            <div className="flex justify-between text-stone-600">
                                <span>Subtotal</span>
                                <span>{formatTotal(order.total_amount)}</span>
                            </div>
                            <div className="flex justify-between text-stone-600">
                                <span>Total Paid</span>
                                <span className="font-semibold text-emerald-600">{formatTotal(order.total_paid)}</span>
                            </div>
                            <div className="flex justify-between font-black text-sm text-[#6E473B] pt-2 border-t border-stone-200">
                                <span>Remaining Balance</span>
                                <span className="text-[#C05A11]">{formatTotal(order.remaining_balance)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer Buttons */}
                <div className="flex items-center justify-between border-t border-stone-100 px-6 py-4 bg-stone-50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-xs font-bold text-stone-600 hover:text-stone-800 bg-white border border-stone-300 rounded-lg transition-colors"
                    >
                        Close
                    </button>
                    <button
                        type="button"
                        onClick={handlePrint}
                        className="px-5 py-2 text-xs font-bold text-white bg-[#C05A11] hover:bg-[#A84E0E] rounded-lg shadow transition-all flex items-center gap-1.5"
                    >
                        <Printer className="w-4 h-4" /> Print / Save PDF
                    </button>
                </div>
            </div>
        </div>
    );
}

function ReorderModal({ order, onClose, onReorder }) {
    if (!order) return null;

    const reorderItem = order.items?.find((item) => item.customization?.shape);
    const itemSummary = order.items?.map((item) => `${item.quantity}x ${item.product_name}`).join(", ");

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4" role="presentation">
            <div
                className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl border border-[#F3E5D0]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reorder-title"
            >
                <div className="flex items-start justify-between border-b border-stone-100 bg-[#FAF5EB] px-5 py-4">
                    <h2 id="reorder-title" className="text-sm font-black text-[#6E473B] flex items-center gap-2">
                        <RefreshCw className="w-4 h-4 text-[#C05A11]" /> Reorder this custom cake?
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-lg leading-none text-stone-400 hover:text-stone-700 transition-colors"
                        aria-label="Close reorder dialog"
                    >
                        ×
                    </button>
                </div>

                <div className="px-5 py-5 space-y-3">
                    <p className="text-xs leading-relaxed text-stone-600">
                        You can load the exact 3D design from your past order into the builder to customize flavors, messages, or order immediately.
                    </p>
                    <div className="rounded-xl bg-[#FFF8EF] border border-[#F3E5D0] px-4 py-3 text-xs text-stone-600">
                        <p className="font-bold text-[#844414]">Order #{order.id}</p>
                        <p className="mt-1 font-medium">{itemSummary || "No items listed"}</p>
                    </div>
                    {!reorderItem && (
                        <p className="text-xs font-semibold text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
                            Note: This order contains standard products or uploaded reference photos without a 3D model configuration.
                        </p>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t border-stone-100 px-5 py-3.5 bg-stone-50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onReorder(reorderItem)}
                        disabled={!reorderItem}
                        className="rounded-lg bg-[#C05A11] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#A84E0E] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Edit in 3D Builder & Reorder
                    </button>
                </div>
            </div>
        </div>
    );
}

function ActiveOrderCard({ order, unreadCount, onView, onInvoice, onItemClick }) {
    const statusLabel = getOrderStatusLabel(order.status);

    const getStatusBadgeStyle = (status) => {
        switch (status) {
            case "pending_review":
            case "awaiting_customer_response":
                return "bg-[#FEF3C7] text-[#B45309] border-[#FCD34D]";
            case "awaiting_downpayment":
            case "processing":
                return "bg-[#FFEDD5] text-[#C05A11] border-[#FDBA74]";
            case "ready_for_delivery":
                return "bg-[#DBEAFE] text-[#1D4ED8] border-[#93C5FD]";
            case "cancelled":
                return "bg-rose-50 text-rose-700 border-rose-200";
            default:
                return "bg-[#ECFDF5] text-[#047857] border-[#6EE7B7]";
        }
    };

    return (
        <article className="rounded-3xl border border-[#F3E5D0] bg-[#FFFDF9] p-5 sm:p-7 shadow-sm hover:shadow-md transition-all">
            {/* Card Top Metadata Bar */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between pb-4 border-b border-[#F3E5D0]">
                <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs font-black uppercase tracking-wider bg-[#FAF5EB] text-[#844414] px-3 py-1 rounded-lg border border-[#EFE3CF]">
                        Order #{order.id}
                    </span>
                    <span className="text-xs font-semibold text-stone-500">
                        Placed {formatDate(order.created_at)}
                    </span>
                </div>

                <div className="flex items-center gap-3">
                    <span className="text-xs text-stone-500 font-medium">TOTAL AMOUNT</span>
                    <span className="text-xl font-black text-[#844414]">{formatTotal(order.total_amount)}</span>
                    <span
                        className={`text-xs font-bold px-3 py-1 rounded-full border ${getStatusBadgeStyle(
                            order.status
                        )}`}
                    >
                        {statusLabel}
                    </span>
                </div>
            </div>

            <div className="pt-2">
                <div className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase tracking-wider text-[#A07060]">
                            Custom Crafted Items ({order.items?.length || 0} {order.items?.length === 1 ? "Cake" : "Items"})
                        </h3>
                        <span className="text-[11px] font-bold text-[#C05A11]">
                            Click item to view 3D cake design
                        </span>
                    </div>
                    <OrderItemsList items={order.items} orderId={order.id} onItemClick={onItemClick} />
                </div>
            </div>

            {/* Card Action Footer Bar */}
            <div className="mt-6 pt-4 border-t border-[#F3E5D0] flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => onView(order.id)}
                        className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold text-[#844414] bg-[#FAF5EB] hover:bg-[#F5E8D3] border border-[#EFE3CF] transition-colors flex items-center justify-center gap-1.5"
                    >
                        <MessageSquare className="w-3.5 h-3.5" /> Message Baker {unreadCount > 0 && <span className="bg-[#C05A11] text-white px-1.5 py-0.5 rounded-full text-[10px]">{unreadCount}</span>}
                    </button>

                    <button
                        onClick={() => onInvoice(order)}
                        className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold text-stone-600 bg-white hover:bg-stone-50 border border-stone-200 transition-colors flex items-center justify-center gap-1.5"
                    >
                        <FileText className="w-3.5 h-3.5" /> Invoice PDF
                    </button>
                </div>

                <button
                    onClick={() => onView(order.id)}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-[#C05A11] hover:bg-[#A84E0E] text-white font-bold text-xs shadow-md shadow-[#C05A11]/20 transition-all flex items-center justify-center gap-1.5"
                >
                    <span>View Order Details & 3D Mockup</span>
                    <span>→</span>
                </button>
            </div>
        </article>
    );
}

function PastOrderCard({ order, onReorder, onInvoice, onView, onItemClick }) {
    return (
        <article className="rounded-3xl border border-stone-200 bg-white p-5 sm:p-6 shadow-sm hover:shadow-md transition-shadow">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0 mt-0.5">
                        <Check className="w-5 h-5" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black uppercase text-stone-500">Order #{order.id}</span>
                            <span className="text-[11px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full">
                                Delivered
                            </span>
                        </div>
                        <h3 className="mt-1 text-base font-bold text-[#6E473B]">
                            {order.items?.map((item) => item.product_name).join(", ") || "Custom Cake Order"}
                        </h3>
                        <p className="mt-0.5 text-xs text-stone-500">
                            Placed {formatDate(order.created_at)} • Delivered {formatDate(order.delivery_date || order.created_at)}
                        </p>
                    </div>
                </div>

                <div className="flex flex-row sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-t-0 pt-3 sm:pt-0 border-stone-100">
                    <span className="text-xs text-stone-400 font-medium sm:hidden">Total Amount</span>
                    <span className="text-lg font-black text-[#844414]">{formatTotal(order.total_amount)}</span>
                </div>
            </div>

            {/* Clickable items list */}
            <div className="mt-4 pt-4 border-t border-stone-100 space-y-2">
                <OrderItemsList items={order.items} orderId={order.id} onItemClick={onItemClick} />
            </div>

            <div className="mt-4 pt-4 border-t border-stone-100 flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => onView(order.id)}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 transition-colors"
                    >
                        Write Pastry Review
                    </button>
                    <button
                        onClick={() => onInvoice(order)}
                        className="flex-1 sm:flex-initial px-3 py-1.5 rounded-lg text-xs font-semibold text-stone-600 border border-stone-200 hover:bg-stone-50 transition-colors flex items-center gap-1"
                    >
                        <FileText className="w-3.5 h-3.5" /> Invoice
                    </button>
                </div>

                <button
                    onClick={() => onReorder(order)}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-[#D97706] hover:bg-[#B45309] text-white text-xs font-bold transition-colors shadow-sm flex items-center justify-center gap-1.5"
                >
                    <RefreshCw className="w-3.5 h-3.5" /> Reorder Same Cake
                </button>
            </div>
        </article>
    );
}

function OrderPagination({ page, totalItems, onPageChange }) {
    const totalPages = Math.ceil(totalItems / ORDERS_PER_PAGE);
    if (totalPages <= 1) return null;

    return (
        <div className="mt-6 flex items-center justify-center gap-3">
            <button
                type="button"
                onClick={() => onPageChange(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-xl bg-[#FAF5EB] px-4 py-2 text-xs font-bold text-[#6E473B] border border-[#F3E5D0] transition-colors hover:bg-[#F5E8D3] disabled:cursor-not-allowed disabled:opacity-40"
            >
                ← Back
            </button>
            <span className="text-xs font-black text-[#844414] px-3">
                Page {page} of {totalPages}
            </span>
            <button
                type="button"
                onClick={() => onPageChange(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
                className="rounded-xl bg-[#C05A11] px-4 py-2 text-xs font-bold text-white shadow transition-colors hover:bg-[#A84E0E] disabled:cursor-not-allowed disabled:opacity-40"
            >
                Next →
            </button>
        </div>
    );
}

export default function CustomerOrdersPage() {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();
    const [orders, setOrders] = useState([]);
    const [unreadOrders, setUnreadOrders] = useState({});
    const [reorderOrder, setReorderOrder] = useState(null);
    const [invoiceOrder, setInvoiceOrder] = useState(null);

    // Cake 3D / Sample Photo Modal State
    const [selectedCakeCustomization, setSelectedCakeCustomization] = useState(null);
    const [selectedCakeOrderId, setSelectedCakeOrderId] = useState(null);
    const [showCakeModal, setShowCakeModal] = useState(false);

    const [activeTab, setActiveTab] = useState("all");
    const [activePage, setActivePage] = useState(1);
    const [pastPage, setPastPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchUnreadOrders = async () => {
        try {
            const res = await authFetch(`${BASEURL}/api/chat/unread/orders/`);
            if (!res.ok) return;
            const data = await res.json();
            const map = {};
            data.forEach((item) => {
                map[item.order] = item.unread;
            });
            setUnreadOrders(map);
        } catch (err) {
            console.error(err);
        }
    };

    const fetchOrders = async () => {
        try {
            const res = await authFetch(`${BASEURL}/api/orders/customer/orders/`);
            if (!res.ok) throw new Error("Failed to fetch customer orders");
            const data = await res.json();
            setOrders(data);
            setError(null);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        fetchOrders();
        fetchUnreadOrders();

        const interval = window.setInterval(fetchOrders, 30000);
        const handleFocus = () => fetchOrders();
        window.addEventListener("focus", handleFocus);

        return () => {
            window.clearInterval(interval);
            window.removeEventListener("focus", handleFocus);
        };
    }, []);

    useEffect(() => {
        const handleScroll = () => {
            const scrollPosition = window.scrollY || document.documentElement.scrollTop;
            const totalScrollable = document.documentElement.scrollHeight - window.innerHeight;
            if (totalScrollable > 0 && scrollPosition >= totalScrollable * 0.3) {
                setShowScrollTop(true);
            } else {
                setShowScrollTop(false);
            }
        };

        window.addEventListener("scroll", handleScroll, { passive: true });
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth",
        });
    };

    // Item Click Handler -> Opens 3D / Photo Customization Modal or Details Page
    const handleItemClick = (item, orderId) => {
        if (item?.customization) {
            setSelectedCakeCustomization(item.customization);
            setSelectedCakeOrderId(orderId);
            setShowCakeModal(true);
        } else {
            navigate(`/orders/${orderId}`);
        }
    };

    // Filtering & Sorting Logic
    const filteredOrders = useMemo(() => {
        return orders.filter((o) => {
            if (activeTab === "awaiting") {
                return o.status === "pending_review" || o.status === "awaiting_customer_response";
            }
            if (activeTab === "to_receive") {
                return o.status === "processing";
            }
            if (activeTab === "completed") {
                return FINISHED_STATUSES.has(o.status);
            }
            if (activeTab === "cancelled") {
                return CANCELLED_STATUSES.has(o.status);
            }
            return true;
        });
    }, [orders, activeTab]);

    const activeOrders = useMemo(
        () => filteredOrders.filter((order) =>
            ACTIVE_STATUSES.has(order.status) ||
            ((activeTab === "all" || activeTab === "cancelled") && CANCELLED_STATUSES.has(order.status))
        ),
        [filteredOrders, activeTab]
    );

    const pastOrders = useMemo(
        () => filteredOrders.filter((order) => FINISHED_STATUSES.has(order.status)),
        [filteredOrders]
    );

    // Metrics
    const awaitingReviewCount = orders.filter(
        (o) => o.status === "pending_review" || o.status === "awaiting_customer_response"
    ).length;
    const toReceiveCount = orders.filter((o) => o.status === "processing").length;
    const pastCompletedCount = orders.filter((o) => FINISHED_STATUSES.has(o.status)).length;
    const cancelledCount = orders.filter((o) => CANCELLED_STATUSES.has(o.status)).length;

    const visibleActiveOrders = activeOrders.slice(
        (activePage - 1) * ORDERS_PER_PAGE,
        activePage * ORDERS_PER_PAGE
    );
    const visiblePastOrders = pastOrders.slice(
        (pastPage - 1) * ORDERS_PER_PAGE,
        pastPage * ORDERS_PER_PAGE
    );

    if (loading) {
        return (
            <div className="min-h-screen bg-[#FCF8EE] flex flex-col items-center justify-center p-6 text-[#C05A11]">
                <div className="w-10 h-10 border-4 border-[#F3E5D0] border-t-[#C05A11] rounded-full animate-spin"></div>
                <p className="mt-4 text-sm font-bold tracking-wide">Loading your custom bakery dashboard...</p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#FCF8EE] flex items-center justify-center p-6">
                <div className="max-w-md w-full bg-white p-6 rounded-2xl border border-rose-200 shadow-md text-center">
                    <p className="text-rose-600 font-bold">{error}</p>
                    <button
                        onClick={fetchOrders}
                        className="mt-4 px-4 py-2 bg-[#C05A11] text-white font-bold rounded-xl text-xs"
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FCF8EE] antialiased text-stone-800 pb-16">
            {/* Filter Tabs Bar & Main Container */}
            <main className="max-w-6xl mx-auto px-4 sm:px-8 pt-8 space-y-10">
                {/* Tabs Bar */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#F3E5D0] pb-4">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 sm:pb-0 scrollbar-none">
                        <button
                            onClick={() => {
                                setActiveTab("all");
                                setActivePage(1);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "all"
                                ? "bg-[#6E473B] text-white shadow-sm"
                                : "bg-white text-stone-600 border border-[#F3E5D0] hover:bg-[#FAF5EB]"
                                }`}
                        >
                            All Orders ({orders.length})
                        </button>

                        <button
                            onClick={() => {
                                setActiveTab("awaiting");
                                setActivePage(1);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "awaiting"
                                ? "bg-[#6E473B] text-white shadow-sm"
                                : "bg-white text-stone-600 border border-[#F3E5D0] hover:bg-[#FAF5EB]"
                                }`}
                        >
                            Awaiting Review & Quote ({awaitingReviewCount})
                        </button>

                        <button
                            onClick={() => {
                                setActiveTab("to_receive");
                                setActivePage(1);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "to_receive"
                                ? "bg-[#6E473B] text-white shadow-sm"
                                : "bg-white text-stone-600 border border-[#F3E5D0] hover:bg-[#FAF5EB]"
                                }`}
                        >
                            To Receive ({toReceiveCount})
                        </button>

                        <button
                            onClick={() => {
                                setActiveTab("completed");
                                setPastPage(1);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "completed"
                                ? "bg-[#6E473B] text-white shadow-sm"
                                : "bg-white text-stone-600 border border-[#F3E5D0] hover:bg-[#FAF5EB]"
                                }`}
                        >
                            Past Completed ({pastCompletedCount})
                        </button>

                        <button
                            onClick={() => {
                                setActiveTab("cancelled");
                                setActivePage(1);
                            }}
                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${activeTab === "cancelled"
                                ? "bg-[#6E473B] text-white shadow-sm"
                                : "bg-white text-stone-600 border border-[#F3E5D0] hover:bg-[#FAF5EB]"
                                }`}
                        >
                            Cancelled ({cancelledCount})
                        </button>
                    </div>
                </div>

                {/* ACTIVE ORDERS SECTION */}
                {activeTab !== "completed" && (
                    <section className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                            <h2 className="text-2xl font-black text-[#6E473B] flex items-center gap-2">
                                <span>{activeTab === "all" ? "All Orders" : activeTab === "cancelled" ? "Cancelled Orders" : "Active Orders"}</span>
                                <span className="text-xs font-bold bg-[#FFF8EF] text-[#C05A11] border border-[#F3E5D0] px-2.5 py-0.5 rounded-full">
                                    {activeOrders.length} {activeTab === "all" ? "orders" : activeTab === "cancelled" ? "cancelled" : "active"}
                                </span>
                            </h2>
                            {activeTab !== "cancelled" && (
                                <p className="text-xs text-stone-500">
                                    Orders are actively monitored by Lead Pastry Chef • Live updates
                                </p>
                            )}
                        </div>

                        {activeOrders.length === 0 ? (
                            <div className="bg-white rounded-3xl p-10 border border-[#F3E5D0] text-center space-y-4">
                                <Cake className="w-10 h-10 text-stone-300 mx-auto" />
                                <h3 className="text-base font-bold text-[#6E473B]">
                                    {activeTab === "cancelled" ? "No cancelled orders" : "No active orders right now"}
                                </h3>
                                {activeTab !== "cancelled" && (
                                    <>
                                        <p className="text-xs text-stone-500 max-w-sm mx-auto">
                                            Ready to bake something special? Design your custom tiered cake with our 3D builder!
                                        </p>
                                        <button
                                            onClick={() => navigate("/build")}
                                            className="px-5 py-2.5 rounded-xl bg-[#C05A11] text-white font-bold text-xs shadow hover:bg-[#A84E0E] transition-colors"
                                        >
                                            Start Designing Cake
                                        </button>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {visibleActiveOrders.map((order) => (
                                    <ActiveOrderCard
                                        key={order.id}
                                        order={order}
                                        unreadCount={unreadOrders[order.id] || 0}
                                        onView={(id) => navigate(`/orders/${id}`)}
                                        onInvoice={setInvoiceOrder}
                                        onItemClick={handleItemClick}
                                    />
                                ))}
                            </div>
                        )}

                        <OrderPagination
                            page={activePage}
                            totalItems={activeOrders.length}
                            onPageChange={setActivePage}
                        />
                    </section>
                )}

                {/* PAST ORDERS & RE-ORDERS SECTION */}
                {activeTab === "completed" && (
                    <section className="space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
                            <div>
                                <h2 className="text-2xl font-black text-[#6E473B]">Past Orders & Re-Orders</h2>
                                <p className="text-xs text-stone-500 mt-0.5">
                                    Looking for past custom recipes? Re-order with 1-click.
                                </p>
                            </div>
                        </div>

                        {pastOrders.length === 0 ? (
                            <div className="bg-white rounded-3xl p-8 border border-stone-200 text-center text-xs text-stone-500">
                                No delivered or past completed orders yet.
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {visiblePastOrders.map((order) => (
                                    <PastOrderCard
                                        key={order.id}
                                        order={order}
                                        onReorder={setReorderOrder}
                                        onInvoice={setInvoiceOrder}
                                        onView={(id) => navigate(`/orders/${id}`)}
                                        onItemClick={handleItemClick}
                                    />
                                ))}
                            </div>
                        )}

                        <OrderPagination
                            page={pastPage}
                            totalItems={pastOrders.length}
                            onPageChange={setPastPage}
                        />
                    </section>
                )}
            </main>

            {/* Modals */}
            <ReorderModal
                order={reorderOrder}
                onClose={() => setReorderOrder(null)}
                onReorder={(item) => {
                    setReorderOrder(null);
                    if (item?.customization) {
                        navigate("/build", {
                            state: {
                                reorderCustomization: item.customization,
                                reorderOrderId: reorderOrder.id,
                            },
                        });
                    }
                }}
            />

            <InvoiceModal
                order={invoiceOrder}
                onClose={() => setInvoiceOrder(null)}
            />

            {/* Interactive 3D Customization & Sample Photo Modal */}
            <CustomizationProvider>
                <CustomCakeModal
                    isOpen={showCakeModal}
                    onClose={() => {
                        setShowCakeModal(false);
                        setSelectedCakeCustomization(null);
                        setSelectedCakeOrderId(null);
                    }}
                    customization={selectedCakeCustomization}
                    orderId={selectedCakeOrderId}
                    canAddImages={false}
                />
            </CustomizationProvider>

            {/* Scroll To Top Button (Appears when scroll > 30% of webpage height) */}
            {showScrollTop && (
                <button
                    onClick={scrollToTop}
                    aria-label="Scroll to top of page"
                    title="Scroll to Top"
                    className="fixed bottom-8 right-8 z-50 flex items-center gap-2 px-4 py-3 rounded-full bg-[#844414] text-white shadow-xl hover:bg-[#6E473B] hover:scale-110 active:scale-95 transition-all duration-300 border border-[#F3E5D0] animate__animated animate__fadeInUp cursor-pointer group"
                >
                    <svg
                        className="w-5 h-5 transition-transform duration-300 group-hover:-translate-y-1"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
                    </svg>
                    <span className="text-xs font-bold tracking-wide hidden sm:inline">Top</span>
                </button>
            )}
        </div>
    );
}