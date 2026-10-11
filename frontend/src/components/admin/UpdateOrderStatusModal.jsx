// frontend/src/components/admin/UpdateOrderStatusModal.jsx
import { useEffect, useState } from "react";
import {
    ArrowRight,
    CheckCircle2,
    CircleAlert,
    Clock3,
    PackageCheck,
    Truck,
    X,
    LoaderCircle,
} from "lucide-react";
import { getOrderStatusLabel } from "../../utils/orderStatus";

const statusDetails = {
    awaiting_downpayment: {
        title: "Accept this order?",
        description:
            "This order will be approved and moved to awaiting downpayment. The customer can then proceed with the required payment.",
        button: "Confirm Acceptance",
        icon: CheckCircle2,
        iconClass: "bg-[#E8F0E4] text-[#557A49]",
        buttonClass: "bg-[#6E473B] hover:bg-[#513328]",
    },
    cancelled: {
        title: "Cancel this order?",
        description:
            "This order will be marked as cancelled. Make sure cancellation is appropriate before continuing.",
        button: "Confirm Cancellation",
        icon: CircleAlert,
        iconClass: "bg-[#FCE9E7] text-[#B74743]",
        buttonClass: "bg-[#B74743] hover:bg-[#9E3936]",
    },
    ready_for_delivery: {
        title: "Mark order as ready?",
        description:
            "Confirm that the cake is finished, checked, and ready for the customer or delivery team.",
        button: "Mark as Ready",
        icon: PackageCheck,
        iconClass: "bg-[#F8EBD8] text-[#A85A16]",
        buttonClass: "bg-[#B75A1A] hover:bg-[#984713]",
    },
    out_for_delivery: {
        title: "Dispatch this order?",
        description:
            "Confirm that the order has been handed over for delivery and is on its way to the customer.",
        button: "Confirm Dispatch",
        icon: Truck,
        iconClass: "bg-[#E8F0E4] text-[#557A49]",
        buttonClass: "bg-[#6E473B] hover:bg-[#513328]",
    },
    delivered: {
        title: "Mark as delivered?",
        description:
            "Only confirm this when the order has reached the customer.",
        button: "Confirm Delivery",
        icon: CheckCircle2,
        iconClass: "bg-[#E8F0E4] text-[#557A49]",
        buttonClass: "bg-[#6E473B] hover:bg-[#513328]",
    },
};

