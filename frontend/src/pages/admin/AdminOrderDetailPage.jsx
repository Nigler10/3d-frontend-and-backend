// src/pages/admin/AdminOrderDetailPage.jsx
import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authFetch } from "../../utils/auth";
import { getMediaUrl } from "../../utils/media";
import RejectModal from "../../components/admin/RejectModal";
import Logistics from "../../components/Logistics";
import { CustomCakeModal } from "../../components/admin/CustomCakeModal";
import AdminQuotationPanel from "../../components/admin/AdminQuotationPanel";
import ChatBox from "../../components/chat/ChatBox";
import { getOrderStatusLabel } from "../../utils/orderStatus";
import UpdateOrderStatusModal from "../../components/admin/UpdateOrderStatusModal";
import OrderItemDetailsModal from "../../components/admin/OrderItemDetailsModal";
import { FileText } from "lucide-react";
import { InvoiceModal } from "../customer/CustomerOrdersPage";

export default function AdminOrderDetailPage() {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const { id } = useParams();
    const navigate = useNavigate();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [showCakeModal, setShowCakeModal] = useState(false);
    const [selectedCakeId, setSelectedCakeId] = useState(null);
    const selectedCake = order?.items?.find((item) => item.id === selectedCakeId);
    const [selectedItemDetails, setSelectedItemDetails] = useState(null);
    const [statusToUpdate, setStatusToUpdate] = useState(null);
    const [showInvoiceModal, setShowInvoiceModal] = useState(false);

    const updateStatus = async (status) => {
        const res = await authFetch(
            `${BASEURL}/api/orders/admin/orders/${id}/update-status/`,
            {
                method: "PATCH",
                body: JSON.stringify({ status }),
            }
        );

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
            throw new Error(
                data.error || "Failed to update order status. Please try again."
            );
        }

        if (data.order) {
            setOrder(data.order);
        }

        await fetchOrder();
    };

    const fetchOrder = async () => {
        try {
            const res = await authFetch(`${BASEURL}/api/orders/admin/orders/${id}/`);
            if (!res.ok) throw new Error("Failed to fetch order");
            const data = await res.json();
            setOrder(data);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        window.scrollTo(0, 0);
        fetchOrder();
    }, [id]);

    if (loading) return <div className="min-h-screen flex items-center justify-center font-black text-[#6E473B]">Loading...</div>;
    if (error) return <div className="min-h-screen flex items-center justify-center text-red-500">{error}</div>;
    if (!order) return null;

    const isUploadedCake = order.items.some(
        (item) => item.customization?.uploaded_cake
    );

    const canProgressStatus = [
        "processing",
        "ready_for_delivery",
        "out_for_delivery",
    ].includes(order.status);
    const hasProcessingPayment =
        order.status === "processing" &&
        ["partial", "paid"].includes(order.payment_status);
    const canCancelOrder =
        ["awaiting_customer_response", "awaiting_downpayment", "processing"].includes(order.status) &&
        !hasProcessingPayment;

    return (
        <div className="min-h-screen bg-[#FCF8EE] pb-10">
            <div className="max-w-6xl mx-auto px-4 md:px-8 pt-5 space-y-6">

                <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <button className="text-[#A07060] hover:text-[#6E473B] font-bold" onClick={() => navigate("/admin/orders")}>
                        ← Back to Orders
                    </button>
                    <div className="flex items-center gap-4">
                        <h1 className="text-2xl font-black text-[#6E473B]">Order <span className="text-[#C05A11]">#{order.id}</span></h1>
                        <span
                            className={`px-3 py-1 text-[11px] font-black rounded-full uppercase border whitespace-nowrap ${order.status}`}
                        >
                            {getOrderStatusLabel(order.status)}
                        </span>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Customer Info */}
                    <div className="bg-white p-6 rounded-2xl border border-[#E6CCA2] space-y-4">
                        <h3 className="font-black text-[#6E473B] border-b border-[#E6CCA2]/30 pb-2">Customer Details</h3>
                        {[
                            { label: "Name", val: order.full_name || order.user_name },
                            { label: "Email", val: order.customer_email },
                            { label: "Phone", val: order.formatted_phone || order.phone },
                            { label: "Address", val: order.full_address },
                            { label: "Placed At", val: new Date(order.created_at).toLocaleString() },
                            { label: "Delivery Date", val: order.delivery_date ? new Date(order.delivery_date).toLocaleDateString() : "N/A" },
                            { label: "Delivery Time", val: order.delivery_time }
                        ].map((item, idx) => (
                            <div key={idx} className="flex justify-between text-sm">
                                <span className="text-[#A07060]">{item.label}:</span>
                                <strong className="text-[#6E473B]">{item.val || "N/A"}</strong>
                            </div>
                        ))}
                        {order.order_notes && (
                            <>
                                <div className="border-t border-[#E6CCA2]/30 pt-4 mt-2">
                                    <p className="text-xs font-bold uppercase tracking-wide text-[#A07060] mb-2">
                                        Special Instructions
                                    </p>

                                    <div className="bg-[#FCF8EE] border border-[#E6CCA2] rounded-xl p-3 text-sm text-[#6E473B] whitespace-pre-wrap break-words">
                                        {order.order_notes}
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Actions & Summary */}
                    <div className="bg-white p-6 rounded-2xl border border-[#E6CCA2] space-y-6">
                        <div className="flex items-center justify-between gap-4">
                            <h3 className="font-black text-[#6E473B]">Order Summary</h3>
                            <button
                                type="button"
                                onClick={() => setShowInvoiceModal(true)}
                                className="flex-1 sm:flex-initial px-3.5 py-2 rounded-xl text-xs font-bold text-stone-600 bg-white hover:bg-stone-50 border border-stone-200 transition-colors flex items-center justify-center gap-1.5"
                            >
                                <FileText className="w-3.5 h-3.5" /> Invoice PDF
                            </button>
                        </div>
                        <div className="flex justify-between text-xl font-black text-[#6E473B]">
                            <span>Total:</span> <span>₱{Number(order.total_amount).toLocaleString()}</span>
                        </div>

                        {!isUploadedCake && order.status === "pending_review" && (
                            <div className="flex gap-3">
                                <button
                                    type="button"
                                    className="flex-1 bg-[#6E473B] text-white py-2 rounded-lg font-bold hover:bg-[#513328] transition"
                                    onClick={() => setStatusToUpdate("awaiting_downpayment")}
                                >
                                    Accept
                                </button>

                                <button
                                    className="flex-1 border border-[#C05A11] text-[#C05A11] py-2 rounded-lg font-bold"
                                    onClick={() => setShowRejectModal(true)}
                                >
                                    Reject
                                </button>
                            </div>
                        )}

                        {canCancelOrder && (
                            <button
                                className="w-full border border-rose-300 text-rose-700 py-2.5 rounded-xl font-bold hover:bg-rose-50 transition"
                                onClick={() => setStatusToUpdate("cancelled")}
                            >
                                Cancel Order
                            </button>
                        )}
                        {hasProcessingPayment && (
                            <p className="rounded-xl border border-[#E9C5C1] bg-[#FFF3F1] p-3 text-sm leading-relaxed text-[#9E3936]">
                               Note: This order has an existing partial or full payment and cannot be cancelled directly. Please follow the appropriate refund process.
                            </p>
                        )}

                        {isUploadedCake && (
                            <div className="space-y-3">
                                <AdminQuotationPanel
                                    orderId={order.id}
                                    status={order.status}
                                    quotations={order.quotations || []}
                                    onQuotationSent={fetchOrder}
                                />

                                {["pending_review", "awaiting_customer_response"].includes(order.status) && (
                                    <button
                                        className="w-full border border-[#C05A11] text-[#C05A11] py-2.5 rounded-xl font-bold hover:bg-orange-50 transition"
                                        onClick={() => setShowRejectModal(true)}
                                    >
                                        Reject Order
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Status Progression */}
                        {canProgressStatus && (
                            <div className="space-y-3">
                                <h4 className="font-bold text-[#6E473B]">
                                    Update Status
                                </h4>

                                {order.status === "processing" && (
                                    <button
                                        type="button"
                                        className="w-full rounded-xl bg-[#E6CCA2] py-2.5 font-bold text-[#6E473B] transition hover:bg-[#D9B982]"
                                        onClick={() => setStatusToUpdate("ready_for_delivery")}
                                    >
                                        Mark as Ready
                                    </button>
                                )}

                                {order.status === "ready_for_delivery" && (
                                    <button
                                        type="button"
                                        className="w-full rounded-xl bg-[#E6CCA2] py-2.5 font-bold text-[#6E473B] transition hover:bg-[#D9B982]"
                                        onClick={() => setStatusToUpdate("out_for_delivery")}
                                    >
                                        Out for Delivery
                                    </button>
                                )}

                                {order.status === "out_for_delivery" && (
                                    <button
                                        type="button"
                                        className="w-full rounded-xl bg-[#6E473B] py-2.5 font-bold text-white transition hover:bg-[#513328]"
                                        onClick={() => setStatusToUpdate("delivered")}
                                    >
                                        Mark as Delivered
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Items Table */}
                <div className="bg-white p-6 rounded-2xl border border-[#E6CCA2]">
                    <h3 className="font-black text-[#6E473B] mb-4">Items Ordered</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead><tr className="text-[#A07060] text-xs uppercase"><th>Product</th><th>Qty</th><th>Price</th><th className="text-right">Subtotal</th></tr></thead>
                            <tbody className="divide-y divide-[#E6CCA2]/20">
                                {order.items.map((item) => (
                                    <tr key={item.id} className="text-[#6E473B]">
                                        <td className="py-4">
                                            <div className="flex items-center gap-3">
                                                {item.product_image ? (
                                                    <img
                                                        src={getMediaUrl(
                                                            item.product_image,
                                                            BASEURL
                                                        )}
                                                        alt={item.product_name}
                                                        loading="lazy"
                                                        className="h-16 w-16 shrink-0 rounded-xl border border-[#E6CCA2] object-cover"
                                                    />
                                                ) : (
                                                    <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#E6CCA2] bg-[#FCF8EE] text-2xl">
                                                        🎂
                                                    </div>
                                                )}

                                                <div>
                                                    <div className="font-bold">
                                                        {item.product_name}
                                                    </div>

                                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                                                        {item.customization && (
                                                            <button
                                                                type="button"
                                                                className="text-xs font-bold text-[#C05A11] underline cursor-pointer"
                                                                onClick={() => {
                                                                    setSelectedCakeId(item.id);
                                                                    setShowCakeModal(true);
                                                                }}
                                                            >
                                                                View Customization
                                                            </button>
                                                        )}
                                                        {!item.product &&
                                                            !item.customization?.uploaded_cake &&
                                                            item.customization?.shape &&
                                                            item.customization?.flavor && (
                                                                <button
                                                                    type="button"
                                                                    className="text-xs font-bold text-[#C05A11] underline cursor-pointer"
                                                                    onClick={() => setSelectedItemDetails(item)}
                                                                >
                                                                    View Details
                                                                </button>
                                                            )}
                                                    </div>
                                                </div>
                                            </div>
                                        </td>
                                        <td>{item.quantity}</td>
                                        <td>₱{Number(item.price).toLocaleString()}</td>
                                        <td className="text-right font-black">₱{Number(item.subtotal).toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Order Timeline */}
                <div className="bg-white p-6 rounded-2xl border border-[#E6CCA2]">
                    <Logistics order={order} embedded />
                </div>
            </div>
            <ChatBox
                orderId={id}
                isAdmin={true}
                quotations={order.quotations || []}
                onRefreshOrder={fetchOrder}
            />

            <OrderItemDetailsModal
                item={selectedItemDetails}
                onClose={() => setSelectedItemDetails(null)}
            />

            <InvoiceModal
                order={showInvoiceModal ? order : null}
                onClose={() => setShowInvoiceModal(false)}
            />

            <RejectModal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} onSubmit={async (reason) => {
                const res = await authFetch(`${BASEURL}/api/orders/admin/orders/${id}/review/`, { method: "PATCH", body: JSON.stringify({ status: "rejected", rejection_reason: reason }) });
                if (!res.ok) return alert("Error");
                setShowRejectModal(false);
                await fetchOrder();
            }} />

            <UpdateOrderStatusModal
                isOpen={Boolean(statusToUpdate)}
                currentStatus={order.status}
                nextStatus={statusToUpdate}
                onClose={() => setStatusToUpdate(null)}
                onConfirm={async (status) => {
                    if (status === "awaiting_downpayment" && order.status === "pending_review") {
                        const res = await authFetch(
                            `${BASEURL}/api/orders/admin/orders/${id}/review/`,
                            {
                                method: "PATCH",
                                body: JSON.stringify({
                                    status: "awaiting_downpayment",
                                }),
                            }
                        );

                        const data = await res.json().catch(() => ({}));

                        if (!res.ok) {
                            throw new Error(
                                data.error || "Failed to accept this order. Please try again."
                            );
                        }

                        if (data.order) {
                            setOrder(data.order);
                        }

                        await fetchOrder();
                        setStatusToUpdate(null);
                        return;
                    }

                    await updateStatus(status);
                    setStatusToUpdate(null);
                }}
            />

            <CustomCakeModal
                isOpen={showCakeModal}
                onClose={() => {
                    setShowCakeModal(false);
                    setSelectedCakeId(null);
                }}
                customization={selectedCake?.customization}
                orderId={order.id}
                orderItemId={selectedCake?.id}
            />
        </div>
    );
}
