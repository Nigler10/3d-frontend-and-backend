// src/components/Logistics.jsx
import { useMemo } from "react";

export default function Logistics({
    order,
    embedded = false,
    onViewReceipt,
}) {
    if (!order) return null;

    const money = (value) =>
        Number(value || 0).toLocaleString(
            "en-PH",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
            }
        );

    const formatDate = (value) => {
        if (!value) return null;

        return new Date(value).toLocaleString(
            "en-PH",
            {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
            }
        );
    };

    const statusDetails = {
        pending_review: {
            title: "Order Submitted",
            description:
                "Your order was submitted and is waiting for bakery review.",
            icon: "✓",
            tone: "amber",
        },

        awaiting_customer_response: {
            title: "Waiting for Your Response",
            description:
                "The bakery sent an update or quotation and is waiting for your response.",
            icon: "!",
            tone: "sky",
        },

        awaiting_downpayment: {
            title: "Awaiting Downpayment",
            description:
                "Your order was approved and is waiting for the required payment.",
            icon: "₱",
            tone: "amber",
        },

        processing: {
            title: "Order Processing",
            description:
                "The bakery has started preparing your order.",
            icon: "●",
            tone: "orange",
        },

        ready_for_delivery: {
            title: "Ready for Delivery",
            description:
                "Your order has been prepared and is ready to be dispatched.",
            icon: "✓",
            tone: "emerald",
        },

        out_for_delivery: {
            title: "Out for Delivery",
            description:
                "Your order is on the way to the delivery address.",
            icon: "→",
            tone: "sky",
        },

        delivered: {
            title: "Order Delivered",
            description:
                "Your order has been marked as delivered.",
            icon: "✓",
            tone: "emerald",
        },

        cancelled: {
            title: "Order Cancelled",
            description:
                "This order was cancelled.",
            icon: "×",
            tone: "rose",
        },

        rejected: {
            title: "Order Rejected",
            description:
                order.rejection_reason
                    ? `Reason: ${order.rejection_reason}`
                    : "The bakery was unable to accept this order.",
            icon: "×",
            tone: "rose",
        },
    };

    const timeline = useMemo(() => {
        const events = [];

        /*
         * ------------------------------------------------
         * ORDER CREATED
         * ------------------------------------------------
         */

        events.push({
            key: "order-created",
            type: "created",
            title: "Order Placed",
            description:
                "Your order was successfully submitted to Smiley Page Corner.",
            time: order.created_at,
            icon: "✓",
            tone: "brown",
        });

        /*
         * ------------------------------------------------
         * REAL STATUS HISTORY
         * ------------------------------------------------
         */

        const statusHistory =
            order.status_history || [];

        statusHistory.forEach((history) => {
            /*
             * pending_review is already represented by
             * "Order Placed", so avoid duplicate events.
             */
            if (
                history.status ===
                "pending_review"
            ) {
                return;
            }

            const details =
                statusDetails[
                history.status
                ] || {
                    title: history.status
                        .replaceAll("_", " "),
                    description:
                        "Your order status was updated.",
                    icon: "●",
                    tone: "brown",
                };

            events.push({
                key: `status-${history.id}`,
                type: "status",
                status: history.status,
                title: details.title,
                description:
                    details.description,
                time: history.created_at,
                icon: details.icon,
                tone: details.tone,
            });
        });

        /*
         * ------------------------------------------------
         * PAYMENTS
         * ------------------------------------------------
         *
         * IMPORTANT:
         * processed_at represents when PayMongo actually
         * confirmed the payment.
         *
         * created_at only represents when the checkout
         * record was initially created.
         */

        const successfulPayments = [
            ...(order.payments || []),
        ]
            .filter((payment) =>
                ["partial", "paid"].includes(
                    payment.status
                )
            )
            .sort((a, b) => {
                const dateA = new Date(
                    a.processed_at ||
                    a.updated_at ||
                    a.created_at
                );

                const dateB = new Date(
                    b.processed_at ||
                    b.updated_at ||
                    b.created_at
                );

                if (
                    dateA.getTime() ===
                    dateB.getTime()
                ) {
                    return (
                        Number(a.id) -
                        Number(b.id)
                    );
                }

                return dateA - dateB;
            });

        successfulPayments.forEach(
            (payment, index) => {
                events.push({
                    key: `payment-${payment.id}`,
                    type: "payment",

                    title:
                        `Payment Received #${index + 1
                        }`,

                    description:
                        "Your payment was confirmed by PayMongo.",

                    time:
                        payment.processed_at ||
                        payment.updated_at ||
                        payment.created_at,

                    icon: "₱",
                    tone: "emerald",

                    payment,
                    paymentNumber:
                        index + 1,

                    amount: Number(
                        payment.amount || 0
                    ),

                    tip: Number(
                        payment.tip || 0
                    ),
                });
            }
        );

        /*
         * ------------------------------------------------
         * OLD ORDERS FALLBACK
         * ------------------------------------------------
         *
         * Orders created before status-history tracking
         * cannot have their historical timestamps
         * reconstructed accurately.
         */

        if (
            statusHistory.length === 0 &&
            order.status &&
            order.status !==
            "pending_review"
        ) {
            const details =
                statusDetails[
                order.status
                ];

            if (details) {
                events.push({
                    key: "legacy-current-status",
                    type: "legacy-status",
                    title:
                        details.title,
                    description:
                        `${details.description} Previous status timestamps are unavailable for this older order.`,
                    time: null,
                    icon:
                        details.icon,
                    tone:
                        details.tone,
                });
            }
        }

        /*
         * ------------------------------------------------
         * FINAL CHRONOLOGICAL SORT
         * ------------------------------------------------
         */

        return events.sort((a, b) => {
            if (!a.time) return 1;
            if (!b.time) return -1;

            const difference =
                new Date(a.time) -
                new Date(b.time);

            if (difference !== 0) {
                return difference;
            }

            /*
             * Payment first when a payment and automatic
             * processing status happen at practically the
             * same moment.
             */
            if (
                a.type === "payment" &&
                b.type !== "payment"
            ) {
                return -1;
            }

            if (
                b.type === "payment" &&
                a.type !== "payment"
            ) {
                return 1;
            }

            return 0;
        });
    }, [order]);

    const getToneClasses = (tone) => {
        switch (tone) {
            case "emerald":
                return {
                    dot:
                        "bg-emerald-500",
                    ring:
                        "ring-emerald-100",
                    card:
                        "border-emerald-100 bg-emerald-50/40",
                    icon:
                        "text-emerald-700",
                };

            case "sky":
                return {
                    dot:
                        "bg-sky-500",
                    ring:
                        "ring-sky-100",
                    card:
                        "border-sky-100 bg-sky-50/40",
                    icon:
                        "text-sky-700",
                };

            case "orange":
                return {
                    dot:
                        "bg-[#d67b27]",
                    ring:
                        "ring-orange-100",
                    card:
                        "border-orange-100 bg-orange-50/40",
                    icon:
                        "text-[#d67b27]",
                };

            case "amber":
                return {
                    dot:
                        "bg-amber-500",
                    ring:
                        "ring-amber-100",
                    card:
                        "border-amber-100 bg-amber-50/40",
                    icon:
                        "text-amber-700",
                };

            case "rose":
                return {
                    dot:
                        "bg-rose-500",
                    ring:
                        "ring-rose-100",
                    card:
                        "border-rose-100 bg-rose-50/40",
                    icon:
                        "text-rose-700",
                };

            default:
                return {
                    dot:
                        "bg-[#844414]",
                    ring:
                        "ring-[#f3e1c6]",
                    card:
                        "border-[#f3e1c6] bg-[#fffdf9]",
                    icon:
                        "text-[#844414]",
                };
        }
    };

    return (
        <div
            className={
                embedded
                    ? ""
                    : "bg-white border border-[#f3e1c6] rounded-2xl p-6 shadow-sm"
            }
        >
            <div className="mb-6">
                <h2 className="text-lg font-black text-[#844414]">
                    Order Timeline
                </h2>

                <p className="mt-1 text-xs text-stone-400">
                    Follow the activity and progress
                    of your order.
                </p>
            </div>

            <div className="relative">
                {/* Main vertical line */}
                <div className="absolute left-[19px] top-3 bottom-3 w-px bg-stone-200" />

                <div className="space-y-5">
                    {timeline.map(
                        (event, index) => {
                            const tone =
                                getToneClasses(
                                    event.tone
                                );

                            const isLatest =
                                index ===
                                timeline.length -
                                1;

                            return (
                                <div
                                    key={
                                        event.key
                                    }
                                    className="relative flex gap-4"
                                >
                                    {/* Timeline Dot */}
                                    <div
                                        className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white ring-4 ${tone.ring}`}
                                    >
                                        <div
                                            className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-black text-white ${tone.dot}`}
                                        >
                                            {
                                                event.icon
                                            }
                                        </div>
                                    </div>

                                    {/* Event */}
                                    <div
                                        className={`min-w-0 flex-1 rounded-2xl border p-4 ${tone.card}`}
                                    >
                                        <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                                            <div>
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-sm font-black text-stone-800">
                                                        {
                                                            event.title
                                                        }
                                                    </h3>

                                                    {isLatest && (
                                                        <span className="rounded-full bg-white/80 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-[#d67b27]">
                                                            Latest
                                                        </span>
                                                    )}
                                                </div>

                                                <p className="mt-1 text-xs leading-relaxed text-stone-500">
                                                    {
                                                        event.description
                                                    }
                                                </p>
                                            </div>

                                            {event.time && (
                                                <time className="shrink-0 text-[11px] font-semibold text-stone-400">
                                                    {formatDate(
                                                        event.time
                                                    )}
                                                </time>
                                            )}
                                        </div>

                                        {/* PAYMENT DETAILS */}
                                        {event.type ===
                                            "payment" && (
                                                <div className="mt-3 rounded-xl border border-emerald-100 bg-white/80 p-3">
                                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                                        <div>
                                                            <p className="text-sm font-black text-stone-800">
                                                                ₱
                                                                {money(
                                                                    event.amount
                                                                )}
                                                            </p>

                                                            <p className="text-[11px] font-medium text-stone-400">
                                                                Applied
                                                                to
                                                                order
                                                            </p>

                                                            {event.tip >
                                                                0 && (
                                                                    <p className="mt-1 text-xs font-bold text-emerald-600">
                                                                        +
                                                                        ₱
                                                                        {money(
                                                                            event.tip
                                                                        )}{" "}
                                                                        tip
                                                                    </p>
                                                                )}
                                                        </div>

                                                        {onViewReceipt && (
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    onViewReceipt(
                                                                        event.payment
                                                                    )
                                                                }
                                                                className="w-full rounded-xl border border-[#d67b27] bg-white px-4 py-2 text-xs font-black text-[#d67b27] transition-colors hover:bg-orange-50 sm:w-auto cursor-pointer"
                                                            >
                                                                View
                                                                Receipt
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            )}

                                        {!event.time && (
                                            <p className="mt-2 text-[10px] font-semibold italic text-stone-400">
                                                Exact
                                                historical
                                                timestamp
                                                unavailable.
                                            </p>
                                        )}
                                    </div>
                                </div>
                            );
                        }
                    )}
                </div>
            </div>
        </div>
    );
}