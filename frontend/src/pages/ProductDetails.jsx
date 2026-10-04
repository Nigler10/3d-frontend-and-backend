// src/pages/ProductDetails.jsx
import { useParams, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useCart } from '../context/CartContext';
import StarRating from "../components/StarRating";
import { getMediaUrl } from "../utils/media";
import ProductReviews from "../components/ProductReviews";

function ProductDetails() {
    const { id } = useParams();
    const navigate = useNavigate();
    const BASEURL = import.meta.env.VITE_DJANGO_BASE_URL;
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showSuccess, setShowSuccess] = useState(false);
    const [reviewData, setReviewData] = useState({
        average_rating: 0,
        review_count: 0,
        reviews: [],
    });
    const { addToCart } = useCart();

    useEffect(() => {
        fetch(`${BASEURL}/api/products/${id}/`)
            .then((response) => {
                if (!response.ok) throw new Error("Failed to fetch product details");
                return response.json();
            })
            .then((data) => {
                setProduct(data);
                setLoading(false);
            })
            .catch((error) => {
                setError(error.message);
                setLoading(false);
            });
    }, [id, BASEURL]);

    useEffect(() => {
        fetch(`${BASEURL}/api/orders/products/${id}/reviews/`)
            .then((res) => {
                if (!res.ok) {
                    throw new Error("Failed to fetch product reviews");
                }

                return res.json();
            })
            .then((data) => {
                setReviewData({
                    average_rating: data.average_rating || 0,
                    review_count: data.review_count || 0,
                    reviews: data.reviews || [],
                });
            })
            .catch((err) => {
                console.error(err);
            });
    }, [id, BASEURL]);

    const handleAddToCart = async () => {
        if (!localStorage.getItem('access_token')) {
            navigate("/login");
            return;
        }

        const result = await addToCart(product.id);

        if (result?.success) {
            setShowSuccess(true);
            setTimeout(() => setShowSuccess(false), 2000);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-[#fffdf9] flex flex-col items-center justify-center text-center p-6">
                <div className="text-5xl animate-spin mb-4">🎂</div>
                <h3 className="text-xl font-bold text-[#844414] animate-pulse">Preparing the details...</h3>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-[#fffdf9] flex flex-col items-center justify-center text-center p-6">
                <div className="text-5xl mb-4">⚠️</div>
                <h3 className="text-lg font-bold text-rose-600 bg-rose-50 border border-rose-200 rounded-2xl px-6 py-4 max-w-md shadow-sm">
                    Error: {error}
                </h3>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="min-h-screen bg-[#fffdf9] flex flex-col items-center justify-center text-center p-6">
                <div className="text-5xl mb-4">🕵️‍♂️</div>
                <h3 className="text-xl font-bold text-stone-500">Cake not found.</h3>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fffdf9] text-stone-800 antialiased flex flex-col">
            <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-5 pb-8 flex-1 flex flex-col">
                {/* Back Button */}
                <div className="mb-6">
                    <button
                        className="inline-flex items-center text-sm font-bold text-[#844414] hover:text-[#d67b27] transition-colors bg-white border border-[#f3e1c6] rounded-full px-4 py-1.5 shadow-sm"
                        onClick={() => navigate(-1)}
                    >
                        ← Back
                    </button>
                </div>

                {/* Main Showcase Showcase Card */}
                <div className="bg-white border border-[#f3e1c6] rounded-3xl overflow-hidden shadow-sm grid grid-cols-1 md:grid-cols-2 gap-8 p-6 lg:p-10">

                    {/* Image Box Section */}
                    <div className="relative w-full aspect-square max-h-[480px] mx-auto overflow-hidden rounded-2xl border border-stone-100 bg-[#fffdf9]">
                        <img
                            src={getMediaUrl(product.image, BASEURL)}
                            alt={product.name}
                            className="h-full w-full object-cover object-center transition-transform duration-300 hover:scale-105"
                        />
                    </div>

                    {/* Metadata Content Section */}
                    <div className="flex flex-col justify-between py-2">
                        <div className="space-y-4">
                            <span className="inline-block bg-[#fdf2e2] text-[#d67b27] text-xs font-black tracking-widest uppercase px-3 py-1 rounded-full">
                                {product.category_name || "Premium Cake"}
                            </span>

                            <h1 className="text-3xl sm:text-4xl font-black text-[#844414] tracking-tight">
                                {product.name}
                            </h1>

                            <StarRating
                                rating={reviewData.average_rating}
                                reviewCount={reviewData.review_count}
                                size="md"
                            />

                            <p className="text-stone-500 leading-relaxed text-base">
                                {product.description}
                            </p>
                        </div>

                        {/* Pricing & Button Area */}
                        <div className="mt-8 pt-6 border-t border-stone-100 space-y-6">
                            <div className="relative flex items-baseline space-x-1 text-[#844414]">
                                <span className="text-2xl font-bold">₱</span>
                                <span className="text-4xl font-black tracking-tight">
                                    {Number(product.price).toLocaleString()}
                                </span>

                                {showSuccess && (
                                    <div
                                        role="status"
                                        aria-live="polite"
                                        className="absolute right-0 top-1/2 z-50 flex -translate-y-1/2 items-center gap-2 rounded-xl bg-[#2E7D32] px-5 py-3.5 text-sm font-semibold text-white shadow-xl"
                                    >
                                        <span aria-hidden="true">✓</span>
                                        Added to cart!
                                    </div>
                                )}
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={handleAddToCart}
                                    className="w-full bg-[#d67b27] hover:bg-[#b56219] text-white font-black py-3.5 px-6 rounded-full transition-colors duration-200 shadow-sm text-sm uppercase tracking-wider text-center"
                                >
                                    Add to Cart
                                </button>
                                <p className="text-xs text-stone-400 font-medium flex items-center justify-center gap-1.5">
                                    <span>✨</span> Freshly baked and ready for delivery
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="mt-8">
                    <ProductReviews
                        reviews={reviewData.reviews}
                        averageRating={reviewData.average_rating}
                        reviewCount={reviewData.review_count}
                    />
                </div>
            </div>
        </div>
    );
}

export default ProductDetails;