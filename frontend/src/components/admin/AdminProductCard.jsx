// src/components/admin/AdminProductCard.jsx
import { useNavigate } from "react-router-dom";
import { getMediaUrl } from "../../utils/media";
import StarRating from "../StarRating";

function AdminProductCard({ product }) {
    const navigate = useNavigate();

    const BASEURL =
        import.meta.env.VITE_DJANGO_BASE_URL;

    return (
        <div className="overflow-hidden rounded-2xl border border-[#E6DBCB] bg-white shadow-sm transition-all hover:-translate-y-1 hover:shadow-lg">
            <div className="aspect-square w-full overflow-hidden bg-[#FCF8EE]">
                <img
                    src={getMediaUrl(
                        product.image,
                        BASEURL
                    )}
                    alt={product.name}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-cover transition-transform duration-300 hover:scale-105"
                />
            </div>

            <div className="flex flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="truncate text-lg font-black text-[#3D251E]">
                            {product.name}
                        </h2>

                        <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-[#8C6D58]">
                            {product.category_name || "Cake"}
                        </p>
                    </div>

                    <p className="shrink-0 text-base font-black text-[#AD4313]">
                        ₱{Number(
                            product.price
                        ).toLocaleString()}
                    </p>
                </div>

                <StarRating
                    rating={
                        product.average_rating
                    }
                    reviewCount={
                        product.review_count
                    }
                />

                <p className="min-h-10 text-sm leading-relaxed text-[#8C6D58]">
                    {product.description?.length >
                        80
                        ? `${product.description.slice(
                            0,
                            80
                        )}...`
                        : product.description}
                </p>

                <div className="mt-1 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={() =>
                            navigate(
                                `/admin/products/${product.id}`
                            )
                        }
                        className="rounded-xl border border-[#E6DBCB] bg-white px-4 py-2.5 text-xs font-black text-[#3D251E] transition-colors hover:bg-[#FCF8EE] cursor-pointer"
                    >
                        View Details
                    </button>

                    <button
                        type="button"
                        onClick={() =>
                            navigate(
                                `/admin/products/${product.id}/edit`
                            )
                        }
                        className="rounded-xl bg-[#AD4313] px-4 py-2.5 text-xs font-black text-white transition-colors hover:bg-[#8F350E] cursor-pointer"
                    >
                        Edit Product
                    </button>
                </div>
            </div>
        </div>
    );
}

export default AdminProductCard;