import { useEffect, useId, useRef } from "react";
import { Cake, Cherry, Cookie, Flame, MessageSquare, Palette, Ruler, Sparkles, Wheat, X } from "lucide-react";

const MESSAGE_COLORS = {
    "#EF4444": "Red", "#FACC15": "Yellow", "#22C55E": "Green",
    "#3B82F6": "Blue", "#FFFFFF": "White", "#000000": "Black",
};

const ICING_COLORS = {
    "#3B1F18": "Chocolate", "#FFF7EA": "Vanilla Cream", "#F7A8C8": "Pink",
    "#B980F0": "Ube", "#AEE8D5": "Mint", "#F3C96B": "Caramel",
};

function ColorSwatch({ color, label }) {
    return (
        <span
            role="img"
            aria-label={`${label}: ${color}`}
            title={color}
            className="inline-block h-5 w-5 shrink-0 rounded-full border border-stone-300 shadow-sm"
            style={{ backgroundColor: color }}
        />
    );
}

function SpecificationRow({ Icon, label, children, divider = false }) {
    return (
        <div className={`flex items-start justify-between gap-4 py-1.5 ${divider ? "border-b border-dashed border-stone-200/60" : ""}`}>
            <dt className="flex shrink-0 items-center gap-1 font-medium text-stone-400">
                <Icon aria-hidden="true" className="h-[18px] w-[18px]" /> {label}
            </dt>
            <dd className="min-w-0 break-words text-right font-medium text-stone-700">{children}</dd>
        </div>
    );
}

export default function OrderItemDetailsModal({ item, onClose }) {
    const dialogRef = useRef(null);
    const titleId = useId();

    useEffect(() => {
        if (!item) return;
        const dialog = dialogRef.current;
        const previousFocus = document.activeElement;
        const previousOverflow = document.body.style.overflow;
        dialog.showModal();
        document.body.style.overflow = "hidden";
        return () => {
            dialog.close();
            document.body.style.overflow = previousOverflow;
            if (previousFocus?.isConnected) previousFocus.focus();
        };
    }, [item]);

    if (!item) return null;

    const details = item.customization || {};
    const message = details.inscription_text || details.message || "";
    const messageColor = details.inscription_color || "#EF4444";
    const messageColorName = MESSAGE_COLORS[messageColor.toUpperCase()] || "Custom";
    const icingColorName = ICING_COLORS[details.icing_color?.toUpperCase()] || "Custom";
    const candleLayout = details.topping_layout?.candle || {};
    const candleMode = details.candle_mode || candleLayout.mode || "gold";
    const candleColor = details.candle_color || candleLayout.color || "gold";
    const tierFlavors = Object.entries(details.tier_flavors || {});
    const addons = [
        ["candle", "Candle", Flame], ["chocolate", "Chocolate", Cookie],
        ["balls", "Balls", Sparkles], ["nuts", "Nuts", Wheat],
        ["cherry", "Cherry", Cherry], ["sprinkles", "Sprinkles", Sparkles],
    ].filter(([key]) => details[`has_${key}`]);

    return (
        <dialog
            ref={dialogRef}
            aria-labelledby={titleId}
            aria-modal="true"
            onCancel={(event) => { event.preventDefault(); onClose(); }}
            onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}
            className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-[660px] overflow-y-auto rounded-2xl border-0 bg-white p-0 shadow-2xl backdrop:bg-black/50"
        >
            <div className="relative p-5 sm:p-6">
                <button
                    type="button"
                    autoFocus
                    onClick={onClose}
                    aria-label="Close item details"
                    className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 text-stone-500 transition hover:bg-stone-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C05A11]"
                >
                    <X aria-hidden="true" className="h-5 w-5" />
                </button>

                <h2 id={titleId} className="break-words pr-9 text-2xl font-bold leading-tight text-[#844414]">
                    {item.product_name || "Custom Cake"}
                </h2>
                <p className="mt-2 text-xl font-medium text-[#d67b27]">₱{Number(item.price || 0).toFixed(2)}</p>

                <div className="mt-4 space-y-2 rounded-2xl border border-[#fdf0dc] bg-[#fffbf4] p-4 text-[15px] text-stone-600">
                    <dl>
                        <SpecificationRow Icon={Ruler} label="Size" divider>
                            {[details.tier, details.size].filter(Boolean).join(" — ") || "Not specified"}
                        </SpecificationRow>
                        <SpecificationRow Icon={Cake} label="Shape" divider>
                            <span className="capitalize">{details.shape || "Not specified"}</span>
                        </SpecificationRow>
                        <SpecificationRow Icon={Cake} label="Flavor" divider>
                            <span className="text-[#844414]">{details.flavor || "Not specified"}</span>
                        </SpecificationRow>
                    </dl>

                    {tierFlavors.length > 0 && (
                        <div>
                            <p className="font-medium text-stone-400">Tier Flavors</p>
                            <div className="mt-1 flex flex-wrap gap-1.5">
                                {tierFlavors.map(([tier, flavor]) => (
                                    <span key={tier} className="rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">{tier}: {flavor}</span>
                                ))}
                            </div>
                        </div>
                    )}

                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-2.5 text-stone-700">
                        <p className="inline-flex items-center gap-1 font-bold text-amber-800">
                            <MessageSquare aria-hidden="true" className="h-[18px] w-[18px]" /> Message:
                        </p>
                        <p className={`whitespace-pre-wrap break-words italic ${message ? "" : "text-stone-400"}`}>
                            {message ? `"${message}"` : "No message"}
                        </p>
                        <p className="mt-1 text-sm text-stone-500">Font: {details.text_font || "Default"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-500">
                            Message color:
                            <ColorSwatch color={messageColor} label={`Message color ${messageColorName}`} />
                            {messageColorName}
                        </div>
                    </div>

                    <dl>
                        <SpecificationRow Icon={Palette} label="Icing Color">
                            {details.icing_color ? (
                                <span className="flex items-center justify-end gap-2">
                                    <ColorSwatch color={details.icing_color} label={`Icing color ${icingColorName}`} /> {icingColorName}
                                </span>
                            ) : "Not specified"}
                        </SpecificationRow>
                        <SpecificationRow Icon={Palette} label="Color">
                            {details.cake_color ? <ColorSwatch color={details.cake_color} label="Base color" /> : "Not specified"}
                        </SpecificationRow>
                    </dl>

                    <div className="border-t border-stone-200/60 pt-2">
                        <p className="flex items-center gap-1 font-medium text-stone-400">
                            <Sparkles aria-hidden="true" className="h-[18px] w-[18px]" /> Add-ons
                        </p>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                            {addons.length ? addons.map(([key, label, Icon]) => {
                                const layout = details.topping_layout?.[key];
                                const count = Array.isArray(layout) ? layout.length : 1;
                                const description = key === "candle"
                                    ? candleMode === "number" ? ` — Number ${details.candle_number || 1} (${candleColor})` : " — Single (gold)"
                                    : count > 1 ? ` × ${count}` : "";
                                return (
                                    <span key={key} className="flex items-center gap-1 rounded-md border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                                        <Icon aria-hidden="true" className="h-3.5 w-3.5" /> {label}{description}
                                    </span>
                                );
                            }) : <span className="italic text-stone-400">None</span>}
                        </div>
                    </div>
                </div>
            </div>
        </dialog>
    );
}