export default function UpdateOrderStatusModal({
    isOpen,
    currentStatus,
    nextStatus,
    onClose,
    onConfirm,
}) {
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const details = statusDetails[nextStatus] || {
        title: "Update order status?",
        description: "Please review the status change before continuing.",
        button: "Confirm Status Update",
        icon: Clock3,
        iconClass: "bg-[#F8EBD8] text-[#A85A16]",
        buttonClass: "bg-[#6E473B] hover:bg-[#513328]",
    };

    const Icon = details.icon;
    const isCancellation = nextStatus === "cancelled";

    useEffect(() => {
        if (!isOpen) {
            setSubmitting(false);
            setError("");
            return;
        }

        const handleEscape = (event) => {
            if (event.key === "Escape" && !submitting) {
                onClose();
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [isOpen, submitting, onClose]);

    if (!isOpen) return null;

    const handleConfirm = async () => {
        if (submitting) return;

        setSubmitting(true);
        setError("");

        try {
            await onConfirm(nextStatus);
        } catch (err) {
            setError(err.message || "Unable to update this order. Please try again.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[10000] flex items-end justify-center bg-[#241710]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (
                    event.target === event.currentTarget &&
                    !submitting
                ) {
                    onClose();
                }
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="update-status-title"
                aria-describedby="update-status-description"
                className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-y-auto rounded-t-[24px] border border-[#E6CCA2]/70 bg-[#FCF8EE] shadow-2xl sm:max-h-[85dvh] sm:rounded-[24px]"
            >
                {/* Header */}
                <div className="flex items-start gap-3 px-5 pb-4 pt-5 sm:px-6">
                    <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${details.iconClass}`}
                    >
                        <Icon size={24} strokeWidth={2} />
                    </div>

                    <div className="min-w-0 flex-1">
                        <h2
                            id="update-status-title"
                            className="text-lg font-black tracking-tight text-[#6E473B]"
                        >
                            {details.title}
                        </h2>
                        <p
                            id="update-status-description"
                            className="mt-1 text-sm leading-relaxed text-[#A07060]"
                        >
                            {details.description}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        aria-label="Close status update modal"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#A07060] transition hover:bg-[#E6CCA2]/40 hover:text-[#6E473B] disabled:opacity-50"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Status comparison */}
                <div className="mx-5 rounded-2xl border border-[#E6CCA2]/70 bg-white p-4 sm:mx-6">
                    <p className="mb-3 text-[10px] font-extrabold uppercase tracking-[0.15em] text-[#A07060]">
                        Status change
                    </p>

                    <div className="flex items-center gap-2">
                        <div className="min-w-0 flex-1 rounded-xl bg-[#FCF8EE] px-3 py-3">
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#A07060]">
                                Current
                            </p>
                            <p className="break-words text-sm font-bold text-[#6E473B]">
                                {getOrderStatusLabel(currentStatus)}
                            </p>
                        </div>

                        <ArrowRight
                            size={19}
                            className="shrink-0 text-[#C05A11]"
                        />

                        <div
                            className={`min-w-0 flex-1 rounded-xl px-3 py-3 ${isCancellation
                                ? "bg-[#FCE9E7]"
                                : "bg-[#F8EBD8]"
                                }`}
                        >
                            <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-[#A07060]">
                                New status
                            </p>
                            <p
                                className={`break-words text-sm font-extrabold ${isCancellation
                                    ? "text-[#B74743]"
                                    : "text-[#984713]"
                                    }`}
                            >
                                {getOrderStatusLabel(nextStatus)}
                            </p>
                        </div>
                    </div>
                </div>

                {/* Optional warning */}
                {isCancellation && (
                    <div className="mx-5 mt-3 flex gap-2 rounded-xl border border-[#E9C5C1] bg-[#FFF3F1] p-3 text-xs leading-relaxed text-[#9E3936] sm:mx-6">
                        <CircleAlert
                            size={16}
                            className="mt-0.5 shrink-0"
                        />
                        <p>
                            Double-check the order before proceeding. This action
                            changes the order status and may affect the customer's
                            order experience.
                        </p>
                    </div>
                )}

                {/* API error */}
                {error && (
                    <div
                        role="alert"
                        className="mx-5 mt-3 rounded-xl border border-[#E9C5C1] bg-[#FFF3F1] px-3 py-2.5 text-sm text-[#9E3936] sm:mx-6"
                    >
                        {error}
                    </div>
                )}

                {/* Footer */}
                <div className="mt-4 flex shrink-0 flex-col gap-2 border-t border-[#E6CCA2]/50 bg-[#FCF8EE] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-5">
                    <button
                        type="button"
                        onClick={handleConfirm}
                        disabled={submitting}
                        className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold text-white shadow-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C05A11] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${details.buttonClass}`}
                    >
                        {submitting ? (
                            <>
                                <LoaderCircle
                                    size={17}
                                    className="animate-spin"
                                />
                                Updating order...
                            </>
                        ) : (
                            <>
                                <CheckCircle2 size={17} />
                                {details.button}
                            </>
                        )}
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={submitting}
                        className="min-h-9 w-full rounded-xl px-4 py-2 text-sm font-bold text-[#A07060] transition hover:bg-[#E6CCA2]/30 hover:text-[#6E473B] disabled:opacity-50"
                    >
                        Go back
                    </button>
                </div>
            </div>
        </div>
    );
}