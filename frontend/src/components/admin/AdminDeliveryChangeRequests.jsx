// src/components/admin/AdminDeliveryChangeRequests.jsx
import { useState } from "react";
import {
    CheckCircle2,
    Clock,
    XCircle,
} from "lucide-react";

import { authFetch } from "../../utils/auth";

function formatDeliveryDate(value) {
    if (!value) return "N/A";

    return new Date(`${value}T00:00:00`).toLocaleDateString(
        undefined,
        {
            year: "numeric",
            month: "long",
            day: "numeric",
        }
    );
}

function formatDeliveryTime(value) {
    if (!value) return "N/A";

    const [hours, minutes] = value.slice(0, 5).split(":").map(Number);

    const period = hours >= 12 ? "PM" : "AM";
    const display = hours === 0
        ? 12
        : hours > 12
            ? hours - 12
            : hours;

    return `${display}:${String(minutes).padStart(2, "0")} ${period}`;
}

function formatAddress(details) {
    return [
        details.street,
        details.barangay,
        details.city,
        details.province,
        details.region,
        details.postal_code,
    ].filter(Boolean).join(", ") || "No address provided";
}

function DetailComparison({ original, requested }) {
    const rows = [
        {
            label: "Recipient",
            before: original.full_name,
            after: requested.full_name,
        },
        {
            label: "Contact",
            before: original.phone,
            after: requested.phone,
        },
        {
            label: "Delivery Date",
            before: formatDeliveryDate(original.delivery_date),
            after: formatDeliveryDate(requested.delivery_date),
        },
        {
            label: "Delivery Time",
            before: formatDeliveryTime(original.delivery_time),
            after: formatDeliveryTime(requested.delivery_time),
        },
        {
            label: "Address",
            before: formatAddress(original),
            after: formatAddress(requested),
        },
    ];

    return (
        <div className="overflow-hidden rounded-xl border border-stone-200">
            <div className="grid grid-cols-2 bg-stone-50 text-[10px] font-black uppercase tracking-wider text-stone-500">
                <div className="border-r border-stone-200 p-3">
                    Original Details
                </div>

                <div className="p-3">
                    Proposed Details
                </div>
            </div>

            {rows.map((row) => {
                const changed = row.before !== row.after;

                return (
                    <div
                        key={row.label}
                        className="grid grid-cols-2 border-t border-stone-100"
                    >
                        <div className="border-r border-stone-100 p-3">
                            <p className="mb-1 text-[10px] font-bold uppercase text-stone-400">
                                {row.label}
                            </p>

                            <p className="break-words text-xs leading-relaxed text-stone-600">
                                {row.before || "N/A"}
                            </p>
                        </div>

                        <div className="p-3">
                            <p className="mb-1 flex items-center gap-1 text-[10px] font-bold uppercase text-stone-400">
                                {row.label}

                                {changed && (
                                    <span className="text-[#d67b27]">
                                        · Changed
                                    </span>
                                )}
                            </p>

                            <p
                                className={`break-words text-xs leading-relaxed ${changed
                                        ? "font-bold text-[#844414]"
                                        : "text-stone-600"
                                    }`}
                            >
                                {row.after || "N/A"}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default function AdminDeliveryChangeRequests({
    order,
    onUpdated,
}) {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    const [rejectingId, setRejectingId] = useState(null);
    const [adminNote, setAdminNote] = useState("");
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState("");

    const requests = order.delivery_change_requests || [];

    const handleReview = async (changeRequest, action) => {
        if (busyId) return;

        if (action === "rejected" && !adminNote.trim()) {
            setError("Please provide a reason for rejecting this request.");
            return;
        }

        setBusyId(changeRequest.id);
        setError("");

        try {
            const res = await authFetch(
                `${BASEURL}/api/orders/admin/orders/${order.id}/delivery-change-requests/${changeRequest.id}/review/`,
                {
                    method: "PATCH",
                    body: JSON.stringify({
                        status: action,
                        admin_note: adminNote.trim(),
                    }),
                }
            );

            const data = await res.json();

            if (!res.ok) {
                setError(
                    data.error ||
                    data.details ||
                    "Unable to review this delivery change request."
                );
                return;
            }

            setRejectingId(null);
            setAdminNote("");

            await onUpdated?.();

        } catch {
            setError("Unable to connect to the server. Please try again.");
        } finally {
            setBusyId(null);
        }
    };

    if (requests.length === 0) return null;

    return (
        <section className="rounded-2xl border border-[#E6CCA2] bg-white p-6 space-y-5">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h3 className="font-black text-[#6E473B]">
                        Delivery Change Requests
                    </h3>

                    <p className="mt-1 text-xs text-[#A07060]">
                        Review the customer's proposed delivery changes.
                    </p>
                </div>

                <span className="rounded-full bg-[#FCF8EE] px-3 py-1 text-xs font-black text-[#6E473B]">
                    {requests.filter((item) => item.status === "pending").length} Pending
                </span>
            </div>

            {requests.map((changeRequest) => {
                const isPending = changeRequest.status === "pending";
                const isBusy = busyId === changeRequest.id;

                return (
                    <div
                        key={changeRequest.id}
                        className="rounded-2xl border border-[#E6CCA2]/70 p-4 sm:p-5 space-y-4"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-black text-[#6E473B]">
                                    Request #{changeRequest.id}
                                </p>

                                <p className="mt-1 text-xs text-[#A07060]">
                                    Submitted by {changeRequest.requested_by_name}
                                </p>
                            </div>

                            <span
                                className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase ${changeRequest.status === "approved"
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : changeRequest.status === "rejected"
                                            ? "border-rose-200 bg-rose-50 text-rose-700"
                                            : "border-amber-200 bg-amber-50 text-amber-700"
                                    }`}
                            >
                                {changeRequest.status}
                            </span>
                        </div>

                        <DetailComparison
                            original={changeRequest.original_details}
                            requested={changeRequest.requested_details}
                        />

                        {changeRequest.admin_note && (
                            <div className="rounded-xl bg-stone-50 p-3">
                                <p className="text-[10px] font-black uppercase tracking-wider text-stone-400">
                                    Admin Response
                                </p>

                                <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-stone-600">
                                    {changeRequest.admin_note}
                                </p>
                            </div>
                        )}

                        {isPending && (
                            <div className="space-y-3 border-t border-stone-100 pt-4">

                                {rejectingId === changeRequest.id && (
                                    <div className="space-y-2">
                                        <label className="block text-xs font-bold text-stone-600">
                                            Reason for rejection *
                                        </label>

                                        <textarea
                                            value={adminNote}
                                            onChange={(e) =>
                                                setAdminNote(e.target.value)
                                            }
                                            rows={3}
                                            placeholder="Explain why the requested delivery changes cannot be accommodated..."
                                            className="w-full resize-none rounded-xl border border-stone-200 p-3 text-sm outline-none focus:border-[#C05A11]"
                                        />
                                    </div>
                                )}

                                {error && (
                                    <p className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
                                        {error}
                                    </p>
                                )}

                                <div className="flex flex-col gap-2 sm:flex-row">
                                    {rejectingId === changeRequest.id ? (
                                        <>
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => handleReview(changeRequest, "rejected")}
                                                className="flex-1 rounded-xl bg-rose-600 px-4 py-3 text-xs font-black text-white transition hover:bg-rose-700 disabled:opacity-50"
                                            >
                                                {isBusy ? "Processing..." : "Confirm Rejection"}
                                            </button>

                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => {
                                                    setRejectingId(null);
                                                    setAdminNote("");
                                                    setError("");
                                                }}
                                                className="rounded-xl border border-stone-200 px-4 py-3 text-xs font-bold text-stone-600 hover:bg-stone-50"
                                            >
                                                Back
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => handleReview(changeRequest, "approved")}
                                                className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-[#6E473B] px-4 py-3 text-xs font-black text-white transition hover:bg-[#513328] disabled:opacity-50"
                                            >
                                                <CheckCircle2 className="h-4 w-4" />
                                                {isBusy ? "Processing..." : "Approve Changes"}
                                            </button>

                                            <button
                                                type="button"
                                                disabled={isBusy}
                                                onClick={() => {
                                                    setRejectingId(changeRequest.id);
                                                    setAdminNote("");
                                                    setError("");
                                                }}
                                                className="flex-1 flex items-center justify-center gap-2 rounded-xl border border-rose-200 px-4 py-3 text-xs font-black text-rose-600 transition hover:bg-rose-50 disabled:opacity-50"
                                            >
                                                <XCircle className="h-4 w-4" />
                                                Reject Request
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {!isPending && (
                            <p className="flex items-center gap-1.5 text-[11px] text-stone-400">
                                <Clock className="h-3.5 w-3.5" />
                                Reviewed by {changeRequest.reviewed_by_name || "Admin"}
                                {changeRequest.reviewed_at
                                    ? ` · ${new Date(changeRequest.reviewed_at).toLocaleString()}`
                                    : ""}
                            </p>
                        )}
                    </div>
                );
            })}
        </section>
    );
}