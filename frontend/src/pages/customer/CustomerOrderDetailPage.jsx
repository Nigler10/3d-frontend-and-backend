import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { authFetch } from "../../utils/auth";
import Logistics from "../../components/Logistics";
import ProductReviewForm from "../../components/customer/ProductReviewForm";
import ChatBox from "../../components/chat/ChatBox";
import { CustomizationProvider } from "../../contexts/Customization";
import { CustomCakeModal } from "../../components/admin/CustomCakeModal";
import { getOrderStatusLabel } from "../../utils/orderStatus";
import ExistingCheckoutModal from "../../components/customer/ExistingCheckoutModal";
import PrintablePaymentReceipt from "../../components/customer/PrintablePaymentReceipt";
import { AlertTriangle, Cake } from "lucide-react";

export default function CustomerOrderDetailPage() {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const { id } = useParams();
    const navigate = useNavigate();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [payAmount, setPayAmount] = useState(0);
    const [tipAmount, setTipAmount] = useState(0);
    const [isCreatingCheckout, setIsCreatingCheckout] = useState(false);
    const [checkoutChoice, setCheckoutChoice] = useState(null);
    const [isReplacingCheckout, setIsReplacingCheckout] = useState(false);
    const [agreeNoRefund, setAgreeNoRefund] = useState(false);
    const [showCakeModal, setShowCakeModal] = useState(false);
    const [selectedCake, setSelectedCake] = useState(null);
    const [showImageModal, setShowImageModal] = useState(false);
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [selectedReceiptPayment, setSelectedReceiptPayment] = useState(null);
    const roundMoney = (value) =>
        Math.round(
            (Number(value) + Number.EPSILON) * 100
        ) / 100;

    const fetchOrder = async () => {
        try {
            const res = await authFetch(`${BASEURL}/api/orders/customer/orders/${id}/`);

            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.error || "Failed to fetch order");
            }

            const data = await res.json();
            setOrder(data);

            const totalPaid = Number(data.total_paid);
            const remaining = Number(data.remaining_balance);

            const min =
                totalPaid === 0
                    ? roundMoney(
                        Number(data.total_amount) * 0.2
                    )
                    : Math.min(remaining, 0.01);

            setPayAmount(min);

        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchOrder();
    }, [id]);

    useEffect(() => {
        const params = new URLSearchParams(
            window.location.search
        );

        if (params.get("checkout") === "cancelled") {
            window.history.replaceState(
                {},
                "",
                `/orders/${id}`
            );
        }
    }, [id]);

    const parsedPay = payAmount === "" ? 0 : Number(payAmount);
    const parsedTip = tipAmount === "" ? 0 : Number(tipAmount);
    const totalToCharge = parsedPay + parsedTip;
    const remainingBalance = order ? Number(order.remaining_balance) : 0;

    const minAmount = order
        ? Number(order.total_paid) === 0
            ? roundMoney(
                Number(order.total_amount) * 0.2
            )
            : 0.01
        : 0;

    const maxAmount = order ? remainingBalance : 0;
    const isTipInvalid = tipAmount !== "" && parsedTip < 0;
    const isInvalid = payAmount === "" || parsedPay < minAmount || parsedPay > maxAmount || parsedPay === 0;

    const handleCancelOrder = async () => {
        if (!confirm("Are you sure you want to cancel this order?")) {
            return;
        }

        try {
            const res = await authFetch(
                `${BASEURL}/api/orders/${id}/cancel/`,
                {
                    method: "POST",
                }
            );

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Failed to cancel order.");
                return;
            }

            alert("Order cancelled successfully.");
            await fetchOrder();
        } catch (err) {
            console.error(err);
            alert("Something went wrong while cancelling the order.");
        }
    };

    const handlePayNow = async () => {
        if (isCreatingCheckout) return;

        setIsCreatingCheckout(true);

        const requestedAmount = parsedPay;
        const requestedTip = parsedTip;

        try {
            const res = await authFetch(
                `${BASEURL}/api/payments/${id}/checkout/`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        amount: requestedAmount,
                        tip: requestedTip,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                alert(
                    data.error ||
                    "Failed to initiate payment."
                );

                return;
            }

            if (data.needs_checkout_choice) {
                setCheckoutChoice({
                    checkoutUrl:
                        data.checkout_url,

                    existingAmount:
                        data.existing_checkout?.amount,

                    existingTip:
                        data.existing_checkout?.tip,

                    requestedAmount,
                    requestedTip,
                });

                return;
            }

            if (!data.checkout_url) {
                alert(
                    "Payment checkout could not be created."
                );

                return;
            }

            window.location.href =
                data.checkout_url;

        } catch (err) {
            console.error(err);

            alert(
                "Unable to connect to the payment service. Please try again."
            );

        } finally {
            setIsCreatingCheckout(false);
        }
    };

    const handleResumeCheckout = () => {
        if (!checkoutChoice?.checkoutUrl) {
            return;
        }

        window.location.href =
            checkoutChoice.checkoutUrl;
    };


    const handleReplaceCheckout = async () => {
        if (!checkoutChoice) return;

        setIsReplacingCheckout(true);

        try {
            const cancelRes = await authFetch(
                `${BASEURL}/api/payments/${id}/checkout/cancel/`,
                {
                    method: "POST",
                }
            );

            const cancelData = await cancelRes
                .json()
                .catch(() => ({}));

            if (!cancelRes.ok) {
                alert(
                    cancelData.error ||
                    "Unable to close the previous checkout."
                );

                return;
            }

            const res = await authFetch(
                `${BASEURL}/api/payments/${id}/checkout/`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        amount:
                            checkoutChoice.requestedAmount,

                        tip:
                            checkoutChoice.requestedTip,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                alert(
                    data.error ||
                    "Unable to create the new checkout."
                );

                return;
            }

            if (!data.checkout_url) {
                alert(
                    "New payment checkout could not be created."
                );

                return;
            }

            setCheckoutChoice(null);

            window.location.href =
                data.checkout_url;

        } catch (err) {
            console.error(err);

            alert(
                "Unable to replace the payment checkout. Please try again."
            );

        } finally {
            setIsReplacingCheckout(false);
        }
    };

    const uploadedImages = (order?.items || []).flatMap((item) => {
        const customization = item.customization;

        if (!customization?.uploaded_cake) return [];

        if (Array.isArray(customization.images)) {
            return customization.images
                .map((image) => ({
                    url: image.image || image.image_url || "",
                    uploadId: image.upload_id,
                }))
                .filter((image) => image.url);
        }

        if (customization.image) {
            return [{
                url: customization.image,
                uploadId: customization.upload_id,
            }];
        }

        return [];
    });

    const getImageUrl = (url) => {
        if (!url) return "";
        if (url.startsWith("http://") || url.startsWith("https://")) return url;
        return `${BASEURL}${url}`;
    };

    const normalizedImages = uploadedImages.map((image) => ({
        ...image,
        url: getImageUrl(image.url),
    }));

    const openImageModal = (index) => {
        setSelectedImageIndex(index);
        setShowImageModal(true);
    };

    const closeImageModal = () => {
        setShowImageModal(false);
        setSelectedImageIndex(0);
    };

    const showPreviousImage = () => {
        if (normalizedImages.length <= 1) return;
        setSelectedImageIndex((current) => current === 0 ? normalizedImages.length - 1 : current - 1);
    };

    const showNextImage = () => {
        if (normalizedImages.length <= 1) return;
        setSelectedImageIndex((current) => current === normalizedImages.length - 1 ? 0 : current + 1);
    };

    if (loading) {
        return <div className="min-h-screen bg-[#fffdf9] flex items-center justify-center text-stone-600 font-bold text-sm">Loading your cake details...</div>;
    }

    if (error) {
        return <div className="min-h-screen bg-[#fffdf9] flex items-center justify-center text-rose-600 font-bold text-sm p-4 text-center">{error}</div>;
    }

    if (!order) return null;

    const isPayable = !["delivered", "completed", "cancelled", "rejected"].includes(order.status);

    const canCancelOrder =
        order.status === "pending_review" ||
        order.status === "awaiting_customer_response" ||
        (
            order.status === "awaiting_downpayment" &&
            Number(order.total_paid) === 0
        );

    const showPaymentCard =
        isPayable &&
        ["awaiting_downpayment", "partial"].includes(order.status === "awaiting_downpayment" ? order.status : order.payment_status) &&
        remainingBalance > 0;

    const getStatusColor = (status) => {
        switch (status) {
            case "completed":
            case "delivered":
                return "bg-emerald-50 text-emerald-700 border-emerald-200";
            case "pending_review":
            case "awaiting_downpayment":
                return "bg-amber-50 text-amber-700 border-amber-200";

            case "awaiting_customer_response":
                return "bg-sky-50 text-sky-700 border-sky-200";
            case "cancelled":
            case "rejected":
                return "bg-rose-50 text-rose-700 border-rose-200";
            default:
                return "bg-stone-50 text-stone-700 border-stone-200";
        }
    };

    const getPaymentColor = (status) => {
        if (status === "paid") return "bg-emerald-50 text-emerald-700 border-emerald-200";
        if (status === "partial") return "bg-sky-50 text-sky-700 border-sky-200";
        return "bg-rose-50 text-rose-700 border-rose-200";
    };

    return (
        <div className="min-h-screen bg-[#fffdf9] text-stone-800 antialiased pb-16">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-5 space-y-6">
                <header className="bg-white border border-[#f3e1c6] rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="space-y-1">
                        <button className="text-xs font-bold text-[#d67b27] hover:text-[#b56219] transition-colors mb-2 block cursor-pointer" onClick={() => navigate("/orders")}>← Back to My Orders</button>
                        <h1 className="text-2xl font-black text-[#844414] tracking-tight">Order <span className="text-[#d67b27]">#{order.id}</span></h1>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <span
                            className={`text-xs uppercase font-black tracking-wider whitespace-nowrap px-3 py-1.5 border rounded-full ${getStatusColor(order.status)}`}
                        >
                            {getOrderStatusLabel(order.status)}
                        </span>
                        <span className={`text-xs uppercase font-black tracking-wider px-3 py-1.5 border rounded-full ${getPaymentColor(order.payment_status)}`}>{order.payment_status}</span>
                    </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
                    <div className="lg:col-span-2 space-y-6">
                        <div className="bg-white border border-[#f3e1c6] rounded-2xl p-6 shadow-sm space-y-4">
                            <h3 className="text-lg font-bold text-[#844414] border-b border-stone-100 pb-2">Order Summary</h3>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between items-center">
                                    <span className="text-stone-500 font-medium">Total Amount:</span>
                                    <span className="text-base font-black text-[#844414]">₱{Number(order.total_amount).toLocaleString()}</span>
                                </div>

                                {order.status !== "rejected" && order.status !== "pending_review" && (
                                    <div className="flex justify-between items-center p-3 bg-[#fdf2e2]/40 rounded-xl border border-[#fdf2e2]">
                                        <span className="text-stone-700 font-bold">Remaining Balance:</span>
                                        <span className="text-base font-black text-[#d67b27]">₱{remainingBalance.toLocaleString()}</span>
                                    </div>
                                )}

                                <div className="flex justify-between items-center text-xs text-stone-400 pt-2 border-t border-stone-50">
                                    <span>Placed At:</span>
                                    <span className="font-medium">{new Date(order.created_at).toLocaleDateString()}</span>
                                </div>
                            </div>

                            {order.order_notes && (
                                <div className="rounded-xl bg-[#fff7eb] border border-[#f3e1c6] p-4">
                                    <p className="text-xs uppercase font-bold text-stone-500 mb-1">Your Notes</p>
                                    <p className="text-sm text-stone-700 whitespace-pre-wrap">{order.order_notes}</p>
                                </div>
                            )}
                        </div>

                        {showPaymentCard && (
                            <div className="bg-white border-2 border-[#d67b27]/80 rounded-2xl p-6 shadow-sm space-y-4 relative overflow-hidden">
                                <div className="absolute top-0 left-0 right-0 h-1.5 bg-[#d67b27]" />

                                <h3 className="text-lg font-bold text-[#844414]">{order.total_paid == 0 ? "Complete Downpayment" : "Complete Remaining Balance"}</h3>

                                <p className="text-xs font-semibold text-stone-500 bg-stone-50 px-3 py-1.5 rounded-lg inline-block">
                                    {order.total_paid == 0 ? `Minimum required: ₱${minAmount.toLocaleString()}` : `Remaining balance: ₱${remainingBalance.toLocaleString()}`}
                                </p>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                    <div className="flex flex-col">
                                        <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Amount to Pay</label>
                                        <input type="number" min="0" step="0.01" value={payAmount || ""} disabled={!isPayable || isCreatingCheckout} onChange={(e) => isPayable && setPayAmount(e.target.value === "" ? "" : Number(e.target.value))} className="w-full bg-white border border-stone-200 focus:border-[#d67b27] focus:ring-1 focus:ring-[#d67b27] rounded-xl px-4 py-2.5 text-sm font-bold outline-none transition-all disabled:bg-stone-50" />
                                    </div>

                                    <div className="flex flex-col">
                                        <label className="text-xs font-bold text-stone-500 uppercase tracking-wider mb-1.5">Add a Tip (Optional)</label>
                                        <input type="number" min="0" step="0.01" value={tipAmount || ""} disabled={!isPayable || isCreatingCheckout} onChange={(e) => isPayable && setTipAmount(e.target.value === "" ? "" : Number(e.target.value))} className="w-full bg-white border border-stone-200 focus:border-[#d67b27] focus:ring-1 focus:ring-[#d67b27] rounded-xl px-4 py-2.5 text-sm font-bold outline-none transition-all disabled:bg-stone-50" />
                                    </div>
                                </div>

                                {isInvalid && payAmount !== "" && (
                                    <p className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-xl p-3 flex items-center gap-1.5"><AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" /> Please enter an amount between ₱{minAmount} and ₱{maxAmount}</p>
                                )}

                                <div className="flex justify-between items-center p-4 bg-[#fffdf9] border border-[#f3e1c6] rounded-xl">
                                    <span className="text-sm font-bold text-stone-600">Total to Charge:</span>
                                    <strong className="text-xl font-black text-[#844414]">₱{totalToCharge.toLocaleString()}</strong>
                                </div>

                                <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                                    <input id="no-refund-agreement" type="checkbox" checked={agreeNoRefund} onChange={(e) => setAgreeNoRefund(e.target.checked)} className="mt-1 h-4 w-4 accent-[#d67b27] cursor-pointer" />
                                    <label htmlFor="no-refund-agreement" className="text-sm text-stone-700 leading-relaxed cursor-pointer">I understand that once my payment is successfully processed, it is <span className="font-bold text-rose-600">non-refundable</span>. I have reviewed my order details and agree to proceed.</label>
                                </div>

                                <button
                                    onClick={handlePayNow}
                                    disabled={
                                        !isPayable ||
                                        isInvalid ||
                                        isTipInvalid ||
                                        !agreeNoRefund ||
                                        isCreatingCheckout
                                    }
                                    className="w-full bg-[#d67b27] hover:bg-[#b56219] disabled:bg-stone-300 text-white font-black py-3.5 px-6 rounded-full transition-colors duration-200 text-sm uppercase tracking-wider shadow-sm text-center cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {isCreatingCheckout
                                        ? "Creating Secure Checkout..."
                                        : "Proceed to Secure Checkout"}
                                </button>
                            </div>
                        )}

                        {canCancelOrder && (
                            <div className="bg-white border border-rose-200 rounded-2xl p-5 shadow-sm">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                    <div>
                                        <h4 className="text-sm font-black text-stone-700">
                                            Cancel Order
                                        </h4>

                                        <p className="text-xs text-stone-500 mt-1">
                                            You can cancel this order while no payment has been made.
                                        </p>
                                    </div>

                                    <button
                                        onClick={handleCancelOrder}
                                        className="w-full sm:w-auto shrink-0 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 hover:border-rose-300 font-bold px-5 py-2.5 rounded-xl transition-all cursor-pointer"
                                    >
                                        Cancel Order
                                    </button>
                                </div>
                            </div>
                        )}

                        {order.status === "rejected" && order.rejection_reason && (
                            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-5 space-y-1">
                                <h4 className="text-sm font-black text-rose-800 uppercase tracking-wider">Update from Bakery</h4>
                                <p className="text-sm text-rose-700 font-medium">{order.rejection_reason}</p>
                            </div>
                        )}
                    </div>

                    <div className="space-y-6">
                        <div className="bg-white border border-[#f3e1c6] rounded-2xl p-6 shadow-sm space-y-4">
                            <h3 className="text-lg font-bold text-[#844414] border-b border-stone-100 pb-2">Items Ordered</h3>

                            <div className="divide-y divide-stone-100 max-h-[320px] overflow-y-auto pr-1">
                                {order.items.map((item) => (
                                    <div
                                        key={item.id}
                                        className="py-4 flex items-start justify-between gap-4 text-sm first:pt-0 last:pb-0"
                                    >
                                        <div className="flex min-w-0 flex-1 items-start gap-3">
                                            {/* Product Image */}
                                            {item.product_image ? (
                                                <img
                                                    src={getImageUrl(item.product_image)}
                                                    alt={item.product_name}
                                                    loading="lazy"
                                                    className="h-16 w-16 shrink-0 rounded-xl border border-[#f3e1c6] object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-[#f3e1c6] bg-[#fffdf9]">
                                                    <Cake className="w-8 h-8 text-[#d67b27]" />
                                                </div>
                                            )}

                                            <div className="min-w-0 flex-1 space-y-0.5">
                                                <p className="font-bold text-stone-800 leading-tight">
                                                    {item.product_name}
                                                </p>

                                                {item.customization && (
                                                    <button
                                                        type="button"
                                                        className="mt-1 text-xs font-semibold text-[#d67b27] underline hover:text-[#b56219] cursor-pointer"
                                                        onClick={() => {
                                                            setSelectedCake(item.customization);
                                                            setShowCakeModal(true);
                                                        }}
                                                    >
                                                        View Customization
                                                    </button>
                                                )}

                                                <p className="text-xs font-semibold text-stone-400">
                                                    Qty: {item.quantity} × ₱
                                                    {Number(item.price).toLocaleString()}
                                                </p>

                                                {order.status === "delivered" && item.product && (
                                                    <ProductReviewForm
                                                        orderId={order.id}
                                                        item={item}
                                                    />
                                                )}
                                            </div>
                                        </div>

                                        <div className="shrink-0 text-right font-extrabold text-[#844414]">
                                            ₱{Number(item.subtotal).toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-white border border-[#f3e1c6] rounded-2xl p-6 shadow-sm space-y-4">
                            <h3 className="text-lg font-bold text-[#844414] border-b border-stone-100 pb-2">Delivery Details</h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs bg-stone-50 p-4 rounded-xl border border-stone-100 font-bold text-stone-600">
                                {/* Delivery Date */}
                                <div>
                                    <span className="block text-stone-400 uppercase tracking-wider mb-1">
                                        Date
                                    </span>

                                    <span className="text-stone-800">
                                        {order.delivery_date
                                            ? new Date(order.delivery_date).toLocaleDateString()
                                            : "TBD"}
                                    </span>
                                </div>

                                {/* Delivery Time */}
                                <div>
                                    <span className="block text-stone-400 uppercase tracking-wider mb-1">
                                        Time
                                    </span>

                                    <span className="text-stone-800">
                                        {order.delivery_time || "TBD"}
                                    </span>
                                </div>

                                <div>
                                    <span className="block text-stone-400 uppercase tracking-wider mb-1">
                                        Recipient
                                    </span>

                                    <span className="text-stone-800">
                                        {order.full_name || "N/A"}
                                    </span>
                                </div>

                                <div>
                                    <span className="block text-stone-400 uppercase tracking-wider mb-1">
                                        Contact Number
                                    </span>

                                    <span className="text-stone-800">
                                        {order.formatted_phone || order.phone || "N/A"}
                                    </span>
                                </div>

                                {/* Delivery Address */}
                                <div className="sm:col-span-2 border-t border-stone-200 pt-3">
                                    <span className="block text-stone-400 uppercase tracking-wider mb-1">
                                        Delivery Address for this Order
                                    </span>

                                    <span className="block text-stone-800 leading-relaxed">
                                        {order.full_address ||
                                            [
                                                order.street,
                                                order.barangay,
                                                order.city,
                                                order.province,
                                                order.region,
                                                order.postal_code,
                                            ]
                                                .filter(Boolean)
                                                .join(", ") ||
                                            "No delivery address available"}
                                    </span>
                                </div>
                            </div>

                            <div className="pt-2">
                                <Logistics order={order} onViewReceipt={setSelectedReceiptPayment} />
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <ChatBox
                orderId={id}
                isAdmin={false}
                quotations={order.quotations || []}
                onQuotationAccepted={fetchOrder}
                onRefreshOrder={fetchOrder}
            />

            <CustomizationProvider>
                <CustomCakeModal
                    isOpen={showCakeModal}
                    onClose={() => {
                        setShowCakeModal(false);
                        setSelectedCake(null);
                    }}
                    customization={selectedCake}
                    orderId={order.id}
                    canAddImages={true}
                    onImagesAdded={() => fetchOrder()}
                />
            </CustomizationProvider>

            <ExistingCheckoutModal
                isOpen={Boolean(checkoutChoice)}
                checkout={checkoutChoice}
                isReplacing={isReplacingCheckout}
                onResume={handleResumeCheckout}
                onReplace={handleReplaceCheckout}
                onClose={() => {
                    if (!isReplacingCheckout) {
                        setCheckoutChoice(null);
                    }
                }}
            />

            <PrintablePaymentReceipt
                isOpen={Boolean(selectedReceiptPayment)}
                payment={selectedReceiptPayment}
                order={order}
                onClose={() => setSelectedReceiptPayment(null)}
            />

            {showImageModal && normalizedImages.length > 0 && (
                <div className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4" onClick={closeImageModal}>
                    <div className="relative w-full max-w-6xl h-[90vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={closeImageModal} className="absolute top-2 right-2 z-30 h-10 w-10 rounded-full bg-black/60 hover:bg-black/80 text-white text-xl font-bold flex items-center justify-center cursor-pointer">×</button>

                        {normalizedImages.length > 1 && (
                            <>
                                <button type="button" onClick={showPreviousImage} className="absolute left-2 sm:left-5 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-black/70 hover:bg-black/90 text-white text-3xl leading-none flex items-center justify-center pb-1 cursor-pointer">‹</button>
                                <button type="button" onClick={showNextImage} className="absolute right-2 sm:right-5 top-1/2 -translate-y-1/2 z-20 h-12 w-12 rounded-full bg-black/70 hover:bg-black/90 text-white text-3xl leading-none flex items-center justify-center pb-1 cursor-pointer">›</button>
                            </>
                        )}

                        <img src={normalizedImages[selectedImageIndex].url} alt={`Uploaded cake reference ${selectedImageIndex + 1}`} className="max-w-[85%] max-h-[82vh] object-contain rounded-xl shadow-2xl" />

                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs font-bold px-4 py-2 rounded-full">
                            {selectedImageIndex + 1} / {normalizedImages.length}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}