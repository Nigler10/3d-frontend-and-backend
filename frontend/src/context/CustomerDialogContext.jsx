import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";

const CustomerDialogContext = createContext(null);

const toneStyles = {
    info: {
        icon: Info,
        iconClass: "bg-amber-50 text-amber-700",
        actionClass: "bg-[#844414] hover:bg-[#6f3710]",
    },
    success: {
        icon: CheckCircle2,
        iconClass: "bg-amber-50 text-amber-700",
        actionClass: "bg-[#844414] hover:bg-[#6f3710]",
    },
    error: {
        icon: AlertCircle,
        iconClass: "bg-amber-50 text-amber-700",
        actionClass: "bg-[#844414] hover:bg-[#6f3710]",
    },
    danger: {
        icon: AlertTriangle,
        iconClass: "bg-amber-50 text-amber-700",
        actionClass: "bg-[#844414] hover:bg-[#6f3710]",
    },
};

export function CustomerDialogProvider({ children }) {
    const [dialog, setDialog] = useState(null);
    const resolveRef = useRef(null);

    const closeDialog = (result) => {
        resolveRef.current?.(result);
        resolveRef.current = null;
        setDialog(null);
    };

    const openDialog = (type, message, options = {}) => new Promise((resolve) => {
        resolveRef.current = resolve;
        setDialog({
            type,
            message: String(message ?? ""),
            title: options.title || (type === "confirm" ? "Please confirm" : "Notice"),
            tone: options.tone || "info",
            confirmLabel: options.confirmLabel || (type === "confirm" ? "Continue" : "Okay"),
            cancelLabel: options.cancelLabel || "Cancel",
        });
    });

    const showAlert = (message, options) => openDialog("alert", message, options);
    const showConfirm = (message, options) => openDialog("confirm", message, options);

    useEffect(() => {
        if (!dialog) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === "Escape") closeDialog(false);
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [dialog]);

    const visual = toneStyles[dialog?.tone] || toneStyles.info;
    const Icon = visual.icon;

    return (
        <CustomerDialogContext.Provider value={{ showAlert, showConfirm }}>
            {children}
            {dialog && (
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-[2px]"
                    onMouseDown={(event) => {
                        if (event.target === event.currentTarget) closeDialog(false);
                    }}
                >
                    <section
                        aria-labelledby="customer-dialog-title"
                        aria-describedby="customer-dialog-message"
                        aria-modal="true"
                        className="w-full max-w-md overflow-hidden rounded-2xl border border-[#f3e1c6] bg-white shadow-2xl"
                        role="alertdialog"
                    >
                        <div className="flex items-start gap-4 p-6 sm:p-7">
                            <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${visual.iconClass}`}>
                                <Icon aria-hidden="true" className="h-6 w-6" />
                            </div>
                            <div className="min-w-0 flex-1 pt-1">
                                <div className="flex items-start justify-between gap-3">
                                    <h2 id="customer-dialog-title" className="text-lg font-black text-[#422719]">
                                        {dialog.title}
                                    </h2>
                                    <button
                                        aria-label="Close dialog"
                                        className="-mr-2 -mt-1 rounded-lg p-2 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700"
                                        onClick={() => closeDialog(false)}
                                        type="button"
                                    >
                                        <X aria-hidden="true" className="h-4 w-4" />
                                    </button>
                                </div>
                                <p id="customer-dialog-message" className="mt-2 whitespace-pre-line text-sm leading-6 text-stone-600">
                                    {dialog.message}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col-reverse gap-2 border-t border-[#f3e1c6] bg-[#fffdf9] px-6 py-4 sm:flex-row sm:justify-end sm:px-7">
                            {dialog.type === "confirm" && (
                                <button
                                    className="rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm font-bold text-stone-700 transition hover:bg-stone-50"
                                    onClick={() => closeDialog(false)}
                                    type="button"
                                >
                                    {dialog.cancelLabel}
                                </button>
                            )}
                            <button
                                autoFocus
                                className={`rounded-lg px-5 py-2.5 text-sm font-bold text-white transition ${visual.actionClass}`}
                                onClick={() => closeDialog(true)}
                                type="button"
                            >
                                {dialog.confirmLabel}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </CustomerDialogContext.Provider>
    );
}

export function useCustomerDialog() {
    const context = useContext(CustomerDialogContext);

    if (!context) {
        throw new Error("useCustomerDialog must be used within CustomerDialogProvider");
    }

    return context;
}