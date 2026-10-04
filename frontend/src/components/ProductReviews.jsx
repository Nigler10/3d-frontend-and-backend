// frontend/src/components/ProductReviews.jsx
import { useEffect, useMemo, useState } from "react";
import StarRating from "./StarRating";
import { getMediaUrl } from "../utils/media";

const REVIEWS_PER_PAGE = 10;

export default function ProductReviews({
    reviews = [],
    averageRating = 0,
    reviewCount = 0,
}) {
    const BASEURL =
        import.meta.env.VITE_DJANGO_BASE_URL;

    const [ratingFilter, setRatingFilter] =
        useState("all");

    const [page, setPage] =
        useState(1);

    const ratingCounts = useMemo(() => {
        const counts = {
            5: 0,
            4: 0,
            3: 0,
            2: 0,
            1: 0,
        };

        reviews.forEach((review) => {
            const rating =
                Number(review.rating);

            if (counts[rating] !== undefined) {
                counts[rating] += 1;
            }
        });

        return counts;
    }, [reviews]);

    const filteredReviews = useMemo(() => {
        if (ratingFilter === "all") {
            return reviews;
        }

        return reviews.filter(
            (review) =>
                Number(review.rating) ===
                Number(ratingFilter)
        );
    }, [reviews, ratingFilter]);

    const totalPages = Math.max(
        1,
        Math.ceil(
            filteredReviews.length /
            REVIEWS_PER_PAGE
        )
    );

    const paginatedReviews = useMemo(() => {
        const start =
            (page - 1) *
            REVIEWS_PER_PAGE;

        return filteredReviews.slice(
            start,
            start + REVIEWS_PER_PAGE
        );
    }, [filteredReviews, page]);

    useEffect(() => {
        setPage(1);
    }, [ratingFilter]);

    useEffect(() => {
        if (page > totalPages) {
            setPage(totalPages);
        }
    }, [page, totalPages]);

    return (
        <div className="rounded-3xl border border-[#E6DBCB] bg-white p-6 shadow-sm sm:p-8">
            {/* Header */}
            <div className="flex flex-col gap-4 border-b border-[#E6DBCB] pb-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <h2 className="text-xl font-black text-[#3D251E]">
                        Customer Reviews
                    </h2>

                    <p className="mt-1 text-sm text-[#8C6D58]">
                        Reviews from customers who
                        purchased this product.
                    </p>
                </div>

                <StarRating
                    rating={averageRating}
                    reviewCount={reviewCount}
                    size="md"
                />
            </div>

            {/* Rating Filter */}
            <div className="my-5 flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={() =>
                        setRatingFilter("all")
                    }
                    className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition cursor-pointer ${ratingFilter === "all"
                            ? "border-[#AD4313] bg-[#AD4313] text-white"
                            : "border-[#E6DBCB] bg-white text-[#5C3D2E] hover:bg-[#FCF8EE]"
                        }`}
                >
                    All ({reviews.length})
                </button>

                {[5, 4, 3, 2, 1].map(
                    (rating) => (
                        <button
                            key={rating}
                            type="button"
                            onClick={() =>
                                setRatingFilter(
                                    String(rating)
                                )
                            }
                            className={`rounded-xl border px-3.5 py-2 text-xs font-bold transition cursor-pointer ${ratingFilter ===
                                    String(rating)
                                    ? "border-[#AD4313] bg-[#AD4313] text-white"
                                    : "border-[#E6DBCB] bg-white text-[#5C3D2E] hover:bg-[#FCF8EE]"
                                }`}
                        >
                            {rating} ★ (
                            {
                                ratingCounts[
                                rating
                                ]
                            }
                            )
                        </button>
                    )
                )}
            </div>

            {/* Reviews */}
            {filteredReviews.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#E6DBCB] bg-[#FFFDF9] p-10 text-center">
                    <p className="font-bold text-[#8C6D58]">
                        {ratingFilter === "all"
                            ? "No customer reviews yet."
                            : `No ${ratingFilter}-star reviews yet.`}
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-[#E6DBCB]">
                    {paginatedReviews.map(
                        (review) => {
                            const displayName =
                                review.user_full_name ||
                                review.user_name ||
                                "Customer";

                            return (
                                <article
                                    key={
                                        review.id
                                    }
                                    className="py-5 first:pt-0"
                                >
                                    <div className="flex items-start gap-3">
                                        {/* Customer Avatar */}
                                        {review.user_profile_picture ? (
                                            <img
                                                src={getMediaUrl(
                                                    review.user_profile_picture,
                                                    BASEURL
                                                )}
                                                alt={
                                                    displayName
                                                }
                                                loading="lazy"
                                                className="h-11 w-11 shrink-0 rounded-full border border-[#E6DBCB] object-cover"
                                            />
                                        ) : (
                                            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#FDF0EB] text-sm font-black uppercase text-[#AD4313]">
                                                {displayName
                                                    .charAt(
                                                        0
                                                    )
                                                    .toUpperCase()}
                                            </div>
                                        )}

                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                                                <div>
                                                    <p className="font-black text-[#3D251E]">
                                                        {
                                                            displayName
                                                        }
                                                    </p>

                                                    <StarRating
                                                        rating={
                                                            review.rating
                                                        }
                                                        size="sm"
                                                    />
                                                </div>

                                                <time className="text-xs font-medium text-[#A48B78]">
                                                    {new Date(
                                                        review.created_at
                                                    ).toLocaleDateString()}
                                                </time>
                                            </div>

                                            {review.comment ? (
                                                <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#5C3D2E]">
                                                    {
                                                        review.comment
                                                    }
                                                </p>
                                            ) : (
                                                <p className="mt-3 text-sm italic text-[#A48B78]">
                                                    No
                                                    written
                                                    comment.
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                </article>
                            );
                        }
                    )}
                </div>
            )}

            {/* Pagination */}
            {filteredReviews.length >
                REVIEWS_PER_PAGE && (
                    <div className="mt-6 flex flex-col gap-3 border-t border-[#E6DBCB] pt-5 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-medium text-[#8C6D58]">
                            Showing{" "}
                            {(page - 1) *
                                REVIEWS_PER_PAGE +
                                1}
                            –
                            {Math.min(
                                page *
                                REVIEWS_PER_PAGE,
                                filteredReviews.length
                            )}{" "}
                            of{" "}
                            {
                                filteredReviews.length
                            }{" "}
                            reviews
                        </p>

                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                disabled={page === 1}
                                onClick={() =>
                                    setPage(
                                        (current) =>
                                            Math.max(
                                                1,
                                                current -
                                                1
                                            )
                                    )
                                }
                                className="rounded-xl border border-[#E6DBCB] bg-white px-3 py-2 text-xs font-bold text-[#5C3D2E] hover:bg-[#FCF8EE] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                            >
                                ← Previous
                            </button>

                            <span className="px-2 text-xs font-black text-[#3D251E]">
                                {page} /{" "}
                                {totalPages}
                            </span>

                            <button
                                type="button"
                                disabled={
                                    page ===
                                    totalPages
                                }
                                onClick={() =>
                                    setPage(
                                        (current) =>
                                            Math.min(
                                                totalPages,
                                                current +
                                                1
                                            )
                                    )
                                }
                                className="rounded-xl border border-[#E6DBCB] bg-white px-3 py-2 text-xs font-bold text-[#5C3D2E] hover:bg-[#FCF8EE] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
                            >
                                Next →
                            </button>
                        </div>
                    </div>
                )}
        </div>
    );
}