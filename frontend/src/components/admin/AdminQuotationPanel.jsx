// src/components/admin/AdminQuotationPanel.jsx
import { useState } from "react";
import { useCustomerDialog } from "../../context/CustomerDialogContext";
import { authFetch } from "../../utils/auth";

export default function AdminQuotationPanel({
    orderId,
    status,
    quotations = [],
    onQuotationSent,
}) {
    const { showAlert, showConfirm } = useCustomerDialog();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const [amount, setAmount] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const currentQuotation = quotations.length
        ? quotations[quotations.length - 1]
        : null;

    const previousQuotation = quotations.length > 1
        ? quotations[quotations.length - 2]
        : null;

    const canSendQuotation = [
        "pending_review",
        "awaiting_customer_response",
    ].includes(status);

    const formatPrice = (value) =>
        `₱${Number(value).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        })}`;

    const handleSubmit = async (e) => {
        e.preventDefault();

        const parsedAmount = Number(amount);

        if (!parsedAmount || parsedAmount <= 0) {
            alert("Enter a valid quotation amount.");
            return;
        }

        if (
            !(await showConfirm(
                `Send quotation of ${formatPrice(parsedAmount)} to the customer?`,
                {
                    title: "Send Quotation",
                    tone: "success",
                    cancelLabel: "Cancel",
                    confirmLabel: "Confirm",
                }
            ))
        ) {
            return;
        }

        try {
            setSubmitting(true);

            const res = await authFetch(
                `${BASEURL}/api/orders/admin/orders/${orderId}/quotation/`,
                {
                    method: "POST",
                    body: JSON.stringify({
                        amount: amount,
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                alert(data.error || "Failed to send quotation.");
                return;
            }

            setAmount("");
            await onQuotationSent?.(data.order);

            await showAlert("Quotation sent successfully.", {
                title: "Quotation sent",
                tone: "success",
                confirmLabel: "Okay",
            });
        } catch (err) {
            console.error(err);
            alert("Something went wrong.");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="rounded-2xl border border-[#E6CCA2] bg-[#FCF8EE] p-4 space-y-4">
            <div>
                <p className="text-xs font-black uppercase tracking-wider text-[#C05A11]">
                    Cake Quotation
                </p>

                <p className="mt-1 text-xs font-medium text-[#A07060]">
                    Review the customer's reference images and send your proposed price.
                </p>
            </div>

            {currentQuotation && (
                <div className="rounded-xl border border-[#E6CCA2] bg-white p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#A07060]">
                        Current Quotation
                    </p>

                    <div className="mt-1 flex flex-wrap items-center gap-2">
                        {previousQuotation && (
                            <>
                                <span className="text-sm font-bold text-stone-400 line-through">
                                    {formatPrice(previousQuotation.amount)}
                                </span>

                                <span className="font-black text-[#C05A11]">
                                    →
                                </span>
                            </>
                        )}

                        <span className="text-xl font-black text-[#6E473B]">
                            {formatPrice(currentQuotation.amount)}
                        </span>
                    </div>

                    <p className="mt-1 text-xs font-bold text-[#A07060]">
                        {currentQuotation.status === "pending" &&
                            "Waiting for customer response"}

                        {currentQuotation.status === "accepted" &&
                            "Accepted by customer"}

                        {currentQuotation.status === "replaced" &&
                            "Replaced"}
                    </p>
                </div>
            )}

            {canSendQuotation && (
                <form onSubmit={handleSubmit} className="space-y-3">
                    <div>
                        <label className="mb-1.5 block text-xs font-black uppercase tracking-wider text-[#6E473B]">
                            {currentQuotation
                                ? "New Quotation"
                                : "Quotation Amount"}
                        </label>

                        <div className="flex">
                            <span className="flex items-center rounded-l-xl border border-r-0 border-[#E6CCA2] bg-white px-3 font-black text-[#6E473B]">
                                ₱
                            </span>

                            <input
                                type="number"
                                min="1"
                                step="0.01"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="min-w-0 flex-1 rounded-r-xl border border-[#E6CCA2] bg-white px-3 py-2.5 font-bold text-[#6E473B] outline-none focus:border-[#C05A11]"
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={submitting || !amount}
                        className="w-full rounded-xl bg-[#6E473B] py-2.5 font-black text-white transition hover:bg-[#55362d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {submitting
                            ? "Sending..."
                            : currentQuotation
                                ? "Send New Quotation"
                                : "Send Quotation"}
                    </button>
                </form>
            )}
        </div>
    );
}
