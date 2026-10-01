// src/components/ProductCard.jsx
import { getMediaUrl } from "../utils/media";
import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { useCart } from "../context/CartContext";

function ProductCard({ product }) {
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const navigate = useNavigate();
    const { addToCart } = useCart(); // 2. Access the function from context
    const [showSuccess, setShowSuccess] = useState(false);

    const handleAddToCart = async (e) => {
        // StopPropagation prevents the card's onClick (navigate) from firing
        e.stopPropagation();

        // 3. Add authentication check 
        if (!localStorage.getItem('access_token')) {
            navigate("/login");
            return;
        }

        // 4. Perform the action and show feedback only after the request succeeds
        const result = await addToCart(product.id);

        if (result?.success) {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
        }
    };

    return (
        <div
            className="group bg-white border border-[#f3e1c6] rounded-2xl p-4 flex flex-col justify-between shadow-sm hover:shadow-md transition-all duration-300 cursor-pointer overflow-hidden transform hover:-translate-y-1"
            onClick={() => navigate(`/product/${product.id}`)}
        >
            {showSuccess && (
                <div
                    role="status"
                    aria-live="polite"
                    className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl bg-[#2E7D32] px-5 py-3.5 text-sm font-semibold text-white shadow-xl"
                >
                    <span aria-hidden="true">✓</span>
                    Added to cart!
                </div>
            )}

            {/* Image Area */}
            <div className="relative w-full aspect-square bg-[#fffdf9] rounded-xl border border-stone-100 flex items-center justify-center overflow-hidden">
                <img
                    src={getMediaUrl(product.image, BASEURL)}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="max-h-[85%] max-w-[85%] object-contain transition-transform duration-500 group-hover:scale-105"
                />

                <div className="absolute inset-0 bg-stone-900/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                    <span className="bg-white/95 text-stone-700 text-xs font-bold px-3 py-1.5 rounded-full shadow-sm tracking-wide opacity-0 group-hover:opacity-100 transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 delay-75">
                        View Details
                    </span>
                </div>
            </div>

            {/* Typography Content */}
            <div className="flex flex-col flex-1 mt-4 text-center">
                <h3 className="text-base font-bold text-[#844414] tracking-tight mb-1 truncate px-1">
                    {product.name}
                </h3>

                <p className="text-sm font-black text-[#d67b27] mb-4">
                    ₱{Number(product.price).toLocaleString()}
                </p>

                {/* Functional Action Button */}
                <div className="w-full mt-auto">
                    <button
                        onClick={handleAddToCart}
                        className="w-full bg-[#d67b27] hover:bg-[#b56219] text-white font-black py-2.5 px-4 rounded-full transition-colors duration-200 text-xs uppercase tracking-wider shadow-sm"
                    >
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ProductCard;