import { useEffect, useState } from "react";
import { AlertTriangle, X, MessageSquareText } from "lucide-react";

const reasonsList = [
    "Location not serviceable",
    "Cannot meet selected delivery date",
    "Incomplete delivery details",
    "Out of stock",
];

export default function RejectModal({ isOpen, onClose, onSubmit }) {
    const [selectedReason, setSelectedReason] = useState("");
    const [customReason, setCustomReason] = useState("");

    useEffect(() => {
        if (!isOpen) {
            setSelectedReason("");
            setCustomReason("");
        }
    }, [isOpen]);

    // Prevent background scrolling while the modal is open.
    useEffect(() => {
        if (!isOpen) return;

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        const handleEscape = (event) => {
            if (event.key === "Escape") onClose();
        };

        window.addEventListener("keydown", handleEscape);

        return () => {
            document.body.style.overflow = previousOverflow;
            window.removeEventListener("keydown", handleEscape);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const finalReason = customReason.trim() || selectedReason;

    const handleSubmit = (event) => {
        event.preventDefault();

        if (!finalReason) {
            alert("Please select or enter a reason for the customer.");
            return;
        }

        onSubmit(finalReason);
    };

    return (
        <div
            className="fixed inset-0 z-[9999] flex items-end justify-center bg-[#241710]/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}
        >
            <form
                onSubmit={handleSubmit}
                className="flex max-h-[88dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[24px] border border-[#EADFD2] bg-[#FFFCF7] shadow-2xl sm:max-h-[85dvh] sm:rounded-[24px]"
                role="dialog"
                aria-modal="true"
                aria-labelledby="reject-modal-title"
                aria-describedby="reject-modal-description"
            >
                {/* Compact header */}
                <div className="flex shrink-0 items-start gap-3 border-b border-[#EFE5D9] px-5 py-4 sm:px-6">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FCE9E7] text-[#B74743]">
                        <AlertTriangle size={21} strokeWidth={2.2} />
                    </div>

                    <div className="min-w-0 flex-1 pt-0.5">
                        <h2
                            id="reject-modal-title"
                            className="text-lg font-extrabold tracking-tight text-[#39251B]"
                        >
                            Reject Order?
                        </h2>
                        <p
                            id="reject-modal-description"
                            className="mt-1 text-xs leading-relaxed text-[#806E60]"
                        >
                            Choose a reason to explain the decision to your customer.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close rejection modal"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#806E60] transition hover:bg-[#F1E7DB] hover:text-[#39251B]"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Scrollable content keeps the modal compact on small screens */}
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
                    <div className="mb-4">
                        <div className="mb-2 flex items-center justify-between gap-2">
                            <span className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#806E60]">
                                Quick reasons
                            </span>
                            <span className="text-[10px] text-[#A18D7C]">
                                Select one
                            </span>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {reasonsList.map((reason) => {
                                const isSelected = selectedReason === reason;

                                return (
                                    <button
                                        key={reason}
                                        type="button"
                                        aria-pressed={isSelected}
                                        onClick={() => {
                                            setSelectedReason(reason);
                                            setCustomReason("");
                                        }}
                                        className={`rounded-xl border px-3 py-2.5 text-left text-xs font-semibold leading-relaxed transition-colors ${
                                            isSelected
                                                ? "border-[#B75A1A] bg-[#F7E9DC] text-[#793B16] ring-1 ring-[#B75A1A]/20"
                                                : "border-[#EADFD2] bg-white text-[#594438] hover:border-[#D6B99E] hover:bg-[#FAF3EB]"
                                        }`}
                                    >
                                        <span className="flex items-center gap-2">
                                            <span
                                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                                                    isSelected
                                                        ? "border-[#B75A1A] bg-[#B75A1A]"
                                                        : "border-[#D6C7B8] bg-white"
                                                }`}
                                            >
                                                {isSelected && (
                                                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                                                )}
                                            </span>
                                            {reason}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <label
                            htmlFor="reject-custom-reason"
                            className="mb-2 flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.12em] text-[#806E60]"
                        >
                            <MessageSquareText size={14} />
                            Custom message
                            <span className="font-medium normal-case tracking-normal text-[#A18D7C]">
                                (optional)
                            </span>
                        </label>

                        <textarea
                            id="reject-custom-reason"
                            placeholder="Write a specific reason for the customer..."
                            value={customReason}
                            onChange={(event) => {
                                setCustomReason(event.target.value);
                                if (event.target.value.trim()) {
                                    setSelectedReason("");
                                }
                            }}
                            maxLength={500}
                            rows={2}
                            className="block min-h-[76px] w-full resize-y rounded-xl border border-[#EADFD2] bg-white px-3.5 py-3 text-sm text-[#39251B] outline-none transition placeholder:text-[#B3A292] focus:border-[#B75A1A] focus:ring-2 focus:ring-[#B75A1A]/15"
                        />
                        <p className="mt-1 text-right text-[10px] text-[#A18D7C]">
                            {customReason.length}/500
                        </p>
                    </div>
                </div>

                {/* Actions stay visible while the content scrolls */}
                <div className="flex shrink-0 flex-col gap-2 border-t border-[#EFE5D9] bg-[#FFFCF7] px-5 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 sm:px-6 sm:pb-5">
                    <button
                        type="submit"
                        disabled={!finalReason}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#B74743] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#9E3936] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B74743] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-45"
                    >
                        <AlertTriangle size={16} />
                        Confirm Rejection
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-9 w-full rounded-xl px-4 py-2 text-sm font-semibold text-[#806E60] transition hover:bg-[#F1E7DB] hover:text-[#39251B]"
                    >
                        Cancel and go back
                    </button>
                </div>
            </form>
        </div>
    );
}