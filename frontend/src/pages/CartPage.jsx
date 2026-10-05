import { useCart } from "../context/CartContext";
import { Link, useNavigate } from "react-router-dom";
import {
    ShoppingBag,
    Cake,
    Flame,
    Cookie,
    Sparkles,
    Wheat,
    Cherry,
    Ruler,
    MessageSquare,
    Palette,
} from "lucide-react";

const INSCRIPTION_COLOR_NAMES = {
    "#EF4444": "Red",
    "#FACC15": "Yellow",
    "#22C55E": "Green",
    "#3B82F6": "Blue",
    "#FFFFFF": "White",
    "#000000": "Black",
};

const ICING_COLOR_NAMES = {
    "#3B1F18": "Chocolate",
    "#FFF7EA": "Vanilla Cream",
    "#F7A8C8": "Pink",
    "#B980F0": "Ube",
    "#AEE8D5": "Mint",
    "#F3C96B": "Caramel",
};

function CartPage() {
    const { cartItems, total, removeFromCart, updateQuantity } = useCart();
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;

    const handleSingleCheckout = (item) => {
        navigate("/checkout", { state: { directBuyItem: item } });
    };

    return (
        <div className="min-h-screen bg-[#fffdf9] py-12 px-4 sm:px-6 lg:px-8 text-stone-800">
            <div className="max-w-6xl mx-auto">
                <h1 className="text-3xl font-extrabold text-[#844414] tracking-tight mb-8 border-b border-[#f3e1c6] pb-4">
                    Your Sweet Bag
                </h1>

                {cartItems.length === 0 ? (
                    <div className="text-center py-16 bg-white border border-[#f3e1c6] rounded-2xl shadow-sm p-8 max-w-md mx-auto">
                        <ShoppingBag className="w-12 h-12 text-[#d67b27] mx-auto mb-4" />
                        <p className="text-xl font-medium text-stone-600 mb-6">Your bag is empty!</p>
                        <Link 
                            to="/products" 
                            className="inline-block bg-[#d67b27] hover:bg-[#b56219] text-white font-medium px-6 py-3 rounded-xl transition-all duration-200 shadow-sm hover:shadow"
                        >
                            Browse Cakes
                        </Link>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                        {/* Cart Items List */}
                        <div className="lg:col-span-2 space-y-6">
                            {cartItems.map((item) => (
                                <div key={item.id} className="bg-white border border-[#f3e1c6] shadow-sm rounded-2xl p-5 hover:shadow-md transition-all duration-300">

                                    <div className="flex flex-col sm:flex-row gap-5 items-start pb-5 border-b border-stone-100">

                                        {/* Image wrapper */}
                                        <div className="w-24 h-24 sm:w-28 sm:h-28 flex-shrink-0 bg-[#fffbf4] border border-[#f5e9d6] rounded-xl flex items-center justify-center overflow-hidden">
                                            {item.is_custom_cake ? (
                                                <Cake className="w-10 h-10 text-[#d67b27] animate-bounce" />
                                            ) : (
                                                <img
                                                    src={`${BASEURL}${item.product_image}`}
                                                    alt={item.item_name}
                                                    className="w-full h-full object-cover"
                                                />
                                            )}
                                        </div>

                                        {/* Item info */}
                                        <div className="flex-1 min-w-0">
                                            <h2 className="text-lg font-bold text-[#844414] truncate">{item.item_name}</h2>

                                            <p className="text-base font-semibold text-[#d67b27] mt-0.5">
                                                ₱{Number(item.item_unit_price).toFixed(2)}
                                            </p>

                                            {item.is_custom_cake && (() => {
                                                const d = item.customization_detail;
                                                const tierFlavors = Object.entries(d.tier_flavors || {});
                                                const candleLayout = d.topping_layout?.candle || {};
                                                const candleMode = d.candle_mode || candleLayout.mode || "gold";
                                                const candleColor = d.candle_color || candleLayout.color || "gold";
                                                const messageText = d.inscription_text || d.message || "";
                                                const messageColor = d.inscription_color || "#EF4444";
                                                const messageColorName = INSCRIPTION_COLOR_NAMES[messageColor.toUpperCase()] || "Custom";
                                                const icingColorName = ICING_COLOR_NAMES[d.icing_color?.toUpperCase()] || "Custom";
                                                const candleDescription = d.has_candle
                                                    ? candleMode === "number"
                                                        ? `Number ${d.candle_number || 1} (${candleColor})`
                                                        : "Single (gold)"
                                                    : null;
                                                const addons = [
                                                    d.has_candle    && { label: "Candle", Icon: Flame },
                                                    d.has_chocolate && { label: "Chocolate", Icon: Cookie },
                                                    d.has_balls     && { label: "Balls", Icon: Sparkles },
                                                    d.has_nuts      && { label: "Nuts", Icon: Wheat },
                                                    d.has_cherry    && { label: "Cherry", Icon: Cherry },
                                                    d.has_sprinkles && { label: "Sprinkles", Icon: Sparkles },
                                                ].filter(Boolean);

                                                return (
                                                    <div className="mt-3 bg-[#fffbf4] border border-[#fdf3e3] rounded-xl p-3 space-y-2 text-xs text-stone-600">
                                                        {/* Tier & Size */}
                                                        {(d.tier || d.size) && (
                                                            <div className="flex justify-between border-b border-dashed border-stone-200/60 pb-1">
                                                                <span className="font-medium text-stone-400 flex items-center gap-1"><Ruler className="w-3.5 h-3.5" /> Size</span>
                                                                <span className="font-semibold text-stone-700">
                                                                    {d.tier}{d.tier && d.size ? " — " : ""}{d.size}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Shape */}
                                                        <div className="flex justify-between border-b border-dashed border-stone-200/60 pb-1">
                                                            <span className="font-medium text-stone-400 flex items-center gap-1"><Cake className="w-3.5 h-3.5" /> Shape</span>
                                                            <span className="font-semibold text-stone-700 capitalize">{d.shape}</span>
                                                        </div>

                                                        {/* Flavor */}
                                                        <div className="flex justify-between border-b border-dashed border-stone-200/60 pb-1">
                                                            <span className="font-medium text-stone-400 flex items-center gap-1"><Cake className="w-3.5 h-3.5" /> Flavor</span>
                                                            <span className="font-semibold text-[#844414]">{d.flavor}</span>
                                                        </div>

                                                        {tierFlavors.length > 0 && (
                                                            <div className="flex flex-col gap-1 pt-1">
                                                                <span className="font-medium text-stone-400">Tier Flavors</span>
                                                                <div className="flex flex-wrap gap-1.5 mt-0.5">
                                                                    {tierFlavors.map(([tierName, tierFlavor]) => (
                                                                        <span key={tierName} className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-md font-medium text-[11px]">
                                                                            {tierName}: {tierFlavor}
                                                                        </span>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        )}

                                                        {d.has_candle && (
                                                            <div className="flex justify-between items-center pt-1">
                                                                <span className="font-medium text-stone-400 flex items-center gap-1"><Flame className="w-3.5 h-3.5" /> Candle</span>
                                                                <span className="font-semibold text-stone-700">{candleDescription}</span>
                                                            </div>
                                                        )}

                                                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2 mt-1 text-stone-700">
                                                            <span className="font-bold text-amber-800 mr-1 inline-flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" /> Message:</span>
                                                            <span className={messageText ? "italic" : "italic text-stone-400"}>
                                                                {messageText ? `"${messageText}"` : "No message"}
                                                            </span>
                                                            <span className="block mt-1 text-[11px] text-stone-500">
                                                                Font: {d.text_font || "Default"}
                                                            </span>
                                                            <span className="flex items-center gap-2 mt-1 text-[11px] text-stone-500">
                                                                Message color:
                                                                <span
                                                                    className="w-3.5 h-3.5 rounded-full border border-stone-300 shadow-sm"
                                                                    style={{ backgroundColor: messageColor }}
                                                                    aria-label={`Message color ${messageColorName}`}
                                                                />
                                                                {messageColorName}
                                                            </span>
                                                        </div>

                                                        {d.has_candle && candleMode === "number" && (
                                                            <div className="text-[11px] text-stone-500 pt-1">
                                                                Number candle color: {candleColor}
                                                            </div>
                                                        )}

                                                        {d.icing_color && (
                                                            <div className="flex justify-between items-center pt-1">
                                                                <span className="font-medium text-stone-400 flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> Icing Color</span>
                                                                <span className="flex items-center gap-2 font-semibold text-stone-700">
                                                                    <span
                                                                        className="w-4 h-4 rounded-full border border-stone-300 shadow-sm"
                                                                        style={{ background: d.icing_color }}
                                                                    />
                                                                    {icingColorName}
                                                                </span>
                                                            </div>
                                                        )}

                                                        {/* Cake Color */}
                                                        <div className="flex justify-between items-center pt-1">
                                                            <span className="font-medium text-stone-400 flex items-center gap-1"><Palette className="w-3.5 h-3.5" /> Color</span>
                                                            <span className="flex items-center">
                                                                <span
                                                                    className="w-4 h-4 rounded-full border border-stone-300 shadow-sm"
                                                                    style={{ background: d.cake_color }}
                                                                />
                                                            </span>
                                                        </div>

                                                        {/* Add-ons */}
                                                        <div className="flex flex-col gap-1 pt-2 border-t border-stone-200/60">
                                                            <span className="font-medium text-stone-400 flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Add-ons</span>
                                                            <div className="flex flex-wrap gap-1.5 mt-0.5">
                                                                {addons.length > 0
                                                                    ? addons.map(a => (
                                                                        <span key={a.label} className="bg-stone-100 text-stone-700 px-2 py-0.5 rounded-md font-medium text-[11px] border border-stone-200 flex items-center gap-1">
                                                                            <a.Icon className="w-3 h-3" /> {a.label}
                                                                        </span>
                                                                    ))
                                                                    : <span className="text-stone-400 italic">None</span>
                                                                }
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })()}

                                        </div>

                                        {/* Quantity Selector */}
                                        <div className="flex items-center space-x-1 bg-stone-100 p-1 rounded-xl self-end sm:self-start">
                                            <button 
                                                onClick={() => updateQuantity(item.id, item.quantity - 1)}
                                                className="w-8 h-8 flex items-center justify-center font-bold text-stone-600 hover:bg-white rounded-lg transition-colors"
                                            >
                                                -
                                            </button>
                                            <span className="w-8 text-center font-semibold text-sm text-stone-800">{item.quantity}</span>
                                            <button 
                                                onClick={() => updateQuantity(item.id, item.quantity + 1)}
                                                className="w-8 h-8 flex items-center justify-center font-bold text-stone-600 hover:bg-white rounded-lg transition-colors"
                                            >
                                                +
                                            </button>
                                        </div>

                                    </div>

                                    {/* Action Footers */}
                                    <div className="flex justify-between items-center mt-4 pt-1">
                                        <button
                                            className="text-sm font-medium text-stone-400 hover:text-rose-600 transition-colors"
                                            onClick={() => removeFromCart(item.id)}
                                        >
                                            Remove Item
                                        </button>

                                        <button
                                            className="text-xs bg-amber-50 hover:bg-[#d67b27] text-[#d67b27] hover:text-white font-semibold px-3 py-2 rounded-lg border border-[#f3e1c6] transition-all duration-200"
                                            onClick={() => handleSingleCheckout(item)}
                                        >
                                            Checkout This Cake Only
                                        </button>
                                    </div>

                                </div>
                            ))}
                        </div>

                        {/* Order Summary Sidebar */}
                        <div className="bg-white border border-[#f3e1c6] shadow-sm rounded-2xl p-6 sticky top-6">
                            <h3 className="text-lg font-bold text-[#844414] mb-4 border-b border-stone-100 pb-2">Order Summary</h3>

                            <div className="space-y-3 mb-6 text-sm">
                                <div className="flex justify-between text-stone-500">
                                    <span>Subtotal</span>
                                    <span className="font-medium text-stone-800">₱{Number(total).toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between text-stone-500">
                                    <span>Estimated Delivery</span>
                                    <span className="text-emerald-600 font-medium">Calculated at next step</span>
                                </div>
                                <div className="border-t border-dashed border-stone-200 pt-3 flex justify-between items-baseline">
                                    <span className="text-base font-bold text-stone-800">Total</span>
                                    <span className="text-2xl font-black text-[#844414]">₱{Number(total).toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                className="w-full bg-[#d67b27] hover:bg-[#b56219] text-white font-bold py-3.5 rounded-xl transition-colors duration-200 shadow-sm hover:shadow text-center text-sm tracking-wide"
                                onClick={() => navigate("/checkout")}
                            >
                                Checkout All Items
                            </button>

                            <p className="text-center text-[11px] text-stone-400 mt-3">Prices include localized VAT taxes</p>
                        </div>

                    </div>
                )}
            </div>
        </div>
    );
}

export default CartPage;