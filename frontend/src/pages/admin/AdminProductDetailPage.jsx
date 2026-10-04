// src/pages/admin/AdminProductDetailPage.jsx
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import StarRating from "../../components/StarRating";
import { getMediaUrl } from "../../utils/media";
import ProductReviews from "../../components/ProductReviews";

export default function AdminProductDetailPage() {
    const { id } = useParams();
    const navigate = useNavigate();

    const BASEURL =
        import.meta.env.VITE_DJANGO_BASE_URL;

    const [product, setProduct] =
        useState(null);

    const [reviewData, setReviewData] =
        useState({
            average_rating: 0,
            review_count: 0,
            reviews: [],
        });

    const [loading, setLoading] =
        useState(true);

    const [error, setError] =
        useState("");

    useEffect(() => {
        const loadData = async () => {
            try {
                const [
                    productRes,
                    reviewRes,
                ] = await Promise.all([
                    fetch(
                        `${BASEURL}/api/products/${id}/`
                    ),
                    fetch(
                        `${BASEURL}/api/orders/products/${id}/reviews/`
                    ),
                ]);

                if (!productRes.ok) {
                    throw new Error(
                        "Failed to load product."
                    );
                }

                if (!reviewRes.ok) {
                    throw new Error(
                        "Failed to load reviews."
                    );
                }

                const productData =
                    await productRes.json();

                const reviews =
                    await reviewRes.json();

                setProduct(productData);

                setReviewData({
                    average_rating:
                        reviews.average_rating ||
                        0,
                    review_count:
                        reviews.review_count || 0,
                    reviews:
                        reviews.reviews || [],
                });
            } catch (err) {
                console.error(err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [id, BASEURL]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#FCF8EE]">
                <p className="font-black text-[#3D251E] animate-pulse">
                    Loading product...
                </p>
            </div>
        );
    }

    if (error || !product) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#FCF8EE]">
                <p className="font-bold text-rose-600">
                    {error ||
                        "Product not found."}
                </p>

                <button
                    onClick={() =>
                        navigate(
                            "/admin/products"
                        )
                    }
                    className="rounded-xl bg-[#AD4313] px-5 py-2.5 text-sm font-bold text-white cursor-pointer"
                >
                    Back to Products
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#FCF8EE] px-4 py-8 text-[#3D251E]">
            <div className="mx-auto max-w-6xl space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <button
                        type="button"
                        onClick={() =>
                            navigate(
                                "/admin/products"
                            )
                        }
                        className="w-fit rounded-xl border border-[#E6DBCB] bg-white px-4 py-2 text-xs font-black text-[#5C3D2E] hover:bg-[#FFF8F1] cursor-pointer"
                    >
                        ← Back to Products
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            navigate(
                                `/admin/products/${product.id}/edit`
                            )
                        }
                        className="w-fit rounded-xl bg-[#AD4313] px-5 py-2.5 text-xs font-black text-white hover:bg-[#8F350E] cursor-pointer"
                    >
                        Edit Product
                    </button>
                </div>

                <div className="grid grid-cols-1 overflow-hidden rounded-3xl border border-[#E6DBCB] bg-white shadow-sm lg:grid-cols-2">
                    <div className="relative aspect-square w-full overflow-hidden bg-[#FFFDF9]">
                        <img
                            src={getMediaUrl(
                                product.image,
                                BASEURL
                            )}
                            alt={product.name}
                            className="h-full w-full object-cover object-center"
                        />
                    </div>

                    <div className="flex flex-col justify-center p-6 sm:p-8 lg:p-10">
                        <span className="mb-3 w-fit rounded-full bg-[#FDF0EB] px-3 py-1 text-xs font-black uppercase tracking-wider text-[#AD4313]">
                            {product.category_name ||
                                "Cake"}
                        </span>

                        <h1 className="text-3xl font-black tracking-tight text-[#3D251E] sm:text-4xl">
                            {product.name}
                        </h1>

                        <div className="mt-4">
                            <StarRating
                                rating={
                                    reviewData.average_rating
                                }
                                reviewCount={
                                    reviewData.review_count
                                }
                                size="md"
                            />
                        </div>

                        <p className="mt-6 whitespace-pre-wrap text-sm leading-7 text-[#8C6D58]">
                            {product.description}
                        </p>

                        <div className="mt-8 border-t border-[#E6DBCB] pt-6">
                            <p className="text-xs font-bold uppercase tracking-wider text-[#8C6D58]">
                                Current Price
                            </p>

                            <p className="mt-1 text-3xl font-black text-[#AD4313]">
                                ₱
                                {Number(
                                    product.price
                                ).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>

                <ProductReviews
                    reviews={reviewData.reviews}
                    averageRating={reviewData.average_rating}
                    reviewCount={reviewData.review_count}
                />
            </div>
        </div>
    );
}